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
        'eagerly a short distance from where they dug, so soil movement appears',
        'mainly as a visible surface mound (white area above what was originally',
        'a flat horizontal soil line) rather than as long deep tunnels.',
        '',
        'Determine whether ALL of the following are met:',
        '1. A clear surface mound has formed: the white/excavated region above',
        '   the original blue soil line is noticeably thicker and more irregular',
        '   than a thin pristine line, indicating accumulated deposits.',
        '2. The boundary between air and soil shows visible disturbance — at',
        '   least a few small indentations, pits, or shafts where ants have',
        '   dug into the blue area.',
        '3. Multiple ants are visible, with at least some clearly active near',
        '   the disturbed boundary (not all clustered at one corner).',
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
