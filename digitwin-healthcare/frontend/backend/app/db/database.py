"""SQLite run history (stdlib sqlite3). Path via DIGITWIN_DB, default ./digitwin.db."""
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

SCHEMA = """CREATE TABLE IF NOT EXISTS simulations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    risk TEXT NOT NULL,
    request_json TEXT NOT NULL,
    result_json TEXT NOT NULL
)"""


@contextmanager
def connect():
    conn = sqlite3.connect(os.environ.get("DIGITWIN_DB", "digitwin.db"))
    conn.row_factory = sqlite3.Row
    conn.execute(SCHEMA)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def save_run(request: dict, result: dict) -> int:
    with connect() as c:
        cur = c.execute(
            "INSERT INTO simulations (created_at, risk, request_json, result_json) VALUES (?,?,?,?)",
            (datetime.now(timezone.utc).isoformat(timespec="seconds"), result["risk"],
             json.dumps(request), json.dumps(result)))
        return cur.lastrowid


def list_runs(limit: int = 50):
    with connect() as c:
        rows = c.execute("SELECT id, created_at, risk, request_json, result_json FROM simulations ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    items = []
    for r in rows:
        req = json.loads(r["request_json"])
        res = json.loads(r["result_json"]) if r["result_json"] else {}
        pat = req.get("patient", {})
        items.append({
            "id": r["id"],
            "created_at": r["created_at"],
            "risk": r["risk"],
            "patient_id": pat.get("patient_id", f"PT-{r['id']:04d}"),
            "patient_name": pat.get("name", "Demo Patient"),
            "baseline_sbp": res.get("baseline", {}).get("sbp"),
            "baseline_dbp": res.get("baseline", {}).get("dbp"),
            "final_sbp": res.get("series", [{}])[-1].get("sbp") if res.get("series") else None,
            "final_dbp": res.get("series", [{}])[-1].get("dbp") if res.get("series") else None,
            "regimen": req.get("regimen", []),
            "horizon_h": req.get("horizon_h", 24),
            "request": req,
        })
    return items


def get_run(run_id: int):
    with connect() as c:
        r = c.execute("SELECT * FROM simulations WHERE id=?", (run_id,)).fetchone()
    if not r:
        return None
    return dict(id=r["id"], created_at=r["created_at"], risk=r["risk"],
                request=json.loads(r["request_json"]), result=json.loads(r["result_json"]))
