"""Pytest fixtures for text-to-sql-guardrails tests."""

import os
import sys
import pytest
import sqlite3

sys.path.insert(0, os.path.dirname(__file__))


@pytest.fixture(scope="session")
def test_db():
    """Create a test database with sample data."""
    path = "test_shop.db"
    if os.path.exists(path):
        os.remove(path)

    conn = sqlite3.connect(path)
    c = conn.cursor()

    c.executescript("""
        CREATE TABLE regions (
            id   INTEGER PRIMARY KEY,
            name TEXT NOT NULL
        );

        CREATE TABLE customers (
            id          INTEGER PRIMARY KEY,
            name        TEXT NOT NULL,
            email       TEXT NOT NULL UNIQUE,
            signup_date TEXT NOT NULL,
            region_id   INTEGER REFERENCES regions(id)
        );

        CREATE TABLE products (
            id       INTEGER PRIMARY KEY,
            name     TEXT NOT NULL,
            category TEXT NOT NULL,
            price    REAL NOT NULL
        );

        CREATE TABLE orders (
            id          INTEGER PRIMARY KEY,
            customer_id INTEGER REFERENCES customers(id),
            product_id  INTEGER REFERENCES products(id),
            quantity    INTEGER NOT NULL,
            amount      REAL NOT NULL,
            order_date  TEXT NOT NULL
        );

        CREATE TABLE inventory (
            product_id   INTEGER REFERENCES products(id),
            warehouse    TEXT NOT NULL,
            stock        INTEGER NOT NULL DEFAULT 0,
            last_restocked TEXT,
            PRIMARY KEY (product_id, warehouse)
        );
    """)

    c.executemany("INSERT INTO regions VALUES (?, ?)", [(1, "north"), (2, "south"), (3, "east"), (4, "west"), (5, "central")])

    c.executemany("INSERT INTO products VALUES (?, ?, ?, ?)", [
        (1, "Wireless Mouse",   "Electronics", 29.99),
        (2, "USB-C Hub",        "Electronics", 49.99),
        (3, "Mechanical Keyboard","Electronics", 89.99),
        (4, "Monitor Stand",    "Furniture", 59.99),
        (5, "Desk Lamp",        "Furniture", 34.99),
        (6, "Cotton T-Shirt",   "Clothing", 19.99),
        (7, "Winter Jacket",    "Clothing", 79.99),
        (8, "Organic Coffee",   "Food", 14.99),
        (9, "Python Handbook",  "Books", 39.99),
    ])

    c.executemany("INSERT INTO customers VALUES (?, ?, ?, ?, ?)", [
        (1, "Ava Smith",  "ava.smith@example.com", "2024-06-15", 1),
        (2, "Liam Johnson", "liam.j@example.com", "2024-09-01", 2),
        (3, "Mia Williams", "mia.w@example.com", "2025-01-20", 3),
    ])

    c.executemany("INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?)", [
        (1, 1, 1, 2, 59.98, "2025-06-10"),
        (2, 2, 3, 1, 89.99, "2025-07-15"),
        (3, 3, 5, 3, 104.97, "2025-08-01"),
        (4, 1, 8, 5, 74.95, "2025-06-20"),
    ])

    c.executemany("INSERT INTO inventory VALUES (?, ?, ?, ?)", [
        (1, "warehouse_north", 100, "2025-09-01"),
        (2, "warehouse_north", 50, "2025-09-01"),
        (3, "warehouse_south", 25, "2025-08-15"),
    ])

    conn.commit()
    conn.close()
    yield path
    os.remove(path)


@pytest.fixture
def config_override(test_db):
    """Patch config to use test database."""
    import sys
    import server
    server.config.DATABASE = test_db
    yield server.config
    server.config.DATABASE = "shop.db"
