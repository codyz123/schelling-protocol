#!/bin/bash
# Smoke test for deployed Schelling Protocol API
# Run after every deploy to verify core functionality.
# Usage: ./scripts/smoke-test.sh [API_URL]

API="${1:-https://schellingprotocol.com}"
PASS=0
FAIL=0
TOTAL=0

check() {
  local name="$1"
  local result="$2"
  local expected="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$result" | grep -q "$expected"; then
    echo "  ✅ $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name (expected: $expected)"
    echo "     Got: $(echo "$result" | head -1)"
    FAIL=$((FAIL + 1))
  fi
}

check_pass() {
  local name="$1"
  TOTAL=$((TOTAL + 1))
  echo "  ✅ $name"
  PASS=$((PASS + 1))
}

check_fail() {
  local name="$1"
  TOTAL=$((TOTAL + 1))
  echo "  ❌ $name"
  FAIL=$((FAIL + 1))
}

echo "🔍 Schelling Protocol Smoke Test"
echo "   API: $API"
echo ""

# 1. Health check
echo "── Health ──"
HEALTH=$(curl -sf "$API/health")
check "GET /health returns ok" "$HEALTH" '"status":"healthy"'

# 2. Root discovery
echo "── Discovery ──"
ROOT=$(curl -sf "$API/" -H 'Accept: application/json')
check "GET / returns JSON discovery" "$ROOT" 'schelling'

# 3. Describe
DESC=$(curl -sf -X POST "$API/schelling/describe" -H 'Content-Type: application/json' -d '{}')
check "POST describe works" "$DESC" '"protocol"'
check "Clusters exist (auto-seed)" "$DESC" '"total_active"'

# 4. OpenAPI
echo "── OpenAPI ──"
OPENAPI=$(curl -sf "$API/openapi.yaml" | head -5)
check "GET /openapi.yaml serves spec" "$OPENAPI" 'openapi'

# 5. Quick seek
echo "── Quick Operations ──"
SEEK=$(curl -sf -X POST "$API/schelling/quick_seek" -H 'Content-Type: application/json' \
  -d '{"intent":"developer in Denver"}')
check "quick_seek returns user_token" "$SEEK" '"user_token"'
check "quick_seek returns candidates" "$SEEK" '"candidates"'

# 6. Quick offer
OFFER=$(curl -sf -X POST "$API/schelling/quick_offer" -H 'Content-Type: application/json' \
  -d '{"intent":"I am a test provider for smoke test"}')
check "quick_offer returns user_token" "$OFFER" '"user_token"'

# 7. Error handling
echo "── Error Handling ──"
ERR_METHOD=$(curl -s "$API/schelling/describe" -H 'Accept: application/json')
check "GET schelling path returns helpful 404" "$ERR_METHOD" 'Not found'

ERR_UNKNOWN=$(curl -s -X POST "$API/schelling/nonexistent" -H 'Content-Type: application/json' -d '{}')
check "Unknown op returns error" "$ERR_UNKNOWN" 'Unknown operation'

ERR_VERSION=$(curl -s -X POST "$API/schelling/register" -H 'Content-Type: application/json' -d '{}')
check "Missing version returns error" "$ERR_VERSION" 'VERSION_MISMATCH'

# 8. CORS
echo "── CORS ──"
CORS=$(curl -sf -I -X OPTIONS "$API/schelling/describe" -H 'Origin: https://schellingprotocol.com' -H 'Access-Control-Request-Method: POST' 2>&1)
check "OPTIONS returns CORS headers" "$CORS" 'access-control-allow-origin'

# 9. Discovery endpoints
echo "── Discovery Endpoints ──"
DOCS=$(curl -sf "$API/docs" | head -20)
check "GET /docs serves Swagger UI" "$DOCS" 'swagger-ui'

DEMO=$(curl -sf "$API/demo" | head -20)
check "GET /demo serves playground" "$DEMO" 'Interactive Demo'

LLMS=$(curl -sf "$API/llms.txt" | head -5)
check "GET /llms.txt serves AI discovery" "$LLMS" 'Schelling'

AGENT=$(curl -sf "$API/.well-known/agent.json")
check "GET /.well-known/agent.json serves A2A card" "$AGENT" '"skills"'

ROBOTS=$(curl -sf "$API/robots.txt")
check "GET /robots.txt serves crawl rules" "$ROBOTS" 'User-agent'

# 10. Network status
echo "── Network Status ──"
STATUS=$(curl -sf "$API/status")
if echo "$STATUS" | grep -q '"status":"live"'; then
  AGENTS=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin)['network']['total_agents'])" 2>/dev/null || echo "?")
  check_pass "GET /status returns live ($AGENTS agents)"
else
  check_fail "GET /status returns live"
fi

# 11. Clusters
echo "── Clusters ──"
CLUSTERS=$(curl -sf -X POST "$API/schelling/clusters" -H 'Content-Type: application/json' -d '{"action":"list"}')
check "clusters list returns data" "$CLUSTERS" '"clusters"'

# 12. Full lifecycle spot check
echo "── Lifecycle ──"
ONBOARD=$(curl -sf -X POST "$API/schelling/onboard" -H 'Content-Type: application/json' \
  -d '{"natural_language":"I need a photographer in Denver"}')
check "onboard returns template" "$ONBOARD" '"registration_template"'

echo ""
echo "══════════════════════════"
echo "  Results: $PASS/$TOTAL passed, $FAIL failed"
echo "══════════════════════════"

[ $FAIL -eq 0 ] && exit 0 || exit 1
