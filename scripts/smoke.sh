#!/usr/bin/env bash
# Black-box HTTP smoke test: boots the server in mock mode, then negotiates a
# full session -> offer -> accept over curl and asserts a bounded deal plus a
# well-formed discount code. Used by CI, runnable locally as-is:
#   bash scripts/smoke.sh
set -euo pipefail

PORT="${SMOKE_PORT:-8797}"
BASE="http://127.0.0.1:$PORT"
HANDLE="demo-ecoride-tripper"

MOCK_PRODUCTS=1 PORT="$PORT" node "$(dirname "$0")/../server/src/index.js" &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 100); do
  curl -fsS "$BASE/healthz" >/dev/null 2>&1 && break
  sleep 0.1
done
curl -fsS "$BASE/healthz" | grep -q '"ok":true' || { echo "server never became healthy"; exit 1; }

# json <dot.path> — extract one field from JSON on stdin (node is already here).
json() {
  node -e '
    let d = "";
    process.stdin.on("data", (c) => (d += c)).on("end", () => {
      const v = process.argv[1].split(".").reduce((o, k) => (o == null ? o : o[k]), JSON.parse(d));
      if (v === undefined || v === null) { console.error("missing field: " + process.argv[1]); process.exit(1); }
      console.log(v);
    });' "$1"
}

echo "== start session for $HANDLE"
SESSION_JSON=$(curl -fsS -X POST "$BASE/api/session" -H 'Content-Type: application/json' \
  -d "{\"productHandle\":\"$HANDLE\"}")
echo "$SESSION_JSON"
SID=$(json sessionId <<<"$SESSION_JSON")
LIST=$(json product.listPrice <<<"$SESSION_JSON")

OFFER=$((LIST * 8 / 10))
echo "== offer $OFFER NOK"
OFFER_JSON=$(curl -fsS -X POST "$BASE/api/offer" -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SID\",\"offerNOK\":$OFFER}")
echo "$OFFER_JSON"
json decision <<<"$OFFER_JSON" >/dev/null

echo "== accept the standing offer"
ACCEPT_JSON=$(curl -fsS -X POST "$BASE/api/accept" -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SID\"}")
echo "$ACCEPT_JSON"
CODE=$(json discountCode <<<"$ACCEPT_JSON")
DEAL=$(json dealPrice <<<"$ACCEPT_JSON")

[[ "$CODE" =~ ^HAGGLE-[A-Z0-9]{6}$ ]] || { echo "FAIL: bad discount code: $CODE"; exit 1; }
((DEAL <= LIST)) || { echo "FAIL: deal $DEAL above list $LIST"; exit 1; }
# Structural floor: max 10% off by default, with 50 NOK human-rounding slack.
((DEAL >= LIST * 90 / 100 - 25)) || { echo "FAIL: deal $DEAL breaches the price floor"; exit 1; }

echo "OK: negotiated $LIST -> $DEAL NOK, code $CODE"
