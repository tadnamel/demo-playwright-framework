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
mock-api/         # Small original Express backend with in-memory data + discrepancy logic
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
npm run dev            # run the app + API manually in the browser at localhost:5173
npm run report         # open the last HTML report
```

## Background

In my day-to-day work I build and maintain automation frameworks for a
freight-cost-audit product, covering test strategy, UI + API regression
suites, nightly smoke tests in CI, and increasingly, AI-assisted test
authoring and maintenance (Claude Code, Playwright MCP). This repo is a
compact, shareable illustration of that same architecture and testing
approach, built around an original sample app so it can be published
publicly without exposing any proprietary code.
