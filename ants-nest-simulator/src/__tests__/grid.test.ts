import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../state';
import { WIDTH, HEIGHT, DEPTH, GROUND_LEVEL, PROTECTED_DEPTH, PHEROMONE_DECAY } from '../constants';
import {
  dirtColor,
  getGridType,
  depositPheromone,
  getPheromone,
  evaporatePheromone,
  makeDiggable,
  digGel,
  dropDirtInside,
  fillDirt,
  dropDirt,
  attemptCreateNewEntrance,
} from '../grid';

function makeGrids() {
  return Array.from({ length: DEPTH }, () =>
    Array.from({ length: HEIGHT }, () => new Uint8Array(WIDTH)),
  );
}

function makePheromone() {
  return Array.from({ length: DEPTH }, () => new Float32Array(WIDTH * HEIGHT));
}

function makeCanvasCtx(): CanvasRenderingContext2D {
  const ctx: Record<string, unknown> = {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    fillStyle: '',
    globalCompositeOperation: 'source-over',
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  state.grids = makeGrids();
  state.pheromone = makePheromone();
  state.soilCtxs = Array.from({ length: DEPTH }, makeCanvasCtx);
});

describe('dirtColor', () => {
  it('returns a string with two comma-separated numbers', () => {
    const result = dirtColor(GROUND_LEVEL);
    expect(result).toMatch(/^\d+, \d+$/);
  });

  it('returns green channel 180 at ground level', () => {
    const [g] = dirtColor(GROUND_LEVEL).split(', ').map(Number);
    expect(g).toBe(180);
  });

  it('returns green channel 120 at bottom of grid', () => {
    const [g] = dirtColor(HEIGHT).split(', ').map(Number);
    expect(g).toBe(120);
  });

  it('clamps above HEIGHT to the same as HEIGHT', () => {
    expect(dirtColor(HEIGHT + 100)).toBe(dirtColor(HEIGHT));
  });

  it('clamps below GROUND_LEVEL to the same as GROUND_LEVEL', () => {
    expect(dirtColor(GROUND_LEVEL - 10)).toBe(dirtColor(GROUND_LEVEL));
  });
});

describe('getGridType', () => {
  it('returns 0 for empty (default) cell', () => {
    expect(getGridType(0, 0, 0)).toBe(0);
  });

  it('returns the value written into grids', () => {
    state.grids[1][10][20] = 3;
    expect(getGridType(20, 10, 1)).toBe(3);
  });

  it('returns 1 (wall) for negative z', () => {
    expect(getGridType(5, 5, -1)).toBe(1);
  });

  it('returns 1 (wall) for z >= DEPTH', () => {
    expect(getGridType(5, 5, DEPTH)).toBe(1);
  });

  it('returns 1 (wall) for x < 0', () => {
    expect(getGridType(-1, 5, 0)).toBe(1);
  });

  it('returns 1 (wall) for x >= WIDTH', () => {
    expect(getGridType(WIDTH, 5, 0)).toBe(1);
  });

  it('returns 1 (wall) for y >= HEIGHT', () => {
    expect(getGridType(5, HEIGHT, 0)).toBe(1);
  });

  it('returns 0 (open) for y < 0', () => {
    expect(getGridType(5, -1, 0)).toBe(0);
  });

  it('floors fractional coordinates', () => {
    state.grids[0][3][7] = 2;
    expect(getGridType(7.9, 3.9, 0)).toBe(2);
  });
});

describe('digGel', () => {
  it('ignores out-of-bounds z', () => {
    expect(() => digGel(10, 10, -1, 3)).not.toThrow();
    expect(() => digGel(10, 10, DEPTH, 3)).not.toThrow();
  });

  it('excavates soil cells (type 1) to air (0)', () => {
    state.grids[0][10][10] = 1;
    digGel(10, 10, 0, 3);
    expect(state.grids[0][10][10]).toBe(0);
  });

  it('leaves protected cells (type 3) unchanged', () => {
    state.grids[0][10][10] = 3;
    digGel(10, 10, 0, 3);
    expect(state.grids[0][10][10]).toBe(3);
  });

  it('does not affect cells outside the radius', () => {
    const farX = 30;
    state.grids[0][10][farX] = 1;
    digGel(10, 10, 0, 3);
    expect(state.grids[0][10][farX]).toBe(1);
  });

  it('handles cells at grid boundaries where some loop positions are out-of-bounds', () => {
    // Center at (0,0) with radius=3 → some cells have y<0 or x<0 (out-of-bounds)
    state.grids[0][0][0] = 1;
    digGel(0, 0, 0, 3);
    expect(state.grids[0][0][0]).toBe(0); // center cell excavated
  });

  it('excavates multiple soil cells in the same call', () => {
    state.grids[0][10][9] = 1;
    state.grids[0][10][11] = 1;
    digGel(10, 10, 0, 5);
    expect(state.grids[0][10][9]).toBe(0);
    expect(state.grids[0][10][11]).toBe(0);
  });
});

describe('dropDirtInside', () => {
  it('ignores out-of-bounds z', () => {
    expect(() => dropDirtInside(50, GROUND_LEVEL + 10, -1)).not.toThrow();
    expect(() => dropDirtInside(50, GROUND_LEVEL + 10, DEPTH)).not.toThrow();
  });

  it('places gel (type 1) in empty cells at or below GROUND_LEVEL', () => {
    const cx = 50, cy = GROUND_LEVEL + 5;
    dropDirtInside(cx, cy, 0);
    // Center cell should be filled
    expect(state.grids[0][cy][cx]).toBe(1);
  });

  it('does not modify cells above GROUND_LEVEL', () => {
    dropDirtInside(50, GROUND_LEVEL - 10, 0);
    for (let y = 0; y < GROUND_LEVEL; y++) {
      for (let x = 0; x < WIDTH; x++) {
        expect(state.grids[0][y][x]).toBe(0);
      }
    }
  });

  it('does not overwrite non-empty cells', () => {
    const cx = 50, cy = GROUND_LEVEL + 5;
    state.grids[0][cy][cx] = 3;
    dropDirtInside(cx, cy, 0);
    expect(state.grids[0][cy][cx]).toBe(3);
  });
});

describe('fillDirt', () => {
  it('ignores out-of-bounds z', () => {
    expect(() => fillDirt(10, 10, -1, 3)).not.toThrow();
    expect(() => fillDirt(10, 10, DEPTH, 3)).not.toThrow();
  });

  it('fills empty cells in radius with soil (type 1)', () => {
    const cx = 50, cy = 50, radius = 3;
    fillDirt(cx, cy, 0, radius);
    expect(state.grids[0][cy][cx]).toBe(1);
  });

  it('does not overwrite non-empty cells', () => {
    state.grids[0][50][50] = 3;
    fillDirt(50, 50, 0, 3);
    expect(state.grids[0][50][50]).toBe(3);
  });

  it('does not modify cells outside the radius', () => {
    const cx = 50, cy = 50, radius = 1;
    fillDirt(cx, cy, 0, radius);
    // Cell at (cx+5, cy) is well outside radius=1
    expect(state.grids[0][cy][cx + 5]).toBe(0);
  });

  it('fills cells on all z layers correctly', () => {
    fillDirt(50, 50, 1, 3);
    expect(state.grids[1][50][50]).toBe(1);
    expect(state.grids[0][50][50]).toBe(0); // other z layers untouched
  });
});

describe('dropDirt', () => {
  function findSoil(z: number, yMin: number, yMax: number, xMin = 0, xMax = WIDTH): boolean {
    for (let x = xMin; x < xMax; x++) {
      for (let y = yMin; y < yMax; y++) {
        if (state.grids[z][y][x] === 1) return true;
      }
    }
    return false;
  }

  it('places soil on a type-3 protected surface at GROUND_LEVEL', () => {
    const z = 0;
    for (let x = 0; x < WIDTH; x++) {
      state.grids[z][GROUND_LEVEL][x] = 3;
    }
    dropDirt(WIDTH / 2, 0, z);
    expect(findSoil(z, GROUND_LEVEL - 6, GROUND_LEVEL)).toBe(true);
  });

  it('places soil on a type-1 soil surface at GROUND_LEVEL', () => {
    const z = 0;
    // Track which cells were pre-seeded so we can ignore them when looking for new fill.
    const preExisting = new Set<number>();
    for (let x = 0; x < WIDTH; x++) {
      state.grids[z][GROUND_LEVEL][x] = 1;
      preExisting.add(GROUND_LEVEL * WIDTH + x);
    }
    dropDirt(WIDTH / 2, 0, z);
    let foundNew = false;
    for (let x = 0; x < WIDTH; x++) {
      for (let y = GROUND_LEVEL - 6; y < GROUND_LEVEL; y++) {
        if (state.grids[z][y][x] === 1 && !preExisting.has(y * WIDTH + x)) {
          foundNew = true;
        }
      }
    }
    expect(foundNew).toBe(true);
  });

  it('discards the dirt on a fully empty grid', () => {
    const z = 0;
    dropDirt(WIDTH / 2, 0, z);
    expect(findSoil(z, 0, HEIGHT)).toBe(false);
  });

  it('discards the dirt when the only solid sits deep below the surface (looks like tunnel interior)', () => {
    const z = 0;
    const preExisting = new Set<number>();
    for (let x = 0; x < WIDTH; x++) {
      state.grids[z][HEIGHT - 1][x] = 1;
      preExisting.add((HEIGHT - 1) * WIDTH + x);
    }
    dropDirt(WIDTH / 2, 0, z);
    let foundNew = false;
    for (let x = 0; x < WIDTH; x++) {
      for (let y = 0; y < HEIGHT; y++) {
        if (state.grids[z][y][x] === 1 && !preExisting.has(y * WIDTH + x)) {
          foundNew = true;
        }
      }
    }
    expect(foundNew).toBe(false);
  });

  it('does not pile soil above the mound height cap (y < 20)', () => {
    const z = 0;
    const preExisting = new Set<number>();
    for (let x = 0; x < WIDTH; x++) {
      for (let y = 20; y < HEIGHT; y++) {
        state.grids[z][y][x] = 1;
        preExisting.add(y * WIDTH + x);
      }
    }
    dropDirt(WIDTH / 2, 0, z);
    for (let x = 0; x < WIDTH; x++) {
      for (let y = 0; y < 20; y++) {
        expect(state.grids[z][y][x]).toBe(0);
      }
    }
  });
});

describe('depositPheromone / getPheromone', () => {
  it('starts at 0', () => {
    expect(getPheromone(10, 10, 0)).toBe(0);
  });

  it('stores deposited amount', () => {
    depositPheromone(10, 10, 0, 0.5);
    expect(getPheromone(10, 10, 0)).toBeCloseTo(0.5);
  });

  it('accumulates multiple deposits', () => {
    depositPheromone(5, 5, 1, 0.3);
    depositPheromone(5, 5, 1, 0.3);
    expect(getPheromone(5, 5, 1)).toBeCloseTo(0.6);
  });

  it('clamps to 1.0', () => {
    depositPheromone(0, 0, 0, 0.8);
    depositPheromone(0, 0, 0, 0.8);
    expect(getPheromone(0, 0, 0)).toBe(1.0);
  });

  it('returns 0 for out-of-bounds z', () => {
    depositPheromone(10, 10, -1, 0.5);
    expect(getPheromone(10, 10, -1)).toBe(0);
  });

  it('returns 0 for out-of-bounds x', () => {
    expect(getPheromone(WIDTH, 10, 0)).toBe(0);
  });

  it('returns 0 for out-of-bounds y', () => {
    expect(getPheromone(10, HEIGHT, 0)).toBe(0);
    expect(getPheromone(10, -1, 0)).toBe(0);
  });

  it('deposit ignores out-of-bounds y', () => {
    depositPheromone(10, -1, 0, 0.5);
    depositPheromone(10, HEIGHT, 0, 0.5);
    // no-op; pheromone at valid cells stays 0
    expect(getPheromone(10, 0, 0)).toBe(0);
  });
});

describe('evaporatePheromone', () => {
  it('reduces concentration by PHEROMONE_DECAY per step', () => {
    depositPheromone(0, 0, 0, 1.0);
    evaporatePheromone();
    expect(getPheromone(0, 0, 0)).toBeCloseTo(PHEROMONE_DECAY);
  });

  it('leaves zero cells at zero', () => {
    evaporatePheromone();
    expect(getPheromone(5, 5, 0)).toBe(0);
  });

  it('applies decay across all z layers', () => {
    for (let z = 0; z < DEPTH; z++) depositPheromone(0, 0, z, 1.0);
    evaporatePheromone();
    for (let z = 0; z < DEPTH; z++) {
      expect(getPheromone(0, 0, z)).toBeCloseTo(PHEROMONE_DECAY);
    }
  });
});

describe('makeDiggable', () => {
  it('converts protected cells (3) to gel (1) within the width', () => {
    for (let y = GROUND_LEVEL; y < GROUND_LEVEL + 10; y++) {
      state.grids[0][y][50] = 3;
    }
    makeDiggable(50, 0, 3, 5);
    expect(getGridType(50, GROUND_LEVEL, 0)).toBe(1);
  });

  it('does not modify cells that are not type 3', () => {
    state.grids[0][GROUND_LEVEL][50] = 0;
    makeDiggable(50, 0, 3, 5);
    expect(getGridType(50, GROUND_LEVEL, 0)).toBe(0);
  });

  it('ignores out-of-bounds z', () => {
    makeDiggable(50, -1, 3, 5);
    makeDiggable(50, DEPTH, 3, 5);
  });

  it('handles width that extends outside grid boundaries', () => {
    // cx=2, width=10 → x ranges from -8 to 12; negative x are out-of-bounds
    for (let y = GROUND_LEVEL; y < GROUND_LEVEL + 10; y++) {
      for (let x = 0; x < 15; x++) state.grids[0][y][x] = 3;
    }
    makeDiggable(2, 0, 10, 5);
    // Cells at x=0 should be converted
    expect(getGridType(0, GROUND_LEVEL, 0)).toBe(1);
  });
});

describe('attemptCreateNewEntrance', () => {
  it('creates a diggable entrance when valid positions exist', () => {
    // Fill entire grid with protected cells (type 3) so all positions are valid
    for (let z = 0; z < DEPTH; z++) {
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          state.grids[z][y][x] = 3;
        }
      }
    }
    attemptCreateNewEntrance();
    // At least some cells near GROUND_LEVEL should have changed from 3 → 1
    let hasDiggable = false;
    for (let z = 0; z < DEPTH; z++) {
      for (let y = GROUND_LEVEL; y <= GROUND_LEVEL + PROTECTED_DEPTH + 2; y++) {
        for (let x = 0; x < WIDTH; x++) {
          if (state.grids[z][y][x] === 1) { hasDiggable = true; break; }
        }
        if (hasDiggable) break;
      }
      if (hasDiggable) break;
    }
    expect(hasDiggable).toBe(true);
  });

  it('does nothing when all positions have nearby openings', () => {
    // All cells near GROUND_LEVEL are air → every position has a nearby opening
    for (let z = 0; z < DEPTH; z++) {
      for (let y = GROUND_LEVEL; y <= GROUND_LEVEL + 20; y++) {
        for (let x = 0; x < WIDTH; x++) {
          state.grids[z][y][x] = 0;
        }
      }
    }
    // Should not throw
    expect(() => attemptCreateNewEntrance()).not.toThrow();
  });
});
