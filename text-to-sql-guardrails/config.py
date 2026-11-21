# Configuration for Text-to-SQL with Guardrails

# Ollama (Qwen 35B on Mac mini via Tailscale)
OLLAMA_ENDPOINT = "https://muthya.tail7dd6d9.ts.net:8443/v1/chat/completions"
OLLAMA_MODEL = "qwen3.6-35b"
OLLAMA_API_KEY = "sk-BZkqkoWb38axfQfmKDyTvg"

# Database
DATABASE = "shop.db"

# Guardrails
MAX_ROWS = 1000
QUERY_TIMEOUT_SECONDS = 30
WHITELISTED_TABLES = [
    "customers",
    "orders",
    "products",
    "inventory",
    "regions",
]

# Server
HOST = "0.0.0.0"
PORT = 8000
