/**
 * Downstream dependency — carrier rate-lookup service.
 *
 * Simulates an external, third-party API that the main mock API calls over
 * HTTP to resolve a carrier's discrepancy tolerance. Runs as its own
 * process/server so calls to it are genuine network round-trips over
 * loopback TCP, not in-process function calls.
 *
 * Chaos mode (off by default) makes it behave like a flaky real-world
 * dependency — occasional errors and occasional slow responses — so the
 * perf suite and the client's fallback/timeout logic have something real
 * to contend with. Toggle it at runtime (no restart needed):
 *   curl -X POST http://localhost:4001/__chaos/enable
 *   curl -X POST http://localhost:4001/__chaos/disable
 * Off by default so the functional (Playwright) suite stays deterministic.
 */
const express = require('express');
const app = express();

const DEFAULT_TOLERANCE = process.env.DISCREPANCY_TOLERANCE
  ? Number(process.env.DISCREPANCY_TOLERANCE)
  : 0.05;

const CARRIER_TOLERANCES = {
  'Pacific Rim Shipping': 0.10,
};

const BASE_LATENCY_MIN_MS = 20;
const BASE_LATENCY_MAX_MS = 70;
const CHAOS_ERROR_RATE = 0.03; // 3% of requests return a 500
const CHAOS_SLOW_RATE = 0.02; // 2% of requests hang long enough to trip a client timeout
const CHAOS_SLOW_DELAY_MS = 400;

let chaosEnabled = false;

function randomBaseLatency() {
  return BASE_LATENCY_MIN_MS + Math.random() * (BASE_LATENCY_MAX_MS - BASE_LATENCY_MIN_MS);
}

app.get('/carrier-tolerance/:carrier', (req, res) => {
  const carrier = decodeURIComponent(req.params.carrier);
  const tolerance = CARRIER_TOLERANCES[carrier] ?? DEFAULT_TOLERANCE;

  if (chaosEnabled) {
    const roll = Math.random();
    if (roll < CHAOS_ERROR_RATE) {
      return setTimeout(
        () => res.status(500).json({ error: 'Upstream rate provider error' }),
        randomBaseLatency()
      );
    }
    if (roll < CHAOS_ERROR_RATE + CHAOS_SLOW_RATE) {
      return setTimeout(() => res.json({ carrier, tolerance }), CHAOS_SLOW_DELAY_MS);
    }
  }

  setTimeout(() => res.json({ carrier, tolerance }), randomBaseLatency());
});

// Test/demo-only controls for toggling chaos behavior at runtime.
app.post('/__chaos/enable', (req, res) => {
  chaosEnabled = true;
  res.json({ chaosEnabled });
});

app.post('/__chaos/disable', (req, res) => {
  chaosEnabled = false;
  res.json({ chaosEnabled });
});

const PORT = process.env.RATE_SERVICE_PORT || 4001;
app.listen(PORT, () => console.log(`Carrier rate-lookup downstream service listening on port ${PORT}`));
