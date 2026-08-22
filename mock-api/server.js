/**
 * CargoAudit Lite — mock API server
 *
 * A small Express server simulating a freight-cost-audit backend: shipments
 * carry a quoted cost and an invoiced cost, and the system flags a
 * discrepancy whenever the invoiced amount exceeds the quoted amount by more
 * than a configurable tolerance.
 *
 * Architecture note: shipment/audit data goes through a simulated async DB
 * layer (mock-api/lib/db.js), and each discrepancy check resolves the
 * carrier's tolerance via a downstream HTTP dependency
 * (mock-api/downstream/rate-service.js, through mock-api/lib/rateLookupClient.js)
 * rather than an in-process constant. That gives the perf suite a genuine
 * DB round-trip and a genuine network hop to measure, instead of everything
 * resolving in the same event-loop tick.
 *
 * This is original sample data/logic for a demo project — not derived
 * from any employer or client codebase.
 */
const express = require('express');
const db = require('./lib/db');
const rateLookupClient = require('./lib/rateLookupClient');

const app = express();
app.use(express.json());

// CORS: the mock app (localhost:5173) and this API (localhost:4000) are on
// different origins, so the browser requires explicit CORS headers, plus a
// handled preflight OPTIONS response since we accept a custom x-user-role header.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-user-role');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

/**
 * Computes discrepancy status for a shipment.
 * Handles edge cases explicitly:
 *  - zero quoted cost: avoid divide-by-zero, only flag if invoiced > 0
 *  - negative difference (credit/refund): never flagged as a discrepancy
 * Tolerance is resolved via the downstream rate-lookup client (cached,
 * timeout-guarded, with a safe local fallback — see rateLookupClient.js).
 */
async function withDiscrepancy(shipment) {
  const diff = shipment.invoicedCost - shipment.quotedCost;

  if (diff <= 0) {
    return { ...shipment, discrepancy: false, discrepancyAmount: 0 };
  }

  const { tolerance } = await rateLookupClient.getToleranceFor(shipment.carrier);
  const allowedAmount = shipment.quotedCost * tolerance;
  const overTolerance = shipment.quotedCost === 0 ? diff > 0 : diff > allowedAmount;

  return { ...shipment, discrepancy: overTolerance, discrepancyAmount: overTolerance ? diff : 0 };
}

/**
 * Minimal mock auth: role is passed via the `x-user-role` header.
 * No real authentication — this is a demo, not a security implementation.
 * Rule: only a 'manager' may approve/reject a shipment that's flagged
 * with a discrepancy. An 'agent' may act freely on non-flagged shipments.
 */
function getRole(req) {
  return req.header('x-user-role') || 'agent';
}

function canAction(role, shipmentWithDiscrepancy) {
  if (!shipmentWithDiscrepancy.discrepancy) return true;
  return role === 'manager';
}

app.get('/shipments', async (req, res) => {
  const shipments = await db.getAllShipments();
  const withFlags = await Promise.all(shipments.map(withDiscrepancy));
  res.json(withFlags);
});

app.get('/shipments/:id', async (req, res) => {
  const shipment = await db.getShipmentById(Number(req.params.id));
  if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
  res.json(await withDiscrepancy(shipment));
});

app.post('/shipments', async (req, res) => {
  const { reference, carrier, quotedCost, invoicedCost } = req.body;
  if (!reference || !carrier || quotedCost == null || invoicedCost == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (quotedCost < 0 || invoicedCost < 0) {
    return res.status(400).json({ error: 'Costs cannot be negative' });
  }
  const shipment = await db.insertShipment({ reference, carrier, quotedCost, invoicedCost });
  res.status(201).json(await withDiscrepancy(shipment));
});

function handleStatusChange(action) {
  return async (req, res) => {
    const shipment = await db.getShipmentById(Number(req.params.id));
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });

    if (shipment.status !== 'pending') {
      return res.status(409).json({ error: `Shipment is already ${shipment.status}` });
    }

    const role = getRole(req);
    const evaluated = await withDiscrepancy(shipment);
    if (!canAction(role, evaluated)) {
      return res.status(403).json({ error: 'Only a manager may action a flagged shipment' });
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    const updated = await db.updateShipmentStatus(shipment.id, status);
    await db.appendAuditLog({
      shipmentId: shipment.id,
      action,
      role,
      timestamp: new Date().toISOString(),
    });
    res.json(await withDiscrepancy(updated));
  };
}

app.patch('/shipments/:id/approve', handleStatusChange('approve'));
app.patch('/shipments/:id/reject', handleStatusChange('reject'));

app.delete('/shipments/:id', async (req, res) => {
  const deleted = await db.deleteShipment(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'Shipment not found' });
  res.status(204).send();
});

app.get('/audit-log', async (req, res) => {
  res.json(await db.getAuditLog());
});

// Test-only helper to reset state between test runs
app.post('/__reset', async (req, res) => {
  await db.resetAll();
  res.status(200).send();
});

const PORT = process.env.API_PORT || 4000;
app.listen(PORT, () => console.log(`CargoAudit mock API listening on port ${PORT}`));
