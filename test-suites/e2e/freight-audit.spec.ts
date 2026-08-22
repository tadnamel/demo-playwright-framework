import { test, expect } from '@fixtures/pageFixtures';
import { qase } from 'playwright-qase-reporter';

test.describe('Freight cost audit workflow', () => {
  test('@smoke displays seeded shipments on load', async ({ shipmentPage }) => {
    qase.id(21);
    await expect(shipmentPage.rows).toHaveCount(3);
  });

  test('@smoke flags a shipment when invoiced cost exceeds quoted cost beyond tolerance', async ({ shipmentPage }) => {
    qase.id(22);
    // SHP-1002 is seeded at quoted 950 / invoiced 1100 (~15.8% over) -> should be flagged
    await shipmentPage.expectDiscrepancyFlagged('SHP-1002');
  });

  test('does not flag a shipment within tolerance', async ({ shipmentPage }) => {
    qase.id(23);
    // SHP-1001 is seeded at quoted == invoiced -> no discrepancy
    await shipmentPage.expectNoDiscrepancy('SHP-1001');
  });

  test('adds a new shipment and evaluates discrepancy correctly', async ({ shipmentPage }) => {
    qase.id(24);
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
    qase.id(25);
    await shipmentPage.addShipment({
      reference: 'SHP-2002',
      carrier: 'Northline Freight',
      quotedCost: 500,
      invoicedCost: 510, // 2% over -> within tolerance
    });

    await shipmentPage.expectNoDiscrepancy('SHP-2002');
  });

  test('@smoke approves a non-flagged pending shipment as agent', async ({ shipmentPage }) => {
    qase.id(26);
    // SHP-1001 is not flagged, so the default 'agent' role may approve it.
    await shipmentPage.approveShipment('SHP-1001');
    await shipmentPage.expectStatus('SHP-1001', 'approved');
  });

  test('rejects a flagged shipment as manager', async ({ shipmentPage }) => {
    qase.id(27);
    // SHP-1002 is flagged, so this requires switching to the 'manager' role first.
    await shipmentPage.actAsRole('manager');
    await shipmentPage.rejectShipment('SHP-1002');
    await shipmentPage.expectStatus('SHP-1002', 'rejected');
  });

  test('disables approve/reject actions once a shipment is actioned', async ({ shipmentPage }) => {
    qase.id(28);
    await shipmentPage.approveShipment('SHP-1003');

    const row = shipmentPage.rowByReference('SHP-1003');
    await expect(row.getByTestId('approve-btn')).toBeDisabled();
    await expect(row.getByTestId('reject-btn')).toBeDisabled();
  });

  test.describe('Role-based authorization (UI)', () => {
    test('agent role sees an error when trying to approve a flagged shipment', async ({ shipmentPage }) => {
      qase.id(29);
      await shipmentPage.actAsRole('agent');
      await shipmentPage.approveShipment('SHP-1002');

      await shipmentPage.expectActionErrorContains('Only a manager');
      await shipmentPage.expectStatus('SHP-1002', 'pending');
    });

    test('switching to manager role allows approving a flagged shipment', async ({ shipmentPage }) => {
      qase.id(30);
      await shipmentPage.actAsRole('manager');
      await shipmentPage.approveShipment('SHP-1002');
      await shipmentPage.expectStatus('SHP-1002', 'approved');
    });
  });
});
