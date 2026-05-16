import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { mkdirSync } from 'fs';
import { join } from 'path';

// 50 ants × 30000 steps ≈ 8 minutes of simulation at 60 fps
const SIMULATION_STEPS = 30_000;

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
        'This is a Canvas screenshot from the Ant Nest Simulator.',
        'In this simulator, excavating the underground gel (blue) reveals bright white cavities.',
        'Determine whether all of the following acceptance criteria are met:',
        '1. Bright white tunnels or cavities are visible in the underground (blue) area.',
        '2. Excavated dirt has accumulated as particles or mounds near the surface (top boundary of the image).',
        '3. Multiple ants are visible and there are clear signs of underground excavation.',
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
