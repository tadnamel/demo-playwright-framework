import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as allure from 'allure-js-commons';

/**
 * Runs an axe-core accessibility scan against the current page state and
 * reports it as a named Allure step, attaching the full JSON results
 * (not just violations) so a clean run is still visible in the report —
 * mirrors the pattern in `allureStep.ts` for UI actions.
 *
 * Fails the test if any violations are found at `impact` level `serious`
 * or `critical` by default. `moderate`/`minor` findings are attached and
 * reported but don't fail the run, so the suite can track them without
 * being noisy on cosmetic contrast/labeling issues while it's still
 * being tuned against the mock app.
 *
 * Usage inside a test (or a Page Object method, same as `step()`):
 *   await checkA11y(page, 'Shipment list — default state');
 */
export async function checkA11y(
  page: Page,
  name: string,
  options: { failOn?: Array<'minor' | 'moderate' | 'serious' | 'critical'> } = {},
): Promise<void> {
  const failOn = options.failOn ?? ['serious', 'critical'];

  await allure.step(`a11y scan: ${name}`, async () => {
    const results = await new AxeBuilder({ page }).analyze();

    await allure.attachment(
      `${name} — axe results`,
      JSON.stringify(results, null, 2),
      'application/json',
    );

    const blocking = results.violations.filter((v) => failOn.includes(v.impact as any));

    if (blocking.length > 0) {
      const summary = blocking
        .map((v) => `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
        .join('\n');
      // Surface the failure with enough detail to act on without opening
      // the full JSON attachment — node count + rule id + one-line help text.
      expect(blocking, `Accessibility violations found:\n${summary}`).toEqual([]);
    }
  });
}
