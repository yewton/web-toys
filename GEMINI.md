# GEMINI.md

This project, **Web Toys**, is a collection of interactive, high-performance web applications built with modern web technologies but without the overhead of heavy UI frameworks. It prioritizes pure Canvas-based rendering and clean, efficient code.

## Project Overview

- **Purpose**: A workspace for experimental web toys and simulations.
- **Main Technologies**:
  - **Bundler/Dev Server**: [Vite](https://vitejs.dev/)
  - **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict Mode)
  - **Styling**: [Tailwind CSS](https://tailwindcss.com/) (utility-first, primarily for app wrappers and UI)
  - **Rendering**: Pure HTML5 Canvas API (2D and pseudo-3D)
  - **Testing**: Vitest for unit tests, [Playwright](https://playwright.dev/) for visual E2E testing
- **Architecture**: A multi-page application (MPA) structure managed by Vite, where each app resides in its own subdirectory with its own `index.html` and `src/` directory.

## Building and Running

### Development
```bash
npm run dev       # dev server with HMR at http://localhost:5173
```

### Production
```bash
npm run build     # tsc --noEmit + vite build → dist/
npm run preview   # serve dist/ locally at http://localhost:4173
```

### Verification
```bash
npm run typecheck    # tsc --noEmit only
npm test             # run Vitest unit tests
npm test -- --coverage # with coverage report
npm run test:visual  # visual E2E test (Playwright + image evaluation)
npm audit            # vulnerability check (expect 0 high-severity)
```

## Pull Request Protocol

**CRITICAL: PR creation rules**

1. **Language**: PR bodies **MUST** be written in **English**. The mechanical check `.claude/hooks/pr-template-check.sh` will block PR creation if Japanese characters are detected in the body.
2. **Template**: Always read and follow `.github/pull_request_template.md` exactly.
3. **Commit Messages**: Follow [Conventional Commits](https://www.conventionalcommits.org/) in **English** (e.g., `feat(ants): ...`). Follow this existing style as seen in `git log`.

### Mandatory Pre-PR Check (ants-nest-simulator)

Whenever a change touches `ants-nest-simulator/` or `tests/ant-nest-*`, you **MUST** run visual tests locally as they are not covered by CI:

- `npx playwright test ant-nest-evolution`: Check 5 screenshots in `tests/screenshots/` for sane growth and no stacking.
- `npx playwright test ant-nest-regression`: Ensure 300k-step run passes.

## Key Applications

### Ant Nest Simulator (`ants-nest-simulator/`)
A 3D simulation of ants digging a nest using pheromone-based collective intelligence.

- **Design**: Uses a voxel-based 3D grid. Volume is conserved: ants dig soil (consuming voxels) and deposit it elsewhere (creating voxels).
- **State**: Singleton in `state.ts` holds `grids` (3D array), `pheromone` (Float32Array), and `soilCtxs` (one Canvas context per Z-layer).
- **Rendering**: Composites layered grids back-to-front. `simulation.ts` exposes `window.__antSimAdvance(n)` for fast-forwarding in tests.
- **Resolution**: `VOXEL_SIZE` (default `2`) determines granularity. Changing it requires a page reload as constants are pixel-anchored.

### Klondike Solitaire Victory Cascade (`solitaire-cascade/`)
An interactive visual effect recreating the iconic card fall animation.

- **Rendering**: 3-layer canvas (`gameCanvas`, `blurCanvas`, `particleCanvas`) for performance and effects.
- **Optimization**: Uses object pooling for `Card` and `Particle` instances to minimize GC pressure.
- **Features**: 8 effects, Auto Play mode (replays 4-suit deck).

## Development Conventions

- **Mono-repo Structure**: Each app has its own directory with `index.html` and `src/`.
- **New App Workflow**:
  1. Create folder, `index.html`, and `src/main.ts`.
  2. Add entry point to `vite.config.ts`.
  3. Add card to root `index.html`.
  4. Update `tsconfig.json` `include`.
  5. (If using Tailwind) Update `tailwind.config.ts` content.
- **Testing**:
  - Unit tests live in `__tests__/*.test.ts`.
  - Use canvas mocks for unit tests (node environment has no DOM).
- **Supply Chain Security**:
  - Actions are pinned to commit SHAs.
  - `package.json` uses exact versions (no `^`).
  - `npm audit --audit-level=high` is enforced in CI.
