#!/usr/bin/env python3
"""
Schelling Protocol — Python Quickstart
=======================================
Registers an apartment listing and a seeker, then shows match results.
Uses the live API at https://www.schellingprotocol.com
"""

import json
import requests

API = "https://www.schellingprotocol.com"


def post(operation: str, body: dict) -> dict:
    resp = requests.post(
        f"{API}/schelling/{operation}",
        json=body,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def main():
    print("=" * 60)
    print("  Schelling Protocol — Python Quickstart")
    print("  Apartment hunting in Fort Collins, CO")
    print("=" * 60)

    # Step 1: Register a listing (provider)
    print("\n🏠 Step 1: Register an apartment listing...")
    offer = post("quick_offer", {
        "intent": (
            "I have a 2-bedroom apartment in Fort Collins near CSU campus. "
            "$1,350/month, pet-friendly, in-unit laundry, available March 1. "
            "Quiet neighborhood, 10-min bike to Old Town."
        ),
    })
    provider_token = offer["user_token"]
    print(f"   ✅ Registered in cluster: {offer.get('cluster_id', 'N/A')}")
    print(f"   Token: {provider_token[:8]}...")
    if offer.get("nl_parsed", {}).get("traits"):
        traits = offer["nl_parsed"]["traits"]
        print(f"   Parsed {len(traits)} traits from natural language:")
        for t in traits[:5]:
            print(f"     • {t['key']}: {t['value']}")

    # Step 2: Register a seeker
    print("\n🔍 Step 2: Register an apartment seeker...")
    seek = post("quick_seek", {
        "intent": (
            "Looking for a 2-bedroom apartment in Fort Collins. "
            "Budget up to $1,500/month. Must be pet-friendly (I have a dog). "
            "Prefer near Old Town or CSU. Need in-unit laundry."
        ),
    })
    seeker_token = seek["user_token"]
    print(f"   ✅ Registered in cluster: {seek.get('cluster_id', 'N/A')}")
    print(f"   Token: {seeker_token[:8]}...")

    # Step 3: Show match results
    candidates = seek.get("candidates", [])
    total = seek.get("total_matches", 0)
    print(f"\n📊 Step 3: Match Results ({total} total candidates)")
    print("-" * 50)

    if not candidates:
        print("   No candidates returned (network may be empty).")
    else:
        for i, c in enumerate(candidates, 1):
            score = c.get("score", 0)
            matching = ", ".join(c.get("matching_traits", []))
            bar = "█" * int(score * 20) + "░" * (20 - int(score * 20))
            print(f"   #{i}  Score: {score:.2f}  [{bar}]")
            print(f"       Matching on: {matching}")
            print(f"       ID: {c.get('user_token_hash', 'N/A')}")
            print()

    # Step 4: Delegation model context
    print("🤖 Delegation Model Context")
    print("-" * 50)
    print("   In a real agent integration, you'd include agent_confidence")
    print("   on each preference to signal how certain the AI is about")
    print("   the user's intent:\n")
    example = {
        "key": "pet_friendly",
        "value": True,
        "agent_confidence": 0.95,
        "source": "user_stated — 'I have a dog'",
    }
    print(f"   {json.dumps(example, indent=4).replace(chr(10), chr(10) + '   ')}\n")
    example2 = {
        "key": "laundry",
        "value": "in-unit",
        "agent_confidence": 0.7,
        "source": "user_preference — 'prefer', not 'must have'",
    }
    print(f"   {json.dumps(example2, indent=4).replace(chr(10), chr(10) + '   ')}")

    # Done
    best_score = candidates[0]["score"] if candidates else 0
    print("\n" + "=" * 60)
    print("  ✅ Done! Both profiles registered and matched.")
    print(f"  Highest match score: {best_score:.2f}")
    print("=" * 60)


if __name__ == "__main__":
    main()
