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
- **Allure reporting with step-level screenshots**: every UI action goes
  through a `step()` helper (`src/utils/allureStep.ts`) that reports it as a
  named Allure step with a screenshot attached — automatic for every test,
  with no changes needed in the test files themselves
- **API-level testing** of the same business rules, independent of the UI
  (`test-suites/api`)
- **Regression vs. smoke separation** using Playwright tags (`@smoke`), with
  CI running the full suite on push/PR and a smoke subset on a nightly schedule
- **Self-hosting test target**: Playwright's `webServer` config boots both the
  mock API and the static app automatically, so the whole suite runs with
  a single `npm test`, no manual environment setup
- **One-command Docker run**: clone the repo, run `docker compose up --build`,
  open `playwright-report/index.html` — no Node, no browser installs needed
- **Accessibility testing**: axe-core scans (`@axe-core/playwright`) of key UI
  states — default load, role switched, a new flagged row present, an inline
  RBAC error visible — via a `checkA11y()` helper that reports into the same
  Allure report as the functional suite
- **Security testing**: static analysis (CodeQL + Semgrep) gating push/PR,
  plus a scheduled OWASP ZAP API scan exercising the live RBAC/403/409 logic
  in `mock-api/server.js` — see "Security Testing" below
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
  utils/allureStep.ts  # Wraps page actions in named Allure steps + screenshots
test-suites/
  e2e/            # UI workflow tests (list, add shipment, flag, approve/reject)
    a11y/         # axe-core accessibility scans of key UI states (@a11y)
  api/            # HTTP-level tests for the same business rules
security/
  openapi.yaml    # API definition used as the ZAP DAST scan target
.github/workflows/
  playwright.yml  # CI: full regression on push/PR, smoke subset nightly
  security.yml    # CI: CodeQL + Semgrep static analysis, push/PR + weekly
  dast.yml        # CI: OWASP ZAP API scan against mock-api, manual + weekly (not gating)
Dockerfile        # Single-image build — Playwright + browsers + all dependencies
docker-compose.yml  # Mounts playwright-report/ back to host; one-command run
```

## Quick start (Docker)

The only prerequisite is [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
git clone https://github.com/tadnamel/demo-playwright-framework.git
cd demo-playwright-framework
docker compose up --build
```

The first build pulls the Playwright base image and installs dependencies (~2 min
on a typical connection). Subsequent runs skip those layers and start in seconds.

When the container exits, open `playwright-report/index.html` in your browser
to see the full test report with traces and screenshots on any failure.

To run a specific subset:

```bash
docker compose run --rm tests npm run test:smoke
docker compose run --rm tests npm run test:api
docker compose run --rm tests npm run test:a11y
```

## Getting started (without Docker)

```bash
npm install
npx playwright install --with-deps chromium
npm test              # full regression suite (UI + API), auto-starts mock servers
npm run test:smoke    # smoke subset only
npm run test:api      # API suite only
npm run test:a11y     # accessibility suite only (axe-core)
npm run dev           # run rate-service + API + app manually in the browser at localhost:5173
npm run report        # open the last Playwright HTML report
npm run report:allure # generate + open the Allure report (see "Test Reporting" below)
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

## Test Reporting (Allure)

Alongside Playwright's built-in HTML reporter, the suite also produces an
[Allure](https://allurereport.org/) report with step-level detail and a
screenshot after every UI action.

**How it works:** rather than annotating individual test files, every method
on `ShipmentPage` (`src/pages/ShipmentPage.ts`) is wrapped in a small
`step()` helper (`src/utils/allureStep.ts`) that reports the action as a
named Allure step and attaches a screenshot taken right after it runs. So a
test that just calls `shipmentPage.addShipment(...)` automatically produces
a report entry like "Add shipment SHP-2001" with a screenshot — no
Allure-specific code in the test files themselves.

**Setup:** `allure-commandline` wraps the Java-based Allure CLI, so it needs
a Java runtime (JRE or JDK) installed separately — any recent LTS (17 or 21)
is fine. Check with `java -version`; if it's missing, install a JDK (e.g.
[Eclipse Temurin](https://adoptium.net/)) first.

```bash
npm test                # generates allure-results/ alongside the usual reports
npm run report:allure    # generate the static HTML report and open it
```

Or run the two steps separately:

```bash
npm run report:allure:generate   # allure-results/ -> allure-report/
npm run report:allure:open       # opens allure-report/ in the browser
```

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

## Accessibility Testing

Accessibility scans live in `test-suites/e2e/a11y/`, using
[axe-core](https://github.com/dequelabs/axe-core) via
`@axe-core/playwright`, wrapped in a `checkA11y()` helper
(`src/utils/axeCheck.ts`) that mirrors the existing `step()` pattern: each
scan reports as a named Allure step and attaches the full axe JSON results,
so a clean run is still visible in the report, not just failures.

Rather than scanning only the initial page load, each test scans a
distinct UI state — default load, manager role active, a newly-added
flagged row, an inline RBAC error message — since dynamically-injected
content (error banners, new rows) is exactly what a single static scan
would miss.

```bash
npm run test:a11y
```

By default, `serious`/`critical` axe violations fail the test;
`moderate`/`minor` findings are attached and visible in the report without
failing the run. This suite runs as part of the regular `e2e` project (and
therefore `npm test`/CI), tagged `@a11y` so it can also be run or excluded
independently.

## Security Testing

Two layers, kept separate because they have very different cost/signal
profiles:

**Static analysis** (`.github/workflows/security.yml`, gates push/PR +
weekly) — no servers involved, just source:

- **CodeQL** — GitHub's native SAST, zero setup, free for public repos.
- **Semgrep** (`p/owasp-top-ten`, `p/javascript`, `p/expressjs` rulesets)
  via `semgrep ci`, run with no Semgrep account/token needed.

Chosen over a self-hosted SonarQube specifically to avoid standing up and
maintaining a server (+ DB) for a demo repo — CodeQL and Semgrep give
comparable SAST coverage for a public GitHub project with no infra to run.

Semgrep's `p/owasp-top-ten` ruleset also flagged the workflow files
themselves — every `uses: action@v4`-style tag reference is a mutable ref
that could be silently repointed by the action owner (a real supply-chain
attack class, e.g. the `tj-actions/changed-files` compromise). All actions
across all four workflows are now pinned to full commit SHAs with a
trailing `# vX` comment for readability, and `.github/dependabot.yml`
keeps them current — Dependabot understands SHA-pinned action refs and
opens a PR to bump both the SHA and the version comment on new releases,
so pinning doesn't mean silently going stale.

**Dynamic scan** (`.github/workflows/dast.yml`, manual + weekly, **not**
gating merges — same trigger shape as `performance.yml`) — an
[OWASP ZAP](https://www.zaproxy.org/) API scan against the *running*
mock-api, using `security/openapi.yaml` as the scan target. This actually
calls the endpoints (verb tampering, parameter fuzzing, missing/garbage
`x-user-role` values) against the live discrepancy/RBAC/409 logic in
`mock-api/server.js`, rather than just reading the source. `fail_action` is
off for now — findings show up in the uploaded report/artifact without
failing the run, until the ruleset's been tuned against this specific app.

```bash
# to run the same scan locally, with rate-service + mock-api already up:
docker run -v $(pwd):/zap/wrk/:rw -t zaproxy/zap-stable \
  zap-api-scan.py -t /zap/wrk/security/openapi.yaml -f openapi
```

## Background

In my day-to-day work I build and maintain automation frameworks for a
freight-cost-audit product, covering test strategy, UI + API regression
suites, nightly smoke tests in CI, and increasingly, AI-assisted test
authoring and maintenance (Claude Code, Playwright MCP). This repo is a
compact, shareable illustration of that same architecture and testing
approach, built around an original sample app so it can be published
publicly without exposing any proprietary code.
