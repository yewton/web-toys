# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech stack

- **Vite** — dev server + bundler (`npm run dev` → `http://localhost:5173`)
- **TypeScript** — strict mode, `moduleResolution: bundler`
- **Tailwind CSS** — utility-first CSS (used by `ants-nest-simulator/`)
- No UI framework (pure Canvas apps)

## Structure

| Path | Description |
|---|---|
| `index.html` | Landing page listing all apps |
| `solitaire-cascade/` | Klondike Solitaire Victory Cascade |
| `ants-nest-simulator/` | Ant Nest Simulator (pheromone-driven ant nest simulator) |

## Commands

```bash
npm run dev       # dev server with HMR (all apps served)
npm run build     # tsc --noEmit + vite build → dist/
npm run preview   # serve dist/ locally
npm run typecheck # tsc --noEmit only
npm test          # run Vitest unit tests
npm test -- --coverage              # with coverage report
npx vitest run <pattern>            # run a single test file
npm audit         # vulnerability check (expect 0 vulnerabilities)
npm run test:visual  # visual E2E test (Playwright + Claude image evaluation)
```

CI runs in this order: `npm audit` → `typecheck` → `npm test --coverage` → `build`.

## CI / Supply chain

- **`.github/workflows/ci.yml`** — runs `npm ci → npm audit --audit-level=high → typecheck → test --coverage → build` on every push and PR
- **`.github/workflows/deploy.yml`** — deploys `dist/` to GitHub Pages on push to main
- **`.github/dependabot.yml`** — weekly automated updates for both npm packages and GitHub Actions
- **Actions pinned to commit SHAs** — prevents tag-mutation attacks; Dependabot keeps the SHAs up to date
- **`npm ci`** — enforces `package-lock.json` strictly
- **Exact versions in `package.json`** (no `^`) — `.npmrc` sets `save-exact=true`
- **`npm audit --audit-level=high`** — CI fails on high+ severity only

## Adding a new app

1. Create `<app-name>/index.html` and `<app-name>/src/main.ts`
2. Add the entry to `vite.config.ts` `rollupOptions.input`
3. Add a card to the root `index.html`
4. If the app uses Tailwind, add its HTML/src paths to `tailwind.config.ts` content list
5. Add the app's `src/` to `tsconfig.json` `include`

## App internals

### ants-nest-simulator

- **`state.ts`** — singleton holding all mutable simulation state: `grids` (3D cell array), `pheromone` (Float32Array per layer), `soilCtxs` (one canvas 2D context per Z layer for rendering soil), `ants` array, and slider values
- **`grid.ts`** — all grid read/write functions. Exported functions are the only way to modify `state.grids` and `state.pheromone` from outside this module
- **`Ant.ts`** — `Ant` class with `update()` (simulation logic) and `draw()` (canvas rendering) methods. `update()` calls grid functions; `draw()` requires a canvas context
- **`simulation.ts`** — core render loop. Composites the layered grid (WIDTH × HEIGHT × DEPTH, where DEPTH=3) back-to-front to create a depth effect. Exposes `advanceSimulation()` as `window.__antSimAdvance` so Playwright tests can advance the simulation instantly without rAF. Removing this exposure will break visual tests.

Grid cell values: `0` = air, `1` = soil (diggable — single voxel type covering both the original substrate and ant-deposited material), `3` = protected zone (not diggable). All soil paints use `soilFillStyle(y)`, the same gradient ramp as the initial fill, so deposits and substrate blend seamlessly on the canvas.

### solitaire-cascade

- **3-layer canvas**: `gameCanvas` (green background + cards), `blurCanvas` (trails/reflex glow), `particleCanvas` (particles) stacked on top of each other.
- **Object pools**: `cardPool` / `particlePool` reuse instances to suppress GC. Returns to pool when `Card.active = false`.
- **Module singletons**: `config.ts` (layout dimensions, updated on resize), `effectState.ts` (visual effect on/off and particle limit calculation).
- **Auto mode**: automatically replays a 4-suit deck each time all cards have exited.

## Unit tests

Tests live in `src/__tests__/*.test.ts` inside each app directory. The test environment is `node` (no DOM).

**Canvas mock pattern** — functions that call `CanvasRenderingContext2D` methods are tested by injecting a minimal no-op object into `state.soilCtxs` (for grid functions) or by passing a mock ctx directly to `draw()`:

```ts
function makeCanvasCtx(): CanvasRenderingContext2D {
  return { save: () => {}, restore: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {},
           fillStyle: '', globalCompositeOperation: 'source-over' } as unknown as CanvasRenderingContext2D;
}
```

**`textures.ts` is excluded from coverage** (`vite.config.ts` → `coverage.exclude`) because it calls `document.createElement('canvas')` at runtime and cannot be exercised in the node environment.

## Visual E2E Tests (ants-nest-simulator)

Three Playwright tests live in `tests/`:

| Test file | Steps | Purpose |
|---|---|---|
| `ant-nest-visual.spec.ts` | 30,000 | Verifies a nest-like structure forms (tunnels + dirt mound) via LLM evaluation |
| `ant-nest-regression.spec.ts` | 300,000 | Regression guard: asserts surface-ant mean X stays within ±100 of center; no top-edge stacking |
| `ant-nest-evolution.spec.ts` | 25,000 | Captures 5 timestamped screenshots (5k/10k/15k/20k/25k) for time-series visual review |

- Port defaults to **5173**; set `PORT=5174` to avoid conflicts with a running dev server
- Screenshots are saved to `tests/screenshots/` (in `.gitignore`)
- `ant-nest-visual.spec.ts` requires `claude` CLI in PATH; the other two do not
- `__antSimAdvance(n)` and `__antSimState` are exposed on `window` by `main.ts` for test use

### Mandatory pre-PR check (ants-nest-simulator changes)

These tests are **not** run in CI. Whenever a change touches `ants-nest-simulator/` or `tests/ant-nest-*`, run them locally before opening a PR and complete the VRT checklist in `.github/pull_request_template.md`. The checklist there is the single source of truth — do not duplicate it; just satisfy it.

The `.claude/settings.json` PreToolUse hook prints a reminder when `gh pr create` is invoked on a branch with ants-nest-simulator changes.

## Creating pull requests

**Before running `gh pr create`**, you must:

1. Read `.github/pull_request_template.md` with the Read tool.
2. Fill every applicable section in **English**, following the template structure exactly.
3. For ants-nest-simulator changes, complete the VRT checklist (check off each item you have actually run).

The PreToolUse hook `.claude/hooks/pr-template-check.sh` enforces these rules mechanically and will **block** `gh pr create` if:

- The body is missing a `## Summary` section, or
- The body contains Japanese characters.
