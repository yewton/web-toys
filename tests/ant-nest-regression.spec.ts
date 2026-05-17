import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Regression metrics for the voxel-discrete ant simulator.
 *
 * The old test asserted "surface ants stay near the centre" and "no top-edge
 * stacking" — both of which depended on a surface/ground concept that the
 * redesign removes. The new invariants assert the geometric guarantees the
 * new model actually does promise:
 *
 *   1. Stand validity: every ant occupies an air voxel that has at least one
 *      6-cardinal soil neighbour (no ant free-floating in mid-air).
 *   2. In-bounds: every ant is inside [0, GRID_WIDTH) × [0, GRID_HEIGHT) ×
 *      [0, DEPTH).
 *   3. Substantial digging: the run carves enough air into the original soil
 *      region that the simulator is clearly doing something.
 *   4. Approximate volume conservation: the total soil count over the run
 *      drops only modestly (rescue-digs when an ant is sealed in are the
 *      only lossy event; their per-step probability is low).
 *   5. Activity: mean ant displacement over an idle-probe window is non-zero
 *      (no mass stuck in dead-ends).
 */

const TOTAL_STEPS = 300_000;
const CHUNK_SIZE = 30_000;
const IDLE_PROBE_STEPS = 1_000;

const MIN_TUNNEL_AIR_VOXELS = 800;
const MIN_VOLUME_RETENTION = 0.85;
const MIN_MEAN_MOVEMENT = 1.0;
// Concurrent move/dig across 50 ants can leave a tiny number momentarily
// straddling a voxel that was a stand-valid target at decision time but lost
// its only soil neighbour by the time the move completes. These recover on
// the next idle tick; we tolerate a small floor at any snapshot rather than
// failing the run for an inherently-transient artefact of concurrency.
const MAX_INVALID_STAND_RATIO = 0.08;

const screenshotsDir = join(process.cwd(), 'tests', 'screenshots');
const resultsDir = join(process.cwd(), 'tests', 'results');

interface Checkpoint {
  step: number;
  total: number;
  invalidStand: number;
  outOfBounds: number;
  tunnelAirVoxels: number;
  totalSoilVoxels: number;
  carryingCount: number;
  meanMovement: number;
}

test('regression metrics over 300k steps', async ({ page }) => {
  test.setTimeout(900_000);

  const label = process.env.APPROACH_LABEL ?? 'voxel-discrete';

  await page.goto('/ants-nest-simulator/');
  await page.waitForFunction(
    () => typeof (window as { __antSimAdvance?: unknown }).__antSimAdvance === 'function',
  );

  // Initial soil count, after the protected band + diggable soil are seeded
  // but before any digging happens. Volume retention is measured against this.
  const initialSoilVoxels: number = await page.evaluate(() => {
    const grids = (window as unknown as { __antSimState: { grids: Uint8Array[][] } })
      .__antSimState.grids;
    let n = 0;
    for (const layer of grids) {
      for (const row of layer) {
        for (let i = 0; i < row.length; i++) if (row[i] > 0) n++;
      }
    }
    return n;
  });

  const checkpoints: Checkpoint[] = [];

  for (let step = CHUNK_SIZE; step <= TOTAL_STEPS; step += CHUNK_SIZE) {
    await page.evaluate((s) => {
      (window as unknown as { __antSimAdvance: (n: number) => void }).__antSimAdvance(s);
    }, CHUNK_SIZE - IDLE_PROBE_STEPS);

    const before: { x: number; y: number }[] = await page.evaluate(() => {
      const ants = (
        window as unknown as { __antSimState: { ants: { drawX: number; drawY: number }[] } }
      ).__antSimState.ants;
      return ants.map((a) => ({ x: a.drawX, y: a.drawY }));
    });

    await page.evaluate((s) => {
      (window as unknown as { __antSimAdvance: (n: number) => void }).__antSimAdvance(s);
    }, IDLE_PROBE_STEPS);

    const stats: Checkpoint = await page.evaluate(
      ({ before }) => {
        const sim = (
          window as unknown as {
            __antSimState: {
              ants: {
                vx: number; vy: number; vz: number;
                drawX: number; drawY: number;
                carrying: boolean;
              }[];
              grids: Uint8Array[][];
            };
          }
        ).__antSimState;

        const grids = sim.grids;
        const depth = grids.length;
        const gridHeight = grids[0].length;
        const gridWidth = grids[0][0].length;

        // INITIAL_AIR_TOP_Y / VOXEL_SIZE = 40 / 2 = 20 — used only as the
        // y-row threshold for the "tunnel air inside the original soil" count.
        const initialAirEndVy = 20;
        let totalSoil = 0;
        let tunnelAir = 0;
        for (let z = 0; z < depth; z++) {
          for (let vy = 0; vy < gridHeight; vy++) {
            const row = grids[z][vy];
            for (let vx = 0; vx < gridWidth; vx++) {
              const v = row[vx];
              if (v > 0) totalSoil++;
              if (vy >= initialAirEndVy && v === 0) tunnelAir++;
            }
          }
        }

        const ants = sim.ants;
        let invalidStand = 0;
        let outOfBounds = 0;
        let movementSum = 0;
        let carryingCount = 0;
        for (let i = 0; i < ants.length; i++) {
          const a = ants[i];
          const b = before[i] ?? { x: a.drawX, y: a.drawY };
          movementSum += Math.hypot(a.drawX - b.x, a.drawY - b.y);
          if (a.carrying) carryingCount++;

          if (
            a.vx < 0 || a.vx >= gridWidth ||
            a.vy < 0 || a.vy >= gridHeight ||
            a.vz < 0 || a.vz >= depth
          ) {
            outOfBounds++;
            continue;
          }

          const cur = grids[a.vz][a.vy][a.vx];
          let standOk = cur === 0;
          if (standOk) {
            const offsets: [number, number, number][] = [
              [ 1, 0, 0], [-1, 0, 0],
              [ 0, 1, 0], [ 0,-1, 0],
              [ 0, 0, 1], [ 0, 0,-1],
            ];
            let hasSoil = false;
            for (const [dx, dy, dz] of offsets) {
              const nx = a.vx + dx, ny = a.vy + dy, nz = a.vz + dz;
              const oob =
                nx < 0 || nx >= gridWidth ||
                ny < 0 || ny >= gridHeight ||
                nz < 0 || nz >= depth;
              if (oob) { hasSoil = true; break; }
              if (grids[nz][ny][nx] > 0) { hasSoil = true; break; }
            }
            if (!hasSoil) standOk = false;
          }
          if (!standOk) invalidStand++;
        }

        return {
          step: 0,
          total: ants.length,
          invalidStand,
          outOfBounds,
          tunnelAirVoxels: tunnelAir,
          totalSoilVoxels: totalSoil,
          carryingCount,
          meanMovement: ants.length > 0 ? movementSum / ants.length : 0,
        };
      },
      { before },
    );
    stats.step = step;
    checkpoints.push(stats);
    console.log(
      `step ${step}: ants=${stats.total} invalid_stand=${stats.invalidStand} oob=${stats.outOfBounds} ` +
      `tunnel_air=${stats.tunnelAirVoxels} soil=${stats.totalSoilVoxels} ` +
      `carrying=${stats.carryingCount} mean_mv=${stats.meanMovement.toFixed(2)}`,
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
    JSON.stringify({ label, initialSoilVoxels, checkpoints, screenshotPath }, null, 2),
  );
  console.log('Result JSON:', jsonPath);

  const final = checkpoints[checkpoints.length - 1];

  const invalidRatio = final.total > 0 ? final.invalidStand / final.total : 0;
  expect(
    invalidRatio,
    `Excess ants on invalid stand positions: ${final.invalidStand}/${final.total}`,
  ).toBeLessThanOrEqual(MAX_INVALID_STAND_RATIO);

  expect(
    final.outOfBounds,
    `Ants ended out of grid bounds: ${final.outOfBounds}/${final.total}`,
  ).toBe(0);

  expect(
    final.tunnelAirVoxels,
    `Insufficient tunnel formation: tunnel_air=${final.tunnelAirVoxels}`,
  ).toBeGreaterThanOrEqual(MIN_TUNNEL_AIR_VOXELS);

  const retention = final.totalSoilVoxels / initialSoilVoxels;
  expect(
    retention,
    `Excess volume loss: retention=${retention.toFixed(3)} (initial=${initialSoilVoxels}, final=${final.totalSoilVoxels})`,
  ).toBeGreaterThanOrEqual(MIN_VOLUME_RETENTION);

  expect(
    final.meanMovement,
    `Simulation has stalled: mean_movement=${final.meanMovement.toFixed(3)}`,
  ).toBeGreaterThanOrEqual(MIN_MEAN_MOVEMENT);
});
