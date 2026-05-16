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

- **`state.ts`** — singleton holding all mutable simulation state: `grids` (3D cell array), `pheromone` (Float32Array per layer), `gelCtxs`/`dirtCtxs` (canvas 2D contexts for rendering soil layers), `ants` array, and slider values
- **`grid.ts`** — all grid read/write functions. Exported functions are the only way to modify `state.grids` and `state.pheromone` from outside this module
- **`Ant.ts`** — `Ant` class with `update()` (simulation logic) and `draw()` (canvas rendering) methods. `update()` calls grid functions; `draw()` requires a canvas context
- **`simulation.ts`** — core render loop. Composites the layered grid (WIDTH × HEIGHT × DEPTH, where DEPTH=3) back-to-front to create a depth effect. Exposes `advanceSimulation()` as `window.__antSimAdvance` so Playwright tests can advance the simulation instantly without rAF. Removing this exposure will break visual tests.

Grid cell values: `0` = air, `1` = diggable soil (gel), `2` = loose dirt (deposited by ants above ground), `3` = protected zone (not diggable).

### solitaire-cascade

- **3-layer canvas**: `gameCanvas` (green background + cards), `blurCanvas` (trails/reflex glow), `particleCanvas` (particles) stacked on top of each other.
- **Object pools**: `cardPool` / `particlePool` reuse instances to suppress GC. Returns to pool when `Card.active = false`.
- **Module singletons**: `config.ts` (layout dimensions, updated on resize), `effectState.ts` (visual effect on/off and particle limit calculation).
- **Auto mode**: automatically replays a 4-suit deck each time all cards have exited.

## Unit tests

Tests live in `src/__tests__/*.test.ts` inside each app directory. The test environment is `node` (no DOM).

**Canvas mock pattern** — functions that call `CanvasRenderingContext2D` methods are tested by injecting a minimal no-op object into `state.gelCtxs`/`state.dirtCtxs` (for grid functions) or by passing a mock ctx directly to `draw()`:

```ts
function makeCanvasCtx(): CanvasRenderingContext2D {
  return { save: () => {}, restore: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {},
           fillStyle: '', globalCompositeOperation: 'source-over' } as unknown as CanvasRenderingContext2D;
}
```

**`textures.ts` is excluded from coverage** (`vite.config.ts` → `coverage.exclude`) because it calls `document.createElement('canvas')` at runtime and cannot be exercised in the node environment.

## Visual E2E Tests (ants-nest-simulator)

`npm run test:visual` launches a browser with Playwright, mechanically advances the simulation **30,000 steps**, captures a screenshot, then uses `claude --print` to evaluate whether an ant-nest-like structure has formed.

- Test port is **5174** (no conflict even if another service is running on 5173)
- Screenshot is saved to `tests/screenshots/ant-nest-latest.png` (in `.gitignore`)
- `ANTHROPIC_API_KEY` is not required. Works as long as the `claude` CLI is in PATH
