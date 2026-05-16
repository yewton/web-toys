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
| `ants-nest-simulator/` | Ant Nest Simulator (3D ant nest simulator) |

## Commands

```bash
npm run dev       # dev server with HMR (all apps served)
npm run build     # tsc --noEmit + vite build → dist/
npm run preview   # serve dist/ locally
npm run typecheck # tsc --noEmit only
npm audit         # vulnerability check (expect 0 vulnerabilities)
npm run test:visual  # visual E2E test (Playwright + Claude image evaluation)
```

## CI / Supply chain

- **`.github/workflows/ci.yml`** — runs `npm ci → npm audit --audit-level=high → typecheck → build` on every push and PR
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

- **`state.ts`** — singleton holding all mutable simulation state (grid, pheromones, ant array, slider values)
- **`grid.ts`** — grid manipulation functions (`makeDiggable`, `evaporatePheromone`)
- **`simulation.ts`** — core render loop. Composites the 3D grid (WIDTH × HEIGHT × DEPTH) back-to-front. Exposes `advanceSimulation()` as `window.__antSimAdvance` so Playwright tests can advance the simulation instantly without rAF. Removing this exposure will break visual tests.

Grid cell values: `0` = air, `1` = diggable soil, `3` = protected zone (not diggable).

### solitaire-cascade

- **3-layer canvas**: `gameCanvas` (green background + cards), `blurCanvas` (trails/reflex glow), `particleCanvas` (particles) stacked on top of each other.
- **Object pools**: `cardPool` / `particlePool` reuse instances to suppress GC. Returns to pool when `Card.active = false`.
- **Module singletons**: `config.ts` (layout dimensions, updated on resize), `effectState.ts` (visual effect on/off and particle limit calculation).
- **Auto mode**: automatically replays a 4-suit deck each time all cards have exited.

## Visual E2E Tests (ants-nest-simulator)

`npm run test:visual` launches a browser with Playwright, mechanically advances the simulation **30,000 steps**, captures a screenshot, then uses `claude --print` to evaluate whether an ant-nest-like structure has formed.

- Test port is **5174** (no conflict even if another service is running on 5173)
- Screenshot is saved to `tests/screenshots/ant-nest-latest.png` (in `.gitignore`)
- `ANTHROPIC_API_KEY` is not required. Works as long as the `claude` CLI is in PATH
