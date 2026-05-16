# Ant Nest Simulator

A simulator where ants autonomously dig their nest using a collective-intelligence algorithm based on pheromones. Tunnels and surface mounds emerge gradually from per-step single-cell carving — there is no top-level planner.

## Overview

- Ants deposit pheromones while exploring and returning; dig direction follows the trails of others
- The grid is `WIDTH × HEIGHT × DEPTH` (400 × 400 × 3); the 3 depth layers are composited back-to-front to give a sense of depth
- All structure (tunnels, branches, surface entrances, dirt mounds) emerges from atomic 1-cell digging actions and dirt deposition — there are no multi-step burst-mode states

## UI

| Control | Description |
|---|---|
| Ant Count | Adjust number of ants (0–200) with a slider |
| Simulation Speed | Change simulation speed from 1x to 20x |
| Flatten Soil (Reset) | Reset the grid to its initial state |

## Algorithm Details

### Grid Cell Values

| Value | Meaning |
|---|---|
| `0` | Air (passable) |
| `1` | Diggable soil (gel) |
| `2` | Loose dirt deposited by ants on the surface |
| `3` | Protected zone (top `PROTECTED_DEPTH = 6` px, not diggable) |

### Pheromones

- Exploring ants deposit `PHEROMONE_DEPOSIT_EXPLORE = 0.001`
- Returning ants (carrying soil) deposit `PHEROMONE_DEPOSIT_RETURN = 0.005` (stronger trail home)
- Pheromones evaporate each step by `PHEROMONE_DECAY = 0.997`

### Digging Behavior

Digging is **per-step and atomic**. There is no `digMode` state machine — each obstacle encounter triggers a single carving action via `digOneCell()`:

1. Carve a radius-1.5 chunk of gel immediately in front of the ant
2. Edge the ant forward at `0.4 × speed`
3. With 5% probability, mark the ant as carrying dirt (`hasDirt = true`), flip 180°, and head back toward the surface to deposit

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

- `dropDirt` scans the [25, 50] y-band for any solid cell (type 1/2/3) as a landing target, so deposited dirt stacks on existing mounds instead of growing unbounded. Mound height is bounded at `MOUND_TOP_LIMIT = 20`.
- Ants embedded in type-2 (deposited dirt) below ground level call `digGel` locally to dig out, instead of teleporting upward. Prevents the y=0 trap where tall mounds engulf ants.

## Module Structure

```
src/
├── constants.ts   grid size, pheromone coefficients, PROTECTED_DEPTH, etc.
├── state.ts       singleton state (grid, pheromones, ant array)
├── grid.ts        grid manipulation: digGel, dropDirt, dropDirtInside, makeDiggable, pheromones
├── Ant.ts         ant behavior logic (digOneCell, wander, frustration) and rendering
├── simulation.ts  render loop and layered composite rendering
└── main.ts        entry point and UI event wiring
```

## Tests

Two Playwright tests live in `tests/`:

| Test file | Steps | Purpose |
|---|---|---|
| `ant-nest-visual.spec.ts` | 30,000 | Verifies a nest-like structure forms (tunnels + dirt mound). Uses `claude --print` to LLM-evaluate the screenshot. |
| `ant-nest-regression.spec.ts` | 300,000 | Regression guard: asserts surface-ant mean X stays within ±100 of center, no ants stuck at y<5. |
| `ant-nest-evolution.spec.ts` | 25,000 | Captures 5 screenshots at 5k/10k/15k/20k/25k steps for time-series visual review during behavior tuning. |

Run with `npm run test:visual` (visual) or `npx playwright test <name>`. Set `APPROACH_LABEL=X` for evolution to tag screenshot filenames. `__antSimAdvance(n)` and `__antSimState` are exposed on `window` for test use.
