#!/usr/bin/env bash
# Smoke test of the local Docker environment (S20), run by CI
# (.github/workflows/local-env.yml) and usable by hand on Linux/macOS:
#
#   docker compose up -d --build && bash scripts/local-smoke.sh
#
# Checks: setup finished, the app answers on localhost and on the machine's
# network address (what a phone on the same Wi-Fi uses), the test account can
# sign in there, its sample analyses exist, and a real demo uploaded through
# the app goes app → MinIO → worker → demoparser2 → COMPLETED, after which the
# demo is deleted from MinIO. Then `docker compose up` again must not re-seed.
set -euo pipefail

BASE_LOCAL="http://localhost:3000"
EMAIL="test@cs2analyst.local"
PASSWORD="test1234"
DEMO="data/przyklad/de_mirage-przyklad.dem"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

fail() {
  echo "FAIL: $*" >&2
  docker compose ps -a >&2 || true
  docker compose logs --no-color --tail 80 setup app worker >&2 || true
  exit 1
}
sql() {
  docker compose exec -T postgres psql -U cs2analyst -d cs2analyst -tAc "$1" | tr -d '[:space:]'
}

echo "== waiting for the app"
for _ in $(seq 1 120); do
  [ "$(docker compose ps app --format '{{.Health}}' 2>/dev/null)" = "healthy" ] && break
  if [ "$(docker compose ps -a setup --format '{{.State}}')" = "exited" ] &&
    [ "$(docker inspect -f '{{.State.ExitCode}}' "$(docker compose ps -aq setup)")" != "0" ]; then
    fail "setup exited with an error"
  fi
  sleep 5
done
[ "$(docker compose ps app --format '{{.Health}}')" = "healthy" ] || fail "app never became healthy"
# grep -q exits at the first match; under pipefail the writer's SIGPIPE would
# fail the pipeline, so read the whole output first.
SETUP_LOG="$(docker compose logs --no-color setup)"
grep -q "setup: gotowe" <<<"$SETUP_LOG" || fail "setup did not finish"

# The address a phone would use: the machine's own network IP, not localhost.
IP="${LAN_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
[ -n "$IP" ] || IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
[ -n "$IP" ] || fail "could not find this machine's network address (set LAN_IP)"
BASE="http://$IP:3000"
echo "== app on $BASE_LOCAL and $BASE"
curl -fsS -o /dev/null "$BASE_LOCAL/login" || fail "/login on localhost"
curl -fsS -o /dev/null "$BASE/login" || fail "/login on $BASE"

echo "== sign in as $EMAIL over $BASE"
CSRF="$(curl -fsS -c "$JAR" -b "$JAR" "$BASE/api/auth/csrf" | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')"
[ -n "$CSRF" ] || fail "no CSRF token"
curl -fsS -o /dev/null -c "$JAR" -b "$JAR" -X POST "$BASE/api/auth/callback/credentials" \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASSWORD" --data-urlencode "callbackUrl=$BASE/matches" \
  --data-urlencode "json=true" || fail "credentials sign-in request"
SESSION_JSON="$(curl -fsS -b "$JAR" "$BASE/api/auth/session")" || fail "no session after sign-in"
grep -q "\"$EMAIL\"" <<<"$SESSION_JSON" || fail "no session after sign-in"
STATUS="$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$BASE/matches")"
[ "$STATUS" = "200" ] || fail "/matches returned $STATUS when signed in"

SAMPLES="$(sql "SELECT count(*) FROM \"DemoUpload\" u JOIN \"User\" x ON x.id = u.\"userId\" WHERE x.email = '$EMAIL' AND u.status = 'COMPLETED'")"
[ "$SAMPLES" -ge 3 ] || fail "expected 3 sample analyses, found $SAMPLES"
echo "== $SAMPLES sample analyses"

[ -f "$DEMO" ] || fail "sample demo $DEMO was not downloaded by setup"
echo "== upload a real demo through the app"
UPLOAD_NAME="smoke-$(date +%s).dem"
STATUS="$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -F "file=@$DEMO;filename=$UPLOAD_NAME" "$BASE/api/uploads")"
case "$STATUS" in 2??) ;; *) fail "upload returned $STATUS" ;; esac
UPLOAD_STATUS=""
for _ in $(seq 1 120); do
  UPLOAD_STATUS="$(sql "SELECT status FROM \"DemoUpload\" WHERE \"fileName\" = '$UPLOAD_NAME'")"
  case "$UPLOAD_STATUS" in COMPLETED | FAILED) break ;; esac
  sleep 5
done
[ "$UPLOAD_STATUS" = "COMPLETED" ] ||
  fail "uploaded demo ended as '$UPLOAD_STATUS': $(sql "SELECT coalesce(error,'') FROM \"DemoUpload\" WHERE \"fileName\" = '$UPLOAD_NAME'")"
FILE_URL="$(sql "SELECT \"fileUrl\" FROM \"DemoUpload\" WHERE \"fileName\" = '$UPLOAD_NAME'")"
case "$FILE_URL" in r2://*) ;; *) fail "demo was not stored in MinIO (fileUrl=$FILE_URL)" ;; esac
DELETED="$(sql "SELECT \"demoDeletedAt\" IS NOT NULL FROM \"DemoUpload\" WHERE \"fileName\" = '$UPLOAD_NAME'")"
[ "$DELETED" = "t" ] || fail "demo was not deleted after the analysis"
LEFT="$(docker compose exec -T minio sh -c 'ls /data/demos/demos 2>/dev/null | wc -l' | tr -d '[:space:]')"
[ "${LEFT:-0}" = "0" ] || fail "MinIO still holds $LEFT demo(s) after the analysis"
echo "== real demo analysed ($FILE_URL, deleted afterwards)"

echo "== second 'docker compose up' keeps the data"
docker compose up -d >/dev/null 2>&1
for _ in $(seq 1 60); do
  [ "$(docker compose ps -a setup --format '{{.State}}')" = "exited" ] && break
  sleep 2
done
SETUP_LOG="$(docker compose logs --no-color setup)"
grep -q "już jest" <<<"$SETUP_LOG" || fail "setup re-ran the seed"
AFTER="$(sql "SELECT count(*) FROM \"DemoUpload\" u JOIN \"User\" x ON x.id = u.\"userId\" WHERE x.email = '$EMAIL'")"
[ "$AFTER" -ge 4 ] || fail "data lost after a second up ($AFTER uploads)"

echo "OK: local environment works"
