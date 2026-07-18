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

const DISCREPANCY_TOLERANCE = 0.05; // 5% over quote triggers a flag

let nextId = 4;
let shipments = [
  { id: 1, reference: 'SHP-1001', carrier: 'Blue Ocean Freight', quotedCost: 1200, invoicedCost: 1200, status: 'pending' },
  { id: 2, reference: 'SHP-1002', carrier: 'Overland Logistics', quotedCost: 950, invoicedCost: 1100, status: 'pending' },
  { id: 3, reference: 'SHP-1003', carrier: 'Pacific Rim Shipping', quotedCost: 3000, invoicedCost: 3050, status: 'pending' },
];

function withDiscrepancy(shipment) {
  const diff = shipment.invoicedCost - shipment.quotedCost;
  const overTolerance = diff > shipment.quotedCost * DISCREPANCY_TOLERANCE;
  return { ...shipment, discrepancy: overTolerance, discrepancyAmount: overTolerance ? diff : 0 };
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
  const shipment = { id: nextId++, reference, carrier, quotedCost, invoicedCost, status: 'pending' };
  shipments.push(shipment);
  res.status(201).json(withDiscrepancy(shipment));
});

app.patch('/shipments/:id/approve', (req, res) => {
  const shipment = shipments.find((s) => s.id === Number(req.params.id));
  if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
  shipment.status = 'approved';
  res.json(withDiscrepancy(shipment));
});

app.patch('/shipments/:id/reject', (req, res) => {
  const shipment = shipments.find((s) => s.id === Number(req.params.id));
  if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
  shipment.status = 'rejected';
  res.json(withDiscrepancy(shipment));
});

app.delete('/shipments/:id', (req, res) => {
  const before = shipments.length;
  shipments = shipments.filter((s) => s.id !== Number(req.params.id));
  if (shipments.length === before) return res.status(404).json({ error: 'Shipment not found' });
  res.status(204).send();
});

// Test-only helper to reset state between test runs
app.post('/__reset', (req, res) => {
  nextId = 4;
  shipments = [
    { id: 1, reference: 'SHP-1001', carrier: 'Blue Ocean Freight', quotedCost: 1200, invoicedCost: 1200, status: 'pending' },
    { id: 2, reference: 'SHP-1002', carrier: 'Overland Logistics', quotedCost: 950, invoicedCost: 1100, status: 'pending' },
    { id: 3, reference: 'SHP-1003', carrier: 'Pacific Rim Shipping', quotedCost: 3000, invoicedCost: 3050, status: 'pending' },
  ];
  res.status(200).send();
});

const PORT = process.env.API_PORT || 4000;
app.listen(PORT, () => console.log(`CargoAudit mock API listening on port ${PORT}`));
