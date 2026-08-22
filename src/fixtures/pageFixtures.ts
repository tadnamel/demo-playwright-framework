import { test as base, request as pwRequest } from '@playwright/test';
import { ShipmentPage } from '@pages/ShipmentPage';

type Fixtures = {
  shipmentPage: ShipmentPage;
};

/**
 * Extends the base Playwright test with:
 *  - a ready-to-use ShipmentPage fixture
 *  - automatic mock-API state reset before each test, so tests don't
 *    leak state into one another (equivalent to a test-data reset step
 *    against a staging environment in a production framework)
 */
export const test = base.extend<Fixtures>({
  shipmentPage: async ({ page, baseURL }, use) => {
    const apiContext = await pwRequest.newContext();
    await apiContext.post('http://localhost:4000/__reset');
    await apiContext.dispose();

    const shipmentPage = new ShipmentPage(page);
    await shipmentPage.goto();
    await use(shipmentPage);
  },
});

export { expect } from '@playwright/test';
