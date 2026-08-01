# CargoAudit Lite — Freight Cost Audit Demo

A small, self-contained web app + test automation framework simulating a
**freight cost audit** workflow: shipments carry a quoted cost and an
invoiced cost, and the system flags a discrepancy whenever invoiced cost
exceeds quote beyond a set tolerance. Users can review flagged shipments
and approve or reject them.

This is an **original demo project** — the app, mock API, and all test
code were written from scratch for this repo. It is not derived from,
and contains no code or data from, any employer or client system. It
exists to demonstrate, in a domain similar to freight-audit / logistics
tooling, the same testing patterns and architecture I use professionally.

## What this demonstrates

- **End-to-end business logic testing**: discrepancy-flagging rules, approve/reject
  workflows, and state transitions — not just generic CRUD
- **Configurable business rules**: the discrepancy tolerance is driven by an
  env var with a sane default, plus a per-carrier override resolved via a
  simulated downstream rate-lookup service — not a magic hardcoded constant
- **Simulated DB + downstream dependency**: shipment/audit data goes through
  an async in-memory "DB" layer, and carrier tolerance is resolved over real
  HTTP from a separate downstream service — with caching, a client timeout,
  request coalescing, and a safe fallback if that dependency is slow or down
- **Role-based authorization**: a lightweight mock-auth layer (via an
  `x-user-role` header) requires a `manager` role to action any shipment
  that's flagged with a discrepancy; an `agent` can freely action clean ones
- **Audit logging**: every approve/reject is recorded with who, what, and
  when, exposed via a `GET /audit-log` endpoint
- **Edge case coverage**: zero-cost shipments, negative costs (rejected
  outright), credits/refunds (never flagged), very large discrepancies, and
  concurrent/double status-change attempts (guarded with a 409 response)
- **Page Object Model** for the UI layer (`src/pages`)
- **Custom Playwright fixtures**, including automatic backend state reset
  between tests for isolation (`src/fixtures`)
- **API-level testing** of the same business rules, independent of the UI
  (`test-suites/api`)
- **Regression vs. smoke separation** using Playwright tags (`@smoke`), with
  CI running the full suite on push/PR and a smoke subset on a nightly schedule
- **Self-hosting test target**: Playwright's `webServer` config boots both the
  mock API and the static app automatically, so the whole suite runs with
  a single `npm test`, no manual environment setup
- **TypeScript** throughout, with path aliases for clean imports

## Structure

```
mock-app/         # Small original front-end (HTML/CSS/JS) — the system under test
mock-api/
  server.js       # Express API — shipment CRUD, discrepancy logic, RBAC, audit log
  lib/db.js       # Simulated async DB layer (in-memory, with realistic query latency)
  lib/rateLookupClient.js  # Client for the downstream rate-lookup service (cache, timeout, fallback)
  downstream/rate-service.js  # Standalone "third-party" service resolving carrier tolerance over HTTP
src/
  pages/          # Page objects
  fixtures/       # Custom Playwright fixtures (incl. API-based state reset)
test-suites/
  e2e/            # UI workflow tests (list, add shipment, flag, approve/reject)
  api/            # HTTP-level tests for the same business rules
.github/workflows/
  playwright.yml  # CI: full regression on push/PR, smoke subset nightly
```

## Getting started

```bash
npm install
npx playwright install --with-deps
npm test              # full regression suite (UI + API), auto-starts mock servers
npm run test:smoke    # smoke subset only
npm run test:api      # API suite only
npm run dev            # run rate-service + API + app manually in the browser at localhost:5173
npm run report         # open the last HTML report
```

## Configuration

```bash
cp .env.example .env
```

- `DISCREPANCY_TOLERANCE` — global default tolerance (decimal, e.g. `0.05` = 5%).
  Falls back to `0.05` if unset. Used by both the API (as its fallback if the
  downstream rate-lookup call fails) and the downstream service itself.
- Per-carrier overrides live in `CARRIER_TOLERANCES` in
  `mock-api/downstream/rate-service.js` (e.g. a carrier with historically
  noisier invoicing can be given a wider band). The API resolves these over
  HTTP rather than reading the map directly — see "Performance Testing" below.
- `API_PORT` — port the mock API listens on (default `4000`).
- `RATE_SERVICE_PORT` — port the downstream rate-lookup service listens on (default `4001`).
- `RATE_SERVICE_URL` — base URL the API uses to call the downstream service (default `http://localhost:4001`).

## Roles

The UI includes an "Acting as" selector (Agent / Manager), which is sent to
the API as an `x-user-role` header. A shipment flagged with a discrepancy
can only be approved or rejected by a `manager`; an `agent` can freely
action non-flagged shipments. This is a mock authorization layer for
demonstration purposes only — there's no real login/session system.

## Performance Testing

A small [k6](https://k6.io/) suite lives in `perf/`, exercising the mock API's
read and write paths under load — separate from the Playwright functional
suite above.

**Architecture note:** the API isn't a single self-contained function call.
Each discrepancy check resolves the carrier's tolerance through a simulated
async DB read (`mock-api/lib/db.js`) and a real HTTP call to a separate
downstream service (`mock-api/downstream/rate-service.js`) that models a
flaky third-party dependency — with a short cache, a client-side timeout,
request coalescing (so concurrent cache-misses for the same carrier don't
fire duplicate downstream calls), and a safe local fallback if that
dependency errors or hangs. This gives the perf suite genuine latency and a
genuine failure mode to exercise, instead of everything resolving in the
same event-loop tick.

k6 is a Go binary, not an npm package, so it's installed separately rather
than via `npm install`:

```bash
# macOS
brew install k6

# Windows
choco install k6

# or download directly from https://k6.io/docs/get-started/installation/
```

With the rate-lookup service and mock API running (`npm run dev`, or
`npm run start:rate-service` + `npm run start:api`):

```bash
npm run test:perf:smoke   # perf/smoke-test.js — quick health check, ~15s
npm run test:perf:load    # perf/load-test.js  — ramping load test, ~80s
```

| Test | Purpose | Thresholds |
|---|---|---|
| `smoke-test.js` | Fast check that the API is up and responsive | p95 < 200ms, error rate < 1% |
| `load-test.js` | Ramps to 30 concurrent VUs, exercises GET + POST including discrepancy logic under load | p95 < 500ms, p99 < 1000ms, error rate < 2% |

Both scripts read the API's base URL from the `API_BASE_URL` env var,
defaulting to `http://localhost:4000` (see `perf/config.js`).

**Chaos mode** (off by default, so the Playwright suite stays deterministic):
toggle the downstream service into a flaky state at runtime to see the
fallback/timeout logic hold up under real errors and slow responses:

```bash
curl -X POST http://localhost:4001/__chaos/enable
npm run test:perf:load
curl -X POST http://localhost:4001/__chaos/disable
```

## Background

In my day-to-day work I build and maintain automation frameworks for a
freight-cost-audit product, covering test strategy, UI + API regression
suites, nightly smoke tests in CI, and increasingly, AI-assisted test
authoring and maintenance (Claude Code, Playwright MCP). This repo is a
compact, shareable illustration of that same architecture and testing
approach, built around an original sample app so it can be published
publicly without exposing any proprietary code.
