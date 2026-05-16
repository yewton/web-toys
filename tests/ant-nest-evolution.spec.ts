import { test } from '@playwright/test';
import { mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

const CHECKPOINTS = [5_000, 10_000, 15_000, 20_000, 25_000];

test('5-checkpoint evolution screenshots', async ({ page }) => {
  test.setTimeout(180_000);

  const label = process.env.APPROACH_LABEL ?? 'baseline';
  const screenshotsDir = join(process.cwd(), 'tests', 'screenshots');
  mkdirSync(screenshotsDir, { recursive: true });

  // Clean up previous run's screenshots for this label so the run starts from a known state.
  const prefix = `evolution-${label}-`;
  for (const file of readdirSync(screenshotsDir)) {
    if (file.startsWith(prefix) && file.endsWith('.png')) {
      unlinkSync(join(screenshotsDir, file));
    }
  }

  await page.goto('/ants-nest-simulator/');
  await page.waitForFunction(
    () => typeof (window as { __antSimAdvance?: unknown }).__antSimAdvance === 'function',
  );

  let prev = 0;
  for (const target of CHECKPOINTS) {
    const steps = target - prev;
    await page.evaluate((n) => {
      (window as unknown as { __antSimAdvance: (n: number) => void }).__antSimAdvance(n);
    }, steps);
    prev = target;

    const fileName = `evolution-${label}-${String(target).padStart(6, '0')}.png`;
    const screenshotPath = join(screenshotsDir, fileName);
    await page.locator('#simCanvas').screenshot({ path: screenshotPath });
    console.log(`step ${target}: ${screenshotPath}`);
  }
});
