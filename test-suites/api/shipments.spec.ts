import { test, expect } from '@playwright/test';

/**
 * API-level tests for the CargoAudit Lite mock backend.
 * Covers CRUD operations, the discrepancy-flagging business rule,
 * role-based authorization, audit logging, and key edge cases —
 * directly at the HTTP layer, independent of the UI.
 */
test.describe('Shipments API', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/__reset');
  });

  test('GET /shipments returns seeded shipments with discrepancy flags computed', async ({ request }) => {
    const response = await request.get('/shipments');
    expect(response.status()).toBe(200);

    const shipments = await response.json();
    expect(shipments).toHaveLength(3);

    const flagged = shipments.find((s: any) => s.reference === 'SHP-1002');
    expect(flagged.discrepancy).toBe(true);
    expect(flagged.discrepancyAmount).toBeCloseTo(150, 2);

    const clean = shipments.find((s: any) => s.reference === 'SHP-1001');
    expect(clean.discrepancy).toBe(false);
  });

  test('GET /shipments/:id returns 404 for a non-existent shipment', async ({ request }) => {
    const response = await request.get('/shipments/9999');
    expect(response.status()).toBe(404);
  });

  test('POST /shipments creates a shipment and evaluates discrepancy', async ({ request }) => {
    const response = await request.post('/shipments', {
      data: { reference: 'SHP-3001', carrier: 'Test Carrier', quotedCost: 1000, invoicedCost: 1300 },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.discrepancy).toBe(true);
    expect(body.discrepancyAmount).toBe(300);
  });

  test('POST /shipments rejects a payload missing required fields', async ({ request }) => {
    const response = await request.post('/shipments', {
      data: { reference: 'SHP-3002' },
    });
    expect(response.status()).toBe(400);
  });

  test('PATCH /shipments/:id/approve sets status to approved (non-flagged, any role)', async ({ request }) => {
    // SHP-1001 (id 1) is not flagged, so an 'agent' role may action it.
    const response = await request.patch('/shipments/1/approve');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('approved');
  });

  test('PATCH /shipments/:id/reject sets status to rejected (flagged, requires manager)', async ({ request }) => {
    // SHP-1002 (id 2) is flagged, so this requires the 'manager' role.
    const response = await request.patch('/shipments/2/reject', {
      headers: { 'x-user-role': 'manager' },
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('rejected');
  });

  test('DELETE /shipments/:id removes a shipment', async ({ request }) => {
    const del = await request.delete('/shipments/3');
    expect(del.status()).toBe(204);

    const getAfter = await request.get('/shipments/3');
    expect(getAfter.status()).toBe(404);
  });

  test.describe('Edge cases', () => {
    test('zero-cost shipment is not flagged and does not error', async ({ request }) => {
      const response = await request.post('/shipments', {
        data: { reference: 'SHP-EDGE-1', carrier: 'Test Carrier', quotedCost: 0, invoicedCost: 0 },
      });
      expect(response.status()).toBe(201);

      const body = await response.json();
      expect(body.discrepancy).toBe(false);
      expect(body.discrepancyAmount).toBe(0);
    });

    test('zero quoted cost with a positive invoiced cost is flagged', async ({ request }) => {
      const response = await request.post('/shipments', {
        data: { reference: 'SHP-EDGE-2', carrier: 'Test Carrier', quotedCost: 0, invoicedCost: 50 },
      });
      expect(response.status()).toBe(201);

      const body = await response.json();
      expect(body.discrepancy).toBe(true);
      expect(body.discrepancyAmount).toBe(50);
    });

    test('negative cost values are rejected on creation', async ({ request }) => {
      const response = await request.post('/shipments', {
        data: { reference: 'SHP-EDGE-3', carrier: 'Test Carrier', quotedCost: -100, invoicedCost: 50 },
      });
      expect(response.status()).toBe(400);
    });

    test('a credit (invoiced below quote) is never flagged as a discrepancy', async ({ request }) => {
      const response = await request.post('/shipments', {
        data: { reference: 'SHP-EDGE-4', carrier: 'Test Carrier', quotedCost: 1000, invoicedCost: 800 },
      });
      expect(response.status()).toBe(201);

      const body = await response.json();
      expect(body.discrepancy).toBe(false);
      expect(body.discrepancyAmount).toBe(0);
    });

    test('an extremely large discrepancy is flagged with the correct amount', async ({ request }) => {
      const response = await request.post('/shipments', {
        data: { reference: 'SHP-EDGE-5', carrier: 'Test Carrier', quotedCost: 500, invoicedCost: 5000 },
      });
      expect(response.status()).toBe(201);

      const body = await response.json();
      expect(body.discrepancy).toBe(true);
      expect(body.discrepancyAmount).toBe(4500);
    });

    test('a carrier with a wider tolerance override is not flagged within that band', async ({ request }) => {
      // Pacific Rim Shipping has a 10% override tolerance (vs. the 5% default).
      // SHP-1003 is seeded at 3000/3050 (~1.7% over) — well within either tolerance,
      // so we create a new shipment closer to the edge of the default band to prove
      // the override, not the default, is what's being applied.
      const response = await request.post('/shipments', {
        data: { reference: 'SHP-EDGE-6', carrier: 'Pacific Rim Shipping', quotedCost: 1000, invoicedCost: 1080 }, // 8% over
      });
      expect(response.status()).toBe(201);

      const body = await response.json();
      // 8% over exceeds the 5% default but is within Pacific Rim's 10% override.
      expect(body.discrepancy).toBe(false);
    });

    test('concurrent status-change attempts: second action on an already-actioned shipment returns 409', async ({ request }) => {
      const first = await request.patch('/shipments/1/approve');
      expect(first.status()).toBe(200);

      const second = await request.patch('/shipments/1/reject');
      expect(second.status()).toBe(409);
    });
  });

  test.describe('Role-based authorization', () => {
    test('agent role cannot approve a flagged shipment', async ({ request }) => {
      const response = await request.patch('/shipments/2/approve', {
        headers: { 'x-user-role': 'agent' },
      });
      expect(response.status()).toBe(403);
    });

    test('manager role can approve a flagged shipment', async ({ request }) => {
      const response = await request.patch('/shipments/2/approve', {
        headers: { 'x-user-role': 'manager' },
      });
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.status).toBe('approved');
    });

    test('missing role header defaults to agent behavior', async ({ request }) => {
      // No x-user-role header sent at all — should behave as 'agent' and be
      // rejected for a flagged shipment.
      const response = await request.patch('/shipments/2/approve');
      expect(response.status()).toBe(403);
    });
  });

  test.describe('Audit log', () => {
    test('approving a shipment creates an audit log entry', async ({ request }) => {
      await request.patch('/shipments/1/approve', { headers: { 'x-user-role': 'agent' } });

      const logResponse = await request.get('/audit-log');
      expect(logResponse.status()).toBe(200);

      const log = await logResponse.json();
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ shipmentId: 1, action: 'approve', role: 'agent' });
      expect(log[0].timestamp).toBeDefined();
    });

    test('rejecting a flagged shipment as manager logs the correct role', async ({ request }) => {
      await request.patch('/shipments/2/reject', { headers: { 'x-user-role': 'manager' } });

      const logResponse = await request.get('/audit-log');
      const log = await logResponse.json();

      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ shipmentId: 2, action: 'reject', role: 'manager' });
    });

    test('a rejected authorization attempt is not logged', async ({ request }) => {
      await request.patch('/shipments/2/approve', { headers: { 'x-user-role': 'agent' } }); // expect 403, no log entry

      const logResponse = await request.get('/audit-log');
      const log = await logResponse.json();
      expect(log).toHaveLength(0);
    });
  });
});
