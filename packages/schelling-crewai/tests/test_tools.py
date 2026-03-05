"""Basic smoke tests for schelling-crewai tools."""
import json
from unittest.mock import patch, MagicMock
from schelling_crewai.tools import (
    SchellingSeekTool,
    SchellingOfferTool,
    SchellingRegisterTool,
    SchellingSearchTool,
)


def _mock_client(method_name: str, return_value: dict):
    mock = MagicMock()
    getattr(mock, method_name).return_value = return_value
    return mock


def test_seek_tool_formats_results():
    client = _mock_client("quick_seek", {
        "total_matches": 2,
        "user_token": "tok-123",
        "candidates": [
            {"user_token_hash": "abc", "score": 0.85, "matching_traits": ["python", "denver"]},
            {"user_token_hash": "def", "score": 0.72, "matching_traits": ["react"]},
        ],
    })
    tool = SchellingSeekTool(client=client)
    result = tool._run(intent="Python dev in Denver")
    assert "2 candidates" in result
    assert "abc" in result
    assert "tok-123" in result


def test_seek_tool_no_matches():
    client = _mock_client("quick_seek", {"total_matches": 0, "candidates": []})
    tool = SchellingSeekTool(client=client)
    result = tool._run(intent="nonexistent skill")
    assert "No matches" in result


def test_offer_tool():
    client = _mock_client("quick_offer", {"user_token": "tok-456", "subscription_id": "sub-1"})
    tool = SchellingOfferTool(client=client)
    result = tool._run(intent="ML engineer $150/hr")
    assert "tok-456" in result
    assert "Offer posted" in result


def test_register_tool():
    client = _mock_client("register", {"user_token": "tok-789"})
    tool = SchellingRegisterTool(client=client)
    traits = json.dumps([{"key": "skill", "value": "python", "value_type": "string"}])
    result = tool._run(cluster_id="freelance.dev", role="offer", traits_json=traits)
    assert "tok-789" in result


def test_search_tool_with_capability_query():
    client = _mock_client("search", {
        "candidates": [
            {"user_token_hash": "xyz", "advisory_score": 0.91},
        ],
    })
    tool = SchellingSearchTool(client=client)
    result = tool._run(
        user_token="tok-123",
        capability_query_json='{"name": "audio.transcribe", "min_confidence": 0.8}',
    )
    assert "xyz" in result
    assert "0.91" in result
    client.search.assert_called_once_with(
        "tok-123",
        capability_query={"name": "audio.transcribe", "min_confidence": 0.8},
    )
