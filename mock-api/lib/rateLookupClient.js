/**
 * Client for the downstream carrier-rate-lookup service.
 *
 * Resolves a carrier's discrepancy tolerance over HTTP, with:
 *  - a larger connection pool than fetch()'s default, so a load test with
 *    dozens of concurrent VUs doesn't queue behind a handful of sockets
 *  - a short in-memory cache per carrier, so a burst of requests for the
 *    same carrier doesn't hammer the downstream service on every call
 *  - request coalescing: concurrent cache-misses for the same carrier share
 *    one in-flight downstream call instead of each firing its own (avoids a
 *    "thundering herd" every time the cache entry expires under load)
 *  - a client-side timeout, since a real downstream dependency can hang
 *  - a safe local fallback if the downstream call errors or times out, so
 *    a flaky "third party" never breaks the core discrepancy-flagging
 *    feature — worst case, one request evaluates against the default
 *    tolerance instead of a carrier-specific override.
 */
const { Agent, setGlobalDispatcher } = require('undici');

setGlobalDispatcher(new Agent({ connections: 128 }));

const RATE_SERVICE_URL = process.env.RATE_SERVICE_URL || 'http://localhost:4001';
const CACHE_TTL_MS = 5000;
const REQUEST_TIMEOUT_MS = 300;
const FALLBACK_TOLERANCE = process.env.DISCREPANCY_TOLERANCE
  ? Number(process.env.DISCREPANCY_TOLERANCE)
  : 0.05;

const cache = new Map(); // carrier -> { tolerance, expiresAt }
const pending = new Map(); // carrier -> in-flight lookup promise

async function getToleranceFor(carrier) {
  const cached = cache.get(carrier);
  if (cached && cached.expiresAt > Date.now()) {
    return { tolerance: cached.tolerance, source: 'cache' };
  }

  if (pending.has(carrier)) {
    return pending.get(carrier);
  }

  const lookupPromise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(
        `${RATE_SERVICE_URL}/carrier-tolerance/${encodeURIComponent(carrier)}`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error(`Rate service returned ${res.status}`);

      const body = await res.json();
      cache.set(carrier, { tolerance: body.tolerance, expiresAt: Date.now() + CACHE_TTL_MS });
      return { tolerance: body.tolerance, source: 'downstream' };
    } catch (err) {
      // Downstream unavailable/slow/erroring — fall back rather than fail the request.
      return { tolerance: FALLBACK_TOLERANCE, source: 'fallback' };
    } finally {
      clearTimeout(timeout);
      pending.delete(carrier);
    }
  })();

  pending.set(carrier, lookupPromise);
  return lookupPromise;
}

module.exports = { getToleranceFor };
