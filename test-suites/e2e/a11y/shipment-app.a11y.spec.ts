import { test } from '@fixtures/pageFixtures';
import { checkA11y } from '@utils/axeCheck';

/**
 * Accessibility regression suite for the CargoAudit Lite mock app, using
 * axe-core (`@axe-core/playwright`) via the `checkA11y()` helper
 * (`src/utils/axeCheck.ts`).
 *
 * Kept as its own suite (rather than folded into `freight-audit.spec.ts`)
 * so it can be run/skipped independently (`npm run test:a11y`,
 * `--grep-invert @a11y`) and so a scan failure reads clearly as an
 * accessibility regression rather than a functional one. Each test scans
 * a distinct, meaningful UI state rather than just the initial load —
 * violations often only appear once content (rows, errors) is present.
 *
 * Tagged @a11y throughout; not tagged @smoke, since these are structural/
 * regression checks rather than a fast health check.
 */
test.describe('Accessibility @a11y', () => {
  test('shipment list — default loaded state', async ({ shipmentPage }) => {
    await checkA11y(shipmentPage.page, 'Shipment list — default state');
  });

  test('shipment list — manager role active', async ({ shipmentPage }) => {
    await shipmentPage.actAsRole('manager');
    await checkA11y(shipmentPage.page, 'Shipment list — manager role');
  });

  test('shipment list — after adding a shipment', async ({ shipmentPage }) => {
    await shipmentPage.addShipment({
      reference: 'SHP-3001',
      carrier: 'Northline Freight',
      quotedCost: 500,
      invoicedCost: 640,
    });
    await checkA11y(shipmentPage.page, 'Shipment list — new flagged row present');
  });

  test('shipment list — action error visible (agent blocked from flagged shipment)', async ({ shipmentPage }) => {
    // SHP-1002 is seeded flagged; default role is 'agent', so this renders
    // the inline action-error state, which is exactly the kind of
    // dynamically-injected content that's easy to miss with a static scan.
    await shipmentPage.approveShipment('SHP-1002');
    await shipmentPage.expectActionErrorContains('Only a manager');
    await checkA11y(shipmentPage.page, 'Shipment list — action error state');
  });
});
