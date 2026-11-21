"""FastAPI server for Text-to-SQL with Guardrails."""

import os
import json
import httpx
from fastapi import FastAPI, APIRouter, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

import config
import prompts
from guard.validator import validate, GuardError
from guard.executor import execute, QueryTimeoutError, get_tables

app = FastAPI(title="Text-to-SQL Guardrails")

# CORS — allow all (needed if served from another origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prevent caching of JS/CSS/HTML
@app.middleware("http")
async def cache_bust(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.endswith((".js", ".css", ".html")):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


# --- API routes ---


class QueryRequest(BaseModel):
    question: str


class QueryResponse(BaseModel):
    sql: str | None
    explanation: str | None = None
    results: list[dict] | None
    tables: list[dict] | None
    error: str | None = None
    raw_llm: str | None = None


@app.get("/")
async def serve_index():
    return FileResponse("static/templates/index.html")


@app.get("/api/tables")
async def api_tables():
    conn = __get_conn()
    try:
        tables = get_tables(conn)
    finally:
        conn.close()
    return {"tables": tables}


@app.get("/api/tables/columns/{table_name}")
async def api_columns(table_name: str):
    conn = __get_conn()
    try:
        c = conn.cursor()
        c.execute(
            "PRAGMA table_info([{}])".format(table_name)
        )
        columns = [
            {
                "name": row[1],
                "type": row[2],
                "notnull": row[3],
                "pk": row[5],
            }
            for row in c.fetchall()
        ]
        if not columns:
            conn.close()
            return JSONResponse(
                status_code=404,
                content={"error": "Table '{}' not found".format(table_name)},
            )
        conn.close()
        return {"table": table_name, "columns": columns}
    except Exception as e:
        conn.close()
        return JSONResponse(
            status_code=500,
            content={"error": str(e)},
        )


@app.post("/api/query", response_model=QueryResponse)
async def api_query(req: QueryRequest) -> QueryResponse:
    """Convert natural language to SQL, validate, execute."""

    # Fetch tables for context
    conn = __get_conn()
    try:
        tables = get_tables(conn)
    finally:
        conn.close()

    # Step 1: Call LLM for SQL + explanation
    try:
        llm_sql, explanation = await _llm_to_sql_and_explain(req.question)
    except Exception as e:
        return QueryResponse(
            sql=None,
            explanation=None,
            results=None,
            tables=tables,
            error=f"LLM error: {e}",
            raw_llm=None,
        )

    # Step 2: Validate against guardrails
    try:
        validate(llm_sql, config.WHITELISTED_TABLES)
    except GuardError as e:
        return QueryResponse(
            sql=llm_sql,
            explanation=explanation,
            results=None,
            tables=tables,
            error=f"Guardrail blocked: {e.message}",
            raw_llm=llm_sql,
        )

    # Step 3: Execute
    try:
        results = execute(llm_sql, config.QUERY_TIMEOUT_SECONDS)
    except QueryTimeoutError as e:
        return QueryResponse(
            sql=llm_sql,
            explanation=explanation,
            results=None,
            tables=tables,
            error=str(e),
            raw_llm=llm_sql,
        )
    except Exception as e:
        return QueryResponse(
            sql=llm_sql,
            explanation=explanation,
            results=None,
            tables=tables,
            error=f"Execution error: {e}",
            raw_llm=llm_sql,
        )

    return QueryResponse(
        sql=llm_sql,
        explanation=explanation,
        results=results,
        tables=tables,
        raw_llm=llm_sql,
    )


class FollowupRequest(BaseModel):
    question: str
    sql: str
    result_count: int


class FollowupResponse(BaseModel):
    followups: list[str]


@app.post("/api/query/followup", response_model=FollowupResponse)
async def api_followup(req: FollowupRequest) -> FollowupResponse:
    """Generate follow-up questions based on a query's result."""
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            config.OLLAMA_ENDPOINT,
            headers={
                "Authorization": f"Bearer {config.OLLAMA_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": config.OLLAMA_MODEL,
                "messages": [
                    {"role": "user",
                     "content": f"Return a valid JSON array of 3 short follow-up questions: {req.question} (SQL: {req.sql}, Rows: {req.result_count}). ONLY JSON, no other text."}
                ],
                "max_tokens": 128,
                "temperature": 0,
            },
        )
        resp.raise_for_status()
        raw = resp.text
        # Strip invalid JSON control characters
        import re
        valid_json = re.sub(r'[^\x09\x0A\x0D\x20-\x7E\x80-\xFF]', '', raw)
        try:
            data = json.loads(valid_json)
        except Exception:
            return {"followups": []}

    content = data.get("choices", [{}])[0].get("message", {}).get("content")
    if not content:
        return {"followups": []}
    content = content.strip()
    try:
        followups = json.loads(content)
    except Exception:
        followups = []
    if not isinstance(followups, list) or len(followups) == 0:
        # Fallback: generate sensible follow-ups based on query
        followups = []
    return {"followups": followups}

static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


# --- Helpers ---


def __get_conn():
    return __import__("sqlite3").connect(config.DATABASE)


async def _llm_to_sql_and_explain(question: str) -> tuple[str, str | None]:
    """Send the question to Qwen via Ollama API.

    Returns (sql, explanation) tuple.
    The LLM outputs:
        <SQL>
        SELECT ...
        </SQL>

        <EXPLANATION>
        Step 1: ...
        Step 2: ...
        </EXPLANATION>
    """
    system_msg = {
        "role": "system",
        "content": prompts.SCHEMA_PROMPT,
    }
    user_msg = {
        "role": "user",
        "content": question,
    }

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            config.OLLAMA_ENDPOINT,
            headers={
                "Authorization": f"Bearer {config.OLLAMA_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": config.OLLAMA_MODEL,
                "messages": [system_msg, user_msg],
                "max_tokens": 2048,
                "temperature": 0,
            },
        )
        resp.raise_for_status()
        # Strip control characters from LLM response before JSON parse
        import re
        valid_json = re.sub(r'[^\x09\x0A\x0D\x20-\x7E\x80-\xFF]', '', resp.text)
        data = json.loads(valid_json)

    # Extract full response
    content = data.get("choices", [{}])[0].get("message", {}).get("content")
    if not content:
        raise ValueError(f"LLM returned no content. Full response: {data}")
    content = content.strip()

    # Strip markdown code blocks if present
    if content.startswith("```sql"):
        content = content[6:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()

    # Extract <SQL> section
    sql_start = content.find("<SQL>")
    sql_end = content.find("</SQL>")
    if sql_start == -1 or sql_end == -1:
        # No SQL tags — treat entire response as SQL (backward compat)
        sql = _strip_markdown(content)
        return sql, None

    sql = content[sql_start + 5:sql_end].strip()

    # Extract <EXPLANATION> section
    exp_start = content.find("<EXPLANATION>")
    exp_end = content.find("</EXPLANATION>")
    explanation = None
    if exp_start != -1 and exp_end != -1:
        explanation = content[exp_start + 13:exp_end].strip()

    return sql, explanation


def _strip_markdown(text: str) -> str:
    """Remove markdown code blocks and surrounding whitespace."""
    text = text.strip()
    if text.startswith("```sql"):
        text = text[6:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    # If there's a newline, take first line (old behavior)
    if "\n" in text:
        text = text.split("\n")[0].strip()
    if ";" in text:
        text = text.split(";")[0].strip()
    return text


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host=config.HOST, port=config.PORT, reload=False)
