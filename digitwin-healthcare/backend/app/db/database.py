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
);
CREATE TABLE IF NOT EXISTS ecg_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    simulation_id INTEGER,
    filename TEXT NOT NULL,
    detected_format TEXT NOT NULL,
    result_json TEXT NOT NULL,
    FOREIGN KEY (simulation_id) REFERENCES simulations(id)
);
CREATE INDEX IF NOT EXISTS idx_ecg_analyses_simulation_id
    ON ecg_analyses(simulation_id)"""


@contextmanager
def connect():
    default_db = "/tmp/digitwin.db" if os.environ.get("VERCEL") else "digitwin.db"
    conn = sqlite3.connect(os.environ.get("DIGITWIN_DB", default_db))
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
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


def list_runs(limit: int = 20):
    with connect() as c:
        rows = c.execute("SELECT id, created_at, risk, request_json FROM simulations ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [dict(id=r["id"], created_at=r["created_at"], risk=r["risk"], request=json.loads(r["request_json"])) for r in rows]


def get_run(run_id: int):
    with connect() as c:
        r = c.execute("SELECT * FROM simulations WHERE id=?", (run_id,)).fetchone()
    if not r:
        return None
    return dict(id=r["id"], created_at=r["created_at"], risk=r["risk"],
                request=json.loads(r["request_json"]), result=json.loads(r["result_json"]))


def save_ecg_analysis(run_id: int | None, detected_format: str, result: dict) -> int:
    stored_result = {
        key: value
        for key, value in result.items()
        if key not in {"filename", "extracted_text", "waveform_preview", "model_features"}
    }
    with connect() as c:
        cur = c.execute(
            """INSERT INTO ecg_analyses
               (created_at, simulation_id, filename, detected_format, result_json)
               VALUES (?, ?, ?, ?, ?)""",
            (
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
                run_id,
                "ECG upload",
                detected_format,
                json.dumps(stored_result),
            ),
        )
        return cur.lastrowid


def get_ecg_analysis(analysis_id: int):
    with connect() as c:
        row = c.execute("SELECT * FROM ecg_analyses WHERE id = ?", (analysis_id,)).fetchone()
    if row is None:
        return None
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "simulation_id": row["simulation_id"],
        "filename": row["filename"],
        "original_filename_retained": False,
        "detected_format": row["detected_format"],
        "result": json.loads(row["result_json"]),
        "source_document_retained": False,
        "extracted_text_retained": False,
    }


def list_ecg_analyses(run_id: int | None = None, limit: int = 20):
    with connect() as c:
        if run_id is None:
            rows = c.execute(
                "SELECT id FROM ecg_analyses ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT id FROM ecg_analyses WHERE simulation_id = ? ORDER BY id DESC LIMIT ?",
                (run_id, limit),
            ).fetchall()
    return [get_ecg_analysis(row["id"]) for row in rows]
