import { test } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';

const screenshotsDir = join(process.cwd(), 'tests', 'screenshots');

test('long-run diagnostic: capture multiple checkpoints', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/ants-nest-simulator/');
  await page.waitForFunction(() => typeof (window as any).__antSimAdvance === 'function');

  const checkpoints = [];
  for (let i = 1000; i <= 300_000; i += 10_000) {
    checkpoints.push(i);
  }

  let prev = 0;
  for (const total of checkpoints) {
    const step = total - prev;
    
    await page.evaluate((s) => {
      (window as any).__antSimAdvance(s);
    }, step);
    
    const stats = await page.evaluate(() => {
      const state = (window as any).__state;
      if (!state || !state.ants) return null;
      
      const ants = state.ants;
      let sumX = 0;
      let count = 0;
      
      let sumSurfaceX = 0;
      let countSurface = 0;
      
      // GROUND_LEVEL is 70 in constants.ts, let's just use hardcoded 70 or check if it's there
      // We can get it from an ant or assume 70. The hypothesis says y < 70
      for (const ant of ants) {
        sumX += ant.x;
        count++;
        if (ant.y < 70) {
          sumSurfaceX += ant.x;
          countSurface++;
        }
      }
      
      return {
        totalMeanX: count > 0 ? sumX / count : 0,
        surfaceMeanX: countSurface > 0 ? sumSurfaceX / countSurface : 0,
        surfaceCount: countSurface,
        totalCount: count
      };
    });
    
    console.log(`Step ${total}: total_mean_x=${stats?.totalMeanX.toFixed(2)}, surface_mean_x=${stats?.surfaceMeanX.toFixed(2)} (surface_count=${stats?.surfaceCount}/${stats?.totalCount})`);
    
    prev = total;
  }
});
