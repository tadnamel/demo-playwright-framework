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
- **Allure trend graphs**: the Docker setup persists Allure history across
  runs via a local `allure-history/` volume — the trend and retry charts
  grow with each `docker compose up` without any manual steps
- **API-level testing** of the same business rules, independent of the UI
  (`test-suites/api`)
- **Regression vs. smoke separation** using Playwright tags (`@smoke`), with
  CI running the full suite on push/PR and a smoke subset on a nightly schedule
- **Self-hosting test target**: Playwright's `webServer` config boots both the
  mock API and the static app automatically, so the whole suite runs with
  a single `npm test`, no manual environment setup
- **One-command Docker run**: clone the repo, run `docker compose up --build`,
  open the Allure report at `http://localhost:4242` — no Node, no browser installs needed
- **Accessibility testing**: axe-core scans (`@axe-core/playwright`) of key UI
  states — default load, role switched, a new flagged row present, an inline
  RBAC error visible — via a `checkA11y()` helper that reports into the same
  Allure report as the functional suite
- **Security testing**: static analysis (CodeQL + Semgrep) gating push/PR,
  plus a scheduled OWASP ZAP API scan exercising the live RBAC/403/409 logic
  in `mock-api/server.js` — see [Security Testing](#security-testing) below
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
  utils/axeCheck.ts    # axe-core helper — named Allure step + JSON attachment per scan
test-suites/
  e2e/            # UI workflow tests (list, add shipment, flag, approve/reject)
    a11y/         # axe-core accessibility scans of key UI states (@a11y)
  api/            # HTTP-level tests for the same business rules
security/
  openapi.yaml    # API definition used as the ZAP DAST scan target
scripts/
  docker-entrypoint.sh  # Container startup: clean → restore history → test → report → serve
.github/workflows/
  playwright.yml  # CI: full regression on push/PR, smoke subset nightly
  security.yml    # CI: CodeQL + Semgrep static analysis, push/PR + weekly
  dast.yml        # CI: OWASP ZAP API scan against mock-api, manual + weekly (not gating)
Dockerfile        # Playwright + Java (for Allure) + all Node dependencies
docker-compose.yml  # Ports, volumes (results, report, history), one-command run
```

---

## Quick start (Docker)

The only prerequisite is [Docker Desktop](https://www.docker.com/products/docker-desktop/).

> ⚠️ **Having trouble getting Docker running?** See [Troubleshooting](#troubleshooting) below — common issues on Windows (no Hyper-V, WSL 2 not installed, virtualization off) are covered with step-by-step fixes.

```bash
git clone https://github.com/tadnamel/demo-playwright-framework.git
cd demo-playwright-framework
docker compose up --build
```

The first build downloads the Playwright base image and installs
dependencies (~2–4 min depending on connection speed). Subsequent runs
reuse the cached image layers and start in seconds.

**What happens when you run it:**

1. Previous test results are cleaned so only the current run appears in the report
2. Allure history from prior runs is restored so the **trend graph** extends automatically
3. The full Playwright suite runs (UI + API + a11y)
4. An Allure report is generated and served at **http://localhost:4242**
5. The history is saved back to `allure-history/` so the next run adds to the trend

When the run completes, open **http://localhost:4242** in your browser.
The report includes step-level detail, screenshots on every UI action, and
— after the second run — a trend graph showing pass/fail history over time.

Press `Ctrl+C` to stop the report server when you're done.

**Running a specific subset:**

```bash
# These override the default CMD and skip the report server — just runs tests
docker compose run --rm tests npm run test:smoke
docker compose run --rm tests npm run test:api
docker compose run --rm tests npm run test:a11y
```

---

## Is it safe to run `docker compose up --build`?

Docker is a powerful tool, and commands shared on the internet deserve
scrutiny — a malicious `docker run` can compromise a host as effectively
as running a malicious script directly. This section documents exactly
what our Docker setup does and doesn't do, so you can verify it yourself
rather than taking it on trust.

### Patterns that make a Docker command dangerous

| Pattern | What it enables |
|---|---|
| `--privileged` | Near-full host kernel access; container can load kernel modules, access all devices |
| `-v /:/host` or `-v ~/.ssh:/root/.ssh` | Mounts host filesystem into container — attacker reads your SSH keys, credentials, or overwrites system files |
| `-v /var/run/docker.sock:/var/run/docker.sock` | Mounts the Docker daemon socket — container can spawn new containers with any privileges, effectively root on the host |
| `--net=host` | Container shares the host's network stack — can bind to any port, intercept host traffic |
| `--pid=host` | Container sees and can signal every process on the host |
| `--cap-add=ALL` or `--cap-add=SYS_ADMIN` | Grants elevated Linux capabilities — used in legitimate tools, but also a common privilege-escalation vector |
| Pulling from an unverified image | `docker run randomuser/sometool` — you have no guarantee of what's in it |

### Why this repo's setup is safe

**`Dockerfile`** — base image is `mcr.microsoft.com/playwright:v1.61.1-noble`,
published by Microsoft to their own registry (not Docker Hub). The full
image tag is pinned to a specific version — no floating `latest`. Beyond
adding Java (for Allure report generation), `npm ci`, and copying source
files, it does nothing else. Read the whole file in under 25 lines.

**`docker-compose.yml`** — every field is documented inline. The options used are:

- **`ipc: host`** — shares the host's IPC (inter-process communication)
  namespace with the container. This is specifically required by Chromium,
  which uses shared memory (`/dev/shm`) for communication between its
  browser and renderer processes; without it, Chromium crashes or runs
  out of memory in a container. This flag does **not** expose the
  filesystem, network stack, or host processes. It is called out in the
  [official Playwright Docker docs](https://playwright.dev/docs/docker).
- **`init: true`** — adds `tini` as PID 1 inside the container so that
  Node child processes (rate-service, mock-api, http-server) are reaped
  cleanly when the container exits. No change to privileges.
- **`ports: "4242:4242"`** — forwards only port 4242 (the Allure report
  server). No other ports are exposed to your host.
- **`volumes`** — four entries, all relative paths inside the cloned repo:
  ```
  ./allure-results:/app/allure-results
  ./allure-report:/app/allure-report
  ./allure-history:/app/allure-history
  ./test-results:/app/test-results
  ```
  These mount output directories so the report and history are readable
  on your host. The container can only write to these four subdirectories
  of the folder you just cloned — it cannot reach anything outside it.

**What is absent:** no `--privileged`, no Docker socket mount, no
`--net=host`, no `--pid=host`, no capability grants, no mounts of
sensitive host paths. You can confirm this by reading `docker-compose.yml`
in the repo root — it is 30 lines long.

### How to verify any Docker command before running it

1. Read the `Dockerfile` — every `RUN`, `COPY`, and `CMD` line is auditable.
2. Check every `-v` / `volumes` entry. Any path starting with `/` and pointing
   outside the project directory warrants scrutiny. `/var/run/docker.sock` is
   an immediate red flag.
3. Check for `--privileged`, `--net=host`, `--pid=host`, and `--cap-add` flags.
4. Verify the base image registry. `mcr.microsoft.com`, `gcr.io`, and
   `registry.k8s.io` are vendor-controlled. An image on Docker Hub from an
   unknown username is not.
5. If in doubt, run `docker compose config` first — it prints the fully
   resolved configuration with no side effects.

---

## Troubleshooting

Common issues when running `docker compose up --build` for the first time,
particularly on Windows.

### Docker Desktop isn't running

**Symptom:** `error during connect: ... Is the Docker daemon running?`

Docker Desktop must be running before any `docker` command works.

- Open **Docker Desktop** from the Start menu.
- Wait for the whale icon in the taskbar to stop animating — it takes
  10–30 seconds to start.
- Run `docker compose up --build` again.

### Windows Home — Hyper-V not available

**Symptom:** Docker Desktop installer says Hyper-V is unavailable, or the
app shows an error about Windows features.

Windows Home does not include Hyper-V. Docker Desktop on Windows Home uses
the **WSL 2 backend** instead — follow the WSL 2 setup steps below.

### WSL 2 not installed

**Symptom:** Docker Desktop shows "WSL 2 installation is incomplete" or
similar on first launch.

1. Open **PowerShell as Administrator** (right-click → Run as administrator).
2. Run:
   ```powershell
   wsl --install
   ```
   This installs WSL 2 and the default Linux distribution (Ubuntu).
3. **Restart your PC** when prompted — WSL 2 requires a reboot.
4. After restarting, open Docker Desktop → **Settings → General** and confirm
   **"Use the WSL 2 based engine"** is checked.
5. Run `docker compose up --build` again.

> **WSL 2 kernel update:** if Docker asks you to update the WSL 2 kernel,
> download and run the installer from
> [Microsoft's WSL update page](https://learn.microsoft.com/en-us/windows/wsl/install-manual#step-4---download-the-linux-kernel-update-package),
> then restart Docker Desktop.

### Virtualization not enabled in BIOS

**Symptom:** WSL 2 installs but shows "Please enable the Virtual Machine
Platform Windows feature", or Docker shows a virtualization error.

1. Check first: open **Task Manager → Performance → CPU** — look for
   "Virtualization: Enabled". If it already says Enabled, this isn't the issue.
2. If Disabled: restart your PC and enter BIOS/UEFI (usually `Del`, `F2`,
   or `F10` during boot — check your motherboard/laptop manual).
3. Look for a setting called **Intel Virtualization Technology (VT-x)**,
   **AMD-V**, or **SVM Mode** and enable it.
4. Save and exit. Boot back into Windows and re-run the WSL 2 install step.

### Port 4242 already in use

**Symptom:** `bind: address already in use` or the report server fails to start.

Something else on your machine is using port 4242. Two options:

**Option A** — find and stop whatever is using it:
```powershell
netstat -ano | findstr :4242
# note the PID in the last column, then:
taskkill /PID <pid> /F
```

**Option B** — change the port in `docker-compose.yml`:
```yaml
ports:
  - "4243:4242"   # host:container — change 4243 to any free port
```
Then open `http://localhost:4243` instead.

### `docker-compose` command not found

**Symptom:** `'docker-compose' is not recognized as an internal or external command`

Docker Desktop v4+ ships with **Docker Compose v2**, which is invoked as
`docker compose` (a subcommand, with a space), not `docker-compose` (the
older standalone binary with a hyphen). All commands in this README use the
`docker compose` form — use that instead.

### Build is slow or hangs on first run

The first build pulls `mcr.microsoft.com/playwright:v1.61.1-noble` (~1.8 GB)
and installs npm dependencies. On a typical connection this takes 2–5 minutes.
Subsequent runs skip the cached layers and complete in seconds. If the pull
appears to hang for more than 10 minutes, check your network connection and
try `docker compose up --build` again — Docker resumes interrupted pulls.

---

## Getting started (without Docker)

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

## Roles

The UI includes an "Acting as" selector (Agent / Manager), which is sent to
the API as an `x-user-role` header. A shipment flagged with a discrepancy
can only be approved or rejected by a `manager`; an `agent` can freely
action non-flagged shipments. This is a mock authorization layer for
demonstration purposes only — there's no real login/session system.

## Test Reporting (Allure)

Alongside Playwright's built-in HTML reporter, the suite produces an
[Allure](https://allurereport.org/) report with step-level detail and a
screenshot after every UI action.

**How it works:** every method on `ShipmentPage` is wrapped in a `step()`
helper (`src/utils/allureStep.ts`) that reports the action as a named Allure
step and attaches a screenshot — no Allure-specific code in the test files
themselves. The Docker run generates and serves this report automatically.

**Trend graphs:** the Docker setup persists Allure's `history/` directory in
`allure-history/` between container runs. Each run restores it before
generating the new report, so the Trend, Retry Trend, and Duration Trend
charts build up automatically — no manual steps needed. The `allure-history/`
directory is git-ignored (run-specific data) but survives `docker compose down`.

**Running Allure locally** (outside Docker) requires a Java runtime (JRE 17+).
Check with `java -version`; if missing, install
[Eclipse Temurin](https://adoptium.net/) first.

```bash
npm test                       # generates allure-results/
npm run report:allure          # generate allure-report/ and open in browser
```

## Performance Testing

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

## Accessibility Testing

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

## Security Testing

**Static analysis** (`.github/workflows/security.yml`, gates push/PR + weekly):

- **CodeQL** — GitHub's native SAST, zero setup, free for public repos.
- **Semgrep** (`p/owasp-top-ten`, `p/javascript`, `p/expressjs`) — no account needed.

All actions across all four workflows are pinned to full commit SHAs (a Semgrep
finding flagged mutable `@v4` tags as a supply-chain risk). `.github/dependabot.yml`
auto-opens PRs to bump SHAs when new versions ship.

**Dynamic scan** (`.github/workflows/dast.yml`, manual + weekly, not gating):
OWASP ZAP API scan against the running mock-api using `security/openapi.yaml`.

## Background

In my day-to-day work I build and maintain automation frameworks for a
freight-cost-audit product, covering test strategy, UI + API regression
suites, nightly smoke tests in CI, and increasingly, AI-assisted test
authoring and maintenance. This repo is a compact, shareable illustration
of that same architecture and testing approach, built around an original
sample app so it can be published publicly without exposing any proprietary code.
