/**
 * CargoAudit Lite — mock API server
 *
 * A small, self-contained Express server simulating a freight-cost-audit
 * backend: shipments carry a quoted cost and an invoiced cost, and the
 * system flags a discrepancy whenever the invoiced amount exceeds the
 * quoted amount by more than a configurable tolerance.
 *
 * This is original sample data/logic for a demo project — not derived
 * from any employer or client codebase.
 */
const express = require('express');
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

// Global default tolerance; overridable via env var, or per-carrier below.
const DEFAULT_TOLERANCE = process.env.DISCREPANCY_TOLERANCE
  ? Number(process.env.DISCREPANCY_TOLERANCE)
  : 0.05; // 5% over quote triggers a flag by default

// Optional per-carrier tolerance overrides (falls back to DEFAULT_TOLERANCE).
const CARRIER_TOLERANCES = {
  'Pacific Rim Shipping': 0.10, // this carrier is allowed a wider 10% band
};

function toleranceFor(carrier) {
  return CARRIER_TOLERANCES[carrier] ?? DEFAULT_TOLERANCE;
}

const seedData = () => [
  { id: 1, reference: 'SHP-1001', carrier: 'Blue Ocean Freight', quotedCost: 1200, invoicedCost: 1200, status: 'pending' },
  { id: 2, reference: 'SHP-1002', carrier: 'Overland Logistics', quotedCost: 950, invoicedCost: 1100, status: 'pending' },
  { id: 3, reference: 'SHP-1003', carrier: 'Pacific Rim Shipping', quotedCost: 3000, invoicedCost: 3050, status: 'pending' },
];

let nextId = 4;
let shipments = seedData();
let auditLog = [];

/**
 * Computes discrepancy status for a shipment.
 * Handles edge cases explicitly:
 *  - zero quoted cost: avoid divide-by-zero, only flag if invoiced > 0
 *  - negative difference (credit/refund): never flagged as a discrepancy
 */
function withDiscrepancy(shipment) {
  const diff = shipment.invoicedCost - shipment.quotedCost;

  if (diff <= 0) {
    // Invoiced at or below quote (including credits/refunds) is never a discrepancy.
    return { ...shipment, discrepancy: false, discrepancyAmount: 0 };
  }

  const tolerance = toleranceFor(shipment.carrier);
  const allowedAmount = shipment.quotedCost * tolerance;
  const overTolerance = shipment.quotedCost === 0 ? diff > 0 : diff > allowedAmount;

  return { ...shipment, discrepancy: overTolerance, discrepancyAmount: overTolerance ? diff : 0 };
}

/**
 * Minimal mock auth: role is passed via the `x-user-role` header.
 * No real authentication — this is a demo, not a security implementation.
 * Rule: only a 'manager' may approve/reject a shipment that is flagged
 * with a discrepancy. An 'agent' may act freely on non-flagged shipments.
 */
function getRole(req) {
  return req.header('x-user-role') || 'agent';
}

function canAction(role, shipmentWithDiscrepancy) {
  if (!shipmentWithDiscrepancy.discrepancy) return true;
  return role === 'manager';
}

function logAudit(shipmentId, action, role) {
  auditLog.push({
    shipmentId,
    action,
    role,
    timestamp: new Date().toISOString(),
  });
}

app.get('/shipments', (req, res) => {
  res.json(shipments.map(withDiscrepancy));
});

app.get('/shipments/:id', (req, res) => {
  const shipment = shipments.find((s) => s.id === Number(req.params.id));
  if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
  res.json(withDiscrepancy(shipment));
});

app.post('/shipments', (req, res) => {
  const { reference, carrier, quotedCost, invoicedCost } = req.body;
  if (!reference || !carrier || quotedCost == null || invoicedCost == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (quotedCost < 0 || invoicedCost < 0) {
    return res.status(400).json({ error: 'Costs cannot be negative' });
  }
  const shipment = { id: nextId++, reference, carrier, quotedCost, invoicedCost, status: 'pending' };
  shipments.push(shipment);
  res.status(201).json(withDiscrepancy(shipment));
});

function handleStatusChange(action) {
  return (req, res) => {
    const shipment = shipments.find((s) => s.id === Number(req.params.id));
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });

    // Guard against double-actioning (e.g. concurrent approve/reject requests).
    if (shipment.status !== 'pending') {
      return res.status(409).json({ error: `Shipment is already ${shipment.status}` });
    }

    const role = getRole(req);
    const evaluated = withDiscrepancy(shipment);
    if (!canAction(role, evaluated)) {
      return res.status(403).json({ error: 'Only a manager may action a flagged shipment' });
    }

    shipment.status = action === 'approve' ? 'approved' : 'rejected';
    logAudit(shipment.id, action, role);
    res.json(withDiscrepancy(shipment));
  };
}

app.patch('/shipments/:id/approve', handleStatusChange('approve'));
app.patch('/shipments/:id/reject', handleStatusChange('reject'));

app.delete('/shipments/:id', (req, res) => {
  const before = shipments.length;
  shipments = shipments.filter((s) => s.id !== Number(req.params.id));
  if (shipments.length === before) return res.status(404).json({ error: 'Shipment not found' });
  res.status(204).send();
});

app.get('/audit-log', (req, res) => {
  res.json(auditLog);
});

// Test-only helper to reset state between test runs
app.post('/__reset', (req, res) => {
  nextId = 4;
  shipments = seedData();
  auditLog = [];
  res.status(200).send();
});

const PORT = process.env.API_PORT || 4000;
app.listen(PORT, () => console.log(`CargoAudit mock API listening on port ${PORT}`));
