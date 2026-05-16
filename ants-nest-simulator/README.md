# Ant Nest Simulator (3D)

A simulator where ants autonomously dig their nest using a collective intelligence algorithm based on pheromones.

## Overview

- Ants deposit pheromones while exploring and returning, deciding dig direction by following the trails of others
- The grid is a 3D structure of `WIDTH × HEIGHT × DEPTH` (400 × 400 × 3), composited back-to-front for rendering
- Two excavation modes — tunnel and room — switch based on depth and surrounding space density

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
| `1` | Diggable soil |
| `3` | Protected zone (not diggable) |

### Pheromones

- Exploring ants deposit `PHEROMONE_DEPOSIT_EXPLORE = 0.001`
- Returning ants (carrying soil) deposit `PHEROMONE_DEPOSIT_RETURN = 0.005` (stronger trail home)
- Pheromones evaporate each step by `PHEROMONE_DECAY = 0.999`

### Digging Logic

- **tunnel mode**: branches horizontally where pheromone concentration is high (busy areas), digs downward where it's low
- **room mode**: triggered probabilistically at dead ends deeper than 150px, excavates a wider space
- The top `PROTECTED_DEPTH = 6` px is a protected layer that cannot be dug

## Module Structure

```
src/
├── constants.ts   grid size, pheromone coefficients, and other constants
├── state.ts       singleton state (grid, pheromones, ant array)
├── grid.ts        grid manipulation functions
├── Ant.ts         ant behavior logic and rendering
├── simulation.ts  render loop and 3D composite rendering
└── main.ts        entry point and UI event wiring
```

## Tests

```bash
npm run test:visual
```

Launches a browser with Playwright, advances the simulation 30,000 steps, and captures a screenshot. Uses `claude --print` to evaluate whether an ant-nest-like structure has formed. Screenshot is saved to `tests/screenshots/ant-nest-latest.png`.
