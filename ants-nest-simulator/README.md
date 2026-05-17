# Ant Nest Simulator

A simulator where ants autonomously dig their nest using a collective-intelligence algorithm based on pheromones. Tunnels and surface mounds emerge gradually from per-step single-cell carving — there is no top-level planner.

## Overview

- Ants deposit pheromones while exploring and returning; dig direction follows the trails of others
- Canvas is `WIDTH × HEIGHT × DEPTH` (400 × 400 × 3); the 3 depth layers are composited back-to-front to give a sense of depth
- The substrate is stored as a coarse **voxel grid** (default `VOXEL_SIZE = 2 px`, so a 200 × 200 grid). Pixel-fine circles are drawn into the soil canvas, so the visible silhouette stays smooth even though the logic operates on whole voxels — see [Voxel grid](#voxel-grid) below
- All structure (tunnels, branches, surface entrances, dirt mounds) emerges from atomic single-bite digging and volume-conserving dirt deposition — there are no multi-step burst-mode states

## UI

| Control | Description |
|---|---|
| Ant Count | Adjust number of ants (0–200) with a slider |
| Simulation Speed | Change simulation speed from 1x to 20x |
| Flatten Soil (Reset) | Reset the grid to its initial state |
| View Mode | `Normal` / `Internal` (debug grid + pheromone heatmap) / `Overlay` |
| Voxel Size | `Fine (2 px)` smoother paths · `Coarse (4 px)` blockier with visible grid in debug view. Stored in localStorage; changing it reloads the page |

## Algorithm Details

### Voxel grid

The substrate is stored as `state.grids[z][vy][vx]` where each cell represents a `VOXEL_SIZE × VOXEL_SIZE` pixel block. Coordinates exposed through `grid.ts` (ant position, dig radius, pheromone lookup) are all in **pixels**; the conversion to voxel indices happens inside the grid module. Default `VOXEL_SIZE = 2` (200 × 200 grid) — switchable to `4` (100 × 100) via the UI.

`VOXEL_SIZE` is a pure resolution dial. The body-scale constants below stay fixed in pixels regardless of voxel size, so the ant's "feel" is preserved — only the granularity of the substrate changes.

| Constant | Pixels | Role |
|---|---|---|
| `DIG_RADIUS_PX` | 2.2 | Radius of one bite (≈ant mandible span) |
| `DIG_REACH_PX` | 3.0 | Forward offset from the ant for each bite |
| `DROP_GRAIN_RADIUS_PX` | 1.5 | Radius of one deposited soil grain |
| `DROP_JITTER_PX` | 6.0 | Lateral spread when stacking a mound |
| `MIN_VOXEL_SIZE_FOR_GRID_LINES` | 3 | Debug grid lines only rendered above this voxel size |

**Volume conservation**: `digGel` / `fillDirt` / `dropDirtInside` all return the number of voxels they actually changed. An ant accumulates dug voxels in `carryAmount` and `dropDirt(x, y, z, amount)` reuses that same number when stacking the mound. This holds regardless of `VOXEL_SIZE`.

### Grid Cell Values

| Value | Meaning |
|---|---|
| `0` | Air (passable) |
| `1` | Soil — diggable. A single voxel type for both the original substrate and ant-deposited material |
| `3` | Protected zone (top `PROTECTED_DEPTH = 6` px, not diggable) |

Rendering: a single `soilCanvas` per Z layer holds the entire substrate at full pixel resolution. `digGel` cuts via `destination-out` using a pixel-fine circle of `DIG_RADIUS_PX`, while updating *all voxels the circle touches* in the underlying grid. Deposits (`dropDirtInside`, `fillDirt`, `dropDirt`) paint pixel circles using `soilFillStyle(y)`, the same gradient ramp as the initial fill. The lack of a separate dirt layer is what makes mounds and tunnel re-fills visually seamless with the surrounding substrate.

### Pheromones

- Exploring ants deposit `PHEROMONE_DEPOSIT_EXPLORE = 0.001`
- Returning ants (carrying soil) deposit `PHEROMONE_DEPOSIT_RETURN = 0.005` (stronger trail home)
- Pheromones evaporate each step by `PHEROMONE_DECAY = 0.997`

### Digging Behavior

Digging is **per-step and atomic**. There is no `digMode` state machine — each obstacle encounter triggers a single carving action via `digOneCell()`:

1. Carve a `DIG_RADIUS_PX = 2.2` chunk of gel `DIG_REACH_PX = 3.0` in front of the ant — yields 1–4 voxels depending on `VOXEL_SIZE`
2. Add the dug count to `carryAmount` and edge the ant forward at `0.5 × speed`
3. With 15% probability when carrying anything, mark the ant as `hasDirt = true`, flip 180°, and head back toward the surface

Tunnels lengthen by repeated single bites — never as a burst — so the visual progression is gradual. Rooms emerge naturally when multiple ants converge on the same area; they are not created explicitly.

Dig probability depends on context:

| Context | Probability |
|---|---|
| Surface / shallow (`y < GROUND_LEVEL + PROTECTED_DEPTH + 5`) | `0.8` (eager so dirt mounds don't wall off entrances) |
| Dead end (left + right both blocked, underground) | `1.0` |
| Otherwise | `0.002 + depthRatio × 0.015` |
| Wide-space detected (>65% air within radius 10) | `0` (don't expand rooms further) |

### Surface Wander

Ants without dirt above ground use a **horizontally-biased wander** so they sample the whole surface instead of orbiting their starting position:

- 70% chance: pick a horizontal direction (`0` or `π`) with ±0.25 rad noise
- 30% chance: drift downward (`π/2`) with ±0.3 rad noise
- Resample every 250–550 steps (longer than the underground 100–300)

### Surface Frustration

A `surfaceFrustration` counter increments each time a surface ant bounces off the protected layer (type 3). When the counter crosses 120:

- `makeDiggable` opens a 4-cell-wide entrance in front of the ant (converting type-3 cells in a column down to `PROTECTED_DEPTH + 1` into type-1)
- The counter resets

The counter also resets whenever the ant reaches the underground. This lets disconnected colonies spontaneously create new entrances without manual seeding.

### Dirt Mound and Burial Protection

- `dropDirt(x, y, z, amount)` stacks exactly `amount` voxels of soil near the ant's current column. Each iteration picks a slightly jittered column (within `±DROP_JITTER_PX`), scans downward to the first solid, and drops one pixel-grain above it. Mound height is bounded at `MOUND_TOP_LIMIT = 20` so columns at the cap are skipped.
- Volume conservation: the `amount` the ant passes in comes straight from the voxels it dug — `dropDirt` returns the actually-placed count and the ant zeros out any leftover (e.g., when every nearby column is capped).
- Ants embedded in soil above ground level (the mound interior) call `digGel` locally to dig out, instead of teleporting upward. Prevents the y=0 trap where tall mounds engulf ants. (Rescue dig volume is discarded, not added to `carryAmount`.)

## Module Structure

```
src/
├── constants.ts   grid size, pheromone coefficients, PROTECTED_DEPTH, VOXEL_SIZE (+ allowed sizes / localStorage key), body-scale pixel constants
├── state.ts       singleton state (grid, pheromones, ant array)
├── grid.ts        voxel grid manipulation: digGel, dropDirt, dropDirtInside, makeDiggable, pheromones — all return the number of voxels changed for volume-conservation
├── Ant.ts         ant behavior logic (digOneCell, wander, frustration) and rendering; tracks carryAmount in voxel units
├── debugView.ts   debug overlay (voxel grid lines gated by VOXEL_SIZE, pheromone heatmap, sensor arrows)
├── simulation.ts  render loop and layered composite rendering; initializes grids/pheromone at voxel resolution
└── main.ts        entry point and UI event wiring (incl. voxel-size selector → localStorage + reload)
```

## Tests

Two Playwright tests live in `tests/`:

| Test file | Steps | Purpose |
|---|---|---|
| `ant-nest-visual.spec.ts` | 30,000 | Verifies a nest-like structure forms (tunnels + dirt mound). Uses `claude --print` to LLM-evaluate the screenshot. |
| `ant-nest-regression.spec.ts` | 300,000 | Regression guard: asserts surface-ant mean X stays within ±100 of center, no ants stuck at y<5. |
| `ant-nest-evolution.spec.ts` | 25,000 | Captures 5 screenshots at 5k/10k/15k/20k/25k steps for time-series visual review during behavior tuning. |

Run with `npm run test:visual` (visual) or `npx playwright test <name>`. Set `APPROACH_LABEL=X` for evolution to tag screenshot filenames. `__antSimAdvance(n)` and `__antSimState` are exposed on `window` for test use.
