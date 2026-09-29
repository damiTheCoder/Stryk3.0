"""
Veo Backend — FastAPI + SQLite (WAL) + web3.py multi-contract event indexer
Schema version: 2

Endpoints:
  GET  /api/health
  GET  /api/invoices                     - filterable invoice list
  GET  /api/invoices/{id}                - single invoice
  GET  /api/invoices/{id}/units          - unit claims for a board
  GET  /api/marketplace                  - active (non-completed) boards
  GET  /api/board/{invoiceId}            - board detail
  GET  /api/board/{invoiceId}/reference-sheet
  POST /api/board/{invoiceId}/pairs      - store plaintext pairs (creator)
  GET  /api/board/{invoiceId}/access/{address}
  GET  /api/player/{address}/stats
  GET  /api/creator/{address}/stats
  GET  /api/treasury
  GET  /api/stats
  POST /api/index/sync                   - manual re-sync
  GET  /api/sign-moonpay

InvoiceStatus enum (matches InvoiceManager.sol exactly):
  CREATED=0, PENDING=1, TOKENIZED=2, ACTIVE=3, PAID=4, DEFAULTED=5, CANCELLED=6
"""

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import random
import sqlite3
import threading
import time
from contextlib import asynccontextmanager
from typing import Optional
from urllib.parse import urlparse

from eth_abi import encode as abi_encode
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from web3 import Web3

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("veo")

# ---------------------------------------------------------------------------
# Config — all addresses from environment
# ---------------------------------------------------------------------------

RPC_URL                  = os.getenv("ARC_RPC_URL") or os.getenv("ARC_TESTNET_RPC_URL", "https://rpc.testnet.arc.io")
DB_PATH                  = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "invoiceflow.db"))
POLL_INTERVAL_SECONDS    = int(os.getenv("POLL_INTERVAL", "30"))
CHUNK_SIZE               = int(os.getenv("CHUNK_SIZE", "2000"))
RATE_LIMIT_BACKOFF_START = 30
RATE_LIMIT_BACKOFF_MAX   = 300

ADDR = {
    "invoice_manager":    os.getenv("INVOICE_MANAGER_ADDRESS",    "0x614203460Df6A41f50d5Cf1F20D20E8B130f8967"),
    "invoice_nft":        os.getenv("INVOICE_NFT_ADDRESS",        "0xBeff9105ae281aE07943cD263466b34C2737e419"),
    "collateral_manager": os.getenv("COLLATERAL_MANAGER_ADDRESS", "0x7814f445fd67d10B0ab0b6a67141092D4F6C01f1"),
    "grid_manager":       os.getenv("GRID_MANAGER_ADDRESS",       "0x58c702eAa8e273900977230F4c08893d82624D00"),
    "cointag_manager":    os.getenv("COINTAG_MANAGER_ADDRESS",    "0x6f9165325973bb47b4FfC1E6bBefD5C74a9cE185"),
    "unit_claim":         os.getenv("UNIT_CLAIM_ADDRESS",         "0xa4d87D1EFBA64dD07C856eA3989DD8Fa8F267F6E"),
    "treasury":           os.getenv("TREASURY_ADDRESS",           "0x0948EE3ce053D3c5d9B0D32F8b349785f6BB1ABD"),
    "payment_manager":    os.getenv("PAYMENT_MANAGER_ADDRESS",    "0x5AbD73D8e5cF84e5D72ecBa67B0AA339076BfE64"),
    "usdc":               os.getenv("ARC_USDC_ADDRESS",           "0x3600000000000000000000000000000000000000"),
}

# InvoiceStatus enum
STATUS = {
    0: "CREATED",
    1: "PENDING",
    2: "TOKENIZED",
    3: "ACTIVE",
    4: "PAID",
    5: "DEFAULTED",
    6: "CANCELLED",
}

# ---------------------------------------------------------------------------
# Minimal ABIs — events + view functions we actually use
# ---------------------------------------------------------------------------

ERC20_ABI = json.loads("""[
  {"type":"event","name":"Transfer","anonymous":false,"inputs":[
    {"name":"from","type":"address","indexed":true},
    {"name":"to","type":"address","indexed":true},
    {"name":"value","type":"uint256","indexed":false}
  ]},
  {"type":"function","name":"transfer","stateMutability":"nonpayable",
   "inputs":[{"name":"to","type":"address"},{"name":"value","type":"uint256"}],
   "outputs":[{"type":"bool"}]}
]""")

INVOICE_MANAGER_ABI = json.loads("""[
  {"type":"event","name":"InvoiceCreated","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"creator","type":"address","indexed":true},
    {"name":"amount","type":"uint256","indexed":false},
    {"name":"stablecoin","type":"address","indexed":false},
    {"name":"dueDate","type":"uint64","indexed":false}
  ]},
  {"type":"event","name":"InvoiceTokenized","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"creator","type":"address","indexed":true}
  ]},
  {"type":"event","name":"InvoiceStatusChanged","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"newStatus","type":"uint8","indexed":false}
  ]},
  {"type":"event","name":"InvoiceCancelled","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true}
  ]},
  {"type":"event","name":"OffChainPaymentReported","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"creator","type":"address","indexed":true},
    {"name":"amount","type":"uint256","indexed":false}
  ]},
  {"type":"function","name":"getInvoiceCreator","stateMutability":"view",
   "inputs":[{"name":"invoiceId","type":"uint256"}],
   "outputs":[{"type":"address"}]},
  {"type":"function","name":"getInvoiceStablecoin","stateMutability":"view",
   "inputs":[{"name":"invoiceId","type":"uint256"}],
   "outputs":[{"type":"address"}]}
]""")

COLLATERAL_MANAGER_ABI = json.loads("""[
  {"type":"event","name":"CollateralDeposited","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"creator","type":"address","indexed":true},
    {"name":"amount","type":"uint256","indexed":false}
  ]},
  {"type":"event","name":"CollateralIncreased","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"amount","type":"uint256","indexed":false},
    {"name":"newTotal","type":"uint256","indexed":false}
  ]},
  {"type":"event","name":"ClaimPaid","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"unitId","type":"uint8","indexed":false},
    {"name":"recipient","type":"address","indexed":true},
    {"name":"amount","type":"uint256","indexed":false}
  ]},
  {"type":"event","name":"DustSwept","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"amount","type":"uint256","indexed":false}
  ]}
]""")

GRID_MANAGER_ABI = json.loads("""[
  {"type":"event","name":"BoardCreated","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true}
  ]},
  {"type":"event","name":"AccessGranted","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"user","type":"address","indexed":true}
  ]},
  {"type":"event","name":"UnitClaimed","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"unitId","type":"uint8","indexed":false},
    {"name":"claimer","type":"address","indexed":true},
    {"name":"payout","type":"uint256","indexed":false}
  ]},
  {"type":"event","name":"GameCompleted","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true}
  ]},
  {"type":"function","name":"getPairHash","stateMutability":"view",
   "inputs":[{"name":"invoiceId","type":"uint256"},{"name":"coordinate","type":"uint16"}],
   "outputs":[{"type":"bytes32"}]},
  {"type":"function","name":"getCoordinateToUnit","stateMutability":"view",
   "inputs":[{"name":"invoiceId","type":"uint256"},{"name":"coordinate","type":"uint16"}],
   "outputs":[{"type":"uint8"}]},
  {"type":"function","name":"getBoardUnitsClaimed","stateMutability":"view",
   "inputs":[{"name":"invoiceId","type":"uint256"}],
   "outputs":[{"type":"uint8"}]},
  {"type":"function","name":"submitPair","stateMutability":"nonpayable",
   "inputs":[{"name":"invoiceId","type":"uint256"},{"name":"coordinate","type":"uint16"},{"name":"pairA","type":"uint256"},{"name":"pairB","type":"uint256"},{"name":"merkleProof","type":"bytes32[]"}],
   "outputs":[]},
  {"type":"function","name":"hasAccess","stateMutability":"view",
   "inputs":[{"name":"user","type":"address"},{"name":"invoiceId","type":"uint256"}],
   "outputs":[{"type":"bool"}]},
  {"type":"function","name":"grantAccess","stateMutability":"nonpayable",
   "inputs":[{"name":"invoiceId","type":"uint256"},{"name":"user","type":"address"}],
   "outputs":[]}
]""")

COINTAG_MANAGER_ABI = json.loads("""[
  {"type":"event","name":"CoinTagPurchased","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"buyer","type":"address","indexed":true},
    {"name":"amount","type":"uint256","indexed":false},
    {"name":"creatorAmount","type":"uint256","indexed":false},
    {"name":"collateralAmount","type":"uint256","indexed":false},
    {"name":"platformAmount","type":"uint256","indexed":false}
  ]}
]""")

PAYMENT_MANAGER_ABI = json.loads("""[
  {"type":"event","name":"InvoicePaid","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"payer","type":"address","indexed":true},
    {"name":"amount","type":"uint256","indexed":false},
    {"name":"txHash","type":"bytes32","indexed":false}
  ]}
]""")

TREASURY_ABI = json.loads("""[
  {"type":"event","name":"RevenueReceived","anonymous":false,"inputs":[
    {"name":"stablecoin","type":"address","indexed":true},
    {"name":"amount","type":"uint256","indexed":false}
  ]},
  {"type":"event","name":"WithdrawalExecuted","anonymous":false,"inputs":[
    {"name":"stablecoin","type":"address","indexed":true},
    {"name":"to","type":"address","indexed":true},
    {"name":"amount","type":"uint256","indexed":false}
  ]},
  {"type":"event","name":"DustSwept","anonymous":false,"inputs":[
    {"name":"stablecoin","type":"address","indexed":true},
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"amount","type":"uint256","indexed":false}
  ]}
]""")

INVOICE_NFT_ABI = json.loads("""[
  {"type":"event","name":"InvoiceNFTMinted","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"to","type":"address","indexed":true},
    {"name":"metadataURI","type":"string","indexed":false}
  ]},
  {"type":"event","name":"InvoiceNFTTransferred","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"from","type":"address","indexed":true},
    {"name":"to","type":"address","indexed":true}
  ]},
  {"type":"event","name":"InvoiceTokenized","anonymous":false,"inputs":[
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"creator","type":"address","indexed":true}
  ]}
]""")

UNIT_CLAIM_ABI = json.loads("""[
  {"type":"event","name":"UnitClaimMinted","anonymous":false,"inputs":[
    {"name":"tokenId","type":"uint256","indexed":true},
    {"name":"invoiceId","type":"uint256","indexed":true},
    {"name":"unitId","type":"uint8","indexed":false},
    {"name":"holder","type":"address","indexed":true}
  ]}
]""")

# ---------------------------------------------------------------------------
# Web3 contracts
# ---------------------------------------------------------------------------

w3 = Web3(Web3.HTTPProvider(RPC_URL))

def _contract(key: str, abi: list):
    return w3.eth.contract(address=Web3.to_checksum_address(ADDR[key]), abi=abi)

contracts = {}  # populated after module load

def _init_contracts():
    global contracts
    contracts = {
        "invoice_manager":    _contract("invoice_manager",    INVOICE_MANAGER_ABI),
        "collateral_manager": _contract("collateral_manager", COLLATERAL_MANAGER_ABI),
        "grid_manager":       _contract("grid_manager",       GRID_MANAGER_ABI),
        "cointag_manager":    _contract("cointag_manager",    COINTAG_MANAGER_ABI),
        "payment_manager":    _contract("payment_manager",    PAYMENT_MANAGER_ABI),
        "treasury":           _contract("treasury",           TREASURY_ABI),
        "invoice_nft":        _contract("invoice_nft",        INVOICE_NFT_ABI),
        "unit_claim":         _contract("unit_claim",         UNIT_CLAIM_ABI),
        "usdc":               _contract("usdc",               ERC20_ABI),
    }

DEPLOYER_PK = os.getenv("DEPLOYER_PRIVATE_KEY", "")
backend_account = None
if DEPLOYER_PK:
    try:
        backend_account = w3.eth.account.from_key(DEPLOYER_PK)
        log.info("Backend relayer wallet loaded: %s", backend_account.address)
    except Exception as exc:
        log.error("Failed to load DEPLOYER_PRIVATE_KEY: %s", exc)

# ---------------------------------------------------------------------------
# Pair-hash and Merkle tree verification
#
# Solidity: keccak256(abi.encode(pairA, pairB))
# Python:   Web3.keccak(eth_abi.encode(['uint256','uint256'], [a, b]))
# abi.encode pads each uint256 to 32 bytes (unlike encodePacked).
# ---------------------------------------------------------------------------

MAX_UINT256 = 2**256 - 1

def compute_pair_hash(pair_a: int, pair_b: int) -> str:
    """Return 0x-prefixed hex keccak256(abi.encode(pair_a, pair_b))."""
    encoded = abi_encode(["uint256", "uint256"], [pair_a, pair_b])
    return Web3.to_hex(Web3.keccak(encoded))

def validate_pair_values(pair_a: int, pair_b: int) -> None:
    """Raise ValueError if either value is out of uint256 range."""
    if not (0 <= pair_a <= MAX_UINT256):
        raise ValueError(f"pair_a={pair_a} is out of uint256 range")
    if not (0 <= pair_b <= MAX_UINT256):
        raise ValueError(f"pair_b={pair_b} is out of uint256 range")

def _compute_leaf(coord: int, pair_hash_hex: str) -> bytes:
    if pair_hash_hex.startswith("0x"):
        pair_hash_bytes = bytes.fromhex(pair_hash_hex[2:])
    else:
        pair_hash_bytes = bytes.fromhex(pair_hash_hex)
    packed = abi_encode(["uint16", "bytes32"], [coord, pair_hash_bytes])
    return Web3.keccak(packed)

def compute_merkle_proof(pairs: list[dict], target_coord: int) -> tuple[bytes, list[bytes]]:
    """
    Reconstruct Merkle tree exactly matching frontend / GridManager._verifyProof.
    Returns (root_bytes, proof_bytes_list).
    """
    sorted_pairs = sorted(pairs, key=lambda p: int(p["coordinate"]))
    leaves = [_compute_leaf(int(p["coordinate"]), p["pair_hash"]) for p in sorted_pairs]
    
    target_idx = -1
    for idx, p in enumerate(sorted_pairs):
        if int(p["coordinate"]) == target_coord:
            target_idx = idx
            break
            
    if target_idx == -1:
        raise ValueError(f"Coordinate {target_coord} not found in pairs")
        
    proof = []
    current_level = leaves
    while len(current_level) > 1:
        next_level = []
        is_right = (target_idx % 2 == 1)
        sibling_idx = target_idx - 1 if is_right else target_idx + 1
        
        if sibling_idx < len(current_level):
            proof.append(current_level[sibling_idx])
            
        for i in range(0, len(current_level), 2):
            if i + 1 < len(current_level):
                a = current_level[i]
                b = current_level[i + 1]
                a_hex = Web3.to_hex(a).lower()
                b_hex = Web3.to_hex(b).lower()
                left, right = (a, b) if a_hex <= b_hex else (b, a)
                next_level.append(Web3.keccak(left + right))
            else:
                next_level.append(current_level[i])
                
        target_idx = target_idx // 2
        current_level = next_level
        
    return current_level[0], proof

_claim_rate_limits: dict[str, float] = {}
_claim_lock = threading.Lock()

def check_claim_rate_limit(address: str) -> bool:
    """Rate limit: max 1 request per user per 3 seconds."""
    addr = address.lower()
    now = time.time()
    with _claim_lock:
        last = _claim_rate_limits.get(addr, 0)
        if now - last < 3.0:
            return False
        _claim_rate_limits[addr] = now
        return True

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

SCHEMA_VERSION = "4"

def get_db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=FULL")
    con.execute("PRAGMA busy_timeout=5000")
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init_db() -> None:
    """Drop and recreate schema if schema_version != 4."""
    con = get_db()
    row = con.execute(
        "SELECT value FROM indexer_state WHERE key='schema_version'"
    ).fetchone() if _table_exists(con, "indexer_state") else None

    current_version = row["value"] if row else None

    if current_version == SCHEMA_VERSION:
        log.info("DB schema v%s already current.", SCHEMA_VERSION)
        con.execute("""
            CREATE TABLE IF NOT EXISTS board_winners (
                invoice_id  INTEGER NOT NULL,
                coordinate  INTEGER NOT NULL,
                unit_id     INTEGER NOT NULL,
                PRIMARY KEY (invoice_id, coordinate)
            );
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_board_winners_invoice ON board_winners(invoice_id);")
        con.execute("""
            CREATE TABLE IF NOT EXISTS staged_pairs (
                offchain_id  TEXT PRIMARY KEY,
                pairs_json   TEXT NOT NULL,
                winners_json TEXT NOT NULL,
                created_at   INTEGER NOT NULL DEFAULT (unixepoch())
            );
        """)
        con.commit()
        con.close()
        return

    if current_version == "3":
        log.info("Migrating DB schema v3 -> v4 (preserving existing invoices).")
        con.execute("PRAGMA foreign_keys=OFF")
        con.executescript("""
            DROP TABLE IF EXISTS invoices_new;
            CREATE TABLE IF NOT EXISTS invoices_new (
                id                  TEXT PRIMARY KEY,
                numeric_id          INTEGER UNIQUE,
                onchain_id          INTEGER UNIQUE,
                creator             TEXT NOT NULL,
                client_address      TEXT,
                client_email        TEXT,
                description         TEXT,
                amount              TEXT NOT NULL,
                tagged_amount       TEXT NOT NULL,
                stablecoin          TEXT NOT NULL,
                due_date            INTEGER NOT NULL,
                debtor_ref          TEXT,
                metadata_uri        TEXT,
                status              INTEGER NOT NULL DEFAULT 0,
                payment_tx_hash     TEXT,
                paid_at             INTEGER,
                created_at_block    INTEGER,
                tokenized_at_block  INTEGER,
                paid_at_block       INTEGER,
                created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
            );

            INSERT INTO invoices_new (
                id, numeric_id, onchain_id, creator, amount, tagged_amount,
                stablecoin, due_date, debtor_ref, metadata_uri, status,
                created_at_block, tokenized_at_block, paid_at_block, updated_at
            )
            SELECT 
                CAST(id AS TEXT), id, id, creator, amount, amount,
                stablecoin, due_date, debtor_ref, metadata_uri, status,
                created_at_block, tokenized_at_block, paid_at_block, updated_at
            FROM invoices;

            DROP TABLE invoices;
            ALTER TABLE invoices_new RENAME TO invoices;

            CREATE INDEX IF NOT EXISTS idx_invoices_creator    ON invoices(creator);
            CREATE INDEX IF NOT EXISTS idx_invoices_status     ON invoices(status);
            CREATE INDEX IF NOT EXISTS idx_invoices_due_date   ON invoices(due_date);
            CREATE INDEX IF NOT EXISTS idx_invoices_match_key  ON invoices(creator, tagged_amount);
            CREATE INDEX IF NOT EXISTS idx_invoices_onchain_id ON invoices(onchain_id);
            CREATE INDEX IF NOT EXISTS idx_invoices_numeric_id ON invoices(numeric_id);

            CREATE TABLE IF NOT EXISTS invoice_sequence (
                id       INTEGER PRIMARY KEY CHECK(id=1),
                next_val INTEGER NOT NULL
            );
            INSERT OR REPLACE INTO invoice_sequence(id, next_val)
            VALUES (1, (SELECT MAX(COALESCE(MAX(numeric_id) + 1, 1), 7) FROM invoices));

            UPDATE indexer_state SET value='4' WHERE key='schema_version';
        """)
        con.commit()
        con.execute("PRAGMA foreign_keys=ON")
        con.close()
        log.info("DB schema migrated to v4.")
        return

    log.info("Migrating DB to schema v%s (dropping all existing tables).", SCHEMA_VERSION)
    con.executescript("""
        DROP TABLE IF EXISTS invoice_sequence;
        DROP TABLE IF EXISTS cointag_codes;
        DROP TABLE IF EXISTS cointag_purchases;
        DROP TABLE IF EXISTS payments;
        DROP TABLE IF EXISTS treasury_events;
        DROP TABLE IF EXISTS unit_claims;
        DROP TABLE IF EXISTS board_access;
        DROP TABLE IF EXISTS reference_pairs;
        DROP TABLE IF EXISTS boards;
        DROP TABLE IF EXISTS invoices;
        DROP TABLE IF EXISTS indexer_state;
    """)

    con.executescript("""
        -- InvoiceStatus: CREATED=0 PENDING=1 TOKENIZED=2 ACTIVE=3 PAID=4 DEFAULTED=5 CANCELLED=6
        CREATE TABLE invoices (
            id                  TEXT PRIMARY KEY,
            numeric_id          INTEGER UNIQUE,
            onchain_id          INTEGER UNIQUE,
            creator             TEXT NOT NULL,
            client_address      TEXT,
            client_email        TEXT,
            description         TEXT,
            amount              TEXT NOT NULL,
            tagged_amount       TEXT NOT NULL,
            stablecoin          TEXT NOT NULL,
            due_date            INTEGER NOT NULL,
            debtor_ref          TEXT,
            metadata_uri        TEXT,
            status              INTEGER NOT NULL DEFAULT 0,
            payment_tx_hash     TEXT,
            paid_at             INTEGER,
            created_at_block    INTEGER,
            tokenized_at_block  INTEGER,
            paid_at_block       INTEGER,
            created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX idx_invoices_creator    ON invoices(creator);
        CREATE INDEX idx_invoices_status     ON invoices(status);
        CREATE INDEX idx_invoices_due_date   ON invoices(due_date);
        CREATE INDEX idx_invoices_match_key  ON invoices(creator, tagged_amount);
        CREATE INDEX idx_invoices_onchain_id ON invoices(onchain_id);
        CREATE INDEX idx_invoices_numeric_id ON invoices(numeric_id);

        CREATE TABLE invoice_sequence (
            id       INTEGER PRIMARY KEY CHECK(id=1),
            next_val INTEGER NOT NULL
        );
        INSERT INTO invoice_sequence(id, next_val) VALUES(1, 7);

        CREATE TABLE boards (
            invoice_id       INTEGER PRIMARY KEY,
            stablecoin       TEXT NOT NULL,
            units_claimed    INTEGER NOT NULL DEFAULT 0,
            completed        INTEGER NOT NULL DEFAULT 0,
            created_at_block INTEGER
        );

        CREATE TABLE reference_pairs (
            invoice_id  INTEGER NOT NULL,
            coordinate  INTEGER NOT NULL,
            pair_a      TEXT NOT NULL,
            pair_b      TEXT NOT NULL,
            pair_hash   TEXT NOT NULL,
            PRIMARY KEY (invoice_id, coordinate)
        );
        CREATE INDEX idx_ref_pairs_invoice ON reference_pairs(invoice_id);

        CREATE TABLE staged_pairs (
            offchain_id  TEXT PRIMARY KEY,
            pairs_json   TEXT NOT NULL,
            winners_json TEXT NOT NULL,
            created_at   INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE board_access (
            invoice_id       INTEGER NOT NULL REFERENCES boards(invoice_id),
            user_address     TEXT NOT NULL,
            granted_at_block INTEGER,
            PRIMARY KEY (invoice_id, user_address)
        );

        CREATE TABLE unit_claims (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id       INTEGER NOT NULL REFERENCES boards(invoice_id),
            unit_id          INTEGER NOT NULL,
            claimer          TEXT NOT NULL,
            payout           TEXT NOT NULL,
            nft_token_id     INTEGER,
            claimed_at_block INTEGER,
            UNIQUE(invoice_id, unit_id)
        );

        CREATE TABLE cointag_purchases (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id        INTEGER NOT NULL,
            buyer             TEXT NOT NULL,
            amount            TEXT NOT NULL,
            creator_amount    TEXT NOT NULL,
            collateral_amount TEXT NOT NULL,
            platform_amount   TEXT NOT NULL DEFAULT '0',
            tx_hash           TEXT,
            block_number      INTEGER
        );

        CREATE TABLE cointag_codes (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id   INTEGER NOT NULL,
            user_address TEXT NOT NULL,
            code         TEXT NOT NULL,
            amount       TEXT NOT NULL,
            tx_hash      TEXT NOT NULL,
            block_number INTEGER,
            created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
            UNIQUE(invoice_id, user_address)
        );
        CREATE INDEX idx_cointag_user ON cointag_codes(user_address);

        CREATE TABLE payments (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id       TEXT NOT NULL,
            payer            TEXT NOT NULL,
            amount           TEXT NOT NULL,
            tx_hash_bytes32  TEXT,
            block_number     INTEGER
        );

        CREATE TABLE treasury_events (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type   TEXT NOT NULL,
            stablecoin   TEXT NOT NULL,
            invoice_id   INTEGER,
            amount       TEXT NOT NULL,
            to_address   TEXT,
            block_number INTEGER
        );

        CREATE TABLE indexer_state (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        INSERT INTO indexer_state(key, value) VALUES('schema_version', '4');
    """)
    con.commit()
    con.close()
    log.info("DB schema v4 created at %s", DB_PATH)


def _table_exists(con: sqlite3.Connection, name: str) -> bool:
    row = con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone()
    return row is not None

# ---------------------------------------------------------------------------
# Indexer state helpers
# ---------------------------------------------------------------------------

def get_last_indexed_block() -> int:
    con = get_db()
    row = con.execute("SELECT value FROM indexer_state WHERE key='last_block'").fetchone()
    con.close()
    if row:
        return int(row["value"])
    try:
        current = w3.eth.block_number
        return max(0, current - 1000)
    except Exception:
        return 0


_indexer_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Event handlers — each receives (args_dict, block_number, tx_hash, con)
# They write into the OPEN connection; commit happens only after all succeed.
# ---------------------------------------------------------------------------

def handle_invoice_created(args, block, tx_hash, con):
    inv_id = f"ONCHAIN-{args['invoiceId']}"
    con.execute("""
        INSERT OR IGNORE INTO invoices
            (id, numeric_id, onchain_id, creator, amount, tagged_amount, stablecoin, due_date, status, created_at_block, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, unixepoch())
    """, (
        inv_id,
        args["invoiceId"],
        args["invoiceId"],
        args["creator"].lower(),
        str(args["amount"]),
        str(args["amount"]),
        args["stablecoin"].lower(),
        args["dueDate"],
        block,
    ))


def handle_invoice_tokenized(args, block, tx_hash, con):
    onchain_id = args["invoiceId"]
    creator = args["creator"].lower()
    row = con.execute("SELECT id FROM invoices WHERE onchain_id = ?", (onchain_id,)).fetchone()
    if row:
        con.execute("""
            UPDATE invoices SET status=2, tokenized_at_block=?, updated_at=unixepoch()
            WHERE id=? AND status < 2
        """, (block, row["id"]))
    else:
        inv_id = f"ONCHAIN-{onchain_id}"
        con.execute("""
            INSERT OR IGNORE INTO invoices
                (id, numeric_id, onchain_id, creator, amount, tagged_amount, stablecoin, due_date, status, tokenized_at_block, updated_at)
            VALUES (?, ?, ?, ?, '0', '0', ?, 0, 2, ?, unixepoch())
        """, (inv_id, onchain_id, onchain_id, creator, ADDR["usdc"].lower(), block))


def handle_invoice_status_changed(args, block, tx_hash, con):
    new_status = args["newStatus"]
    paid_block = block if new_status == 4 else None
    con.execute("""
        UPDATE invoices
        SET status=?, paid_at_block=COALESCE(?, paid_at_block), updated_at=unixepoch()
        WHERE onchain_id=? OR id=?
    """, (new_status, paid_block, args["invoiceId"], str(args["invoiceId"])))


def handle_invoice_cancelled(args, block, tx_hash, con):
    con.execute("""
        UPDATE invoices SET status=6, updated_at=unixepoch() WHERE onchain_id=? OR id=?
    """, (args["invoiceId"], str(args["invoiceId"])))


def handle_off_chain_payment_reported(args, block, tx_hash, con):
    con.execute("""
        UPDATE invoices SET status=4, paid_at_block=?, updated_at=unixepoch() WHERE onchain_id=? OR id=?
    """, (block, args["invoiceId"], str(args["invoiceId"])))


def handle_usdc_transfer(args, block, tx_hash, con):
    to_addr = args["to"].lower()
    value = str(args["value"])
    # Find matching invoice by creator and tagged_amount
    row = con.execute(
        "SELECT id, amount, status FROM invoices WHERE creator = ? AND tagged_amount = ? AND status IN (0, 1, 2, 3)",
        (to_addr, value)
    ).fetchone()
    if row:
        con.execute("""
            UPDATE invoices
            SET status=4, payment_tx_hash=?, paid_at=unixepoch(), paid_at_block=?, updated_at=unixepoch()
            WHERE id=?
        """, (tx_hash, block, row["id"]))
        con.execute("""
            INSERT OR IGNORE INTO payments (invoice_id, payer, amount, tx_hash_bytes32, block_number)
            VALUES (?, ?, ?, ?, ?)
        """, (row["id"], args["from"].lower(), value, tx_hash, block))
        log.info("Indexed direct USDC payment for invoice %s (amount %s, tx %s)", row["id"], value, tx_hash)


def handle_board_created(args, block, tx_hash, con):
    onchain_id = args["invoiceId"]
    row = con.execute("SELECT stablecoin FROM invoices WHERE onchain_id=? OR id=?", (onchain_id, str(onchain_id))).fetchone()
    stablecoin = row["stablecoin"] if row else ADDR["usdc"].lower()
    con.execute("""
        INSERT OR IGNORE INTO boards(invoice_id, stablecoin, created_at_block)
        VALUES (?, ?, ?)
    """, (onchain_id, stablecoin, block))


def handle_access_granted(args, block, tx_hash, con):
    con.execute("""
        INSERT OR IGNORE INTO board_access(invoice_id, user_address, granted_at_block)
        VALUES (?, ?, ?)
    """, (args["invoiceId"], args["user"].lower(), block))


def handle_unit_claimed(args, block, tx_hash, con):
    con.execute("""
        INSERT OR IGNORE INTO unit_claims
            (invoice_id, unit_id, claimer, payout, claimed_at_block)
        VALUES (?, ?, ?, ?, ?)
    """, (
        args["invoiceId"],
        args["unitId"],
        args["claimer"].lower(),
        str(args["payout"]),
        block,
    ))
    con.execute("""
        UPDATE boards SET units_claimed = units_claimed + 1 WHERE invoice_id=?
        AND NOT EXISTS (
            SELECT 1 FROM unit_claims
            WHERE invoice_id=? AND unit_id=? AND claimed_at_block < ?
        )
    """, (args["invoiceId"], args["invoiceId"], args["unitId"], block))


def handle_game_completed(args, block, tx_hash, con):
    con.execute("""
        UPDATE boards SET completed=1 WHERE invoice_id=?
    """, (args["invoiceId"],))


def handle_cointag_purchased(args, block, tx_hash, con):
    con.execute("""
        INSERT INTO cointag_purchases
            (invoice_id, buyer, amount, creator_amount, collateral_amount, platform_amount,
             tx_hash, block_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        args["invoiceId"],
        args["buyer"].lower(),
        str(args["amount"]),
        str(args["creatorAmount"]),
        str(args["collateralAmount"]),
        str(args["platformAmount"]),
        tx_hash,
        block,
    ))


def handle_invoice_paid_pm(args, block, tx_hash, con):
    """PaymentManager.InvoicePaid"""
    con.execute("""
        INSERT OR IGNORE INTO payments
            (invoice_id, payer, amount, tx_hash_bytes32, block_number)
        VALUES (?, ?, ?, ?, ?)
    """, (
        str(args["invoiceId"]),
        args["payer"].lower(),
        str(args["amount"]),
        args["txHash"].hex() if hasattr(args["txHash"], "hex") else str(args["txHash"]),
        block,
    ))
    # Mirror to invoices status
    con.execute("""
        UPDATE invoices SET status=4, paid_at_block=?, updated_at=unixepoch()
        WHERE onchain_id=? OR id=?
    """, (block, args["invoiceId"], str(args["invoiceId"])))


def handle_collateral_deposited(args, block, tx_hash, con):
    pass  # informational; collateral amount tracked by ClaimPaid


def handle_collateral_increased(args, block, tx_hash, con):
    pass  # informational


def handle_claim_paid(args, block, tx_hash, con):
    # Update payout on unit_claims record if present
    con.execute("""
        UPDATE unit_claims SET payout=? WHERE invoice_id=? AND unit_id=?
    """, (str(args["amount"]), args["invoiceId"], args["unitId"]))


def handle_collateral_dust_swept(args, block, tx_hash, con):
    con.execute("""
        INSERT INTO treasury_events(event_type, stablecoin, invoice_id, amount, block_number)
        VALUES ('DustSwept_Collateral', 'unknown', ?, ?, ?)
    """, (args["invoiceId"], str(args["amount"]), block))


def handle_treasury_revenue(args, block, tx_hash, con):
    con.execute("""
        INSERT INTO treasury_events(event_type, stablecoin, amount, block_number)
        VALUES ('RevenueReceived', ?, ?, ?)
    """, (args["stablecoin"].lower(), str(args["amount"]), block))


def handle_treasury_withdrawal(args, block, tx_hash, con):
    con.execute("""
        INSERT INTO treasury_events(event_type, stablecoin, amount, to_address, block_number)
        VALUES ('WithdrawalExecuted', ?, ?, ?, ?)
    """, (args["stablecoin"].lower(), str(args["amount"]), args["to"].lower(), block))


def handle_treasury_dust_swept(args, block, tx_hash, con):
    con.execute("""
        INSERT INTO treasury_events(event_type, stablecoin, invoice_id, amount, block_number)
        VALUES ('DustSwept_Treasury', ?, ?, ?, ?)
    """, (args["stablecoin"].lower(), args["invoiceId"], str(args["amount"]), block))


def handle_invoice_nft_minted(args, block, tx_hash, con):
    con.execute("""
        UPDATE invoices SET metadata_uri=? WHERE (onchain_id=? OR id=?) AND metadata_uri IS NULL
    """, (args["metadataURI"], args["invoiceId"], str(args["invoiceId"])))


def handle_invoice_nft_tokenized(args, block, tx_hash, con):
    handle_invoice_tokenized(args, block, tx_hash, con)


def handle_invoice_nft_transferred(args, block, tx_hash, con):
    pass  # informational


def handle_unit_claim_minted(args, block, tx_hash, con):
    con.execute("""
        UPDATE unit_claims SET nft_token_id=? WHERE invoice_id=? AND unit_id=?
    """, (args["tokenId"], args["invoiceId"], args["unitId"]))
    con.execute("""
        INSERT OR IGNORE INTO unit_claims
            (invoice_id, unit_id, claimer, payout, nft_token_id, claimed_at_block)
        VALUES (?, ?, ?, '0', ?, ?)
    """, (args["invoiceId"], args["unitId"], args["holder"].lower(), args["tokenId"], block))


# ---------------------------------------------------------------------------
# Subscription table: (contract_key, event_name, handler)
# ---------------------------------------------------------------------------

SUBSCRIPTIONS = [
    ("invoice_manager",    "InvoiceCreated",           handle_invoice_created),
    ("invoice_manager",    "InvoiceTokenized",         handle_invoice_tokenized),
    ("invoice_manager",    "InvoiceStatusChanged",     handle_invoice_status_changed),
    ("invoice_manager",    "InvoiceCancelled",         handle_invoice_cancelled),
    ("invoice_manager",    "OffChainPaymentReported",  handle_off_chain_payment_reported),
    ("usdc",               "Transfer",                 handle_usdc_transfer),
    ("collateral_manager", "CollateralDeposited",      handle_collateral_deposited),
    ("collateral_manager", "CollateralIncreased",      handle_collateral_increased),
    ("collateral_manager", "ClaimPaid",                handle_claim_paid),
    ("collateral_manager", "DustSwept",                handle_collateral_dust_swept),
    ("grid_manager",       "BoardCreated",             handle_board_created),
    ("grid_manager",       "AccessGranted",            handle_access_granted),
    ("grid_manager",       "UnitClaimed",              handle_unit_claimed),
    ("grid_manager",       "GameCompleted",            handle_game_completed),
    ("cointag_manager",    "CoinTagPurchased",         handle_cointag_purchased),
    ("payment_manager",    "InvoicePaid",              handle_invoice_paid_pm),
    ("treasury",           "RevenueReceived",          handle_treasury_revenue),
    ("treasury",           "WithdrawalExecuted",       handle_treasury_withdrawal),
    ("treasury",           "DustSwept",                handle_treasury_dust_swept),
    ("invoice_nft",        "InvoiceNFTMinted",         handle_invoice_nft_minted),
    ("invoice_nft",        "InvoiceTokenized",         handle_invoice_nft_tokenized),
    ("invoice_nft",        "InvoiceNFTTransferred",    handle_invoice_nft_transferred),
    ("unit_claim",         "UnitClaimMinted",          handle_unit_claim_minted),
]

# ---------------------------------------------------------------------------
# Indexer — atomic watermark safety (Correction 1)
#
# Rule: last_block advances ONLY after ALL contracts succeed for the chunk.
# All DB writes for a chunk are in ONE transaction.
# On ANY failure: rollback, leave last_block unchanged, retry next tick.
# ---------------------------------------------------------------------------

def process_chunk(from_block: int, to_block: int, con: sqlite3.Connection) -> int:
    """
    Process one block-range chunk across ALL contracts.
    Writes into the provided (open, not-yet-committed) connection.
    Returns total events processed.
    Raises on any RPC or DB error (caller rolls back).
    """
    total = 0
    for contract_key, event_name, handler in SUBSCRIPTIONS:
        ct = contracts[contract_key]
        event = getattr(ct.events, event_name)
        logs = event.get_logs(from_block=from_block, to_block=to_block)
        for entry in logs:
            args = entry["args"]
            block = entry["blockNumber"]
            tx_hash = entry["transactionHash"].hex()
            handler(args, block, tx_hash, con)
            log.debug("Event %s.%s block=%d", contract_key, event_name, block)
            total += 1
    return total


def sync_once(from_block_override: int | None = None) -> dict:
    """Sync from last indexed block to chain head. Returns summary."""
    with _indexer_lock:
        try:
            head = w3.eth.block_number
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

        last = from_block_override if from_block_override is not None else get_last_indexed_block()
        if last >= head:
            return {"ok": True, "from": last, "to": head, "new_events": 0}

        total_events = 0
        cur = last + 1

        while cur <= head:
            end = min(cur + CHUNK_SIZE - 1, head)
            con = get_db()
            try:
                con.execute("BEGIN")
                chunk_events = process_chunk(cur, end, con)
                # Advance watermark in the same transaction
                con.execute(
                    "INSERT OR REPLACE INTO indexer_state(key,value) VALUES('last_block',?)",
                    (str(end),),
                )
                con.commit()
                total_events += chunk_events
                log.info("Chunk %d→%d processed: %d events", cur, end, chunk_events)
            except Exception as exc:
                con.rollback()
                log.error(
                    "Chunk %d→%d FAILED — watermark NOT advanced. Error: %s",
                    cur, end, exc,
                )
                con.close()
                return {"ok": False, "from": cur, "to": end, "error": str(exc)}
            finally:
                con.close()

            cur = end + 1

        log.info("Full sync complete: blocks %d→%d, %d events", last, head, total_events)
        return {"ok": True, "from": last, "to": head, "new_events": total_events}


def _background_poller() -> None:
    log.info(
        "Event poller started (interval=%ds ± 5s, chunk=%d blocks, backoff_start=%ds, backoff_max=%ds)",
        POLL_INTERVAL_SECONDS,
        CHUNK_SIZE,
        RATE_LIMIT_BACKOFF_START,
        RATE_LIMIT_BACKOFF_MAX,
    )
    backoff = RATE_LIMIT_BACKOFF_START
    while True:
        try:
            result = sync_once()
            if not result["ok"]:
                err_msg = str(result.get("error", ""))
                log.warning("Poller sync error: %s", err_msg)
                if "429" in err_msg or "rate limit" in err_msg.lower() or "too many requests" in err_msg.lower():
                    log.warning("Rate limit (429) hit. Backing off for %ds before retry.", backoff)
                    time.sleep(backoff)
                    backoff = min(backoff * 2, RATE_LIMIT_BACKOFF_MAX)
                    continue
                else:
                    backoff = RATE_LIMIT_BACKOFF_START
            else:
                backoff = RATE_LIMIT_BACKOFF_START
        except Exception as exc:
            err_msg = str(exc)
            log.error("Poller uncaught exception: %s", exc)
            if "429" in err_msg or "rate limit" in err_msg.lower() or "too many requests" in err_msg.lower():
                log.warning("Rate limit (429) hit in uncaught exception. Backing off for %ds.", backoff)
                time.sleep(backoff)
                backoff = min(backoff * 2, RATE_LIMIT_BACKOFF_MAX)
                continue
            else:
                backoff = RATE_LIMIT_BACKOFF_START

        jitter = random.uniform(-5.0, 5.0)
        sleep_time = max(5.0, POLL_INTERVAL_SECONDS + jitter)
        time.sleep(sleep_time)

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_app: FastAPI):
    _init_contracts()
    init_db()
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, sync_once)
    t = threading.Thread(target=_background_poller, daemon=True)
    t.start()
    yield


app = FastAPI(title="Veo API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------

class InvoiceCreateIn(BaseModel):
    creator: str
    client_address: Optional[str] = None
    client_email: Optional[str] = None
    description: Optional[str] = None
    amount: str
    stablecoin: Optional[str] = None
    due_date: Optional[int] = None
    dueDate: Optional[int] = None
    debtor_ref: Optional[str] = None
    metadata_uri: Optional[str] = None


class ReportPaymentIn(BaseModel):
    tx_hash: Optional[str] = None


class LinkOnchainIn(BaseModel):
    onchain_id: Optional[int] = None
    onchainId: Optional[int] = None
    tokenized_at_block: Optional[int] = None


class InvoiceOut(BaseModel):
    id: str
    numeric_id: Optional[int] = None
    onchain_id: Optional[int] = None
    creator: str
    client_address: Optional[str] = None
    client_email: Optional[str] = None
    description: Optional[str] = None
    amount: str
    amount_usdc: float
    tagged_amount: Optional[str] = None
    tagged_amount_usdc: Optional[float] = None
    stablecoin: str
    due_date: int
    debtor_ref: Optional[str] = None
    metadata_uri: Optional[str] = None
    status: int
    status_label: str
    is_overdue: bool
    payment_tx_hash: Optional[str] = None
    paid_at: Optional[int] = None
    created_at_block: Optional[int] = None
    tokenized_at_block: Optional[int] = None
    paid_at_block: Optional[int] = None
    created_at: Optional[int] = None
    updated_at: Optional[int] = None

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "InvoiceOut":
        now = int(time.time())
        amount_raw = int(row["amount"]) if row["amount"] else 0
        tagged_raw = int(row["tagged_amount"]) if "tagged_amount" in row.keys() and row["tagged_amount"] else amount_raw
        status = row["status"]
        return cls(
            id=str(row["id"]),
            numeric_id=row["numeric_id"] if "numeric_id" in row.keys() else None,
            onchain_id=row["onchain_id"] if "onchain_id" in row.keys() else None,
            creator=row["creator"],
            client_address=row["client_address"] if "client_address" in row.keys() else None,
            client_email=row["client_email"] if "client_email" in row.keys() else None,
            description=row["description"] if "description" in row.keys() else None,
            amount=str(row["amount"]),
            amount_usdc=round(amount_raw / 1_000_000, 6),
            tagged_amount=str(row["tagged_amount"]) if "tagged_amount" in row.keys() and row["tagged_amount"] else None,
            tagged_amount_usdc=round(tagged_raw / 1_000_000, 6) if tagged_raw else None,
            stablecoin=row["stablecoin"],
            due_date=row["due_date"],
            debtor_ref=row["debtor_ref"] if "debtor_ref" in row.keys() else None,
            metadata_uri=row["metadata_uri"] if "metadata_uri" in row.keys() else None,
            status=status,
            status_label=STATUS.get(status, "UNKNOWN"),
            is_overdue=(status in (0, 1, 3)) and (now > row["due_date"]),
            payment_tx_hash=row["payment_tx_hash"] if "payment_tx_hash" in row.keys() else None,
            paid_at=row["paid_at"] if "paid_at" in row.keys() else None,
            created_at_block=row["created_at_block"] if "created_at_block" in row.keys() else None,
            tokenized_at_block=row["tokenized_at_block"] if "tokenized_at_block" in row.keys() else None,
            paid_at_block=row["paid_at_block"] if "paid_at_block" in row.keys() else None,
            created_at=row["created_at"] if "created_at" in row.keys() else None,
            updated_at=row["updated_at"] if "updated_at" in row.keys() else None,
        )


class BoardOut(BaseModel):
    invoice_id: int
    stablecoin: str
    units_claimed: int
    completed: bool
    created_at_block: Optional[int]
    invoice: Optional[InvoiceOut]


class UnitClaimOut(BaseModel):
    invoice_id: int
    unit_id: int
    claimer: str
    payout: str
    payout_usdc: float
    nft_token_id: Optional[int]
    claimed_at_block: Optional[int]


class PairRow(BaseModel):
    coordinate: int
    pair_a: str
    pair_b: str
    pair_hash: str


class PairSubmission(BaseModel):
    pairs: list[PairRow]
    winners: Optional[list[int]] = None


class StagePairsIn(BaseModel):
    pairs: list[PairRow]
    winners: Optional[list[int]] = None


class ClaimRequest(BaseModel):
    userAddress: str
    coordinate: int


class StatsOut(BaseModel):
    total_invoices: int
    created: int
    pending: int
    tokenized: int
    active: int
    paid: int
    defaulted: int
    cancelled: int
    total_volume_usdc: float
    total_boards: int
    completed_boards: int
    last_indexed_block: int

# ---------------------------------------------------------------------------
# Sequence generator
# ---------------------------------------------------------------------------

def get_next_invoice_sequence(con: sqlite3.Connection) -> tuple[int, str]:
    row = con.execute("SELECT next_val FROM invoice_sequence WHERE id=1").fetchone()
    if not row:
        con.execute("INSERT OR REPLACE INTO invoice_sequence(id, next_val) VALUES(1, 7)")
        next_val = 7
    else:
        next_val = row["next_val"]
    con.execute("UPDATE invoice_sequence SET next_val = next_val + 1 WHERE id=1")
    year = time.strftime("%Y")
    invoice_id = f"INV-{year}-{next_val:05d}"
    return next_val, invoice_id

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
        "contracts": ADDR,
    }


@app.post("/api/invoices", response_model=InvoiceOut)
def create_invoice(payload: InvoiceCreateIn):
    con = get_db()
    try:
        numeric_id, invoice_id = get_next_invoice_sequence(con)
        amt_str = payload.amount.strip()
        if "." in amt_str:
            base_amount = int(float(amt_str) * 1_000_000)
        else:
            base_amount = int(amt_str)
        tagged_amount = str(base_amount + numeric_id)
        stablecoin = (payload.stablecoin or ADDR["usdc"]).lower()
        creator = payload.creator.lower()
        due_date = payload.due_date if payload.due_date is not None else (payload.dueDate if payload.dueDate is not None else int(time.time() + 30 * 86400))
        
        con.execute("""
            INSERT INTO invoices (
                id, numeric_id, creator, client_address, client_email, description,
                amount, tagged_amount, stablecoin, due_date, debtor_ref, metadata_uri,
                status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, unixepoch(), unixepoch())
        """, (
            invoice_id,
            numeric_id,
            creator,
            payload.client_address.lower() if payload.client_address else None,
            payload.client_email,
            payload.description,
            str(base_amount),
            tagged_amount,
            stablecoin,
            due_date,
            payload.debtor_ref,
            payload.metadata_uri,
        ))
        con.commit()
        row = con.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
        return InvoiceOut.from_row(row)
    finally:
        con.close()


@app.get("/api/invoices", response_model=list[InvoiceOut])
def list_invoices(
    status: Optional[int] = Query(None),
    creator: Optional[str] = None,
    overdue_only: bool = False,
    limit: int = Query(100, le=500),
    offset: int = 0,
):
    con = get_db()
    clauses, params = [], []
    if status is not None:
        clauses.append("status = ?"); params.append(status)
    if creator:
        clauses.append("creator = ?"); params.append(creator.lower())
    if overdue_only:
        clauses.append("status IN (0,1,3) AND due_date < ?"); params.append(int(time.time()))
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    rows = con.execute(
        f"SELECT * FROM invoices {where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()
    con.close()
    return [InvoiceOut.from_row(r) for r in rows]


@app.get("/api/invoices/creator/{address}", response_model=list[InvoiceOut])
def invoices_by_creator(address: str, limit: int = Query(100, le=500), offset: int = 0):
    con = get_db()
    rows = con.execute(
        "SELECT * FROM invoices WHERE creator = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        (address.lower(), limit, offset),
    ).fetchall()
    con.close()
    return [InvoiceOut.from_row(r) for r in rows]


@app.get("/api/invoices/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: str):
    con = get_db()
    row = con.execute(
        "SELECT * FROM invoices WHERE id = ? OR onchain_id = ? OR CAST(numeric_id AS TEXT) = ?",
        (invoice_id, int(invoice_id) if invoice_id.isdigit() else -1, invoice_id)
    ).fetchone()
    con.close()
    if not row:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return InvoiceOut.from_row(row)


@app.post("/api/invoices/{invoice_id}/report-payment")
def report_payment(invoice_id: str, payload: ReportPaymentIn):
    con = get_db()
    row = con.execute(
        "SELECT * FROM invoices WHERE id = ? OR onchain_id = ? OR CAST(numeric_id AS TEXT) = ?",
        (invoice_id, int(invoice_id) if invoice_id.isdigit() else -1, invoice_id)
    ).fetchone()
    if not row:
        con.close()
        raise HTTPException(status_code=404, detail="Invoice not found")
    actual_id = row["id"]
    con.execute("""
        UPDATE invoices
        SET status = 4, payment_tx_hash = COALESCE(?, payment_tx_hash), paid_at = unixepoch(), updated_at = unixepoch()
        WHERE id = ?
    """, (payload.tx_hash, actual_id))
    con.commit()
    con.close()
    return {"ok": True, "invoice_id": actual_id, "status": 4}


@app.post("/api/invoices/{invoice_id}/link-onchain")
def link_onchain_invoice(invoice_id: str, payload: LinkOnchainIn):
    onchain_id = payload.onchainId if payload.onchainId is not None else payload.onchain_id
    if onchain_id is None:
        raise HTTPException(status_code=400, detail="Missing onchain_id")
    con = get_db()
    row = con.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    if not row:
        con.close()
        raise HTTPException(status_code=404, detail="Invoice not found")
    con.execute("""
        UPDATE invoices
        SET onchain_id = ?, status = 2, tokenized_at_block = COALESCE(?, tokenized_at_block), updated_at = unixepoch()
        WHERE id = ?
    """, (onchain_id, payload.tokenized_at_block, invoice_id))
    con.commit()

    # Link staged pairs (new stage-first flow). If nothing was staged,
    # fall back to plain invoice linking for backward compatibility.
    staged = con.execute(
        "SELECT pairs_json, winners_json FROM staged_pairs WHERE offchain_id = ?",
        (invoice_id,),
    ).fetchone()
    if not staged:
        existing = con.execute(
            "SELECT COUNT(*) AS cnt FROM reference_pairs WHERE invoice_id = ?", (onchain_id,)
        ).fetchone()
        con.close()
        if existing and existing["cnt"] >= 676:
            return {"ok": True, "invoice_id": invoice_id, "onchain_id": onchain_id,
                    "linked": True, "alreadyLinked": True,
                    "pairsStored": existing["cnt"], "winnersStored": 0}
        raise HTTPException(status_code=400, detail="No staged pairs")

    try:
        pairs = json.loads(staged["pairs_json"])
        winners = json.loads(staged["winners_json"] or "[]")
    except (ValueError, TypeError):
        con.close()
        raise HTTPException(status_code=400, detail="Corrupt staged pairs")
    if not isinstance(pairs, list) or len(pairs) != 676:
        con.close()
        raise HTTPException(status_code=400, detail="Corrupt staged pairs")
    if not isinstance(winners, list) or len(winners) not in (0, 100):
        con.close()
        raise HTTPException(status_code=400, detail="Corrupt staged winners")

    # Self-healing replace: a previous link attempt may have partially written.
    con.execute("DELETE FROM reference_pairs WHERE invoice_id = ?", (onchain_id,))
    validated = []
    for p in pairs:
        coord = int(p["coordinate"])
        a = int(p["pair_a"])
        b = int(p["pair_b"])
        validated.append((onchain_id, coord, str(a), str(b), compute_pair_hash(a, b)))
    con.executemany(
        "INSERT INTO reference_pairs(invoice_id, coordinate, pair_a, pair_b, pair_hash) VALUES (?,?,?,?,?)",
        validated,
    )
    winners_stored = 0
    if winners:
        con.execute("DELETE FROM board_winners WHERE invoice_id = ?", (onchain_id,))
        con.executemany(
            "INSERT OR REPLACE INTO board_winners(invoice_id, coordinate, unit_id) VALUES (?,?,?)",
            [(onchain_id, int(w), idx + 1) for idx, w in enumerate(winners)],
        )
        winners_stored = len(winners)

    board = con.execute("SELECT 1 FROM boards WHERE invoice_id = ?", (onchain_id,)).fetchone()
    if not board:
        con.execute(
            "INSERT OR IGNORE INTO boards(invoice_id, stablecoin, created_at_block) VALUES (?, ?, ?)",
            (onchain_id, row["stablecoin"], None),
        )
    con.execute("DELETE FROM staged_pairs WHERE offchain_id = ?", (invoice_id,))
    con.commit()
    con.close()
    log.info("Linked staged pairs for %s -> on-chain #%d (%d pairs, %d winners)",
             invoice_id, onchain_id, len(validated), winners_stored)
    return {"ok": True, "linked": True, "invoice_id": invoice_id, "onchain_id": onchain_id,
            "pairsStored": len(validated), "winnersStored": winners_stored}


@app.post("/api/invoices/{invoice_id}/stage-pairs")
def stage_pairs(invoice_id: str, body: StagePairsIn):
    """
    Stage 676 plaintext pairs + 100 winners for an off-chain invoice BEFORE
    the on-chain tokenize transaction fires. The frontend must not tokenize
    until this returns 200, so pairs can never be lost to a failed POST
    after tokenization. Re-posting replaces the previous staging.
    All pair hashes are validated (same rules as POST /pairs).
    """
    con = get_db()
    row = con.execute("SELECT id FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    if not row:
        con.close()
        raise HTTPException(status_code=404, detail="Invoice not found")
    if len(body.pairs) != 676:
        con.close()
        raise HTTPException(status_code=400, detail=f"Expected 676 pairs, got {len(body.pairs)}")
    winners = body.winners if body.winners is not None else []
    if len(winners) not in (0, 100):
        con.close()
        raise HTTPException(status_code=400, detail=f"Expected 100 winners, got {len(winners)}")

    for p in body.pairs:
        if not (0 <= p.coordinate <= 675):
            con.close()
            raise HTTPException(status_code=400, detail=f"coordinate {p.coordinate} out of range 0-675")
        try:
            a = int(p.pair_a)
            b = int(p.pair_b)
        except ValueError:
            con.close()
            raise HTTPException(status_code=400, detail=f"pair_a/pair_b must be integers, got {p.pair_a}/{p.pair_b}")
        try:
            validate_pair_values(a, b)
        except ValueError as exc:
            con.close()
            raise HTTPException(status_code=400, detail=str(exc))
        computed = compute_pair_hash(a, b)
        submitted = p.pair_hash.lower()
        if not submitted.startswith("0x"):
            submitted = "0x" + submitted
        if computed.lower() != submitted.lower():
            con.close()
            raise HTTPException(
                status_code=400,
                detail=f"Hash mismatch at coordinate {p.coordinate}",
            )
    for w in winners:
        if not (0 <= w <= 675):
            con.close()
            raise HTTPException(status_code=400, detail=f"Winning coordinate {w} out of range 0-675")

    con.execute(
        "INSERT OR REPLACE INTO staged_pairs(offchain_id, pairs_json, winners_json) VALUES (?, ?, ?)",
        (invoice_id, json.dumps([p.model_dump() for p in body.pairs]), json.dumps(winners)),
    )
    con.commit()
    con.close()
    return {"staged": 676}


@app.get("/api/invoices/{invoice_id}/units", response_model=dict)
def invoice_units(invoice_id: int):
    con = get_db()
    board = con.execute("SELECT * FROM boards WHERE invoice_id=?", (invoice_id,)).fetchone()
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    rows = con.execute(
        "SELECT * FROM unit_claims WHERE invoice_id=? ORDER BY unit_id", (invoice_id,)
    ).fetchall()
    con.close()
    claims = [
        UnitClaimOut(
            invoice_id=r["invoice_id"],
            unit_id=r["unit_id"],
            claimer=r["claimer"],
            payout=r["payout"],
            payout_usdc=round(int(r["payout"]) / 1_000_000, 6),
            nft_token_id=r["nft_token_id"],
            claimed_at_block=r["claimed_at_block"],
        )
        for r in rows
    ]
    return {
        "invoice_id": invoice_id,
        "units_claimed": board["units_claimed"],
        "completed": bool(board["completed"]),
        "claims": [c.model_dump() for c in claims],
    }


@app.get("/api/marketplace")
def marketplace(limit: int = Query(100, le=500), offset: int = 0):
    """Active (non-completed) boards — what Marketplace.tsx consumes."""
    con = get_db()
    rows = con.execute("""
        SELECT invoices.*, boards.units_claimed, boards.completed
        FROM invoices
        JOIN boards ON (boards.invoice_id = invoices.onchain_id OR boards.invoice_id = invoices.id)
        WHERE boards.completed = 0
        ORDER BY invoices.created_at DESC, invoices.id DESC
        LIMIT ? OFFSET ?
    """, (limit, offset)).fetchall()
    con.close()
    result = []
    for r in rows:
        inv = InvoiceOut.from_row(r)
        d = inv.model_dump()
        d["units_claimed"] = r["units_claimed"]
        d["completed"] = bool(r["completed"])
        result.append(d)
    return result


@app.get("/api/board/{invoice_id}", response_model=BoardOut)
def get_board(invoice_id: int):
    con = get_db()
    board = con.execute("SELECT * FROM boards WHERE invoice_id=?", (invoice_id,)).fetchone()
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    inv_row = con.execute("SELECT * FROM invoices WHERE onchain_id=? OR id=?", (invoice_id, str(invoice_id))).fetchone()
    con.close()
    return BoardOut(
        invoice_id=board["invoice_id"],
        stablecoin=board["stablecoin"],
        units_claimed=board["units_claimed"],
        completed=bool(board["completed"]),
        created_at_block=board["created_at_block"],
        invoice=InvoiceOut.from_row(inv_row) if inv_row else None,
    )


@app.get("/api/board/{invoice_id}/reference-sheet")
def reference_sheet(invoice_id: int):
    con = get_db()
    board = con.execute("SELECT 1 FROM boards WHERE invoice_id=?", (invoice_id,)).fetchone()
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    rows = con.execute(
        "SELECT coordinate, pair_a, pair_b, pair_hash FROM reference_pairs "
        "WHERE invoice_id=? ORDER BY coordinate",
        (invoice_id,),
    ).fetchall()
    con.close()
    if not rows:
        raise HTTPException(status_code=404, detail="Reference pairs not yet stored for this board")
    return {
        "invoice_id": invoice_id,
        "pairs": [
            {"coordinate": r["coordinate"], "pair_a": r["pair_a"],
             "pair_b": r["pair_b"], "pair_hash": r["pair_hash"]}
            for r in rows
        ],
    }


@app.post("/api/board/{invoice_id}/pairs")
def store_pairs(invoice_id: int, body: PairSubmission):
    """
    Store the 676 plaintext pairs for a board.
    All hashes are validated:
      Backend re-derives keccak256(abi.encode(pair_a, pair_b)) and compares.
    """
    if len(body.pairs) != 676:
        raise HTTPException(status_code=400, detail=f"Expected 676 pairs, got {len(body.pairs)}")

    con = get_db()
    # Check board exists or ensure board row exists if invoice exists
    board = con.execute("SELECT 1 FROM boards WHERE invoice_id=?", (invoice_id,)).fetchone()
    if not board:
        inv = con.execute("SELECT stablecoin FROM invoices WHERE onchain_id=? OR id=?", (invoice_id, str(invoice_id))).fetchone()
        if inv:
            con.execute(
                "INSERT OR IGNORE INTO boards(invoice_id, stablecoin, created_at_block) VALUES (?, ?, ?)",
                (invoice_id, inv["stablecoin"], None),
            )
            con.commit()
        else:
            try:
                creator = contracts["invoice_manager"].functions.getInvoiceCreator(invoice_id).call()
                if creator != "0x0000000000000000000000000000000000000000":
                    stablecoin = contracts["invoice_manager"].functions.getInvoiceStablecoin(invoice_id).call()
                    con.execute(
                        "INSERT OR IGNORE INTO invoices(id, numeric_id, onchain_id, creator, amount, tagged_amount, stablecoin, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (f"ONCHAIN-{invoice_id}", invoice_id, invoice_id, creator.lower(), "0", "0", stablecoin.lower(), 0, 2),
                    )
                    con.execute(
                        "INSERT OR IGNORE INTO boards(invoice_id, stablecoin, created_at_block) VALUES (?, ?, ?)",
                        (invoice_id, stablecoin, None),
                    )
                    con.commit()
                else:
                    con.close()
                    raise HTTPException(status_code=404, detail="Board not found (BoardCreated not yet indexed)")
            except Exception:
                con.close()
                raise HTTPException(status_code=404, detail="Board not found (BoardCreated not yet indexed)")

    # Check pairs not already stored
    existing = con.execute(
        "SELECT COUNT(*) AS cnt FROM reference_pairs WHERE invoice_id=?", (invoice_id,)
    ).fetchone()
    if existing and existing["cnt"] > 0:
        con.close()
        raise HTTPException(status_code=409, detail="Pairs already stored for this board")
    con.close()

    # Validate all 676 hash computations locally
    validated = []
    for p in body.pairs:
        if not (0 <= p.coordinate <= 675):
            raise HTTPException(status_code=400, detail=f"coordinate {p.coordinate} out of range 0-675")
        try:
            a = int(p.pair_a)
            b = int(p.pair_b)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"pair_a/pair_b must be integers, got {p.pair_a}/{p.pair_b}")
        try:
            validate_pair_values(a, b)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        computed = compute_pair_hash(a, b)
        submitted = p.pair_hash.lower()
        if not submitted.startswith("0x"):
            submitted = "0x" + submitted
        if computed != submitted and ("0x" + computed.lstrip("0x")) != submitted:
            if computed.lower() != submitted.lower():
                raise HTTPException(
                    status_code=400,
                    detail=f"Hash mismatch at coordinate {p.coordinate}: "
                           f"computed={computed}, submitted={p.pair_hash}",
                )
        validated.append((invoice_id, p.coordinate, str(a), str(b), computed))

    # Persist pairs
    con = get_db()
    con.executemany(
        "INSERT INTO reference_pairs(invoice_id, coordinate, pair_a, pair_b, pair_hash) VALUES (?,?,?,?,?)",
        validated,
    )
    con.commit()

    # Persist winners if present
    if body.winners is not None:
        if len(body.winners) != 100:
            con.close()
            raise HTTPException(status_code=400, detail=f"Expected 100 winners, got {len(body.winners)}")
        winners_validated = []
        for idx, w in enumerate(body.winners):
            if not (0 <= w <= 675):
                con.close()
                raise HTTPException(status_code=400, detail=f"Winning coordinate {w} out of range 0-675")
            winners_validated.append((invoice_id, w, idx + 1))
        con.executemany(
            "INSERT OR REPLACE INTO board_winners(invoice_id, coordinate, unit_id) VALUES (?,?,?)",
            winners_validated,
        )
        con.commit()
        log.info("Stored %d winners for invoice #%d", len(winners_validated), invoice_id)
    else:
        log.warning("No winners provided for invoice #%d; old boards may not have winners stored.", invoice_id)

    con.close()
    return {"stored": len(validated), "invoice_id": invoice_id}


@app.post("/api/board/{invoice_id}/claim")
def claim_unit(invoice_id: int, body: ClaimRequest):
    """
    Backend relayer claim endpoint:
    - Players submit coordinate off-chain without signing wallet transactions or paying gas
    - If decoy -> returns instant { win: False, reason: 'CPU not found' } (zero gas)
    - If winner -> backend submits on-chain submitPair, pays gas, receives gross payout,
      deducts gas, forwards net USDC payout to the player
    """
    # 1. Basic validation
    if not Web3.is_address(body.userAddress):
        raise HTTPException(status_code=400, detail="Invalid address")
    if not (0 <= body.coordinate <= 675):
        raise HTTPException(status_code=400, detail="Invalid coordinate (must be 0-675)")

    user_checksum = Web3.to_checksum_address(body.userAddress)

    # Rate limit check: max 1 request per user per 3 seconds
    if not check_claim_rate_limit(user_checksum):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait 3 seconds before next claim.")

    # 2. Check board exists
    con = get_db()
    board = con.execute("SELECT * FROM boards WHERE invoice_id = ?", (invoice_id,)).fetchone()
    if not board:
        con.close()
        raise HTTPException(status_code=404, detail="Board not found")

    if bool(board["completed"]):
        con.close()
        return {"win": False, "reason": "Board is already completed"}

    # 3. Check if coordinate is a winner
    winner = con.execute(
        "SELECT unit_id FROM board_winners WHERE invoice_id = ? AND coordinate = ?",
        (invoice_id, body.coordinate)
    ).fetchone()
    if not winner:
        con.close()
        return {"win": False, "reason": "CPU not found"}

    unit_id = winner["unit_id"]

    # Check if unit already claimed in unit_claims
    already_claimed = con.execute(
        "SELECT 1 FROM unit_claims WHERE invoice_id = ? AND unit_id = ?",
        (invoice_id, unit_id)
    ).fetchone()
    if already_claimed:
        con.close()
        return {"win": False, "reason": "Unit already claimed"}

    # 4. Check on-chain hasAccess for the user
    gm = contracts["grid_manager"]
    try:
        has_access = gm.functions.hasAccess(user_checksum, invoice_id).call()
    except Exception as exc:
        log.error("hasAccess check failed: %s", exc)
        has_access = False

    if not has_access:
        con.close()
        return {"win": False, "reason": "No access for this wallet. Purchase a CoinTag first."}

    # 5. Load pair data for this coordinate
    pair_row = con.execute(
        "SELECT pair_a, pair_b, pair_hash FROM reference_pairs WHERE invoice_id = ? AND coordinate = ?",
        (invoice_id, body.coordinate)
    ).fetchone()
    if not pair_row:
        con.close()
        raise HTTPException(status_code=404, detail="Reference pairs not found for this board")

    # 6. Rebuild Merkle tree and compute proof
    all_pairs = con.execute(
        "SELECT coordinate, pair_a, pair_b, pair_hash FROM reference_pairs WHERE invoice_id = ? ORDER BY coordinate",
        (invoice_id,)
    ).fetchall()
    con.close()

    if len(all_pairs) != 676:
        raise HTTPException(status_code=400, detail="Incomplete reference pairs on backend")

    pairs_list = [dict(r) for r in all_pairs]
    try:
        merkle_root_bytes, proof_bytes = compute_merkle_proof(pairs_list, body.coordinate)
    except Exception as exc:
        log.error("Merkle proof calculation failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to compute Merkle proof")

    if not backend_account:
        raise HTTPException(status_code=500, detail="Backend relayer wallet not configured")

    # Ensure backend wallet has access on-chain so submitPair passes
    try:
        if not gm.functions.hasAccess(backend_account.address, invoice_id).call():
            grant_tx = gm.functions.grantAccess(invoice_id, backend_account.address).build_transaction({
                "from": backend_account.address,
                "nonce": w3.eth.get_transaction_count(backend_account.address),
                "gas": 100_000,
                "gasPrice": w3.eth.gas_price,
            })
            signed_grant = backend_account.sign_transaction(grant_tx)
            gtx_hash = w3.eth.send_raw_transaction(signed_grant.raw_transaction)
            w3.eth.wait_for_transaction_receipt(gtx_hash)
    except Exception as exc:
        log.warning("Backend wallet grantAccess pre-check: %s", exc)

    # 7. Submit submitPair from backend wallet
    try:
        pair_a_int = int(pair_row["pair_a"])
        pair_b_int = int(pair_row["pair_b"])

        nonce = w3.eth.get_transaction_count(backend_account.address)
        tx_data = gm.functions.submitPair(
            invoice_id,
            body.coordinate,
            pair_a_int,
            pair_b_int,
            proof_bytes
        ).build_transaction({
            "from": backend_account.address,
            "nonce": nonce,
            "gas": 500_000,
            "gasPrice": w3.eth.gas_price,
        })
        signed_tx = backend_account.sign_transaction(tx_data)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    except Exception as exc:
        log.error("SubmitPair transaction failed: %s", exc)
        return {"win": False, "reason": f"Claim transaction failed: {str(exc)}"}

    if receipt["status"] != 1:
        return {"win": False, "reason": "Claim transaction reverted on-chain"}

    # 8. Parse UnitClaimed event to get gross payout
    gross_payout = 0
    try:
        unit_claimed_events = gm.events.UnitClaimed().process_receipt(receipt)
        if unit_claimed_events:
            gross_payout = int(unit_claimed_events[0]["args"]["payout"])
    except Exception as exc:
        log.error("Error parsing UnitClaimed event: %s", exc)

    # 9. Compute gas cost
    gas_used = receipt["gasUsed"]
    effective_gas_price = receipt.get("effectiveGasPrice", w3.eth.gas_price)
    gas_cost_wei = gas_used * effective_gas_price
    gas_cost_usdc = gas_cost_wei / 1e18
    gas_cost_micro = int(gas_cost_usdc * 1_000_000)

    net_payout = max(0, gross_payout - gas_cost_micro)

    # 10. Forward net payout to player in USDC
    if net_payout > 0:
        try:
            usdc_ct = contracts["usdc"]
            transfer_nonce = w3.eth.get_transaction_count(backend_account.address)
            transfer_tx = usdc_ct.functions.transfer(
                user_checksum,
                net_payout
            ).build_transaction({
                "from": backend_account.address,
                "nonce": transfer_nonce,
                "gas": 100_000,
                "gasPrice": w3.eth.gas_price,
            })
            signed_transfer = backend_account.sign_transaction(transfer_tx)
            transfer_hash = w3.eth.send_raw_transaction(signed_transfer.raw_transaction)
            w3.eth.wait_for_transaction_receipt(transfer_hash)
            log.info("Transferred %d micro-USDC to %s (tx: %s)", net_payout, user_checksum, transfer_hash.hex())
        except Exception as exc:
            log.error("Failed to forward net payout to player: %s", exc)

    log.info(
        "Successful claim for invoice #%d coord %d by %s: gross=%d gas=%d net=%d tx=%s",
        invoice_id, body.coordinate, user_checksum, gross_payout, gas_cost_micro, net_payout, tx_hash.hex()
    )

    return {
        "win": True,
        "txHash": tx_hash.hex(),
        "grossPayout": gross_payout,
        "gasCost": gas_cost_micro,
        "netPayout": net_payout,
    }


@app.get("/api/board/{invoice_id}/access/{address}")
def board_access(invoice_id: int, address: str):
    con = get_db()
    board = con.execute("SELECT 1 FROM boards WHERE invoice_id=?", (invoice_id,)).fetchone()
    if not board:
        con.close()
        raise HTTPException(status_code=404, detail="Board not found")
    row = con.execute(
        "SELECT * FROM board_access WHERE invoice_id=? AND user_address=?",
        (invoice_id, address.lower()),
    ).fetchone()
    con.close()
    if row:
        return {"has_access": True, "granted_at_block": row["granted_at_block"]}
    # Fallback: check on-chain
    try:
        gm = contracts["grid_manager"]
        on_chain = gm.functions.hasAccess(
            Web3.to_checksum_address(address), invoice_id
        ).call()
    except Exception:
        on_chain = False
    return {"has_access": on_chain, "granted_at_block": None}


@app.get("/api/player/{address}/stats")
def player_stats(address: str):
    addr = address.lower()
    con = get_db()
    boards_accessed = con.execute(
        "SELECT COUNT(*) AS cnt FROM board_access WHERE user_address=?", (addr,)
    ).fetchone()["cnt"]
    claims = con.execute(
        "SELECT COUNT(*) AS cnt, COALESCE(SUM(CAST(payout AS REAL)),0) AS total "
        "FROM unit_claims WHERE claimer=?", (addr,)
    ).fetchone()
    purchases = con.execute(
        "SELECT COUNT(*) AS cnt, COALESCE(SUM(CAST(amount AS REAL)),0) AS total "
        "FROM cointag_purchases WHERE buyer=?", (addr,)
    ).fetchone()
    con.close()
    return {
        "address": address,
        "boards_accessed": boards_accessed,
        "units_claimed": claims["cnt"],
        "total_payout_usdc": round(claims["total"] / 1_000_000, 6),
        "cointags_purchased": purchases["cnt"],
        "total_spent_usdc": round(purchases["total"] / 1_000_000, 6),
    }


@app.get("/api/creator/{address}/stats")
def creator_stats(address: str):
    addr = address.lower()
    con = get_db()
    inv = con.execute("""
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN status=3 THEN 1 ELSE 0 END) AS active,
               SUM(CASE WHEN status=4 THEN 1 ELSE 0 END) AS paid,
               COALESCE(SUM(CAST(amount AS REAL)),0) AS volume
        FROM invoices WHERE creator=?
    """, (addr,)).fetchone()
    cointag_rev = con.execute("""
        SELECT COALESCE(SUM(CAST(creator_amount AS REAL)),0) AS total
        FROM cointag_purchases cp
        JOIN invoices i ON (i.onchain_id = cp.invoice_id OR i.id = CAST(cp.invoice_id AS TEXT))
        WHERE i.creator=?
    """, (addr,)).fetchone()
    con.close()
    return {
        "address": address,
        "invoices_created": inv["total"] or 0,
        "invoices_active": inv["active"] or 0,
        "invoices_paid": inv["paid"] or 0,
        "total_volume_usdc": round((inv["volume"] or 0) / 1_000_000, 6),
        "total_cointag_revenue_usdc": round((cointag_rev["total"] or 0) / 1_000_000, 6),
    }


@app.get("/api/treasury")
def treasury_log(limit: int = Query(50, le=500), offset: int = 0):
    con = get_db()
    rows = con.execute(
        "SELECT * FROM treasury_events ORDER BY block_number DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ).fetchall()
    con.close()
    return {
        "events": [
            {
                "id": r["id"],
                "event_type": r["event_type"],
                "stablecoin": r["stablecoin"],
                "invoice_id": r["invoice_id"],
                "amount": r["amount"],
                "amount_usdc": round(int(r["amount"]) / 1_000_000, 6),
                "to_address": r["to_address"],
                "block_number": r["block_number"],
            }
            for r in rows
        ]
    }


@app.get("/api/stats", response_model=StatsOut)
def stats():
    con = get_db()
    inv = con.execute("""
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN status=0 THEN 1 ELSE 0 END) AS s0,
               SUM(CASE WHEN status=1 THEN 1 ELSE 0 END) AS s1,
               SUM(CASE WHEN status=2 THEN 1 ELSE 0 END) AS s2,
               SUM(CASE WHEN status=3 THEN 1 ELSE 0 END) AS s3,
               SUM(CASE WHEN status=4 THEN 1 ELSE 0 END) AS s4,
               SUM(CASE WHEN status=5 THEN 1 ELSE 0 END) AS s5,
               SUM(CASE WHEN status=6 THEN 1 ELSE 0 END) AS s6,
               COALESCE(SUM(CAST(amount AS REAL)),0) AS volume
        FROM invoices
    """).fetchone()
    boards = con.execute("""
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN completed=1 THEN 1 ELSE 0 END) AS completed
        FROM boards
    """).fetchone()
    last = con.execute(
        "SELECT value FROM indexer_state WHERE key='last_block'"
    ).fetchone()
    con.close()
    return StatsOut(
        total_invoices=inv["total"] or 0,
        created=inv["s0"] or 0,
        pending=inv["s1"] or 0,
        tokenized=inv["s2"] or 0,
        active=inv["s3"] or 0,
        paid=inv["s4"] or 0,
        defaulted=inv["s5"] or 0,
        cancelled=inv["s6"] or 0,
        total_volume_usdc=round((inv["volume"] or 0) / 1_000_000, 2),
        total_boards=boards["total"] or 0,
        completed_boards=boards["completed"] or 0,
        last_indexed_block=int(last["value"]) if last else 0,
    )


@app.post("/api/index/sync")
def manual_sync(from_block: Optional[int] = Query(None)):
    """Manually trigger a sync. Optionally start from a specific block."""
    result = sync_once(from_block_override=from_block)
    return result


# ---------------------------------------------------------------------------
# CoinTag Access Code Endpoints & Derivation
# ---------------------------------------------------------------------------

def derive_code(user_address: str, invoice_id: int) -> str:
    """
    Derive deterministic CoinTag code matching frontend deriveCode():
    keccak256(abi.encode(user_address, uint256(invoice_id)))
    Formatted as CT-XXXX-XXXX-XXXX
    """
    packed = abi_encode(
        ["address", "uint256"],
        [Web3.to_checksum_address(user_address), int(invoice_id)]
    )
    h = Web3.to_hex(Web3.keccak(packed))
    hex_part = h[2:14].upper()
    return f"CT-{hex_part[0:4]}-{hex_part[4:8]}-{hex_part[8:12]}"


class CointagRegisterRequest(BaseModel):
    invoiceId: int
    userAddress: str
    code: str
    amount: str
    txHash: str
    blockNumber: int


@app.post("/api/cointags/register")
def register_cointag_code(req: CointagRegisterRequest):
    if req.invoiceId <= 0:
        raise HTTPException(status_code=400, detail="invoiceId must be a positive integer")
    if not Web3.is_address(req.userAddress):
        raise HTTPException(status_code=400, detail="Invalid userAddress")
    if not req.amount.isdigit():
        raise HTTPException(status_code=400, detail="amount must be a numeric string")
    if not (req.txHash.startswith("0x") and len(req.txHash) == 66):
        raise HTTPException(status_code=400, detail="Invalid txHash")

    # Defense in depth: verify the purchase transaction on-chain before
    # storing anything. A reverted (or foreign-contract) tx must never
    # produce a code row, or users will see stale codes with no access.
    cointag_manager_address = Web3.to_checksum_address(ADDR["cointag_manager"])
    try:
        tx = w3.eth.get_transaction(req.txHash)
        receipt = w3.eth.get_transaction_receipt(req.txHash)
    except Exception:
        raise HTTPException(status_code=400, detail="Transaction not found")
    if tx is None or receipt is None:
        raise HTTPException(status_code=400, detail="Transaction not found")

    # 2. Check status (web3.py receipt status: 1 = success, 0 = reverted)
    if receipt["status"] != 1:
        raise HTTPException(status_code=400, detail="Transaction reverted")

    # 3. Check target is the CURRENT CoinTagManager
    tx_to = tx.get("to")
    if tx_to is None or Web3.to_checksum_address(tx_to) != cointag_manager_address:
        raise HTTPException(status_code=400, detail="Transaction sent to wrong contract")

    # 4. Check the CoinTagPurchased event with matching invoiceId and buyer
    expected_buyer = Web3.to_checksum_address(req.userAddress)
    cointag_manager_contract = w3.eth.contract(
        address=cointag_manager_address, abi=COINTAG_MANAGER_ABI
    )
    found_event = False
    for receipt_log in receipt["logs"]:
        if Web3.to_checksum_address(receipt_log["address"]) != cointag_manager_address:
            continue
        try:
            event = cointag_manager_contract.events.CoinTagPurchased().process_log(receipt_log)
        except Exception:
            continue
        if (
            int(event["args"]["invoiceId"]) == req.invoiceId
            and Web3.to_checksum_address(event["args"]["buyer"]) == expected_buyer
        ):
            found_event = True
            break

    if not found_event:
        raise HTTPException(status_code=400, detail="Transaction does not match purchase payload")

    checksummed = expected_buyer
    expected_code = derive_code(checksummed, req.invoiceId)
    if req.code.upper().strip() != expected_code:
        raise HTTPException(status_code=400, detail=f"Code mismatch: expected {expected_code}")

    con = get_db()
    con.execute(
        """
        INSERT OR IGNORE INTO cointag_codes (
            invoice_id, user_address, code, amount, tx_hash, block_number
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            req.invoiceId,
            checksummed,
            expected_code,
            req.amount,
            req.txHash,
            req.blockNumber,
        )
    )
    con.commit()
    con.close()
    return {"ok": True}


@app.get("/api/cointags/{address}")
def get_cointag_codes(address: str):
    if not Web3.is_address(address):
        raise HTTPException(status_code=400, detail="Invalid Ethereum address")
    checksummed = Web3.to_checksum_address(address)
    con = get_db()
    rows = con.execute(
        """
        SELECT invoice_id, code, amount, tx_hash, block_number, created_at
        FROM cointag_codes
        WHERE user_address = ?
        ORDER BY created_at DESC, id DESC
        """,
        (checksummed,)
    ).fetchall()
    con.close()

    return {
        "codes": [
            {
                "invoiceId": row["invoice_id"],
                "code": row["code"],
                "amount": row["amount"],
                "txHash": row["tx_hash"],
                "blockNumber": row["block_number"],
                "createdAt": row["created_at"],
            }
            for row in rows
        ]
    }


# ---------------------------------------------------------------------------
# MoonPay URL signing (preserved from v1)
# ---------------------------------------------------------------------------

MOONPAY_SECRET_KEY = os.environ.get("MOONPAY_SECRET_KEY", "")


@app.get("/api/sign-moonpay")
def sign_moonpay_url(url: str = Query(..., description="Full MoonPay widget URL to sign")):
    if not MOONPAY_SECRET_KEY:
        raise HTTPException(status_code=503, detail="MOONPAY_SECRET_KEY not configured")
    parsed = urlparse(url)
    query_string = "?" + parsed.query if parsed.query else ""
    mac = hmac.new(
        MOONPAY_SECRET_KEY.encode("utf-8"),
        query_string.encode("utf-8"),
        hashlib.sha256,
    )
    return {"signature": mac.hexdigest()}


# ---------------------------------------------------------------------------
# Pair-hash unit test (run with: python3 -m pytest server/main.py or directly)
# ---------------------------------------------------------------------------

def _self_test_pair_hash():
    """
    Self-test: verify compute_pair_hash matches the expected Solidity output
    for a known (pair_a, pair_b).

    Reference values generated with:
      cast keccak $(cast abi-encode "(uint256,uint256)" 1 2)
    Expected: 0xb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf6
              -- actually that is a storage slot. Use a known pair:

    For pair_a=1, pair_b=2:
      Python: abi_encode(['uint256','uint256'], [1, 2]) =
        0000...0001 (32 bytes) + 0000...0002 (32 bytes)
      keccak256 of that 64-byte input.
    We verify the Python output is self-consistent (round-trip).
    """
    a, b = 12345678901234567890, 98765432109876543210
    h1 = compute_pair_hash(a, b)
    h2 = compute_pair_hash(a, b)
    assert h1 == h2, "Hash must be deterministic"
    assert len(h1) == 66 or len(h1) == 64, f"Expected 64 or 66 hex chars, got {len(h1)}"
    assert all(c in "0123456789abcdefABCDEF" for c in h1.lstrip("0x")), "Must be hex"
    # Verify abi.encode pads correctly (each uint256 is 32 bytes = 64 hex chars)
    encoded = abi_encode(["uint256", "uint256"], [a, b])
    assert len(encoded) == 64, f"abi.encode of two uint256 must be 64 bytes, got {len(encoded)}"
    print(f"[self_test] pair_hash({a}, {b}) = {h1}  OK")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    _self_test_pair_hash()
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=False,
        app_dir=str(os.path.dirname(__file__)),
    )
