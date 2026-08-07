#!/bin/bash
# docker-entrypoint.sh — runs inside the container as the CMD.
# Flow: clean stale results → restore history → npm test → generate Allure
#       report → persist history for next run → serve report on :4242
set -e

# ── 0. Fix mount permissions ─────────────────────────────────────────────────
# On Windows/WSL, mounted volumes may have restrictive permissions.
# Ensure pwuser can write to all mounted volumes.
for dir in /app/allure-results /app/allure-report /app/allure-history /app/test-results; do
  if [ -d "$dir" ]; then
    chmod 777 "$dir" 2>/dev/null || true
    find "$dir" -type d -exec chmod 777 {} \; 2>/dev/null || true
    find "$dir" -type f -exec chmod 666 {} \; 2>/dev/null || true
  fi
done

# ── 1. Clean previous XML results but not the history dir ────────────────────
echo ""
echo "🧹  Clearing previous test results..."
find /app/allure-results -mindepth 1 \
  -not -path '/app/allure-results/history' \
  -not -path '/app/allure-results/history/*' \
  -delete 2>/dev/null || true

# ── 2. Restore history so Allure builds trend graphs ────────────────────────
if [ -d /app/allure-history ] && [ "$(ls -A /app/allure-history 2>/dev/null)" ]; then
  echo "📊  Restoring Allure history for trend graphs..."
  mkdir -p /app/allure-results/history
  chmod 777 /app/allure-results/history 2>/dev/null || true
  cp -r /app/allure-history/. /app/allure-results/history/ 2>/dev/null || true
fi

# ── 3. Run the full test suite ───────────────────────────────────────────────
echo ""
echo "🎭  Running Playwright test suite..."
npm test

# ── 4. Generate Allure report ────────────────────────────────────────────────
echo ""
echo "📋  Generating Allure report..."
# Generate to temp location first, then move to mounted volume to avoid permission issues
TEMP_REPORT=$(mktemp -d)
npx allure generate /app/allure-results --clean -o "$TEMP_REPORT"

# Wipe old report and move new one in place
find /app/allure-report -mindepth 1 -delete 2>/dev/null || true
mv "$TEMP_REPORT"/* /app/allure-report/ 2>/dev/null || true
rmdir "$TEMP_REPORT" 2>/dev/null || true

# ── 5. Persist history for next run ─────────────────────────────────────────
echo "💾  Saving history for next run..."
# Clean old history first
find /app/allure-history -mindepth 1 -delete 2>/dev/null || true
mkdir -p /app/allure-history
chmod 777 /app/allure-history 2>/dev/null || true
cp -r /app/allure-report/history/. /app/allure-history/ 2>/dev/null || true
find /app/allure-history -type f -exec chmod 666 {} \; 2>/dev/null || true

# ── 6. Serve the report ──────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅  Tests complete."
echo "  📂  Allure report → http://localhost:4242"
echo "  🛑  Press Ctrl+C to stop."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx http-server /app/allure-report -p 4242 -s
