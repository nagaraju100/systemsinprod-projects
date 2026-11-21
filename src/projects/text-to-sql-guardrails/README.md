# Text-to-SQL with Guardrails

Free, ready-to-run demo. Ask questions in plain English, get back SQL queries with full safety controls.

## What it does

- User types a question in plain English
- LLM (Qwen 35B local) converts it to SQL
- Guardrails block anything unsafe before execution
- Results returned as a table

## Safety features

- **Read-only enforced:** INSERT, UPDATE, DELETE, DROP, TRUNCATE are stripped at parse time
- **Table whitelist:** only configured tables can be queried
- **Result cap:** max 1000 rows returned
- **Timeout:** queries running >30s are killed

## Setup

```bash
cd text-to-sql-guardrails
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python init_db.py
python server.py
```

Open http://localhost:8000

## Configuration

Edit `config.py` to change:
- Ollama endpoint and credentials
- Whitelisted tables
- Result limits
- Sample data

## Sample questions to try

- "How many orders last month?"
- "Show revenue by region"
- "Which product has the highest stock?"
- "Top 5 customers by spending"
- "Orders per product category this year"
