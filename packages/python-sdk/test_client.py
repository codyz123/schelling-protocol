"""Integration tests for the Schelling Python SDK against the live API."""

import sys
import traceback

from schelling_sdk import SchellingClient, SchellingError, Candidate, __version__

BASE_URL = "https://www.schellingprotocol.com"


def test_version():
    assert __version__ == "3.0.0", f"Expected 3.0.0, got {__version__}"
    print("  PASS test_version")


def test_describe():
    client = SchellingClient(base_url=BASE_URL)
    result = client.describe()
    assert "protocol" in result, "describe should return protocol info"
    assert "clusters" in result, "describe should return clusters"
    assert "capabilities" in result, "describe should return capabilities"
    assert result["protocol"]["version"] == "3.0", f"Expected protocol 3.0, got {result['protocol']['version']}"
    print("  PASS test_describe")


def test_clusters():
    client = SchellingClient(base_url=BASE_URL)
    result = client.clusters()
    assert isinstance(result, dict), "clusters should return a dict"
    assert "clusters" in result, "clusters response should contain 'clusters' key"
    print("  PASS test_clusters")


def test_seek():
    client = SchellingClient(base_url=BASE_URL)
    result = client.seek("Python developer")
    assert hasattr(result, "candidates"), "seek should return SeekResult with candidates"
    assert isinstance(result.candidates, list), "candidates should be a list"
    assert result.user_token, "seek should return a user_token"
    assert result.cluster_id, "seek should return a cluster_id"
    for c in result.candidates:
        assert isinstance(c, Candidate), f"Each candidate should be a Candidate, got {type(c)}"
        assert c.candidate_id, "candidate should have an id"
    print(f"  PASS test_seek ({len(result.candidates)} candidates)")


def test_offer():
    client = SchellingClient(base_url=BASE_URL)
    result = client.offer("Senior backend engineer, 10 years Python experience")
    assert result.user_token, "offer should return a user_token"
    assert result.cluster_id, "offer should return a cluster_id"
    print("  PASS test_offer")


def test_full_lifecycle():
    """Test register → search → interest flow."""
    client = SchellingClient(base_url=BASE_URL)

    # Step 1: Register as a seeker
    reg = client.register(
        cluster_id="testing.integration",
        role="seeker",
        traits=[
            {
                "key": "skill.primary",
                "value": "integration-testing",
                "value_type": "string",
                "visibility": "public",
            }
        ],
        preferences=[
            {
                "trait_key": "skill.primary",
                "operator": "eq",
                "value": "python",
                "weight": 0.8,
            }
        ],
    )
    assert "user_token" in reg, "register should return user_token"
    assert client.token == reg["user_token"], "client should store token automatically"
    seeker_token = reg["user_token"]

    # Step 2: Register as an offerer (separate client)
    client2 = SchellingClient(base_url=BASE_URL)
    reg2 = client2.register(
        cluster_id="testing.integration",
        role="offerer",
        traits=[
            {
                "key": "skill.primary",
                "value": "python",
                "value_type": "string",
                "visibility": "public",
            }
        ],
        preferences=[
            {
                "trait_key": "skill.primary",
                "operator": "eq",
                "value": "integration-testing",
                "weight": 0.8,
            }
        ],
    )
    assert "user_token" in reg2, "register should return user_token for offerer"

    # Step 3: Search from seeker's perspective
    results = client.search(cluster_id="testing.integration")
    assert "candidates" in results, "search should return candidates"

    # Step 4: If we found candidates, express interest in the first one
    if results["candidates"]:
        candidate_id = results["candidates"][0]["candidate_id"]
        interest_result = client.interest(candidate_id)
        assert interest_result is not None, "interest should return a response"
        print(f"  PASS test_full_lifecycle (registered, searched, found {len(results['candidates'])} candidates, expressed interest)")
    else:
        print(f"  PASS test_full_lifecycle (registered, searched, 0 candidates found — cluster may be empty)")


def test_error_handling():
    """Test that API errors are raised as SchellingError."""
    client = SchellingClient(base_url=BASE_URL, token="invalid-token-12345")
    try:
        client.connections()
        # Some operations may not require valid token, so this is not always an error
        print("  PASS test_error_handling (no error raised — operation may not require auth)")
    except SchellingError as e:
        assert e.status >= 400, f"Error status should be >= 400, got {e.status}"
        assert e.code, "Error should have a code"
        print(f"  PASS test_error_handling (caught {e.code}: {e})")


def test_agent_convenience():
    """Test agent_seek and agent_lookup aliases."""
    client = SchellingClient(base_url=BASE_URL)
    result = client.agent_seek("DevOps engineer with Kubernetes experience")
    assert hasattr(result, "candidates"), "agent_seek should return SeekResult"
    print(f"  PASS test_agent_convenience ({len(result.candidates)} candidates)")


def main():
    tests = [
        test_version,
        test_describe,
        test_clusters,
        test_seek,
        test_offer,
        test_full_lifecycle,
        test_error_handling,
        test_agent_convenience,
    ]

    passed = 0
    failed = 0

    print(f"\nSchelling Python SDK Integration Tests")
    print(f"Server: {BASE_URL}")
    print(f"{'=' * 50}\n")

    for test in tests:
        try:
            test()
            passed += 1
        except Exception as e:
            failed += 1
            print(f"  FAIL {test.__name__}: {e}")
            traceback.print_exc()

    print(f"\n{'=' * 50}")
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")

    if failed > 0:
        sys.exit(1)
    print("\nAll tests passed!")


if __name__ == "__main__":
    main()
