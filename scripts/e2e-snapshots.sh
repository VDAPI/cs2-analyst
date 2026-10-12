#!/usr/bin/env bash
# Regenerate the E2E visual baselines (e2e/screens/__screenshots__) inside the
# same Playwright Docker image CI runs in, so fonts and rendering match CI
# pixel for pixel. Needs Docker, plus PostgreSQL and Redis on localhost
# (`docker compose up -d`). Extra arguments go to `playwright test`
# (e.g. a spec file or `-g "ekran: raport"`).
set -euo pipefail
IMAGE="mcr.microsoft.com/playwright:v$(node -p 'require("@playwright/test/package.json").version')-noble"
exec docker run --rm --network host --ipc host \
  -v "$PWD":/work -w /work \
  -e E2E_DATABASE_URL -e E2E_REDIS_URL -e E2E_PORT -e E2E_VISUAL=1 \
  "$IMAGE" \
  npx playwright test --project=setup --project=desktop --project=mobile --update-snapshots "$@"
