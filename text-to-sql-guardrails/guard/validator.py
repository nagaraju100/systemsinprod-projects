"""SQL guardrails: parse and validate queries before execution."""

from sqlglot import parse, expressions
from sqlglot.dialects import SQLite


class GuardError(Exception):
    """Raised when a query fails validation."""

    def __init__(self, message):
        self.message = message
        super().__init__(message)


def validate(sql: str, whitelist: list[str]) -> None:
    """Check a SQL query against safety rules. Raises GuardError on violation.

    Handles multi-statement SQL (e.g. 'SELECT 1; DROP TABLE orders') by
    parsing all statements, not just the first.
    """
    try:
        statements = parse(sql, dialect=SQLite)
    except Exception as e:
        raise GuardError(f"Could not parse SQL: {e}")

    for stmt in statements:
        _check_dangerous_operations(stmt)
        _check_tables(stmt, whitelist)


def _check_dangerous_operations(node) -> None:
    """Ensure the query is SELECT-only."""
    for expr in node.walk():
        if isinstance(expr, (
            expressions.Insert, expressions.Update, expressions.Delete,
            expressions.Drop, expressions.Alter,
            expressions.Create, expressions.Execute, expressions.Copy,
        )):
            op = type(expr).__name__.capitalize()
            raise GuardError(f"Operation '{op}' is not allowed. Only SELECT queries are permitted.")

    if node.key != "select":
        raise GuardError(f"Only SELECT queries are permitted, got '{node.key}'.")


def _check_tables(node, whitelist: list[str]) -> None:
    """Ensure all referenced tables are in the whitelist."""
    referenced = set()

    for table in node.find_all(expressions.Table):
        referenced.add(table.name.lower())

    banned = referenced - set(t.lower() for t in whitelist)
    if banned:
        raise GuardError(
            f"Tables '{', '.join(sorted(banned))}' are not allowed. "
            f"Available: {', '.join(sorted(whitelist))}"
        )
