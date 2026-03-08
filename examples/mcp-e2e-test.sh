#!/usr/bin/env bash
# MCP End-to-End Test — verifies the full Schelling Protocol flow
# Works against live API, no auth needed (playground mode)
set -uo pipefail

API="https://schellingprotocol.com/schelling"
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'
PASS=0
FAIL=0

check() {
  local desc="$1" ok="$2"
  if [ "$ok" = "true" ]; then
    echo -e "  ${GREEN}✓${NC} $desc"
    ((PASS++))
  else
    echo -e "  ${RED}✗${NC} $desc"
    ((FAIL++))
  fi
}

echo -e "${BLUE}Schelling Protocol — End-to-End Test${NC}"
echo "API: $API"
echo ""

# 1. Health check
echo "1. Health & Discovery"
HEALTH=$(curl -s "${API%/schelling}/health" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null || echo "")
check "Health endpoint responds" "$([ "$HEALTH" = "healthy" ] && echo true || echo false)"

DESCRIBE=$(curl -s -X POST "$API/describe" -H "Content-Type: application/json" -d '{}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('protocol',{}).get('version',''))" 2>/dev/null || echo "")
check "Describe returns protocol v3.0" "$([ "$DESCRIBE" = "3.0" ] && echo true || echo false)"

echo ""

# 2. Register two agents
echo "2. Registration"
OFFER=$(curl -s -X POST "$API/quick_offer" -H "Content-Type: application/json" \
  -d '{"intent": "E2E test: I offer TypeScript development and code review services"}')
TOKEN_OFFER=$(echo "$OFFER" | python3 -c "import sys,json; print(json.load(sys.stdin).get('user_token',''))" 2>/dev/null)
check "Register offerer via quick_offer" "$([ -n "$TOKEN_OFFER" ] && echo true || echo false)"

SEEK=$(curl -s -X POST "$API/quick_seek" -H "Content-Type: application/json" \
  -d '{"intent": "E2E test: Looking for a developer for code review"}')
TOKEN_SEEK=$(echo "$SEEK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('user_token',''))" 2>/dev/null)
check "Register seeker via quick_seek" "$([ -n "$TOKEN_SEEK" ] && echo true || echo false)"

echo ""

# 3. Search
echo "3. Search & Discovery"
SEARCH=$(curl -s -X POST "$API/search" -H "Content-Type: application/json" \
  -d "{\"protocol_version\": \"3.0\", \"user_token\": \"$TOKEN_SEEK\"}")
CAND_COUNT=$(echo "$SEARCH" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('candidates',[])))" 2>/dev/null || echo "0")
check "Search returns candidates ($CAND_COUNT found)" "$([ "$CAND_COUNT" -gt "0" ] && echo true || echo false)"

FIRST_CAND=$(echo "$SEARCH" | python3 -c "import sys,json; cs=json.load(sys.stdin).get('candidates',[]); print(cs[0]['candidate_id'] if cs else '')" 2>/dev/null)
check "Candidate has ID" "$([ -n "$FIRST_CAND" ] && echo true || echo false)"

echo ""

# 4. Interest
echo "4. Funnel Progression"
INTEREST=$(curl -s -X POST "$API/interest" -H "Content-Type: application/json" \
  -d "{\"protocol_version\": \"3.0\", \"user_token\": \"$TOKEN_SEEK\", \"candidate_id\": \"$FIRST_CAND\"}")
STAGE=$(echo "$INTEREST" | python3 -c "import sys,json; print(json.load(sys.stdin).get('your_stage',''))" 2>/dev/null || echo "")
check "Express interest (stage: $STAGE)" "$([ "$STAGE" = "2" ] && echo true || echo false)"

COMMIT=$(curl -s -X POST "$API/commit" -H "Content-Type: application/json" \
  -d "{\"protocol_version\": \"3.0\", \"user_token\": \"$TOKEN_SEEK\", \"candidate_id\": \"$FIRST_CAND\"}")
COMMIT_STAGE=$(echo "$COMMIT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('your_stage',''))" 2>/dev/null || echo "")
check "Commit (stage: $COMMIT_STAGE)" "$([ "$COMMIT_STAGE" = "3" ] && echo true || echo false)"

echo ""

# 5. Contract
echo "5. Contract Negotiation"
CONTRACT=$(curl -s -X POST "$API/contract" -H "Content-Type: application/json" \
  -d "{\"protocol_version\": \"3.0\", \"user_token\": \"$TOKEN_SEEK\", \"candidate_id\": \"$FIRST_CAND\", \"action\": \"propose\", \"type\": \"service\", \"terms\": {\"description\": \"Code review for test project\", \"price\": 0}}")
CONTRACT_ID=$(echo "$CONTRACT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',d).get('contract_id',''))" 2>/dev/null || echo "")
check "Propose contract" "$([ -n "$CONTRACT_ID" ] && echo true || echo false)"

echo ""

# 6. No auth required
echo "6. Playground Mode (no auth/credits)"
check "Registration works without API key" "$([ -n "$TOKEN_OFFER" ] && echo true || echo false)"
check "Search works without credits" "$([ "$CAND_COUNT" -gt "0" ] && echo true || echo false)"
check "Contract works without payment" "$([ -n "$CONTRACT_ID" ] && echo true || echo false)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
[ "$FAIL" -eq 0 ] && echo -e "${GREEN}All tests passed!${NC}" || echo -e "${RED}Some tests failed.${NC}"
