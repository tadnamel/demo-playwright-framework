import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL } from './config.js';

/**
 * Performance load test — CargoAudit Lite shipments API.
 *
 * Ramps virtual users up, holds a peak, then ramps down, exercising both
 * read (GET /shipments) and write (POST /shipments) paths, including the
 * discrepancy-flagging business logic itself under concurrent load. This
 * is heavier than the smoke test and intended for periodic or manual runs
 * rather than gating every push.
 */
export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '30s', target: 10 },
    { duration: '10s', target: 30 },
    { duration: '20s', target: 30 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.02'],
  },
};

export default function () {
  const listRes = http.get(`${BASE_URL}/shipments`);
  check(listRes, {
    'GET /shipments returns 200': (r) => r.status === 200,
  });

  const quotedCost = 500 + Math.floor(Math.random() * 1000);
  const isOverBudget = Math.random() > 0.5;
  const invoicedCost = isOverBudget
    ? quotedCost * 1.2
    : quotedCost * 1.02;

  const payload = JSON.stringify({
    reference: `PERF-${__VU}-${__ITER}`,
    carrier: 'Load Test Carrier',
    quotedCost,
    invoicedCost,
  });

  const createRes = http.post(`${BASE_URL}/shipments`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(createRes, {
    'POST /shipments returns 201': (r) => r.status === 201,
    'discrepancy flag matches expected outcome': (r) => {
      const body = r.json();
      return body.discrepancy === isOverBudget;
    },
  });

  sleep(1);
}
