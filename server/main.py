"""
InvoiceFlow Python Backend
FastAPI + SQLite (WAL) + web3.py event indexer

Endpoints:
  GET  /api/health
  GET  /api/invoices              - all indexed invoices (filterable)
  GET  /api/invoices/{id}         - single invoice
  GET  /api/marketplace           - tokenized receivables for sale
  GET  /api/invoices/vendor/{addr}
  GET  /api/invoices/client/{addr}
  POST /api/index/sync            - manual re-sync trigger
  GET  /api/stats                 - platform-wide stats
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
import sqlite3
import threading
import time
from contextlib import asynccontextmanager
from typing import Optional
from urllib.parse import urlparse, urlencode, parse_qsl

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from web3 import Web3

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("invoiceflow")

RPC_URL = os.getenv("RPC_URL", "https://rpc.testnet.arc.io")
CONTRACT_ADDRESS = os.getenv(
    "CONTRACT_ADDRESS", "0x1f6e9cccf4f4c782900694b452c8dea490a59530"
)
DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "invoiceflow.db"))
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "15"))  # seconds between RPC polls

# Minimal ABI — only the events + view functions we index
CONTRACT_ABI = json.loads("""
[
  {
    "type": "event",
    "name": "InvoiceCreated",
    "inputs": [
      {"name": "id",       "type": "uint256", "indexed": true},
      {"name": "vendor",   "type": "address", "indexed": true},
      {"name": "client",   "type": "address", "indexed": true},
      {"name": "amount",   "type": "uint256", "indexed": false},
      {"name": "dueDate",  "type": "uint256", "indexed": false}
    ]
  },
  {
    "type": "event",
    "name": "InvoicePaid",
    "inputs": [
      {"name": "id",     "type": "uint256", "indexed": true},
      {"name": "payer",  "type": "address", "indexed": true},
      {"name": "amount", "type": "uint256", "indexed": false}
    ]
  },
  {
    "type": "event",
    "name": "InvoiceTokenized",
    "inputs": [
      {"name": "id",            "type": "uint256", "indexed": true},
      {"name": "tokenContract", "type": "address", "indexed": false}
    ]
  },
  {
    "type": "event",
    "name": "InvoiceCancelled",
    "inputs": [
      {"name": "id", "type": "uint256", "indexed": true}
    ]
  },
  {
    "type": "function",
    "name": "getInvoice",
    "stateMutability": "view",
    "inputs": [{"name": "invoiceId", "type": "uint256"}],
    "outputs": [
      {
        "type": "tuple",
        "components": [
          {"name": "id",            "type": "uint256"},
          {"name": "vendor",        "type": "address"},
          {"name": "client",        "type": "address"},
          {"name": "amount",        "type": "uint256"},
          {"name": "description",   "type": "string"},
          {"name": "dueDate",       "type": "uint256"},
          {"name": "status",        "type": "uint8"},
          {"name": "tokenContract", "type": "address"}
        ]
      }
    ]
  }
]
""")

STATUS_LABELS = {0: "Pending", 1: "Paid", 2: "Tokenized", 3: "Cancelled"}

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def get_db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=FULL")
    con.execute("PRAGMA busy_timeout=5000")
    return con


def init_db() -> None:
    con = get_db()
    con.executescript("""
        CREATE TABLE IF NOT EXISTS invoices (
            id              INTEGER PRIMARY KEY,
            vendor          TEXT NOT NULL,
            client          TEXT NOT NULL,
            amount          TEXT NOT NULL,   -- uint256 as string
            description     TEXT NOT NULL,
            due_date        INTEGER NOT NULL,
            status          INTEGER NOT NULL DEFAULT 0,
            token_contract  TEXT,
            created_at_block INTEGER,
            updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE INDEX IF NOT EXISTS idx_vendor  ON invoices(vendor);
        CREATE INDEX IF NOT EXISTS idx_client  ON invoices(client);
        CREATE INDEX IF NOT EXISTS idx_status  ON invoices(status);

        CREATE TABLE IF NOT EXISTS indexer_state (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    """)
    con.commit()
    con.close()
    log.info("Database initialised at %s", DB_PATH)


# ---------------------------------------------------------------------------
# Web3 / event indexer
# ---------------------------------------------------------------------------

w3 = Web3(Web3.HTTPProvider(RPC_URL))
contract = w3.eth.contract(
    address=Web3.to_checksum_address(CONTRACT_ADDRESS),
    abi=CONTRACT_ABI,
)

_indexer_lock = threading.Lock()


def get_last_indexed_block() -> int:
    con = get_db()
    row = con.execute("SELECT value FROM indexer_state WHERE key='last_block'").fetchone()
    con.close()
    if row:
        return int(row["value"])
    # Start from current block minus ~1000 blocks on first run
    try:
        current = w3.eth.block_number
        return max(0, current - 1000)
    except Exception:
        return 0


def set_last_indexed_block(block: int) -> None:
    con = get_db()
    con.execute(
        "INSERT OR REPLACE INTO indexer_state(key, value) VALUES('last_block', ?)",
        (str(block),),
    )
    con.commit()
    con.close()


def fetch_invoice_from_chain(invoice_id: int) -> dict | None:
    """Call getInvoice() on-chain and return a normalised dict."""
    try:
        inv = contract.functions.getInvoice(invoice_id).call()
        return {
            "id":             inv[0],
            "vendor":         inv[1].lower(),
            "client":         inv[2].lower(),
            "amount":         str(inv[3]),
            "description":    inv[4],
            "due_date":       inv[5],
            "status":         inv[6],
            "token_contract": inv[7].lower() if inv[7] != "0x" + "0" * 40 else None,
        }
    except Exception as exc:
        log.warning("getInvoice(%d) failed: %s", invoice_id, exc)
        return None


def upsert_invoice(con: sqlite3.Connection, data: dict, block: int | None = None) -> None:
    con.execute(
        """
        INSERT INTO invoices
            (id, vendor, client, amount, description, due_date, status,
             token_contract, created_at_block, updated_at)
        VALUES
            (:id, :vendor, :client, :amount, :description, :due_date, :status,
             :token_contract, :block, unixepoch())
        ON CONFLICT(id) DO UPDATE SET
            status         = excluded.status,
            token_contract = COALESCE(excluded.token_contract, invoices.token_contract),
            updated_at     = unixepoch()
        """,
        {**data, "block": block},
    )


def process_events(from_block: int, to_block: int) -> int:
    """Fetch and process all contract events in [from_block, to_block]."""
    ids_to_refresh: set[int] = set()

    # Collect all event ids that need a chain refresh
    for event_name in ("InvoiceCreated", "InvoicePaid", "InvoiceTokenized", "InvoiceCancelled"):
        try:
            event = getattr(contract.events, event_name)
            logs = event.get_logs(from_block=from_block, to_block=to_block)
            for entry in logs:
                ids_to_refresh.add(entry["args"]["id"])
                log.info("Event %s id=%d block=%d", event_name, entry["args"]["id"], entry["blockNumber"])
        except Exception as exc:
            log.warning("get_logs(%s) error: %s", event_name, exc)

    if not ids_to_refresh:
        return 0

    con = get_db()
    refreshed = 0
    for inv_id in ids_to_refresh:
        data = fetch_invoice_from_chain(inv_id)
        if data:
            upsert_invoice(con, data, block=from_block)
            refreshed += 1
    con.commit()
    con.close()
    return refreshed


def sync_once() -> dict:
    """Sync from last indexed block to chain head. Returns summary."""
    with _indexer_lock:
        try:
            head = w3.eth.block_number
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

        last = get_last_indexed_block()
        if last >= head:
            return {"ok": True, "from": last, "to": head, "new_events": 0}

        # Process in chunks to avoid RPC range limits
        CHUNK = 500
        total = 0
        cur = last + 1
        while cur <= head:
            end = min(cur + CHUNK - 1, head)
            total += process_events(cur, end)
            cur = end + 1

        set_last_indexed_block(head)
        log.info("Synced blocks %d→%d, %d invoice(s) updated", last, head, total)
        return {"ok": True, "from": last, "to": head, "new_events": total}


def _background_poller() -> None:
    """Long-running thread that polls for new events."""
    log.info("Event poller started (interval=%ds)", POLL_INTERVAL)
    while True:
        try:
            result = sync_once()
            if not result["ok"]:
                log.warning("Sync error: %s", result.get("error"))
        except Exception as exc:
            log.error("Poller exception: %s", exc)
        time.sleep(POLL_INTERVAL)


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    # Initial sync then start background poller
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, sync_once)
    t = threading.Thread(target=_background_poller, daemon=True)
    t.start()
    yield


app = FastAPI(title="InvoiceFlow API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class InvoiceOut(BaseModel):
    id: int
    vendor: str
    client: str
    amount: str          # raw uint256 string
    amount_usdc: float   # formatted 6-decimal
    description: str
    due_date: int
    status: int
    status_label: str
    token_contract: Optional[str]
    is_overdue: bool
    created_at_block: Optional[int]

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "InvoiceOut":
        now = int(time.time())
        amount_raw = int(row["amount"])
        return cls(
            id=row["id"],
            vendor=row["vendor"],
            client=row["client"],
            amount=row["amount"],
            amount_usdc=round(amount_raw / 1_000_000, 6),
            description=row["description"],
            due_date=row["due_date"],
            status=row["status"],
            status_label=STATUS_LABELS.get(row["status"], "Unknown"),
            token_contract=row["token_contract"],
            is_overdue=row["status"] == 0 and now > row["due_date"],
            created_at_block=row["created_at_block"],
        )


class StatsOut(BaseModel):
    total_invoices: int
    pending: int
    paid: int
    tokenized: int
    cancelled: int
    total_volume_usdc: float
    last_indexed_block: int


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    try:
        block = w3.eth.block_number
        connected = True
    except Exception:
        block = None
        connected = False
    return {
        "status": "ok",
        "rpc_connected": connected,
        "latest_block": block,
        "contract": CONTRACT_ADDRESS,
    }


@app.get("/api/invoices", response_model=list[InvoiceOut])
def list_invoices(
    status: Optional[int] = Query(None, description="0=Pending 1=Paid 2=Tokenized 3=Cancelled"),
    vendor: Optional[str] = None,
    client: Optional[str] = None,
    overdue_only: bool = False,
    limit: int = Query(100, le=500),
    offset: int = 0,
):
    con = get_db()
    clauses, params = [], []

    if status is not None:
        clauses.append("status = ?"); params.append(status)
    if vendor:
        clauses.append("vendor = ?"); params.append(vendor.lower())
    if client:
        clauses.append("client = ?"); params.append(client.lower())
    if overdue_only:
        clauses.append("status = 0 AND due_date < ?"); params.append(int(time.time()))

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    rows = con.execute(
        f"SELECT * FROM invoices {where} ORDER BY id DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()
    con.close()
    return [InvoiceOut.from_row(r) for r in rows]


@app.get("/api/invoices/vendor/{address}", response_model=list[InvoiceOut])
def invoices_by_vendor(address: str, limit: int = Query(100, le=500), offset: int = 0):
    con = get_db()
    rows = con.execute(
        "SELECT * FROM invoices WHERE vendor = ? ORDER BY id DESC LIMIT ? OFFSET ?",
        (address.lower(), limit, offset),
    ).fetchall()
    con.close()
    return [InvoiceOut.from_row(r) for r in rows]


@app.get("/api/invoices/client/{address}", response_model=list[InvoiceOut])
def invoices_by_client(address: str, limit: int = Query(100, le=500), offset: int = 0):
    con = get_db()
    rows = con.execute(
        "SELECT * FROM invoices WHERE client = ? ORDER BY id DESC LIMIT ? OFFSET ?",
        (address.lower(), limit, offset),
    ).fetchall()
    con.close()
    return [InvoiceOut.from_row(r) for r in rows]


@app.get("/api/invoices/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: int):
    con = get_db()
    row = con.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    con.close()
    if not row:
        # Try to fetch from chain directly
        data = fetch_invoice_from_chain(invoice_id)
        if not data or data["id"] == 0:
            raise HTTPException(status_code=404, detail="Invoice not found")
        con = get_db()
        upsert_invoice(con, data)
        con.commit()
        row = con.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
        con.close()
    return InvoiceOut.from_row(row)


@app.get("/api/marketplace", response_model=list[InvoiceOut])
def marketplace(limit: int = Query(100, le=500), offset: int = 0):
    """All tokenized receivables available on the marketplace."""
    con = get_db()
    rows = con.execute(
        "SELECT * FROM invoices WHERE status = 2 ORDER BY amount DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ).fetchall()
    con.close()
    return [InvoiceOut.from_row(r) for r in rows]


@app.post("/api/index/sync")
def manual_sync():
    """Manually trigger a sync from chain."""
    result = sync_once()
    return result


@app.get("/api/stats", response_model=StatsOut)
def stats():  # noqa: F811
    con = get_db()
    row = con.execute("""
        SELECT
            COUNT(*)                                         AS total,
            SUM(CASE WHEN status=0 THEN 1 ELSE 0 END)       AS pending,
            SUM(CASE WHEN status=1 THEN 1 ELSE 0 END)       AS paid,
            SUM(CASE WHEN status=2 THEN 1 ELSE 0 END)       AS tokenized,
            SUM(CASE WHEN status=3 THEN 1 ELSE 0 END)       AS cancelled,
            SUM(CAST(amount AS REAL) / 1000000.0)           AS volume
        FROM invoices
    """).fetchone()
    con.close()
    return StatsOut(
        total_invoices=row["total"] or 0,
        pending=row["pending"] or 0,
        paid=row["paid"] or 0,
        tokenized=row["tokenized"] or 0,
        cancelled=row["cancelled"] or 0,
        total_volume_usdc=round(row["volume"] or 0.0, 2),
        last_indexed_block=get_last_indexed_block(),
    )


# ---------------------------------------------------------------------------
# MoonPay URL signing
# ---------------------------------------------------------------------------

MOONPAY_SECRET_KEY = os.environ.get("MOONPAY_SECRET_KEY", "")


@app.get("/api/sign-moonpay")
def sign_moonpay_url(url: str = Query(..., description="Full MoonPay widget URL to sign")):
    """
    Signs a MoonPay widget URL with HMAC-SHA256 using MOONPAY_SECRET_KEY.
    The signature covers the query string of the URL.
    """
    if not MOONPAY_SECRET_KEY:
        raise HTTPException(status_code=503, detail="MOONPAY_SECRET_KEY not configured")

    parsed = urlparse(url)
    # MoonPay signs the query string (including the leading '?')
    query_string = "?" + parsed.query if parsed.query else ""
    mac = hmac.new(
        MOONPAY_SECRET_KEY.encode("utf-8"),
        query_string.encode("utf-8"),
        hashlib.sha256,
    )
    signature = mac.hexdigest()

    return {"signature": signature}


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=3001,
        reload=False,
        app_dir=str(os.path.dirname(__file__)),
    )
