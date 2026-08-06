#!/bin/bash
# docker-entrypoint.sh — runs inside the container as the CMD.
# Flow: clean stale results → restore history → npm test → generate Allure
#       report → persist history for next run → serve report on :4242
set -e

# ── 1. Clean previous XML results but not the history dir ────────────────────
# allure-results/ is mounted from the host, so it may contain results from a
# previous local or Docker run. Wipe everything except the history/ subdir
# (which we restore below); leaving stale XMLs would merge old and new results
# into the same report run.
echo ""
echo "🧹  Clearing previous test results..."
find /app/allure-results -mindepth 1 \
  -not -path '/app/allure-results/history' \
  -not -path '/app/allure-results/history/*' \
  -delete 2>/dev/null || true

# ── 2. Restore history so Allure builds trend graphs ────────────────────────
# allure-history/ is a separate host-mounted volume that survives container
# restarts. On first run it doesn't exist / is empty — that's fine, Allure
# just starts a fresh history. On subsequent runs it contains the previous
# report's history/ directory, which Allure uses to draw the trend chart.
if [ -d /app/allure-history ] && [ "$(ls -A /app/allure-history 2>/dev/null)" ]; then
  echo "📊  Restoring Allure history for trend graphs..."
  mkdir -p /app/allure-results/history
  cp -r /app/allure-history/. /app/allure-results/history/
fi

# ── 3. Run the full test suite ───────────────────────────────────────────────
# playwright.config.ts webServer[] boots rate-service (4001), mock-api (4000),
# and mock-app (5173) automatically. CI=true (set in Dockerfile) disables
# reuseExistingServer so Playwright always starts fresh servers here.
echo ""
echo "🎭  Running Playwright test suite..."
npm test

# ── 4. Generate Allure report ────────────────────────────────────────────────
echo ""
echo "📋  Generating Allure report..."
npx allure generate /app/allure-results --clean -o /app/allure-report

# ── 5. Persist history for next run ─────────────────────────────────────────
# Copy the freshly-generated history/ directory into the allure-history/
# volume so the next run can restore it and extend the trend graph.
echo "💾  Saving history for next run..."
mkdir -p /app/allure-history
cp -r /app/allure-report/history/. /app/allure-history/ 2>/dev/null || true

# ── 6. Serve the report ──────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅  Tests complete."
echo "  📂  Allure report → http://localhost:4242"
echo "  🛑  Press Ctrl+C to stop."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx http-server /app/allure-report -p 4242 -s
