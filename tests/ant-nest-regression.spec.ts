import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const TOTAL_STEPS = 300_000;
const CHUNK_SIZE = 30_000;
const IDLE_PROBE_STEPS = 1_000;
const IDLE_DISTANCE_THRESHOLD = 5;
const GROUND_LEVEL = 40;
const WIDTH = 400;
const CENTER_X = WIDTH / 2;

const MAX_SURFACE_MEAN_X_DEVIATION = 100;
const MAX_TOP_EDGE_RATIO = 0.2;

const screenshotsDir = join(process.cwd(), 'tests', 'screenshots');
const resultsDir = join(process.cwd(), 'tests', 'results');

interface Checkpoint {
  step: number;
  total: number;
  surface: number;
  underground: number;
  topEdge: number;
  surfaceMeanX: number;
  digging: number;
  idleSurface: number;
  idleUnderground: number;
  meanMovement: number;
}

test('regression metrics over 300k steps', async ({ page }) => {
  test.setTimeout(900_000);

  const label = process.env.APPROACH_LABEL ?? 'baseline';

  await page.goto('/ants-nest-simulator/');
  await page.waitForFunction(
    () => typeof (window as { __antSimAdvance?: unknown }).__antSimAdvance === 'function',
  );

  const checkpoints: Checkpoint[] = [];

  for (let step = CHUNK_SIZE; step <= TOTAL_STEPS; step += CHUNK_SIZE) {
    // Most of the chunk
    await page.evaluate((s) => {
      (window as unknown as { __antSimAdvance: (n: number) => void }).__antSimAdvance(s);
    }, CHUNK_SIZE - IDLE_PROBE_STEPS);

    // Sample positions before idle probe
    const before: { x: number; y: number }[] = await page.evaluate(() => {
      const ants = (window as unknown as { __antSimState: { ants: { x: number; y: number }[] } }).__antSimState.ants;
      return ants.map((a) => ({ x: a.x, y: a.y }));
    });

    // Idle probe window
    await page.evaluate((s) => {
      (window as unknown as { __antSimAdvance: (n: number) => void }).__antSimAdvance(s);
    }, IDLE_PROBE_STEPS);

    const stats: Checkpoint = await page.evaluate(
      ({ groundLevel, before, idleThreshold }) => {
        const ants = (
          window as unknown as { __antSimState: { ants: { x: number; y: number; digMode: string }[] } }
        ).__antSimState.ants;
        let surfaceSumX = 0;
        let surface = 0;
        let underground = 0;
        let topEdge = 0;
        let digging = 0;
        let idleSurface = 0;
        let idleUnderground = 0;
        let movementSum = 0;
        for (let i = 0; i < ants.length; i++) {
          const a = ants[i];
          const b = before[i] ?? a;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          movementSum += d;
          const isIdle = d < idleThreshold;
          if (a.y < groundLevel) {
            surfaceSumX += a.x;
            surface++;
            if (isIdle) idleSurface++;
          } else {
            underground++;
            if (isIdle) idleUnderground++;
          }
          if (a.y < 5) topEdge++;
          if (a.digMode !== 'none') digging++;
        }
        return {
          step: 0,
          total: ants.length,
          surface,
          underground,
          topEdge,
          surfaceMeanX: surface > 0 ? surfaceSumX / surface : 200,
          digging,
          idleSurface,
          idleUnderground,
          meanMovement: ants.length > 0 ? movementSum / ants.length : 0,
        };
      },
      { groundLevel: GROUND_LEVEL, before, idleThreshold: IDLE_DISTANCE_THRESHOLD },
    );
    stats.step = step;
    checkpoints.push(stats);
    console.log(
      `step ${step}: surface=${stats.surface}/${stats.total} top_edge=${stats.topEdge} dig=${stats.digging} idle_s=${stats.idleSurface} idle_u=${stats.idleUnderground} mean_mv=${stats.meanMovement.toFixed(1)} surface_mean_x=${stats.surfaceMeanX.toFixed(1)}`,
    );
  }

  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(resultsDir, { recursive: true });
  const screenshotPath = join(screenshotsDir, `ant-nest-300k-${label}.png`);
  await page.locator('#simCanvas').screenshot({ path: screenshotPath });
  console.log('Screenshot:', screenshotPath);

  const jsonPath = join(resultsDir, `result-${label}.json`);
  writeFileSync(
    jsonPath,
    JSON.stringify({ label, checkpoints, screenshotPath }, null, 2),
  );
  console.log('Result JSON:', jsonPath);

  const final = checkpoints[checkpoints.length - 1];

  const deviation = Math.abs(final.surfaceMeanX - CENTER_X);
  expect(
    deviation,
    `Surface ants drifted from center: mean_x=${final.surfaceMeanX.toFixed(1)} deviation=${deviation.toFixed(1)}`,
  ).toBeLessThanOrEqual(MAX_SURFACE_MEAN_X_DEVIATION);

  const topEdgeRatio = final.topEdge / final.total;
  expect(
    topEdgeRatio,
    `Top edge stacking: ${final.topEdge}/${final.total} (${(topEdgeRatio * 100).toFixed(1)}%)`,
  ).toBeLessThanOrEqual(MAX_TOP_EDGE_RATIO);
});
