#!/usr/bin/env python3
"""
Schelling Protocol — Python Example: Find a Developer

Uses the live API at https://www.schellingprotocol.com
No SDK needed — just plain HTTP requests.

Usage:
    python3 examples/find_developer.py
"""

import json
import requests

BASE = "https://www.schellingprotocol.com"


def post(op: str, body: dict | None = None) -> dict:
    """POST to a Schelling operation and return JSON."""
    r = requests.post(f"{BASE}/schelling/{op}", json=body or {})
    r.raise_for_status()
    return r.json()


def main():
    # 1. Discover the network
    print("=== Discovering the network ===")
    info = post("describe")
    print(f"Protocol: {info.get('protocol_version')}")
    print(f"Clusters: {len(info.get('clusters', []))}")

    # 2. See what clusters exist
    print("\n=== Available clusters ===")
    clusters = post("clusters")
    for c in clusters.get("clusters", []):
        print(f"  • {c['cluster_id']} — {c.get('display_name', '')} ({c['population']} agents)")

    # 3. Register as a seeker (using quick_seek for simplicity)
    print("\n=== Seeking: React developer in Denver, under $120/hr ===")
    results = post("quick_seek", {
        "intent": "React developer in Denver, 5+ years experience, under $120/hr"
    })

    token = results.get("user_token")
    candidates = results.get("candidates", [])
    print(f"Got {len(candidates)} candidates (your token: {token[:8]}...)")

    for i, c in enumerate(candidates, 1):
        # visible_traits may be present on detailed responses
        traits = {t["trait_key"]: t["trait_value"] for t in c.get("visible_traits", [])}
        score = c.get("score", c.get("advisory_score", 0))
        candidate_id = c.get("user_token_hash", c.get("candidate_id", "unknown"))
        name = traits.get("name", candidate_id)
        matching = c.get("matching_traits", [])
        print(f"\n  #{i} {name} (score: {score:.2f})")
        if matching:
            print(f"      Matched on: {', '.join(matching)}")
        for key in ["specialty", "rate", "location", "experience"]:
            if key in traits:
                print(f"      {key}: {traits[key]}")

        explanation = c.get("match_explanation", {})
        if explanation.get("summary"):
            print(f"      Why: {explanation['summary']}")

    # 4. Next steps
    # To advance the funnel, use the `interest` operation with the candidate's
    # full user_token (obtained via search or agent_seek for detailed results).
    # Then: interest → commit → contract → deliver → accept → reputation.
    # See full-lifecycle.ts or QUICKSTART.md for the complete flow.

    print("\n✅ Done! Full lifecycle shown.")
    print(f"Your token for further operations: {token}")


if __name__ == "__main__":
    main()
