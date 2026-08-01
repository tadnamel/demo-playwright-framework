/**
 * Simulated database layer for CargoAudit Lite.
 *
 * Data still lives in-memory (no real DB engine for a demo repo), but every
 * read/write is wrapped in a Promise with a small randomized delay to
 * emulate a real DB round-trip (query planning + disk/network I/O). This
 * gives the app a genuine async boundary and gives the k6 perf suite real
 * latency to measure, instead of a same-process function call that returns
 * in under a microsecond.
 */
const MIN_LATENCY_MS = 3;
const MAX_LATENCY_MS = 12;

function simulateLatency() {
  const ms = MIN_LATENCY_MS + Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const seedData = () => [
  { id: 1, reference: 'SHP-1001', carrier: 'Blue Ocean Freight', quotedCost: 1200, invoicedCost: 1200, status: 'pending' },
  { id: 2, reference: 'SHP-1002', carrier: 'Overland Logistics', quotedCost: 950, invoicedCost: 1100, status: 'pending' },
  { id: 3, reference: 'SHP-1003', carrier: 'Pacific Rim Shipping', quotedCost: 3000, invoicedCost: 3050, status: 'pending' },
];

let nextId = 4;
let shipments = seedData();
let auditLog = [];

async function getAllShipments() {
  await simulateLatency();
  return shipments.map((s) => ({ ...s }));
}

async function getShipmentById(id) {
  await simulateLatency();
  const shipment = shipments.find((s) => s.id === id);
  return shipment ? { ...shipment } : null;
}

async function insertShipment(data) {
  await simulateLatency();
  const shipment = { id: nextId++, status: 'pending', ...data };
  shipments.push(shipment);
  return { ...shipment };
}

async function updateShipmentStatus(id, status) {
  await simulateLatency();
  const shipment = shipments.find((s) => s.id === id);
  if (!shipment) return null;
  shipment.status = status;
  return { ...shipment };
}

async function deleteShipment(id) {
  await simulateLatency();
  const before = shipments.length;
  shipments = shipments.filter((s) => s.id !== id);
  return shipments.length !== before;
}

async function getAuditLog() {
  await simulateLatency();
  return auditLog.map((entry) => ({ ...entry }));
}

async function appendAuditLog(entry) {
  await simulateLatency();
  auditLog.push(entry);
}

async function resetAll() {
  await simulateLatency();
  nextId = 4;
  shipments = seedData();
  auditLog = [];
}

module.exports = {
  getAllShipments,
  getShipmentById,
  insertShipment,
  updateShipmentStatus,
  deleteShipment,
  getAuditLog,
  appendAuditLog,
  resetAll,
};
