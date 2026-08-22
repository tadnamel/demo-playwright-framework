import type { Page } from '@playwright/test';
import * as allure from 'allure-js-commons';

/**
 * Wraps a Page Object action in a named Allure step, and attaches a
 * screenshot taken immediately after the action completes.
 *
 * Using this inside ShipmentPage's methods (rather than calling page/locator
 * actions directly in test files) means every meaningful UI action —
 * "Add shipment SHP-2001", "Approve shipment SHP-1001", etc. — shows up in
 * the Allure report as its own step with a screenshot attached, without
 * test files needing to know or care that Allure is involved. That keeps
 * the existing Page Object Model intact: tests still just call
 * `shipmentPage.addShipment(...)`.
 */
export async function step<T>(page: Page, name: string, action: () => Promise<T>): Promise<T> {
  return allure.step(name, async () => {
    const result = await action();
    const screenshot = await page.screenshot();
    await allure.attachment(`${name} — screenshot`, screenshot, 'image/png');
    return result;
  });
}
