# syntax=docker/dockerfile:1

# Use the official Playwright image that matches the npm-installed version
# exactly — browsers are pre-installed in the base image, so `npm ci` here
# only installs the Node dependencies. Version must stay in sync with
# @playwright/test in package.json; update both together.
FROM mcr.microsoft.com/playwright:v1.61.1-noble

# Install Java so allure-commandline (already an npm devDependency) can
# generate the Allure report after the test run. default-jre-headless is
# the smallest JRE available on Ubuntu Noble.
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first so this layer is cached separately from source
# changes — rebuilds after editing a test file skip this step entirely.
COPY package*.json ./
RUN npm ci

# Copy source after deps so the cache hit above is as broad as possible
COPY . .

# CI=true tells playwright.config.ts to:
#   - enable retries (2 on failure)
#   - set forbidOnly (no accidental .only left in)
#   - set reuseExistingServer: false (Playwright manages its own server
#     processes — rate-service:4001, mock-api:4000, mock-app:5173 — which
#     is correct inside a container where nothing is pre-running)
ENV CI=true

COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN dos2unix /docker-entrypoint.sh 2>/dev/null || sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

# Run as non-root. The Playwright base image ships a `pwuser` (uid 1001)
# specifically for this — its browsers under /ms-playwright are already
# readable by pwuser, so no extra permission wiring is needed there. /app
# does need to be owned by pwuser since the entrypoint script writes test
# results into it at runtime (allure-results, test-results, etc.).
RUN chown -R pwuser:pwuser /app
USER pwuser

# Override at `docker compose run --rm tests npm run test:smoke` etc.
CMD ["/docker-entrypoint.sh"]
