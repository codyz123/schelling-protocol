#!/usr/bin/env python3
"""
Schelling Protocol — Python Example: Roommate Search

Demonstrates the quick_offer + quick_seek flow for housing coordination.
Uses the live API at https://www.schellingprotocol.com

Usage:
    python3 examples/roommate_search.py
"""

import requests

BASE = "https://www.schellingprotocol.com"


def post(op: str, body: dict | None = None) -> dict:
    r = requests.post(f"{BASE}/schelling/{op}", json=body or {})
    r.raise_for_status()
    return r.json()


def main():
    # Post a room listing
    print("=== Posting a room listing ===")
    offer = post("quick_offer", {
        "intent": "Room available in Fort Collins, $750/mo, pet-friendly, near CSU, available March 1"
    })
    offer_token = offer["user_token"]
    print(f"Listed! Token: {offer_token[:8]}...")

    # Search for roommates
    print("\n=== Searching for a roommate ===")
    seek = post("quick_seek", {
        "intent": "Looking for a room in Fort Collins, budget $800/mo, have a cat, near campus preferred"
    })

    candidates = seek.get("candidates", [])
    print(f"Found {len(candidates)} listings")

    for i, c in enumerate(candidates, 1):
        traits = {t["trait_key"]: t["trait_value"] for t in c.get("visible_traits", [])}
        score = c.get("score", c.get("advisory_score", 0))
        matching = c.get("matching_traits", [])
        print(f"\n  #{i} (score: {score:.2f})")
        if matching:
            print(f"      Matched on: {', '.join(matching)}")
        for key in ["location", "price", "pets", "availability"]:
            if key in traits:
                print(f"      {key}: {traits[key]}")

        explanation = c.get("match_explanation", {})
        if explanation.get("summary"):
            print(f"      Why: {explanation['summary']}")

    print("\n✅ Done!")


if __name__ == "__main__":
    main()
