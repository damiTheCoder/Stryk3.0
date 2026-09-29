#!/usr/bin/env python3
"""
One-time cleanup: delete stale cointag_codes rows whose transaction
reverted (or cannot be found) on-chain.

A stale row shows up in the user's Code Store but grants no access,
because the purchaseCoinTag transaction never succeeded.

Usage:
  python3 scripts/cleanup-stale-codes.py --dry-run   # report only (default)
  python3 scripts/cleanup-stale-codes.py --apply     # actually delete

Env:
  ARC_RPC_URL / ARC_TESTNET_RPC_URL  - Arc Testnet RPC (default https://rpc.testnet.arc.io)
  DB_PATH                            - SQLite path (default server/invoiceflow.db)

This script is NOT run automatically on startup. Run it once manually
after deploying the CoinTag registration hardening fix.
"""

import argparse
import os
import sqlite3
import sys

from web3 import Web3
from web3.exceptions import TransactionNotFound

RPC_URL = os.getenv("ARC_RPC_URL") or os.getenv(
    "ARC_TESTNET_RPC_URL", "https://rpc.testnet.arc.io"
)
DEFAULT_DB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server", "invoiceflow.db")
DB_PATH = os.getenv("DB_PATH", DEFAULT_DB)


def main() -> int:
    parser = argparse.ArgumentParser(description="Delete stale cointag_codes rows (reverted txs).")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually delete stale rows. Without this flag, dry-run only.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report only, do not delete (default).",
    )
    args = parser.parse_args()
    apply = args.apply and not args.dry_run

    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print(f"ERROR: cannot connect to RPC at {RPC_URL}", file=sys.stderr)
        return 1

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        "SELECT id, invoice_id, user_address, code, tx_hash FROM cointag_codes"
    ).fetchall()

    kept = 0
    stale = []  # list of (id, invoice_id, code, reason)

    for row in rows:
        tx_hash = row["tx_hash"]
        try:
            receipt = w3.eth.get_transaction_receipt(tx_hash)
        except (TransactionNotFound, Exception):
            receipt = None
        if receipt is None:
            stale.append((row["id"], row["invoice_id"], row["code"], "transaction not found"))
            continue
        if receipt["status"] != 1:
            stale.append((row["id"], row["invoice_id"], row["code"], "transaction reverted"))
            continue
        kept += 1

    print(f"Checked {len(rows)} cointag_codes row(s): {kept} valid, {len(stale)} stale.")
    for row_id, invoice_id, code, reason in stale:
        print(f"  STALE id={row_id} invoice={invoice_id} code={code}: {reason}")

    if not stale:
        print("Nothing to clean up.")
        con.close()
        return 0

    if not apply:
        print("Dry run — no rows deleted. Re-run with --apply to delete.")
        con.close()
        return 0

    ids = [row_id for row_id, _, _, _ in stale]
    con.execute(
        f"DELETE FROM cointag_codes WHERE id IN ({','.join('?' * len(ids))})",
        ids,
    )
    con.commit()
    con.close()
    print(f"Deleted {len(ids)} stale row(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
