import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL } from './config.js';

/**
 * Performance smoke test — CargoAudit Lite shipments API.
 *
 * A lightweight, fast check that the API responds correctly and quickly
 * under a small, constant load. Intended to run frequently (e.g. on every
 * CI run) as a fast health check, distinct from the heavier load test
 * below which is meant for periodic/manual runs.
 */
export const options = {
  vus: 3,
  duration: '15s',
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const listRes = http.get(`${BASE_URL}/shipments`);
  check(listRes, {
    'GET /shipments returns 200': (r) => r.status === 200,
    'GET /shipments returns an array': (r) => Array.isArray(r.json()),
  });

  const detailRes = http.get(`${BASE_URL}/shipments/1`);
  check(detailRes, {
    'GET /shipments/1 returns 200': (r) => r.status === 200,
  });

  sleep(1);
}
