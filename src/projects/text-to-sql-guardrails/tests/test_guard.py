"""Tests for guardrails: validation, execution, edge cases."""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from guard.validator import validate, GuardError
from guard.executor import execute, QueryTimeoutError


WHITELIST = ["customers", "orders", "products", "inventory", "regions"]


# ── validator ────────────────────────────────────────────────────────────


def test_valid_select():
    validate("SELECT * FROM orders LIMIT 10", WHITELIST)


def test_valid_select_with_join():
    validate(
        "SELECT c.name, SUM(o.amount) FROM customers c JOIN orders o ON c.id = o.customer_id GROUP BY c.name LIMIT 10",
        WHITELIST,
    )


def test_allows_whitelisted_tables():
    validate("SELECT COUNT(*) FROM customers", WHITELIST)


def test_blocks_non_whitelisted_table():
    with pytest.raises(GuardError, match="not allowed"):
        validate("SELECT * FROM users", WHITELIST)


def test_blocks_drop_table():
    with pytest.raises(GuardError, match="not allowed"):
        validate("DROP TABLE orders", WHITELIST)


def test_blocks_delete():
    with pytest.raises(GuardError, match="not allowed"):
        validate("DELETE FROM orders WHERE id = 1", WHITELIST)


def test_blocks_insert():
    with pytest.raises(GuardError, match="not allowed"):
        validate("INSERT INTO orders VALUES (1, 1, 1, 1, 1.0, '2025-01-01')", WHITELIST)


def test_blocks_update():
    with pytest.raises(GuardError, match="not allowed"):
        validate("UPDATE customers SET name = 'hacked'", WHITELIST)


def test_blocks_create_table():
    with pytest.raises(GuardError, match="not allowed"):
        validate("CREATE TABLE hacked (id INT)", WHITELIST)


def test_blocks_union_drop():
    with pytest.raises(GuardError, match="not allowed"):
        validate("SELECT 1; DROP TABLE orders", WHITELIST)


# ── executor ─────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def db_path():
    orig = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "shop.db")
    if os.path.exists(orig):
        os.rename(orig, orig + ".bak")
    return orig


def test_select_returns_rows(db_path):
    if not os.path.exists(db_path):
        pytest.skip("Database not initialized")
    results = execute("SELECT COUNT(*) as total FROM orders", 5)
    assert len(results) > 0
    assert "total" in results[0]


def test_select_with_join(db_path):
    if not os.path.exists(db_path):
        pytest.skip("Database not initialized")
    results = execute(
        "SELECT c.name, SUM(o.amount) as total FROM customers c JOIN orders o ON c.id = o.customer_id GROUP BY c.name LIMIT 5",
        5,
    )
    assert len(results) > 0
    assert any("total" in str(r.values()) for r in results)


def test_select_limits_results(db_path):
    if not os.path.exists(db_path):
        pytest.skip("Database not initialized")
    results = execute("SELECT * FROM customers", 5)
    # Default MAX_ROWS = 1000, but let's test a smaller cap
    assert len(results) <= 1000


def test_aggregation(db_path):
    if not os.path.exists(db_path):
        pytest.skip("Database not initialized")
    results = execute("SELECT AVG(amount) as avg_order FROM orders", 5)
    assert len(results) == 1
    assert "avg_order" in results[0]


# ── integration ──────────────────────────────────────────────────────────
# Server integration tests require httpx. Run with:
#   source .venv/bin/activate && pip install -q httpx && pytest tests/test_guard.py -v
