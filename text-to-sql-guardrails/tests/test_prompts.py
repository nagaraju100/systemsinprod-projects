"""Tests for the LLM prompt generation and prompt formatting."""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from prompts import SCHEMA_PROMPT


def test_schema_prompt_exists():
    assert "regions" in SCHEMA_PROMPT
    assert "customers" in SCHEMA_PROMPT
    assert "orders" in SCHEMA_PROMPT
    assert "products" in SCHEMA_PROMPT
    assert "inventory" in SCHEMA_PROMPT


def test_schema_prompt_mentions_rules():
    assert "SQLite" in SCHEMA_PROMPT
    assert "JOIN" in SCHEMA_PROMPT
    assert "LIMIT" in SCHEMA_PROMPT
    assert "COUNT" in SCHEMA_PROMPT
    assert "ROUND" in SCHEMA_PROMPT


def test_schema_prompt_no_examples():
    """Schema has no pre-loaded data values — only schema definition."""
    assert "SQLite" in SCHEMA_PROMPT
    assert "INSERT" not in SCHEMA_PROMPT
    assert "VALUES" not in SCHEMA_PROMPT
