/**
 * Shared config for k6 performance tests against the CargoAudit Lite mock API.
 * Import BASE_URL into each test script rather than hardcoding it in multiple places.
 */
export const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:4000';
