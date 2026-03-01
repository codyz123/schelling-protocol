"""Typed client wrapping all Schelling Protocol operations."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import requests


class SchellingError(Exception):
    """Error returned by the Schelling Protocol API."""

    def __init__(self, code: str, message: str, status: int) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


@dataclass
class Candidate:
    """A candidate returned from search/seek operations."""

    candidate_id: str
    counterpart_token: str
    advisory_score: float
    traits: list[dict[str, Any]] = field(default_factory=list)
    text_profile: dict[str, Any] | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Candidate:
        known = {"candidate_id", "counterpart_token", "advisory_score", "traits", "text_profile",
                 "user_token_hash", "score", "matching_traits"}
        return cls(
            candidate_id=data.get("candidate_id", "") or data.get("user_token_hash", ""),
            counterpart_token=data.get("counterpart_token", "") or data.get("user_token_hash", ""),
            advisory_score=data.get("advisory_score", 0.0) or data.get("score", 0.0),
            traits=data.get("traits", []) or data.get("matching_traits", []),
            text_profile=data.get("text_profile"),
            extra={k: v for k, v in data.items() if k not in known},
        )


@dataclass
class SeekResult:
    """Result from a seek/quick_seek call."""

    user_token: str
    cluster_id: str
    candidates: list[Candidate]
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class OfferResult:
    """Result from an offer/quick_offer call."""

    user_token: str
    cluster_id: str
    subscription_id: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


class SchellingClient:
    """Typed client for the Schelling Protocol API.

    All operations are exposed as methods that post to /schelling/<operation>.
    """

    def __init__(
        self,
        base_url: str = "https://www.schellingprotocol.com",
        token: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self._session = requests.Session()
        self._session.headers["Content-Type"] = "application/json"

    def _post(self, operation: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = dict(params) if params else {}
        if self.token and "user_token" not in payload:
            payload["user_token"] = self.token

        url = f"{self.base_url}/schelling/{operation}"
        resp = self._session.post(url, json=payload, timeout=self.timeout)

        data: dict[str, Any] = resp.json()
        if not resp.ok:
            raise SchellingError(
                code=data.get("code", "UNKNOWN"),
                message=data.get("message", f"HTTP {resp.status_code}"),
                status=resp.status_code,
            )
        return data

    # ── Discovery ────────────────────────────────────────────────────

    def describe(self) -> dict[str, Any]:
        """Discover what the Schelling network offers."""
        return self._post("describe")

    def server_info(self) -> dict[str, Any]:
        """Get server metadata."""
        return self._post("server_info")

    def clusters(self, **kwargs: Any) -> dict[str, Any]:
        """List or search clusters."""
        return self._post("clusters", kwargs or None)

    def cluster_info(self, cluster_id: str) -> dict[str, Any]:
        """Get detailed cluster info."""
        return self._post("cluster_info", {"cluster_id": cluster_id})

    # ── Onboarding & Registration ────────────────────────────────────

    def onboard(self, natural_language: str, cluster_id: str | None = None) -> dict[str, Any]:
        """NL onboarding: describe what you want, get a registration template."""
        params: dict[str, Any] = {"natural_language": natural_language}
        if cluster_id:
            params["cluster_id"] = cluster_id
        return self._post("onboard", params)

    def register(self, **kwargs: Any) -> dict[str, Any]:
        """Register with structured traits and preferences.

        Returns response containing user_token. Automatically stores the token.
        """
        kwargs.setdefault("protocol_version", "3.0")
        result = self._post("register", kwargs)
        if "user_token" in result:
            self.token = result["user_token"]
        return result

    def update(self, **kwargs: Any) -> dict[str, Any]:
        """Update your registration."""
        return self._post("update", kwargs)

    def refresh(self) -> dict[str, Any]:
        """Refresh staleness clock."""
        return self._post("refresh")

    # ── Natural Language Interface ───────────────────────────────────

    def seek(self, intent: str, **kwargs: Any) -> SeekResult:
        """Find what you need in one call (NL interface).

        Returns a SeekResult with typed candidates.
        """
        kwargs["intent"] = intent
        data = self._post("quick_seek", kwargs)
        if data.get("user_token") and not self.token:
            self.token = data["user_token"]
        return SeekResult(
            user_token=data.get("user_token", ""),
            cluster_id=data.get("cluster_id", ""),
            candidates=[Candidate.from_dict(c) for c in data.get("candidates", [])],
            raw=data,
        )

    def offer(self, intent: str, **kwargs: Any) -> OfferResult:
        """Advertise what you offer in one call (NL interface).

        Returns an OfferResult.
        """
        kwargs["intent"] = intent
        data = self._post("quick_offer", kwargs)
        if data.get("user_token") and not self.token:
            self.token = data["user_token"]
        return OfferResult(
            user_token=data.get("user_token", ""),
            cluster_id=data.get("cluster_id", ""),
            subscription_id=data.get("subscription_id"),
            raw=data,
        )

    # ── Search ───────────────────────────────────────────────────────

    def search(self, **kwargs: Any) -> dict[str, Any]:
        """Full structured search."""
        return self._post("search", kwargs or None)

    def quick_seek(self, **kwargs: Any) -> dict[str, Any]:
        """Quick seek with all options."""
        data = self._post("quick_seek", kwargs)
        if data.get("user_token") and not self.token:
            self.token = data["user_token"]
        return data

    def quick_offer(self, **kwargs: Any) -> dict[str, Any]:
        """Quick offer with all options."""
        data = self._post("quick_offer", kwargs)
        if data.get("user_token") and not self.token:
            self.token = data["user_token"]
        return data

    # ── Funnel Operations ────────────────────────────────────────────

    def interest(self, candidate_id: str, contract_proposal: dict[str, Any] | None = None) -> dict[str, Any]:
        """Express interest in a candidate."""
        params: dict[str, Any] = {"candidate_id": candidate_id}
        if contract_proposal:
            params["contract_proposal"] = contract_proposal
        return self._post("interest", params)

    def commit(self, candidate_id: str) -> dict[str, Any]:
        """Commit to a candidate."""
        return self._post("commit", {"candidate_id": candidate_id})

    def connections(self, **kwargs: Any) -> dict[str, Any]:
        """List connections."""
        return self._post("connections", kwargs or None)

    def decline(self, candidate_id: str, reason: str | None = None, feedback: dict[str, Any] | None = None) -> dict[str, Any]:
        """Decline a candidate."""
        params: dict[str, Any] = {"candidate_id": candidate_id}
        if reason:
            params["reason"] = reason
        if feedback:
            params["feedback"] = feedback
        return self._post("decline", params)

    def reconsider(self, candidate_id: str) -> dict[str, Any]:
        """Reconsider a declined candidate."""
        return self._post("reconsider", {"candidate_id": candidate_id})

    def withdraw(self, candidate_id: str, reason: str | None = None) -> dict[str, Any]:
        """Withdraw from COMMITTED/CONNECTED."""
        params: dict[str, Any] = {"candidate_id": candidate_id}
        if reason:
            params["reason"] = reason
        return self._post("withdraw", params)

    def report(self, candidate_id: str, outcome: str, feedback: dict[str, Any] | None = None) -> dict[str, Any]:
        """Report outcome (positive/neutral/negative)."""
        params: dict[str, Any] = {"candidate_id": candidate_id, "outcome": outcome}
        if feedback:
            params["feedback"] = feedback
        return self._post("report", params)

    def pending(self) -> dict[str, Any]:
        """Get pending actions."""
        return self._post("pending")

    # ── Communication ────────────────────────────────────────────────

    def message(self, candidate_id: str, content: str) -> dict[str, Any]:
        """Send a message."""
        return self._post("message", {"candidate_id": candidate_id, "content": content})

    def messages(self, candidate_id: str, **kwargs: Any) -> dict[str, Any]:
        """Get messages."""
        kwargs["candidate_id"] = candidate_id
        return self._post("messages", kwargs)

    def direct(self, candidate_id: str, contact_info: str) -> dict[str, Any]:
        """Share direct contact info."""
        return self._post("direct", {"candidate_id": candidate_id, "contact_info": contact_info})

    def inquire(self, candidate_id: str, **kwargs: Any) -> dict[str, Any]:
        """Pre-commitment Q&A."""
        kwargs["candidate_id"] = candidate_id
        return self._post("inquire", kwargs)

    # ── Contracts & Deliverables ─────────────────────────────────────

    def contract(self, **kwargs: Any) -> dict[str, Any]:
        """Contract lifecycle (propose/accept/reject/counter/complete/terminate/list)."""
        return self._post("contract", kwargs)

    def deliver(
        self,
        contract_id: str,
        deliverable: dict[str, Any],
        milestone_id: str | None = None,
        message: str | None = None,
    ) -> dict[str, Any]:
        """Deliver an artifact."""
        params: dict[str, Any] = {"contract_id": contract_id, "deliverable": deliverable}
        if milestone_id:
            params["milestone_id"] = milestone_id
        if message:
            params["message"] = message
        return self._post("deliver", params)

    def accept_delivery(
        self,
        delivery_id: str,
        accepted: bool,
        feedback: str | None = None,
        rating: int | None = None,
    ) -> dict[str, Any]:
        """Accept or reject a delivery."""
        params: dict[str, Any] = {"delivery_id": delivery_id, "accepted": accepted}
        if feedback:
            params["feedback"] = feedback
        if rating is not None:
            params["rating"] = rating
        return self._post("accept_delivery", params)

    def deliveries(self, contract_id: str, status_filter: str | None = None) -> dict[str, Any]:
        """List deliverables."""
        params: dict[str, Any] = {"contract_id": contract_id}
        if status_filter:
            params["status_filter"] = status_filter
        return self._post("deliveries", params)

    # ── Reputation ───────────────────────────────────────────────────

    def reputation(self, candidate_id: str | None = None) -> dict[str, Any]:
        """Get reputation."""
        params: dict[str, Any] = {}
        if candidate_id:
            params["candidate_id"] = candidate_id
        return self._post("reputation", params)

    # ── Agent convenience ────────────────────────────────────────────

    def agent_seek(self, intent: str, **kwargs: Any) -> SeekResult:
        """Alias for seek — designed for agent-to-agent workflows."""
        return self.seek(intent, **kwargs)

    def agent_lookup(self, candidate_id: str) -> dict[str, Any]:
        """Look up a specific candidate's reputation and connection status."""
        return self.reputation(candidate_id)
