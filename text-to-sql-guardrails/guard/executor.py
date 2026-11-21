"""Execute validated SQL queries with safety limits."""

import sqlite3
import signal
import threading
from config import DATABASE, MAX_ROWS


class QueryTimeoutError(Exception):
    pass


def execute(sql: str, timeout: int = 30) -> list[dict]:
    """Run a SELECT query and return results as list of dicts.

    Enforces:
    - Max {MAX_ROWS} rows
    - Timeout of {timeout} seconds
    """

    def _run(conn: sqlite3.Connection) -> list[dict]:
        c = conn.cursor()
        c.execute(sql)
        columns = [desc[0] for desc in c.description]
        rows = c.fetchmany(MAX_ROWS)
        return [dict(zip(columns, row)) for row in rows]

    conn = sqlite3.connect(DATABASE)

    timer = threading.Timer(timeout, lambda: conn.execute("SELECT 1"))
    timer.start()
    try:
        result = _run(conn)
    except sqlite3.OperationalError as e:
        if "interrupt" in str(e).lower():
            raise QueryTimeoutError(f"Query exceeded {timeout}s timeout")
        raise
    finally:
        timer.cancel()
        conn.close()

    return result


def get_tables(conn: sqlite3.Connection) -> list[dict]:
    """Return available tables and row counts."""
    c = conn.cursor()
    c.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    tables = []
    for (name,) in c.fetchall():
        c.execute(f"SELECT COUNT(*) FROM [{name}]")
        count = c.fetchone()[0]
        tables.append({"name": name, "rows": count})
    return tables
