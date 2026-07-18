import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object for the CargoAudit Lite shipment list / audit workflow.
 * Encapsulates locators and actions so test files stay readable and
 * free of raw selectors — same pattern used for production UI suites.
 */
export class ShipmentPage {
  readonly page: Page;
  readonly referenceInput: Locator;
  readonly carrierInput: Locator;
  readonly quotedCostInput: Locator;
  readonly invoicedCostInput: Locator;
  readonly addShipmentButton: Locator;
  readonly rows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.referenceInput = page.locator('input[name="reference"]');
    this.carrierInput = page.locator('input[name="carrier"]');
    this.quotedCostInput = page.locator('input[name="quotedCost"]');
    this.invoicedCostInput = page.locator('input[name="invoicedCost"]');
    this.addShipmentButton = page.getByRole('button', { name: 'Add Shipment' });
    this.rows = page.getByTestId('shipment-row');
  }

  async goto() {
    await this.page.goto('/');
  }

  async addShipment(params: { reference: string; carrier: string; quotedCost: number; invoicedCost: number }) {
    await this.referenceInput.fill(params.reference);
    await this.carrierInput.fill(params.carrier);
    await this.quotedCostInput.fill(String(params.quotedCost));
    await this.invoicedCostInput.fill(String(params.invoicedCost));
    await this.addShipmentButton.click();
  }

  rowByReference(reference: string): Locator {
    return this.rows.filter({ has: this.page.getByTestId('reference').getByText(reference, { exact: true }) });
  }

  async expectDiscrepancyFlagged(reference: string) {
    const row = this.rowByReference(reference);
    await expect(row.getByTestId('discrepancy-flag')).toHaveClass(/flagged/);
  }

  async expectNoDiscrepancy(reference: string) {
    const row = this.rowByReference(reference);
    await expect(row.getByTestId('discrepancy-flag')).toHaveClass(/ok/);
  }

  async approveShipment(reference: string) {
    await this.rowByReference(reference).getByTestId('approve-btn').click();
  }

  async rejectShipment(reference: string) {
    await this.rowByReference(reference).getByTestId('reject-btn').click();
  }

  async expectStatus(reference: string, status: 'pending' | 'approved' | 'rejected') {
    await expect(this.rowByReference(reference).getByTestId('status')).toHaveText(status);
  }
}
