import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { mkdirSync } from 'fs';
import { join } from 'path';

// The voxel-discrete model removes one voxel per dig and drops eagerly near
// the dig site, so soil movement is dominated by a thick surface mound that
// grows above the original soil line — deep tunnels are a slower secondary
// effect. 100k frames is enough for the mound + surface disturbance to be
// unambiguous on the screenshot.
const SIMULATION_STEPS = 100_000;

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
        'In this version the ants carry exactly one voxel at a time and drop it',
        'eagerly a short distance from where they dug. Soil rendering uses one',
        'rounded rectangle per voxel, so individual deposited voxels are visible',
        'as small pale squares scattered through the boundary region — they do',
        'not blur into a single solid pile.',
        '',
        'Determine whether ALL of the following are met:',
        '1. The top region shows a thick, mixed band of pale specks and white',
        '   patches — a visibly DISTURBED region rather than a thin clean strip.',
        '   Individual scattered specks above the main soil mass count.',
        '2. The boundary between air and soil is visibly irregular — not a',
        '   clean horizontal line. Scalloping, bumps, indentations along the',
        '   boundary are all acceptable evidence.',
        '3. Multiple ants are visible, spread across the width of the',
        '   disturbed boundary (not all clustered at one corner).',
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
