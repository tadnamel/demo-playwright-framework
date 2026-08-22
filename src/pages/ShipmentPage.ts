import { Page, Locator, expect } from '@playwright/test';
import { step } from '@utils/allureStep';

/**
 * Page Object for the CargoAudit Lite shipment list / audit workflow.
 * Encapsulates locators and actions so test files stay readable and
 * free of raw selectors — same pattern used for production UI suites.
 *
 * Every action/assertion method below is wrapped in the `step()` helper,
 * which reports it as a named step in the Allure report with a screenshot
 * attached right after it runs. Test files don't need to change anything —
 * calling `shipmentPage.addShipment(...)` just works and now also produces
 * a documented, visual step in the report.
 */
export class ShipmentPage {
  readonly page: Page;
  readonly referenceInput: Locator;
  readonly carrierInput: Locator;
  readonly quotedCostInput: Locator;
  readonly invoicedCostInput: Locator;
  readonly addShipmentButton: Locator;
  readonly rows: Locator;
  readonly roleSelect: Locator;
  readonly actionError: Locator;

  constructor(page: Page) {
    this.page = page;
    this.referenceInput = page.locator('input[name="reference"]');
    this.carrierInput = page.locator('input[name="carrier"]');
    this.quotedCostInput = page.locator('input[name="quotedCost"]');
    this.invoicedCostInput = page.locator('input[name="invoicedCost"]');
    this.addShipmentButton = page.getByRole('button', { name: 'Add Shipment' });
    this.rows = page.getByTestId('shipment-row');
    this.roleSelect = page.locator('#role-select');
    this.actionError = page.getByTestId('action-error');
  }

  async actAsRole(role: 'agent' | 'manager') {
    return step(this.page, `Switch role to "${role}"`, async () => {
      await this.roleSelect.selectOption(role);
    });
  }

  async goto() {
    return step(this.page, 'Open the CargoAudit Lite app', async () => {
      await this.page.goto('/');
    });
  }

  async addShipment(params: { reference: string; carrier: string; quotedCost: number; invoicedCost: number }) {
    return step(this.page, `Add shipment ${params.reference}`, async () => {
      await this.referenceInput.fill(params.reference);
      await this.carrierInput.fill(params.carrier);
      await this.quotedCostInput.fill(String(params.quotedCost));
      await this.invoicedCostInput.fill(String(params.invoicedCost));
      await this.addShipmentButton.click();
    });
  }

  rowByReference(reference: string): Locator {
    return this.rows.filter({ has: this.page.getByTestId('reference').getByText(reference, { exact: true }) });
  }

  async expectDiscrepancyFlagged(reference: string) {
    return step(this.page, `Expect ${reference} to be flagged with a discrepancy`, async () => {
      const row = this.rowByReference(reference);
      await expect(row.getByTestId('discrepancy-flag')).toHaveClass(/flagged/);
    });
  }

  async expectNoDiscrepancy(reference: string) {
    return step(this.page, `Expect ${reference} to have no discrepancy`, async () => {
      const row = this.rowByReference(reference);
      await expect(row.getByTestId('discrepancy-flag')).toHaveClass(/ok/);
    });
  }

  async approveShipment(reference: string) {
    return step(this.page, `Approve shipment ${reference}`, async () => {
      await this.rowByReference(reference).getByTestId('approve-btn').click();
    });
  }

  async rejectShipment(reference: string) {
    return step(this.page, `Reject shipment ${reference}`, async () => {
      await this.rowByReference(reference).getByTestId('reject-btn').click();
    });
  }

  async expectStatus(reference: string, status: 'pending' | 'approved' | 'rejected') {
    return step(this.page, `Expect ${reference} status to be "${status}"`, async () => {
      await expect(this.rowByReference(reference).getByTestId('status')).toHaveText(status);
    });
  }

  async expectActionErrorContains(text: string) {
    return step(this.page, `Expect action error to contain "${text}"`, async () => {
      await expect(this.actionError).toContainText(text);
    });
  }
}
