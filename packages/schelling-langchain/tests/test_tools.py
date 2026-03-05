"""Smoke tests for schelling-langchain tools."""
from unittest.mock import MagicMock
from schelling_langchain.tools import (
    SchellingSeekerTool,
    SchellingOfferTool,
    SchellingDescribeTool,
    SchellingSearchTool,
)


def test_seeker_tool():
    client = MagicMock()
    client.quick_seek.return_value = {
        "total_matches": 1,
        "user_token": "tok-1",
        "candidates": [{"score": 0.9, "matching_traits": ["python"]}],
    }
    tool = SchellingSeekerTool(client=client)
    result = tool._run("Python dev")
    assert "1 matches" in result
    assert "tok-1" in result


def test_offer_tool():
    client = MagicMock()
    client.quick_offer.return_value = {"user_token": "tok-2"}
    tool = SchellingOfferTool(client=client)
    result = tool._run("ML engineer")
    assert "tok-2" in result


def test_describe_tool():
    client = MagicMock()
    client.describe.return_value = {
        "protocol": {"name": "Schelling", "version": "3.0"},
        "clusters": {"total_active": 5, "top_clusters": [{"cluster_id": "ai.agents"}]},
    }
    tool = SchellingDescribeTool(client=client)
    result = tool._run()
    assert "3.0" in result
    assert "ai.agents" in result


def test_search_with_capability_query():
    client = MagicMock()
    client.search.return_value = {
        "candidates": [{"user_token_hash": "abc", "advisory_score": 0.88}],
    }
    tool = SchellingSearchTool(client=client)
    result = tool._run('tok-1|{"name": "audio"}')
    assert "abc" in result
    client.search.assert_called_once_with("tok-1", capability_query={"name": "audio"})
