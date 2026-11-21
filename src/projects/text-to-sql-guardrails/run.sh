#!/bin/bash
# Quick-start script: init DB, install deps, start server.
set -e

echo "=== Text-to-SQL Guardrails ==="

# Create venv if not exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

source .venv/bin/activate

echo "Installing dependencies..."
pip install -q -r requirements.txt

echo "Initializing database..."
rm -f shop.db
python init_db.py

echo ""
echo "Starting server at http://localhost:8000"
echo ""
python server.py
