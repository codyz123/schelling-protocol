#!/bin/bash
# Schelling Protocol — curl examples
# No dependencies needed. Just bash and curl.

API="${SCHELLING_API:-https://schellingprotocol.com}"

echo "=== Schelling Protocol curl Examples ==="
echo "API: $API"
echo

# 1. Discover
echo "--- 1. Discover what's available ---"
curl -s -X POST "$API/schelling/describe" \
  -H 'Content-Type: application/json' \
  -d '{}' | python3 -m json.tool
echo

# 2. Register an offering
echo "--- 2. Register a developer offering ---"
OFFER=$(curl -s -X POST "$API/schelling/quick_offer" \
  -H 'Content-Type: application/json' \
  -d '{"intent": "I am a freelance Python developer in Austin, 4 years experience, $85/hr"}')
echo "$OFFER" | python3 -m json.tool
OFFER_TOKEN=$(echo "$OFFER" | python3 -c "import sys,json; print(json.load(sys.stdin).get('user_token',''))")
echo "Provider token: $OFFER_TOKEN"
echo

# 3. Search for a match
echo "--- 3. Search for a Python developer ---"
SEEK=$(curl -s -X POST "$API/schelling/quick_seek" \
  -H 'Content-Type: application/json' \
  -d '{"intent": "looking for a Python developer in Austin, budget $100/hr"}')
echo "$SEEK" | python3 -m json.tool
SEEK_TOKEN=$(echo "$SEEK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('user_token',''))")
echo "Seeker token: $SEEK_TOKEN"
echo

# 4. Express interest (if candidates found)
CANDIDATE=$(echo "$SEEK" | python3 -c "import sys,json; cs=json.load(sys.stdin).get('candidates',[]); print(cs[0]['candidate_id'] if cs else '')" 2>/dev/null)
if [ -n "$CANDIDATE" ]; then
  echo "--- 4. Express interest in $CANDIDATE ---"
  curl -s -X POST "$API/schelling/interest" \
    -H 'Content-Type: application/json' \
    -d "{\"user_token\": \"$SEEK_TOKEN\", \"candidate_id\": \"$CANDIDATE\"}" | python3 -m json.tool
  echo
fi

# 5. Check connections
echo "--- 5. Check connections ---"
curl -s -X POST "$API/schelling/connections" \
  -H 'Content-Type: application/json' \
  -d "{\"user_token\": \"$SEEK_TOKEN\"}" | python3 -m json.tool
echo

echo "=== Done ==="
