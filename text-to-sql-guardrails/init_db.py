"""Initialize SQLite database with sample data for the demo."""

import sqlite3
import os
import random
from datetime import datetime, timedelta

DB_NAME = "shop.db"


def init():
    """Create database schema and populate with sample data."""
    if os.path.exists(DB_NAME):
        os.remove(DB_NAME)

    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()

    # ── schema ──────────────────────────────────────────────────────────
    c.executescript("""
        CREATE TABLE regions (
            id   INTEGER PRIMARY KEY,
            name TEXT    NOT NULL
        );

        CREATE TABLE customers (
            id          INTEGER PRIMARY KEY,
            name        TEXT    NOT NULL,
            email       TEXT    NOT NULL UNIQUE,
            signup_date TEXT    NOT NULL,
            region_id   INTEGER REFERENCES regions(id)
        );

        CREATE TABLE products (
            id        INTEGER PRIMARY KEY,
            name      TEXT    NOT NULL,
            category  TEXT    NOT NULL,
            price     REAL    NOT NULL
        );

        CREATE TABLE orders (
            id          INTEGER PRIMARY KEY,
            customer_id INTEGER REFERENCES customers(id),
            product_id  INTEGER REFERENCES products(id),
            quantity    INTEGER NOT NULL,
            amount      REAL    NOT NULL,
            order_date  TEXT    NOT NULL
        );

        CREATE TABLE inventory (
            product_id   INTEGER REFERENCES products(id),
            warehouse    TEXT    NOT NULL,
            stock        INTEGER NOT NULL DEFAULT 0,
            last_restocked TEXT,
            PRIMARY KEY (product_id, warehouse)
        );
    """)

    # ── seed data ───────────────────────────────────────────────────────
    regions = ["north", "south", "east", "west", "central"]
    c.executemany("INSERT INTO regions VALUES (?, ?)",
                  enumerate(regions, 1))

    first_names = [
        "Ava", "Liam", "Mia", "Noah", "Ella", "Oliver", "Isabella",
        "Elijah", "Sophia", "James", "Amelia", "William", "Harper",
        "Benjamin", "Charlotte", "Lucas", "Amelia", "Henry", "Grace",
        "Alexander", "Chloe", "Michael", "Eleanor", "Daniel", "Riley",
        "Matthew", "Victoria", "Jackson", "Hannah", "Sebastian",
        "Lily", "Aiden", "Zoe", "Owen", "Penelope", "Samuel",
        "Luna", "Ryan", "Stella", "Nathan", "Aria", "Caleb",
        "Ruby", "Christian", "Nora", "Leo", "Sadie", "Isaac",
    ]
    last_names = [
        "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia",
        "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez",
        "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore",
        "Jackson", "Martin", "Lee", "Perez", "Thompson", "White",
        "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
    ]

    customers = []
    seen = set()
    for i in range(1, 201):
        fname = first_names[i % len(first_names)]
        lname = last_names[i % len(last_names)]
        name = f"{fname} {lname}"
        base_email = f"{name.lower().replace(' ', '.')}@example.com"
        email = base_email
        counter = 2
        while email in seen:
            email = f"{fname.lower().replace(' ', '.')}_{counter}@example.com"
            counter += 1
        seen.add(email)
        signup = (datetime(2024, 1, 1) + timedelta(days=random.randint(0, 600))).strftime("%Y-%m-%d")
        region_id = random.randint(1, 5)
        customers.append((i, name, email, signup, region_id))

    c.executemany("INSERT INTO customers VALUES (?, ?, ?, ?, ?)", customers)

    categories = ["Electronics", "Furniture", "Clothing", "Food", "Books"]
    products = [
        (1, "Wireless Mouse",   "Electronics", 29.99),
        (2, "USB-C Hub",        "Electronics", 49.99),
        (3, "Mechanical Keyboard","Electronics", 89.99),
        (4, "Monitor Stand",    "Furniture", 59.99),
        (5, "Desk Lamp",        "Furniture", 34.99),
        (6, "Ergonomic Chair",  "Furniture", 299.99),
        (7, "Cotton T-Shirt",   "Clothing", 19.99),
        (8, "Winter Jacket",    "Clothing", 79.99),
        (9, "Running Shoes",    "Clothing", 119.99),
        (10, "Organic Coffee",  "Food", 14.99),
        (11, "Green Tea Pack",  "Food", 9.99),
        (12, "Protein Bars",    "Food", 24.99),
        (13, "Python Handbook", "Books", 39.99),
        (14, "AI Fundamentals", "Books", 44.99),
        (15, "SQL Mastery",     "Books", 34.99),
    ]
    c.executemany("INSERT INTO products VALUES (?, ?, ?, ?)", products)

    # ~400 orders across 2024-2025
    order_rows = []
    for oid in range(1, 401):
        cid = random.randint(1, 200)
        pid = random.randint(1, 15)
        qty = random.randint(1, 10)
        prod_price = products[pid - 1][3]
        amount = round(qty * prod_price * (0.9 + random.random() * 0.2), 2)
        odate = (datetime(2024, 1, 1) + timedelta(days=random.randint(0, 700))).strftime("%Y-%m-%d")
        order_rows.append((oid, cid, pid, qty, amount, odate))

    c.executemany("INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?)", order_rows)

    # Inventory: 3 warehouses
    warehouses = ["warehouse_north", "warehouse_south", "warehouse_central"]
    inv_rows = []
    for pid in range(1, 16):
        for wid, wh in enumerate(warehouses, 1):
            stock = random.randint(10, 500)
            restocked = (datetime(2025, 6, 1) + timedelta(days=random.randint(0, 150))).strftime("%Y-%m-%d")
            inv_rows.append((pid, wh, stock, restocked))

    c.executemany("INSERT INTO inventory VALUES (?, ?, ?, ?)", inv_rows)

    conn.commit()
    conn.close()
    print(f"Database created: {DB_NAME}")
    print(f"  customers: 200")
    print(f"  products:  15")
    print(f"  orders:    400")
    print(f"  inventory: 45 (15 products x 3 warehouses)")
    print(f"  regions:   5")


if __name__ == "__main__":
    init()
