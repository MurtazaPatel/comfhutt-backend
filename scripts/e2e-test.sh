#!/bin/bash
# ─────────────────────────────────────────────────────────────
# CRUX E2E Integration Test
# Run: bash scripts/e2e-test.sh
# Requires: server running on localhost:3000, jq installed
# ─────────────────────────────────────────────────────────────

BASE="http://localhost:8080/api"
HEALTH_URL="http://localhost:8080"
PROPERTY_ID="ac86df83-6931-416d-83d0-da578f61e3e0"
PASS=0
FAIL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✅ PASS${NC} — $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}❌ FAIL${NC} — $1: $2"; FAIL=$((FAIL + 1)); }
section() { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"; }

# ── SECTION 1: HEALTH ─────────────────────────────────────────
section "1. Health Check"

STATUS=$(curl -s "$HEALTH_URL/health" | jq -r '.status // empty')
[ "$STATUS" = "ok" ] && pass "Health endpoint" || fail "Health endpoint" "got: $STATUS"

# ── SECTION 2: PROPERTY ──────────────────────────────────────
section "2. Property Ingestion"

# Ingest a new property (Mumbai test)
INGEST=$(curl -s -X POST "$BASE/crux/property" \
  -H "Content-Type: application/json" \
  -d '{"address": "Bandra West, Mumbai, Maharashtra 400050"}')

NEW_PROPERTY_ID=$(echo "$INGEST" | jq -r '.data.id // empty')
CITY=$(echo "$INGEST" | jq -r '.data.city // empty')

[ -n "$NEW_PROPERTY_ID" ] && pass "Property ingestion returns property_id" \
  || fail "Property ingestion" "no property_id in response"
[ "$CITY" = "Mumbai" ] && pass "City correctly geocoded as Mumbai" \
  || fail "City geocoding" "expected Mumbai, got: $CITY"

# Fetch existing property (canonical fixture)
FETCH=$(curl -s "$BASE/crux/property/$PROPERTY_ID")
FETCH_SUCCESS=$(echo "$FETCH" | jq -r '.success // empty')
[ "$FETCH_SUCCESS" = "true" ] && pass "Property fetch by ID" \
  || fail "Property fetch" "response: $(echo $FETCH | jq -r '.error.code // empty')"

# ── SECTION 3: SCORING ───────────────────────────────────────
section "3. CRUX Scoring Engine"

# Fetch cached score (should be fast)
SCORE=$(curl -s "$BASE/crux/score/$PROPERTY_ID?intent=balanced")
COMPOSITE=$(echo "$SCORE" | jq -r '.data.score_composite // empty')
CONFIDENCE=$(echo "$SCORE" | jq -r '.data.confidence_score // empty')
SOURCES=$(echo "$SCORE" | jq -r '.data.data_sources_used | length // 0')

[ -n "$COMPOSITE" ] && pass "Score composite is present (value: $COMPOSITE)" \
  || fail "Score composite" "null or missing"
[ "$(echo "$CONFIDENCE > 0" | bc -l)" = "1" ] \
  && pass "Confidence score > 0 (value: $CONFIDENCE)" \
  || fail "Confidence score" "is 0 or null"
[ "$SOURCES" -gt "0" ] && pass "Data sources used: $SOURCES sources" \
  || fail "Data sources" "empty array"

# Intent variants — all 3 must work
for INTENT in yield appreciation balanced; do
  RESULT=$(curl -s "$BASE/crux/score/$PROPERTY_ID?intent=$INTENT" \
    | jq -r '.data.score_composite // empty')
  [ -n "$RESULT" ] && pass "Score with intent=$INTENT (score: $RESULT)" \
    || fail "Score intent=$INTENT" "null response"
done

# Force recompute on new property
COMPUTE=$(curl -s -X POST \
  "$BASE/crux/score/$NEW_PROPERTY_ID/compute?intent=balanced&lifecycle=delivered&macro_cycle=growth")
COMPUTE_SCORE=$(echo "$COMPUTE" | jq -r '.data.score_composite // empty')
[ -n "$COMPUTE_SCORE" ] && pass "Force recompute on new property (score: $COMPUTE_SCORE)" \
  || fail "Force recompute" "response: $(echo $COMPUTE | jq .)"

# ── SECTION 4: CRUX LENS ─────────────────────────────────────
section "4. CRUX Lens"

# Create session
SESSION_RESP=$(curl -s -X POST "$BASE/crux/lens/session" \
  -H "Content-Type: application/json" \
  -d "{\"property_id\": \"$PROPERTY_ID\"}")
SESSION_ID=$(echo "$SESSION_RESP" | jq -r '.data.session_id // empty')
EXPIRES=$(echo "$SESSION_RESP" | jq -r '.data.expires_at // empty')

[ -n "$SESSION_ID" ] && pass "Lens session created (id: ${SESSION_ID:0:8}...)" \
  || fail "Lens session creation" "no session_id"
[ -n "$EXPIRES" ] && pass "Session has expiry timestamp" \
  || fail "Session expiry" "expires_at missing"

# Stream a message — collect full response
echo -n "  Streaming Lens message... "
STREAM=$(curl -s -X POST "$BASE/crux/lens/$SESSION_ID/message" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the CRUX Score for this property?"}' \
  --no-buffer 2>&1)

DONE_CHUNK=$(echo "$STREAM" | grep '"done":true')
HAS_DELTA=$(echo "$STREAM" | grep '"delta"' | grep -v '"delta":""' | head -1)
HAS_DISCLAIMER=$(echo "$STREAM" | grep -i "investment advice\|not investment\|SEBI\|research only")

[ -n "$DONE_CHUNK" ] && pass "SSE stream completes with done:true" \
  || fail "SSE stream" "no done:true chunk received"
[ -n "$HAS_DELTA" ] && pass "SSE stream contains text deltas" \
  || fail "SSE deltas" "no text content in stream"
[ -n "$HAS_DISCLAIMER" ] && pass "SEBI disclaimer present in stream" \
  || fail "SEBI GUARDRAIL" "disclaimer NOT found in response — CRITICAL FAILURE"

# Stream a second message (tests rolling history)
STREAM2=$(curl -s -X POST "$BASE/crux/lens/$SESSION_ID/message" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the fair value of this property?"}' \
  --no-buffer 2>&1)
DONE2=$(echo "$STREAM2" | grep '"done":true')
[ -n "$DONE2" ] && pass "Second Lens message streams successfully" \
  || fail "Second Lens message" "no done:true"

# Check history
HISTORY=$(curl -s "$BASE/crux/lens/$SESSION_ID/history")
MSG_COUNT=$(echo "$HISTORY" | jq -r '.data.count // 0')
[ "$MSG_COUNT" -ge "4" ] && pass "History contains $MSG_COUNT messages (2 exchanges)" \
  || fail "Lens history" "expected >= 4 messages, got: $MSG_COUNT"

# ── SECTION 5: REPORT ────────────────────────────────────────
section "5. CRUX Report"

REPORT=$(curl -s "$BASE/crux/report/$PROPERTY_ID?intent=balanced")
SUMMARY=$(echo "$REPORT" | jq -r '.data.summary // empty')
RISK_FLAGS=$(echo "$REPORT" | jq -r '.data.risk_flags | length // 0')
DISCLAIMER=$(echo "$REPORT" | jq -r '.data.sebi_disclaimer // empty')
METHODOLOGY_LEAK=$(echo "$REPORT" | jq -r '.data | to_entries[] | .value |
  strings | select(test("weight|30%|formula|methodology"; "i"))' 2>/dev/null)

[ -n "$SUMMARY" ] && pass "Report summary is non-empty" \
  || fail "Report summary" "null or empty"
[ "$RISK_FLAGS" -ge "3" ] && pass "Report has >= 3 risk flags ($RISK_FLAGS found)" \
  || fail "Report risk flags" "expected >= 3, got: $RISK_FLAGS"
[ -n "$DISCLAIMER" ] && pass "Report SEBI disclaimer present" \
  || fail "Report SEBI disclaimer" "missing — CRITICAL"
[ -z "$METHODOLOGY_LEAK" ] && pass "No methodology weights leaked in report" \
  || fail "IP LEAK" "methodology language found: $METHODOLOGY_LEAK — CRITICAL"

# Cache test — second call should return same report id
REPORT_ID_1=$(echo "$REPORT" | jq -r '.data.id')
REPORT_ID_2=$(curl -s "$BASE/crux/report/$PROPERTY_ID?intent=balanced" | jq -r '.data.id')
[ "$REPORT_ID_1" = "$REPORT_ID_2" ] && pass "Report cache returns same id on second call" \
  || fail "Report cache" "different ids: $REPORT_ID_1 vs $REPORT_ID_2"

# ── SECTION 6: CARD ──────────────────────────────────────────
section "6. CRUX Card"

CARD=$(curl -s -X POST "$BASE/crux/card/$PROPERTY_ID?intent=balanced")
SHARE_TOKEN=$(echo "$CARD" | jq -r '.data.share_token // empty')
SHARE_URL=$(echo "$CARD" | jq -r '.data.share_url // empty')
CARD_DISCLAIMER=$(echo "$CARD" | jq -r '.data.card_data.sebi_disclaimer // empty')
CARD_SCORE=$(echo "$CARD" | jq -r '.data.card_data.score_composite // empty')

[ -n "$SHARE_TOKEN" ] && pass "Card generated with share_token: $SHARE_TOKEN" \
  || fail "Card generation" "no share_token"
[ -n "$SHARE_URL" ] && pass "Share URL present: $SHARE_URL" \
  || fail "Card share URL" "missing"
[ -n "$CARD_DISCLAIMER" ] && pass "Card SEBI disclaimer present" \
  || fail "Card SEBI disclaimer" "missing — CRITICAL"
[ "$CARD_SCORE" = "61" ] && pass "Card score matches canonical fixture (61)" \
  || fail "Card score" "expected 61, got: $CARD_SCORE"

# Fetch by share token
CARD_FETCH=$(curl -s "$BASE/crux/card/share/$SHARE_TOKEN")
FETCHED_SCORE=$(echo "$CARD_FETCH" | jq -r '.data.card_data.score_composite // empty')
VIEW_COUNT=$(echo "$CARD_FETCH" | jq -r '.data.view_count // 0')

[ "$FETCHED_SCORE" = "61" ] && pass "Card fetch by share_token returns correct score" \
  || fail "Card fetch by token" "expected 61, got: $FETCHED_SCORE"
[ "$VIEW_COUNT" -ge "1" ] && pass "View count incremented ($VIEW_COUNT)" \
  || fail "View count" "expected >= 1, got: $VIEW_COUNT"

# ── SECTION 7: SECURITY LAYER SPOT CHECKS ────────────────────
section "7. Security Spot Checks"

# Bad UUID should 400
BAD_UUID=$(curl -s "$BASE/crux/score/not-a-uuid" | jq -r '.error.code // empty')
[ "$BAD_UUID" = "VALIDATION_ERROR" ] && pass "Invalid UUID returns VALIDATION_ERROR" \
  || fail "UUID validation" "expected VALIDATION_ERROR, got: $BAD_UUID"

# Script injection in address
INJECT=$(curl -s -X POST "$BASE/crux/property" \
  -H "Content-Type: application/json" \
  -d '{"address": "<script>alert(1)</script>"}' | jq -r '.error.code // empty')
[ "$INJECT" = "VALIDATION_ERROR" ] && pass "Script injection blocked" \
  || fail "Script injection" "not blocked — got: $INJECT"

# Watch requires auth
WATCH_AUTH=$(curl -s -X POST "$BASE/crux/watch/$PROPERTY_ID" \
  | jq -r '.error.code // empty')
[ "$WATCH_AUTH" = "UNAUTHORIZED" ] && pass "Watch correctly requires auth" \
  || fail "Watch auth guard" "expected UNAUTHORIZED, got: $WATCH_AUTH"

# CORS blocks unknown origin
CORS_BLOCK=$(curl -s -I "$HEALTH_URL/health" \
  -H "Origin: https://evil.com" | grep -i "access-control-allow-origin")
[ -z "$CORS_BLOCK" ] && pass "CORS blocks unknown origin" \
  || fail "CORS" "evil.com was allowed: $CORS_BLOCK"

# ── SUMMARY ──────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS + FAIL))
echo -e "${GREEN}PASS: $PASS${NC} / ${RED}FAIL: $FAIL${NC} / TOTAL: $TOTAL"

if [ "$FAIL" -eq "0" ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED — READY FOR DEPLOYMENT${NC}"
  exit 0
else
  echo -e "${RED}❌ $FAIL TEST(S) FAILED — DO NOT DEPLOY${NC}"
  echo "Fix all failures before running Prompt 17."
  exit 1
fi
