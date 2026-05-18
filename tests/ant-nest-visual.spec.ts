import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { mkdirSync } from 'fs';
import { join } from 'path';

// Pheromone-reinforced trunk tunnels develop slowly — 100k frames was
// enough to see the surface mound but not the descending trunk. 250k is
// the sweet spot where trunks are clearly visible without the simulation
// taking too long.
const SIMULATION_STEPS = 250_000;

const screenshotsDir = join(process.cwd(), 'tests', 'screenshots');
const screenshotPath = join(screenshotsDir, 'ant-nest-latest.png');

test('ant-nest-like structure forms after a set number of steps', async ({ page }) => {
  await page.goto('/ants-nest-simulator/');

  // Wait for JS to load and advanceSimulation to be exposed on window
  await page.waitForFunction(() => typeof (window as { __antSimAdvance?: unknown }).__antSimAdvance === 'function');

  // Advance the given number of steps immediately (no requestAnimationFrame), then render once
  await page.evaluate((steps) => {
    (window as unknown as { __antSimAdvance: (n: number) => void }).__antSimAdvance(steps);
  }, SIMULATION_STEPS);

  mkdirSync(screenshotsDir, { recursive: true });
  await page.locator('#simCanvas').screenshot({ path: screenshotPath });

  const evaluation = execFileSync(
    'claude',
    [
      '--print',
      [
        `Please read the following image file using the Read tool: ${screenshotPath}`,
        '',
        'This is a Canvas screenshot from the Ant Nest Simulator. The underground',
        'is rendered as a solid blue gel; air (excavated or never-soil) shows the',
        'lighter background. Ants are the small dark shapes; ants currently',
        'carrying a voxel of soil show a faint coloured dot attached to them.',
        '',
        'In this version pheromone-attracted explorers funnel through narrow',
        'entrances to form one or more vertical TRUNK tunnels descending into',
        'the soil, while pheromone-repelled carriers spread their deposits',
        'across the surface. Each soil voxel renders as a small pale square.',
        '',
        'Determine whether ALL of the following are met:',
        '1. At least one narrow vertical tunnel (a column of excavated voxels)',
        '   is visible descending from the top boundary into the blue soil',
        '   mass — i.e. the disturbance is not purely lateral along the top.',
        '2. The air/soil boundary along the top is visibly irregular (bumps,',
        '   indentations, scattered deposit voxels) rather than a clean line.',
        '3. Multiple ants are visible, with some active around the visible',
        '   tunnel(s) or along the disturbed boundary.',
        '',
        'Write only "PASS" or "FAIL" on the first line, then explain your reasoning.',
      ].join('\n'),
    ],
    { encoding: 'utf8', timeout: 60_000 },
  );

  const firstLine = evaluation.trim().split('\n')[0].trim().toUpperCase();
  console.log('Claude evaluation:\n', evaluation);
  console.log('Diagnostic screenshot:', screenshotPath);
  expect(
    firstLine,
    `No ant-nest-like structure was formed.\nClaude evaluation:\n${evaluation}`,
  ).toBe('PASS');
});
