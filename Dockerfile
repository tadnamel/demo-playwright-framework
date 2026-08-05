# syntax=docker/dockerfile:1

# Use the official Playwright image that matches the npm-installed version
# exactly — browsers are pre-installed in the base image, so `npm ci` here
# only installs the Node dependencies. Version must stay in sync with
# @playwright/test in package.json; update both together.
FROM mcr.microsoft.com/playwright:v1.61.1-noble

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

# Default entrypoint runs the full regression suite. Override at `docker run`
# or in docker-compose to run a specific subset, e.g.:
#   docker compose run --rm tests npm run test:smoke
CMD ["npm", "test"]
