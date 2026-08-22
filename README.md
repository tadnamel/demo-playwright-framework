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

## Table of contents

- [Quick start (Docker)](#quick-start-docker)
- [What this demonstrates](#what-this-demonstrates)
- [Project structure](#project-structure)
- [Is it safe to run `docker compose up --build`?](#docker-safety)
- [Troubleshooting](#troubleshooting)
- [Running without Docker](#without-docker)
- [Configuration](#configuration)
- [Roles](#roles)
- [Test Reporting (Allure)](#test-reporting-allure)
- [Performance Testing](#performance-testing)
- [Accessibility Testing](#accessibility-testing)
- [Manual Test Cases (Qase)](#qase-test-cases)
- [Security Testing](#security-testing)
- [Background](#background)

<a name="quick-start-docker"></a>
## Quick start (Docker)

The only prerequisite is [Docker Desktop](https://www.docker.com/products/docker-desktop/).

> Trouble getting Docker running? See [Troubleshooting](#troubleshooting) below.

```bash
git clone https://github.com/tadnamel/demo-playwright-framework.git
cd demo-playwright-framework
docker compose up --build
```

First build downloads the Playwright base image and installs dependencies
(~2–4 min). Subsequent runs reuse cached layers and start in seconds.

**What happens:** previous results are cleaned → Allure history is restored
→ the full suite runs (UI + API + a11y) → an Allure report is generated and
served at **http://localhost:4242** → history is saved back for the next
run's trend graph. Press `Ctrl+C` to stop the report server when done.

**Running a specific subset:**

```bash
docker compose run --rm tests npm run test:smoke
docker compose run --rm tests npm run test:api
docker compose run --rm tests npm run test:a11y
```

<a name="what-this-demonstrates"></a>
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
- **Allure reporting with step-level screenshots**, generated automatically
  with no changes needed in the test files — see [Test Reporting](#test-reporting-allure)
- **API-level testing** of the same business rules, independent of the UI
  (`test-suites/api`)
- **Regression vs. smoke separation** using Playwright tags (`@smoke`), with
  CI running the full suite on push/PR and a smoke subset on a nightly schedule
- **Self-hosting test target**: Playwright's `webServer` config boots both the
  mock API and the static app automatically, so the whole suite runs with
  a single `npm test`, no manual environment setup
- **One-command Docker run**: clone the repo, run `docker compose up --build`,
  open the Allure report at `http://localhost:4242` — no Node, no browser installs needed
- **Accessibility testing**: axe-core scans of key UI states, reporting into
  the same Allure report — see [Accessibility Testing](#accessibility-testing)
- **Security testing**: static analysis (CodeQL + Semgrep) gating push/PR,
  plus a scheduled OWASP ZAP API scan — see [Security Testing](#security-testing)
- **Manual/automation traceability**: every automated case has a matching
  manual test case in Qase, so manual testers can execute the same coverage
  by hand, and automated runs report results directly against those cases
  — see [Manual Test Cases (Qase)](#qase-test-cases)
- **TypeScript** throughout, with path aliases for clean imports

<a name="project-structure"></a>
## Project structure

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
  utils/axeCheck.ts    # axe-core helper — named Allure step + JSON attachment per scan
test-suites/
  e2e/            # UI workflow tests (list, add shipment, flag, approve/reject)
    a11y/         # axe-core accessibility scans of key UI states (@a11y)
  api/            # HTTP-level tests for the same business rules
security/
  openapi.yaml    # API definition used as the ZAP DAST scan target
scripts/
  docker-entrypoint.sh  # Container startup: clean → restore history → test → report → serve
  qase-setup.mjs  # One-time: creates the Qase project/suites/manual cases mirroring test-suites/
.github/workflows/
  playwright.yml  # CI: full regression on push/PR, smoke subset nightly
  security.yml    # CI: CodeQL + Semgrep static analysis, push/PR + weekly
  dast.yml        # CI: OWASP ZAP API scan against mock-api, manual + weekly (not gating)
Dockerfile        # Playwright + Java (for Allure) + all Node dependencies
docker-compose.yml  # Ports, volumes (results, report, history), one-command run
```

<a name="docker-safety"></a>
## 🔒 Is it safe to run `docker compose up --build`?

Commands shared on the internet deserve scrutiny — a malicious `docker run`
can compromise a host as effectively as a malicious script. Quick facts
about this repo's setup, so you can verify rather than trust:

- **Base image**: `mcr.microsoft.com/playwright:v1.61.1-noble`, published by
  Microsoft to their own registry, pinned to a specific version (no `latest`).
  Runs as the non-root `pwuser` shipped by the base image.
- **No dangerous flags**: no `--privileged`, no Docker socket mount, no
  `--net=host` / `--pid=host`, no capability grants.
- **Ports**: only `4242` (the Allure report server) is exposed to your host.
- **Volumes**: four relative paths inside the cloned repo only —
  `allure-results`, `allure-report`, `allure-history`, `test-results`. The
  container can't write anywhere outside these.

To verify yourself: read `Dockerfile` (< 25 lines) and `docker-compose.yml`
(< 30 lines) in the repo root, or run `docker compose config` to see the
fully resolved configuration with no side effects.

<a name="troubleshooting"></a>
## 🛠️ Troubleshooting

| Symptom | Fix |
|---|---|
| `Is the Docker daemon running?` | Open Docker Desktop and wait for the whale icon to stop animating, then retry. |
| Installer says Hyper-V is unavailable (Windows Home) | Windows Home uses the WSL 2 backend instead — see next row. |
| "WSL 2 installation is incomplete" | Run `wsl --install` in an admin PowerShell, restart, then confirm **Settings → General → Use the WSL 2 based engine** is checked in Docker Desktop. |
| WSL 2 asks to enable Virtual Machine Platform / virtualization error | Check **Task Manager → Performance → CPU** for "Virtualization: Enabled". If disabled, enable **VT-x/AMD-V/SVM** in BIOS/UEFI. |
| `bind: address already in use` on port 4242 | Free the port (`netstat -ano \| findstr :4242` then `taskkill /PID <pid> /F`), or change the host port in `docker-compose.yml` (`"4243:4242"`) and use `http://localhost:4243`. |
| `'docker-compose' is not recognized` | Docker Desktop v4+ uses `docker compose` (subcommand, with a space) — use that form. |
| Build seems to hang on first run | First pull is ~1.8 GB and takes 2–5 min; Docker resumes interrupted pulls, so just retry if it looks stuck. |

<a name="without-docker"></a>
## 💻 Running without Docker

```bash
npm install
npx playwright install --with-deps chromium
npm test              # full regression suite (UI + API + a11y), auto-starts mock servers
npm run test:smoke    # smoke subset only
npm run test:api      # API suite only
npm run test:a11y     # accessibility suite only (axe-core)
npm run dev           # run rate-service + API + app manually in the browser at localhost:5173
npm run report        # open the last Playwright HTML report
npm run report:allure # generate + open the Allure report (see "Test Reporting" below)
```

<a name="configuration"></a>
## Configuration

```bash
cp .env.example .env
```

- `DISCREPANCY_TOLERANCE` — global default tolerance (decimal, e.g. `0.05` = 5%).
  Falls back to `0.05` if unset.
- Per-carrier overrides live in `CARRIER_TOLERANCES` in
  `mock-api/downstream/rate-service.js`. The API resolves these over HTTP
  rather than reading the map directly — see [Performance Testing](#performance-testing).
- `API_PORT` — port the mock API listens on (default `4000`).
- `RATE_SERVICE_PORT` — port the downstream rate-lookup service listens on (default `4001`).
- `RATE_SERVICE_URL` — base URL the API uses to call the downstream service (default `http://localhost:4001`).

<a name="roles"></a>
## Roles

The UI includes an "Acting as" selector (Agent / Manager), which is sent to
the API as an `x-user-role` header. A shipment flagged with a discrepancy
can only be approved or rejected by a `manager`; an `agent` can freely
action non-flagged shipments. This is a mock authorization layer for
demonstration purposes only — there's no real login/session system.

<a name="test-reporting-allure"></a>
## 📊 Test Reporting (Allure)

Alongside Playwright's built-in HTML reporter, the suite produces an
[Allure](https://allurereport.org/) report with step-level detail and a
screenshot after every UI action.

**How it works:** every method on `ShipmentPage` is wrapped in a `step()`
helper (`src/utils/allureStep.ts`) that reports the action as a named Allure
step and attaches a screenshot — no Allure-specific code in the test files
themselves. The Docker run generates and serves this report automatically.

**Trend graphs:** the Docker setup persists Allure's `history/` directory in
`allure-history/` between container runs, restoring it before each new report
so the Trend, Retry Trend, and Duration Trend charts build up automatically.
`allure-history/` is git-ignored but survives `docker compose down`.

**Running Allure locally** (outside Docker) requires a Java runtime (JRE 17+).
Check with `java -version`; if missing, install
[Eclipse Temurin](https://adoptium.net/) first.

```bash
npm test                       # generates allure-results/
npm run report:allure          # generate allure-report/ and open in browser
```

<a name="performance-testing"></a>
## ⚡ Performance Testing

A small [k6](https://k6.io/) suite lives in `perf/`, exercising the mock API's
read and write paths under load — separate from the Playwright functional suite.

k6 is a Go binary installed separately:

```bash
brew install k6        # macOS
choco install k6       # Windows
# or: https://k6.io/docs/get-started/installation/
```

With the services running (`npm run dev`):

```bash
npm run test:perf:smoke   # ~15s, p95 < 200ms
npm run test:perf:load    # ~80s, ramps to 30 VUs, p95 < 500ms / p99 < 1000ms
```

**Chaos mode** (off by default):

```bash
curl -X POST http://localhost:4001/__chaos/enable
npm run test:perf:load
curl -X POST http://localhost:4001/__chaos/disable
```

<a name="accessibility-testing"></a>
## ♿ Accessibility Testing

Scans in `test-suites/e2e/a11y/` use axe-core via `@axe-core/playwright`,
wrapped in `checkA11y()` (`src/utils/axeCheck.ts`). Each test scans a
distinct UI state — not just the initial load — since dynamically-injected
content (error banners, new rows) is what a single static scan misses.

`serious`/`critical` violations fail the test; `moderate`/`minor` are
attached as JSON in the Allure report without failing the run.

```bash
npm run test:a11y
# or via Docker:
docker compose run --rm tests npm run test:a11y
```

<a name="qase-test-cases"></a>
## 📋 Manual Test Cases (Qase)

Every automated test in `test-suites/` has a matching manual test case in
[Qase](https://qase.io/), organized into the same suite structure (API →
Shipments CRUD / Edge cases / Role-based authorization / Audit log; E2E →
Freight audit workflow / Role-based authorization (UI); Accessibility).
This lets a manual tester execute the same coverage by hand without reading
TypeScript.

**This is self-serve** — `qase:setup` creates a brand-new Qase project under
*your own* token/account, unrelated to any project of mine, and no token is
stored in this repo.

```bash
cp .env.example .env
# edit .env, set QASE_TESTOPS_API_TOKEN=<your token> (git-ignored, read via dotenv)

npm run qase:setup   # creates project/suites/manual cases, writes qase-case-map.json
npm run test:qase    # runs the suite and reports results into Qase against those cases
```

`npm test` alone never touches Qase — reporting only activates via `test:qase`.

Prefer not to use a `.env` file? Pass the token inline:
```powershell
$env:QASE_TESTOPS_API_TOKEN = '<your token>'; npm run qase:setup   # PowerShell
```
```bash
QASE_TESTOPS_API_TOKEN=<your token> npm run qase:setup             # bash/macOS/Linux
```

<a name="security-testing"></a>
## 🛡️ Security Testing

**Static analysis** (`.github/workflows/security.yml`, gates push/PR + weekly):

- **CodeQL** — GitHub's native SAST, zero setup, free for public repos.
- **Semgrep** (`p/owasp-top-ten`, `p/javascript`, `p/expressjs`) — no account needed.

All actions across all four workflows are pinned to full commit SHAs (a Semgrep
finding flagged mutable `@v4` tags as a supply-chain risk). `.github/dependabot.yml`
auto-opens PRs to bump SHAs when new versions ship.

**Dynamic scan** (`.github/workflows/dast.yml`, manual + weekly, not gating):
OWASP ZAP API scan against the running mock-api using `security/openapi.yaml`.

<a name="background"></a>
## Background

In my day-to-day work I build and maintain automation frameworks for a
freight-cost-audit product, covering test strategy, UI + API regression
suites, nightly smoke tests in CI, and increasingly, AI-assisted test
authoring and maintenance. This repo is a compact, shareable illustration
of that same architecture and testing approach, built around an original
sample app so it can be published publicly without exposing any proprietary code.
