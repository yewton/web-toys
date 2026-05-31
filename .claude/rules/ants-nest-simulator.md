---
paths:
  - "ants-nest-simulator/**"
  - "tests/ant-nest-*"
---

# ants-nest-simulator internals

- **`state.ts`** — singleton holding all mutable simulation state: `grids` (3D voxel array, sized `GRID_WIDTH × GRID_HEIGHT × DEPTH`), `pheromone` (per-voxel `Float32Array` per layer), `soilCtxs` (one full-resolution canvas 2D context per Z layer for rendering soil), `ants` array, and slider values
- **`grid.ts`** — all grid read/write functions. Public API takes **pixel** coordinates; the voxel conversion happens inside. `digGel` / `fillDirt` / `dropDirtInside` return the number of voxels changed so callers can conserve dug volume. `dropDirt(x, y, z, amount)` consumes that count to stack a mound near the ant
- **`Ant.ts`** — `Ant` class with `update()` (simulation logic) and `draw()` (canvas rendering) methods. Tracks `carryAmount` in voxel units, hands it back to `dropDirt` on deposit (volume conservation)
- **`simulation.ts`** — core render loop. Composites the layered grid back-to-front to create a depth effect; initializes grids at voxel resolution. Exposes `advanceSimulation()` as `window.__antSimAdvance` so Playwright tests can advance the simulation instantly without rAF. Removing this exposure will break visual tests
- **`debugView.ts`** — debug overlay. Voxel boundary lines are drawn only when `VOXEL_SIZE >= MIN_VOXEL_SIZE_FOR_GRID_LINES` (currently `3`) — finer grids are too dense to read

Voxel grid cell values: `0` = air, `1` = soil (diggable — single voxel type covering both the original substrate and ant-deposited material), `3` = protected zone (not diggable). `soilCanvases` are per-layer binary opaque-white **masks** (encoding "is there soil here?"). Color comes from a shared y-axis `gradientCanvas` and is applied at render time by `source-in` compositing mask × gradient into `compositeCanvas`. Because every soil pixel — original substrate, ant mound, redeposited tunnel fill — takes its color from the same gradient sampled at its own y, all deposits blend seamlessly with the surrounding substrate. `soilFillStyle()` returns `'#fff'`; it's only used when adding to the mask.

`VOXEL_SIZE` is a pure internal-resolution dial (allowed: `2`, `4`; default `2`). Body-scale constants in `constants.ts` (`DIG_RADIUS_PX`, `DIG_REACH_PX`, `DROP_GRAIN_RADIUS_PX`, `DROP_JITTER_PX`) are pixel-anchored — they describe the ant, not the grid. Changing `VOXEL_SIZE` only changes how grainy the substrate feels; the volume-conservation invariant (`carryAmount` in / `dropDirt` out) holds at every size. The UI selector writes to `localStorage` (`antSim.voxelSize`) and reloads the page so `constants.ts` reads the new value.

## Visual E2E Tests

Three Playwright tests live in `tests/`:

| Test file | Steps | Purpose |
|---|---|---|
| `ant-nest-visual.spec.ts` | 30,000 | Verifies a nest-like structure forms (tunnels + dirt mound) via LLM evaluation |
| `ant-nest-regression.spec.ts` | 300,000 | Regression guard: asserts surface-ant mean X stays within ±100 of center; no top-edge stacking |
| `ant-nest-evolution.spec.ts` | 25,000 | Captures 5 timestamped screenshots (5k/10k/15k/20k/25k) for time-series visual review |

- Port defaults to **5173**; set `PORT=5174` to avoid conflicts with a running dev server (e.g. start one with `scripts/dev.sh up 5174`, then run the test against it — see CLAUDE.md → Verification utilities)
- Screenshots are saved to `tests/screenshots/` (in `.gitignore`)
- `ant-nest-visual.spec.ts` requires `claude` CLI in PATH; the other two do not
- `__antSimAdvance(n)` and `__antSimState` are exposed on `window` by `main.ts` for test use

### Mandatory pre-PR check

These tests are **not** run in CI. Whenever a change touches `ants-nest-simulator/` or `tests/ant-nest-*`, run them locally before opening a PR and complete the VRT checklist in `.github/pull_request_template.md`. The checklist there is the single source of truth — do not duplicate it; just satisfy it.

The `.claude/settings.json` PreToolUse hook prints a reminder when `gh pr create` is invoked on a branch with ants-nest-simulator changes.
