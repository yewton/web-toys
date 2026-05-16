import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';

// Matches the hypothesis verification conditions: stagnation/clustering was observed at 300k steps
const TOTAL_STEPS = 300_000;
const CHUNK_SIZE = 30_000;
const GROUND_LEVEL = 40;
const WIDTH = 400;
const CENTER_X = WIDTH / 2;

// Tolerance: surface mean X must stay within ±100 of center (200).
// Before fix, it drifted to ~400 (right edge) by 300k steps.
const MAX_SURFACE_MEAN_X_DEVIATION = 100;

const screenshotsDir = join(process.cwd(), 'tests', 'screenshots');

interface AntStats {
  surfaceMeanX: number;
  surfaceCount: number;
  totalCount: number;
}

test('no upper-right clustering after 300k steps (regression for hypo-C fix)', async ({ page }) => {
  test.setTimeout(600_000);

  await page.goto('/ants-nest-simulator/');
  await page.waitForFunction(
    () => typeof (window as { __antSimAdvance?: unknown }).__antSimAdvance === 'function',
  );

  const checkpoints: { step: number; stats: AntStats }[] = [];

  for (let step = CHUNK_SIZE; step <= TOTAL_STEPS; step += CHUNK_SIZE) {
    await page.evaluate((s) => {
      (window as unknown as { __antSimAdvance: (n: number) => void }).__antSimAdvance(s);
    }, CHUNK_SIZE);

    const stats: AntStats = await page.evaluate((groundLevel) => {
      const state = (window as unknown as { __antSimState: { ants: { x: number; y: number }[] } }).__antSimState;
      const ants = state.ants;
      let surfaceSumX = 0;
      let surfaceCount = 0;
      for (const ant of ants) {
        if (ant.y < groundLevel) {
          surfaceSumX += ant.x;
          surfaceCount++;
        }
      }
      return {
        surfaceMeanX: surfaceCount > 0 ? surfaceSumX / surfaceCount : 200,
        surfaceCount,
        totalCount: ants.length,
      };
    }, GROUND_LEVEL);

    checkpoints.push({ step, stats });
    console.log(
      `step ${step}: surface_mean_x=${stats.surfaceMeanX.toFixed(1)} (${stats.surfaceCount}/${stats.totalCount} ants on surface)`,
    );
  }

  // Take screenshot at 300k for visual record
  mkdirSync(screenshotsDir, { recursive: true });
  const screenshotPath = join(screenshotsDir, 'ant-nest-300k.png');
  await page.locator('#simCanvas').screenshot({ path: screenshotPath });
  console.log('Screenshot:', screenshotPath);

  // Assert surface mean X stays near center at 300k step final checkpoint
  const final = checkpoints[checkpoints.length - 1];
  const deviation = Math.abs(final.stats.surfaceMeanX - CENTER_X);
  expect(
    deviation,
    `Surface ants clustered away from center at step ${final.step}: mean_x=${final.stats.surfaceMeanX.toFixed(1)}, deviation=${deviation.toFixed(1)} > ${MAX_SURFACE_MEAN_X_DEVIATION}`,
  ).toBeLessThanOrEqual(MAX_SURFACE_MEAN_X_DEVIATION);
});
