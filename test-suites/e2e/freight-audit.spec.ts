import { test, expect } from '@fixtures/pageFixtures';

test.describe('Freight cost audit workflow', () => {
  test('@smoke displays seeded shipments on load', async ({ shipmentPage }) => {
    await expect(shipmentPage.rows).toHaveCount(3);
  });

  test('@smoke flags a shipment when invoiced cost exceeds quoted cost beyond tolerance', async ({ shipmentPage }) => {
    // SHP-1002 is seeded at quoted 950 / invoiced 1100 (~15.8% over) -> should be flagged
    await shipmentPage.expectDiscrepancyFlagged('SHP-1002');
  });

  test('does not flag a shipment within tolerance', async ({ shipmentPage }) => {
    // SHP-1001 is seeded at quoted == invoiced -> no discrepancy
    await shipmentPage.expectNoDiscrepancy('SHP-1001');
  });

  test('adds a new shipment and evaluates discrepancy correctly', async ({ shipmentPage }) => {
    await shipmentPage.addShipment({
      reference: 'SHP-2001',
      carrier: 'Northline Freight',
      quotedCost: 500,
      invoicedCost: 640, // 28% over -> should flag
    });

    await expect(shipmentPage.rows).toHaveCount(4);
    await shipmentPage.expectDiscrepancyFlagged('SHP-2001');
  });

  test('adds a new shipment within tolerance and does not flag it', async ({ shipmentPage }) => {
    await shipmentPage.addShipment({
      reference: 'SHP-2002',
      carrier: 'Northline Freight',
      quotedCost: 500,
      invoicedCost: 510, // 2% over -> within tolerance
    });

    await shipmentPage.expectNoDiscrepancy('SHP-2002');
  });

  test('@smoke approves a pending shipment', async ({ shipmentPage }) => {
    await shipmentPage.approveShipment('SHP-1001');
    await shipmentPage.expectStatus('SHP-1001', 'approved');
  });

  test('rejects a flagged shipment', async ({ shipmentPage }) => {
    await shipmentPage.rejectShipment('SHP-1002');
    await shipmentPage.expectStatus('SHP-1002', 'rejected');
  });

  test('disables approve/reject actions once a shipment is actioned', async ({ shipmentPage }) => {
    await shipmentPage.approveShipment('SHP-1003');

    const row = shipmentPage.rowByReference('SHP-1003');
    await expect(row.getByTestId('approve-btn')).toBeDisabled();
    await expect(row.getByTestId('reject-btn')).toBeDisabled();
  });
});
