"""Lightweight Schelling Protocol HTTP client."""

from __future__ import annotations
import httpx
from typing import Any

DEFAULT_BASE_URL = "https://www.schellingprotocol.com/schelling"


class SchellingClient:
    """Thin wrapper around the Schelling Protocol REST API."""

    def __init__(self, base_url: str = DEFAULT_BASE_URL, timeout: float = 15.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _post(self, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
        resp = httpx.post(
            f"{self.base_url}/{endpoint}",
            json=payload,
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()

    def quick_seek(self, intent: str) -> dict[str, Any]:
        return self._post("quick_seek", {"intent": intent})

    def quick_offer(self, intent: str) -> dict[str, Any]:
        return self._post("quick_offer", {"intent": intent})

    def register(self, cluster_id: str, role: str, traits: list[dict], **kwargs) -> dict[str, Any]:
        payload = {
            "protocol_version": "3.0",
            "cluster_id": cluster_id,
            "role": role,
            "traits": traits,
            **kwargs,
        }
        return self._post("register", payload)

    def search(self, user_token: str, **kwargs) -> dict[str, Any]:
        return self._post("search", {"user_token": user_token, **kwargs})

    def interest(self, user_token: str, candidate_token: str) -> dict[str, Any]:
        return self._post("interest", {
            "user_token": user_token,
            "candidate_token": candidate_token,
        })

    def commit(self, user_token: str, candidate_token: str) -> dict[str, Any]:
        return self._post("commit", {
            "user_token": user_token,
            "candidate_token": candidate_token,
        })

    def contract_propose(self, user_token: str, counterparty_token: str, terms: dict) -> dict[str, Any]:
        return self._post("contract", {
            "action": "propose",
            "user_token": user_token,
            "counterparty_token": counterparty_token,
            "terms": terms,
        })

    def describe(self) -> dict[str, Any]:
        return self._post("describe", {})
