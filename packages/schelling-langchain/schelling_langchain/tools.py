"""LangChain tool definitions for Schelling Protocol."""

from __future__ import annotations
import json
from typing import Optional
from langchain_core.tools import BaseTool
from pydantic import Field
from .client import SchellingClient


class SchellingSeekerTool(BaseTool):
    name: str = "schelling_seek"
    description: str = (
        "Search the Schelling Protocol network for matches using natural language. "
        "Input: describe what you need, e.g. 'React developer in Denver under $100/hr'"
    )
    client: SchellingClient = Field(default_factory=SchellingClient)

    class Config:
        arbitrary_types_allowed = True

    def _run(self, query: str) -> str:
        data = self.client.quick_seek(query)
        candidates = data.get("candidates", [])
        if not candidates:
            return "No matches found on the Schelling network."
        lines = [f"Found {data.get('total_matches', len(candidates))} matches:"]
        for c in candidates[:5]:
            score = c.get("score", "N/A")
            traits = ", ".join(c.get("matching_traits", []))
            lines.append(f"  • Score: {score} | Traits: [{traits}]")
        if data.get("user_token"):
            lines.append(f"\nYour token: {data['user_token']}")
        return "\n".join(lines)


class SchellingOfferTool(BaseTool):
    name: str = "schelling_offer"
    description: str = (
        "Post an offering to the Schelling Protocol network using natural language. "
        "Input: describe what you're offering, e.g. 'Senior Python developer, $80/hr'"
    )
    client: SchellingClient = Field(default_factory=SchellingClient)

    class Config:
        arbitrary_types_allowed = True

    def _run(self, query: str) -> str:
        data = self.client.quick_offer(query)
        token = data.get("user_token", "N/A")
        return f"✅ Offer posted. Token: {token}. You're now discoverable."


class SchellingDescribeTool(BaseTool):
    name: str = "schelling_describe"
    description: str = "Get info about the Schelling network — protocol version, active clusters, stats."
    client: SchellingClient = Field(default_factory=SchellingClient)

    class Config:
        arbitrary_types_allowed = True

    def _run(self, query: str = "") -> str:
        data = self.client.describe()
        protocol = data.get("protocol", {})
        clusters = data.get("clusters", {})
        top = [c["cluster_id"] for c in clusters.get("top_clusters", [])]
        return (
            f"Protocol: {protocol.get('name')} v{protocol.get('version')}\n"
            f"Active clusters: {clusters.get('total_active', 0)}\n"
            f"Top clusters: {', '.join(top)}"
        )


class SchellingSearchTool(BaseTool):
    name: str = "schelling_search"
    description: str = (
        "Search Schelling with your token. Input format: 'TOKEN' or 'TOKEN|{\"name\":\"audio\"}' "
        "to include a capability query."
    )
    client: SchellingClient = Field(default_factory=SchellingClient)

    class Config:
        arbitrary_types_allowed = True

    def _run(self, query: str) -> str:
        parts = query.split("|", 1)
        token = parts[0].strip()
        kwargs = {}
        if len(parts) > 1:
            kwargs["capability_query"] = json.loads(parts[1])
        data = self.client.search(token, **kwargs)
        candidates = data.get("candidates", [])
        if not candidates:
            return "No candidates found."
        lines = [f"Found {len(candidates)} candidates:"]
        for c in candidates[:10]:
            score = c.get("advisory_score", "N/A")
            lines.append(f"  • {c.get('user_token_hash', '?')} — score: {score}")
        return "\n".join(lines)


class SchellingInterestTool(BaseTool):
    name: str = "schelling_interest"
    description: str = (
        "Express interest in a Schelling candidate. Input: 'YOUR_TOKEN|CANDIDATE_TOKEN'"
    )
    client: SchellingClient = Field(default_factory=SchellingClient)

    class Config:
        arbitrary_types_allowed = True

    def _run(self, query: str) -> str:
        parts = query.split("|")
        if len(parts) != 2:
            return "Error: provide 'YOUR_TOKEN|CANDIDATE_TOKEN'"
        data = self.client.interest(parts[0].strip(), parts[1].strip())
        return f"Interest expressed. Stage: {data.get('stage')}. Mutual: {data.get('mutual_interest')}"


class SchellingContractTool(BaseTool):
    name: str = "schelling_contract"
    description: str = (
        "Propose a contract. Input: 'YOUR_TOKEN|COUNTERPARTY_TOKEN|{\"scope\":\"...\",\"price\":1000}'"
    )
    client: SchellingClient = Field(default_factory=SchellingClient)

    class Config:
        arbitrary_types_allowed = True

    def _run(self, query: str) -> str:
        parts = query.split("|", 2)
        if len(parts) != 3:
            return "Error: provide 'YOUR_TOKEN|COUNTERPARTY_TOKEN|{terms_json}'"
        terms = json.loads(parts[2])
        data = self.client.contract_propose(parts[0].strip(), parts[1].strip(), terms)
        return f"✅ Contract proposed. ID: {data.get('contract_id')}"
