"""CrewAI tool definitions for Schelling Protocol."""

from __future__ import annotations
from typing import Optional, Type
from pydantic import BaseModel, Field
from crewai.tools import BaseTool
from .client import SchellingClient

# ─── Input Schemas ────────────────────────────────────────────────────

class SeekInput(BaseModel):
    intent: str = Field(description="Natural language description of what you need (e.g. 'React developer in Denver under $100/hr')")

class OfferInput(BaseModel):
    intent: str = Field(description="Natural language description of what you're offering (e.g. 'Senior Python developer, $80/hr, available now')")

class RegisterInput(BaseModel):
    cluster_id: str = Field(description="Cluster to join (e.g. 'freelance.dev', 'ai.agents')")
    role: str = Field(description="'seek' or 'offer'")
    traits_json: str = Field(description='JSON array of traits, e.g. [{"key":"skill","value":"python","value_type":"string"}]')

class SearchInput(BaseModel):
    user_token: str = Field(description="Your Schelling user token")
    capability_query_json: Optional[str] = Field(default=None, description='Optional JSON capability query, e.g. {"name":"audio.transcribe","min_confidence":0.8}')

class InterestInput(BaseModel):
    user_token: str = Field(description="Your Schelling user token")
    candidate_token: str = Field(description="Token of the candidate you're interested in")

class ContractInput(BaseModel):
    user_token: str = Field(description="Your Schelling user token")
    counterparty_token: str = Field(description="Token of the counterparty")
    terms_json: str = Field(description='JSON terms, e.g. {"scope":"Build React dashboard","price":5000,"currency":"USD","deadline":"2026-04-01"}')


# ─── Tools ────────────────────────────────────────────────────────────

class SchellingSeekTool(BaseTool):
    name: str = "schelling_seek"
    description: str = "Search the Schelling Protocol network for what you need using natural language. Returns matched candidates with scores."
    args_schema: Type[BaseModel] = SeekInput
    client: SchellingClient = SchellingClient()

    class Config:
        arbitrary_types_allowed = True

    def _run(self, intent: str) -> str:
        data = self.client.quick_seek(intent)
        candidates = data.get("candidates", [])
        if not candidates:
            return "No matches found on the Schelling network."
        lines = [f"Found {data.get('total_matches', len(candidates))} candidates:"]
        for c in candidates[:5]:
            score = c.get("score", "N/A")
            traits = ", ".join(c.get("matching_traits", []))
            token_hash = c.get("user_token_hash", "unknown")
            lines.append(f"  • {token_hash} — score: {score}, traits: [{traits}]")
        if data.get("user_token"):
            lines.append(f"\nYour token: {data['user_token']} (save this for follow-up actions)")
        return "\n".join(lines)


class SchellingOfferTool(BaseTool):
    name: str = "schelling_offer"
    description: str = "Post an offering to the Schelling Protocol network using natural language. Makes you discoverable by seekers."
    args_schema: Type[BaseModel] = OfferInput
    client: SchellingClient = SchellingClient()

    class Config:
        arbitrary_types_allowed = True

    def _run(self, intent: str) -> str:
        data = self.client.quick_offer(intent)
        token = data.get("user_token", "N/A")
        sub_id = data.get("subscription_id", "")
        return f"✅ Offer posted to Schelling network.\nYour token: {token}\nSubscription: {sub_id}\nYou're now discoverable by seekers."


class SchellingRegisterTool(BaseTool):
    name: str = "schelling_register"
    description: str = "Register on the Schelling Protocol with specific traits and capabilities. Use for precise registrations."
    args_schema: Type[BaseModel] = RegisterInput
    client: SchellingClient = SchellingClient()

    class Config:
        arbitrary_types_allowed = True

    def _run(self, cluster_id: str, role: str, traits_json: str) -> str:
        import json
        traits = json.loads(traits_json)
        data = self.client.register(cluster_id, role, traits)
        token = data.get("user_token", "N/A")
        return f"✅ Registered on Schelling.\nToken: {token}\nCluster: {cluster_id}\nRole: {role}\nTraits: {len(traits)}"


class SchellingSearchTool(BaseTool):
    name: str = "schelling_search"
    description: str = "Search for candidates using your Schelling token. Optionally filter by structured capabilities."
    args_schema: Type[BaseModel] = SearchInput
    client: SchellingClient = SchellingClient()

    class Config:
        arbitrary_types_allowed = True

    def _run(self, user_token: str, capability_query_json: str | None = None) -> str:
        import json
        kwargs = {}
        if capability_query_json:
            kwargs["capability_query"] = json.loads(capability_query_json)
        data = self.client.search(user_token, **kwargs)
        candidates = data.get("candidates", [])
        if not candidates:
            return "No candidates found."
        lines = [f"Found {len(candidates)} candidates:"]
        for c in candidates[:10]:
            score = c.get("advisory_score", "N/A")
            token = c.get("user_token_hash", "unknown")
            lines.append(f"  • {token} — advisory_score: {score}")
        return "\n".join(lines)


class SchellingInterestTool(BaseTool):
    name: str = "schelling_interest"
    description: str = "Express interest in a candidate on the Schelling network. Advances the funnel from DISCOVERED to INTERESTED."
    args_schema: Type[BaseModel] = InterestInput
    client: SchellingClient = SchellingClient()

    class Config:
        arbitrary_types_allowed = True

    def _run(self, user_token: str, candidate_token: str) -> str:
        data = self.client.interest(user_token, candidate_token)
        stage = data.get("stage", "unknown")
        mutual = data.get("mutual_interest", False)
        return f"Interest expressed. Stage: {stage}. Mutual interest: {mutual}"


class SchellingContractTool(BaseTool):
    name: str = "schelling_contract"
    description: str = "Propose a contract to a counterparty on the Schelling network."
    args_schema: Type[BaseModel] = ContractInput
    client: SchellingClient = SchellingClient()

    class Config:
        arbitrary_types_allowed = True

    def _run(self, user_token: str, counterparty_token: str, terms_json: str) -> str:
        import json
        terms = json.loads(terms_json)
        data = self.client.contract_propose(user_token, counterparty_token, terms)
        contract_id = data.get("contract_id", "N/A")
        return f"✅ Contract proposed.\nContract ID: {contract_id}\nTerms: {terms}"
