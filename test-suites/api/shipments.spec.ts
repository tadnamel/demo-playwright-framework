import { test, expect } from '@playwright/test';

/**
 * API-level tests for the CargoAudit Lite mock backend.
 * Covers CRUD operations and the discrepancy-flagging business rule
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

  test('PATCH /shipments/:id/approve sets status to approved', async ({ request }) => {
    const response = await request.patch('/shipments/1/approve');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('approved');
  });

  test('PATCH /shipments/:id/reject sets status to rejected', async ({ request }) => {
    const response = await request.patch('/shipments/2/reject');
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
});
