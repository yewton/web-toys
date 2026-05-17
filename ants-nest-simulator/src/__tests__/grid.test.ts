import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../state';
import {
  WIDTH,
  HEIGHT,
  DEPTH,
  GROUND_LEVEL,
  PROTECTED_DEPTH,
  PHEROMONE_DECAY,
  VOXEL_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT,
} from '../constants';
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
    Array.from({ length: GRID_HEIGHT }, () => new Uint8Array(GRID_WIDTH)),
  );
}

function makePheromone() {
  return Array.from({ length: DEPTH }, () => new Float32Array(GRID_WIDTH * GRID_HEIGHT));
}

function makeCanvasCtx(): CanvasRenderingContext2D {
  const ctx: Record<string, unknown> = {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    clearRect: () => {},
    fillStyle: '',
    globalCompositeOperation: 'source-over',
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

/** Helpers: convert pixel → voxel for setting/reading grid cells in tests. */
const px2v = (p: number) => Math.floor(p / VOXEL_SIZE);

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

  it('returns the value written into voxel grid via pixel-coord lookup', () => {
    state.grids[1][px2v(10)][px2v(20)] = 3;
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

  it('maps fractional pixel coordinates to their voxel', () => {
    state.grids[0][px2v(3.9)][px2v(7.9)] = 2;
    expect(getGridType(7.9, 3.9, 0)).toBe(2);
  });
});

describe('digGel', () => {
  it('ignores out-of-bounds z', () => {
    expect(() => digGel(10, 10, -1, 3)).not.toThrow();
    expect(() => digGel(10, 10, DEPTH, 3)).not.toThrow();
  });

  it('excavates the voxel containing the circle center', () => {
    const cx = 40, cy = 80; // voxel (10, 20)
    state.grids[0][px2v(cy)][px2v(cx)] = 1;
    digGel(cx, cy, 0, 3);
    expect(state.grids[0][px2v(cy)][px2v(cx)]).toBe(0);
  });

  it('leaves protected voxels (type 3) unchanged', () => {
    const cx = 40, cy = 80;
    state.grids[0][px2v(cy)][px2v(cx)] = 3;
    digGel(cx, cy, 0, 3);
    expect(state.grids[0][px2v(cy)][px2v(cx)]).toBe(3);
  });

  it('does not affect voxels well outside the radius', () => {
    const far = 30; // 30 voxels away in x — well past any reasonable radius
    state.grids[0][20][far] = 1;
    digGel(40, 80, 0, 3);
    expect(state.grids[0][20][far]).toBe(1);
  });

  it('handles a circle that overflows the grid edge', () => {
    state.grids[0][0][0] = 1;
    digGel(0, 0, 0, 3);
    expect(state.grids[0][0][0]).toBe(0);
  });

  it('excavates multiple voxels for a larger radius', () => {
    const cx = 40, cy = 80;
    // Seed a 3-voxel-wide band
    for (let dvx = -2; dvx <= 2; dvx++) {
      state.grids[0][px2v(cy)][px2v(cx) + dvx] = 1;
    }
    digGel(cx, cy, 0, 8); // 2 voxels radius
    expect(state.grids[0][px2v(cy)][px2v(cx) - 1]).toBe(0);
    expect(state.grids[0][px2v(cy)][px2v(cx) + 1]).toBe(0);
  });
});

describe('dropDirtInside', () => {
  it('ignores out-of-bounds z', () => {
    expect(() => dropDirtInside(50, GROUND_LEVEL + 10, -1)).not.toThrow();
    expect(() => dropDirtInside(50, GROUND_LEVEL + 10, DEPTH)).not.toThrow();
  });

  it('places soil in empty voxels at or below GROUND_LEVEL', () => {
    const cx = 60, cy = GROUND_LEVEL + 12;
    dropDirtInside(cx, cy, 0);
    expect(state.grids[0][px2v(cy)][px2v(cx)]).toBe(1);
  });

  it('does not modify voxels above GROUND_LEVEL', () => {
    dropDirtInside(60, GROUND_LEVEL - 20, 0);
    const groundVy = Math.floor(GROUND_LEVEL / VOXEL_SIZE);
    for (let vy = 0; vy < groundVy; vy++) {
      for (let vx = 0; vx < GRID_WIDTH; vx++) {
        expect(state.grids[0][vy][vx]).toBe(0);
      }
    }
  });

  it('does not overwrite non-empty voxels', () => {
    const cx = 60, cy = GROUND_LEVEL + 12;
    state.grids[0][px2v(cy)][px2v(cx)] = 3;
    dropDirtInside(cx, cy, 0);
    expect(state.grids[0][px2v(cy)][px2v(cx)]).toBe(3);
  });
});

describe('fillDirt', () => {
  it('ignores out-of-bounds z', () => {
    expect(() => fillDirt(40, 80, -1, 3)).not.toThrow();
    expect(() => fillDirt(40, 80, DEPTH, 3)).not.toThrow();
  });

  it('fills empty voxels in radius with soil (type 1)', () => {
    const cx = 60, cy = 60;
    fillDirt(cx, cy, 0, 3);
    expect(state.grids[0][px2v(cy)][px2v(cx)]).toBe(1);
  });

  it('does not overwrite non-empty voxels', () => {
    const cx = 60, cy = 60;
    state.grids[0][px2v(cy)][px2v(cx)] = 3;
    fillDirt(cx, cy, 0, 3);
    expect(state.grids[0][px2v(cy)][px2v(cx)]).toBe(3);
  });

  it('does not modify voxels well outside the radius', () => {
    fillDirt(40, 40, 0, 1);
    // 10 voxels away
    expect(state.grids[0][10][20]).toBe(0);
  });

  it('fills voxels on the requested z layer only', () => {
    fillDirt(60, 60, 1, 3);
    expect(state.grids[1][px2v(60)][px2v(60)]).toBe(1);
    expect(state.grids[0][px2v(60)][px2v(60)]).toBe(0);
  });
});

describe('dropDirt (simplified: stack above the column the ant is on)', () => {
  function anyNewSoil(z: number, vyMin: number, vyMax: number, preExisting: Set<number>): boolean {
    for (let vy = vyMin; vy <= vyMax; vy++) {
      for (let vx = 0; vx < GRID_WIDTH; vx++) {
        if (state.grids[z][vy][vx] === 1 && !preExisting.has(vy * GRID_WIDTH + vx)) return true;
      }
    }
    return false;
  }

  it('places soil above a protected substrate at GROUND_LEVEL', () => {
    const z = 0;
    const groundVy = Math.floor(GROUND_LEVEL / VOXEL_SIZE);
    for (let vx = 0; vx < GRID_WIDTH; vx++) state.grids[z][groundVy][vx] = 3;
    const pre = new Set<number>();
    dropDirt(WIDTH / 2, 0, z, 3);
    expect(anyNewSoil(z, 0, groundVy - 1, pre)).toBe(true);
  });

  it('places soil above an existing soil surface', () => {
    const z = 0;
    const groundVy = Math.floor(GROUND_LEVEL / VOXEL_SIZE);
    const pre = new Set<number>();
    for (let vx = 0; vx < GRID_WIDTH; vx++) {
      state.grids[z][groundVy][vx] = 1;
      pre.add(groundVy * GRID_WIDTH + vx);
    }
    dropDirt(WIDTH / 2, 0, z, 3);
    expect(anyNewSoil(z, 0, groundVy - 1, pre)).toBe(true);
  });

  it('abandons the drop when there is no solid below the ant', () => {
    const z = 0;
    dropDirt(WIDTH / 2, 0, z, 5);
    let anySoil = false;
    for (let vy = 0; vy < GRID_HEIGHT; vy++) {
      for (let vx = 0; vx < GRID_WIDTH; vx++) {
        if (state.grids[z][vy][vx] !== 0) anySoil = true;
      }
    }
    expect(anySoil).toBe(false);
  });

  it('refuses to stack higher than the mound cap', () => {
    const z = 0;
    const capVy = Math.floor(20 / VOXEL_SIZE);
    for (let vy = capVy; vy < GRID_HEIGHT; vy++) {
      for (let vx = 0; vx < GRID_WIDTH; vx++) state.grids[z][vy][vx] = 1;
    }
    const before = countSoil(z);
    dropDirt(WIDTH / 2, 0, z, 10);
    const after = countSoil(z);
    expect(after).toBe(before);
  });

  it('returns 0 for non-positive amount', () => {
    expect(dropDirt(WIDTH / 2, 0, 0, 0)).toBe(0);
    expect(dropDirt(WIDTH / 2, 0, 0, -1)).toBe(0);
  });

  function countSoil(z: number): number {
    let n = 0;
    for (let vy = 0; vy < GRID_HEIGHT; vy++) {
      for (let vx = 0; vx < GRID_WIDTH; vx++) {
        if (state.grids[z][vy][vx] === 1) n++;
      }
    }
    return n;
  }
});

describe('depositPheromone / getPheromone', () => {
  it('starts at 0', () => {
    expect(getPheromone(10, 10, 0)).toBe(0);
  });

  it('stores deposited amount (voxel-quantized)', () => {
    depositPheromone(40, 40, 0, 0.5);
    expect(getPheromone(40, 40, 0)).toBeCloseTo(0.5);
  });

  it('accumulates multiple deposits in the same voxel', () => {
    depositPheromone(20, 20, 1, 0.3);
    depositPheromone(20, 20, 1, 0.3);
    expect(getPheromone(20, 20, 1)).toBeCloseTo(0.6);
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
  it('converts protected voxels (3) to gel (1) within the width', () => {
    const z = 0;
    const groundVy = Math.floor(GROUND_LEVEL / VOXEL_SIZE);
    for (let dvy = 0; dvy < 3; dvy++) {
      state.grids[z][groundVy + dvy][px2v(50)] = 3;
    }
    makeDiggable(50, z, 5, 8);
    expect(state.grids[z][groundVy][px2v(50)]).toBe(1);
  });

  it('does not modify voxels that are not type 3', () => {
    const z = 0;
    const groundVy = Math.floor(GROUND_LEVEL / VOXEL_SIZE);
    state.grids[z][groundVy][px2v(50)] = 0;
    makeDiggable(50, z, 5, 8);
    expect(state.grids[z][groundVy][px2v(50)]).toBe(0);
  });

  it('ignores out-of-bounds z', () => {
    expect(() => makeDiggable(50, -1, 5, 8)).not.toThrow();
    expect(() => makeDiggable(50, DEPTH, 5, 8)).not.toThrow();
  });

  it('handles width that extends past the grid edge', () => {
    const z = 0;
    const groundVy = Math.floor(GROUND_LEVEL / VOXEL_SIZE);
    for (let dvy = 0; dvy < 3; dvy++) {
      for (let vx = 0; vx < 6; vx++) state.grids[z][groundVy + dvy][vx] = 3;
    }
    makeDiggable(2, z, 12, 8);
    expect(state.grids[z][groundVy][0]).toBe(1);
  });
});

describe('attemptCreateNewEntrance', () => {
  it('creates a diggable entrance when valid positions exist', () => {
    for (let z = 0; z < DEPTH; z++) {
      for (let vy = 0; vy < GRID_HEIGHT; vy++) {
        for (let vx = 0; vx < GRID_WIDTH; vx++) {
          state.grids[z][vy][vx] = 3;
        }
      }
    }
    attemptCreateNewEntrance();
    const groundVy = Math.floor(GROUND_LEVEL / VOXEL_SIZE);
    const checkEnd = Math.floor((GROUND_LEVEL + PROTECTED_DEPTH + 4) / VOXEL_SIZE);
    let hasDiggable = false;
    outer: for (let z = 0; z < DEPTH; z++) {
      for (let vy = groundVy; vy <= checkEnd; vy++) {
        for (let vx = 0; vx < GRID_WIDTH; vx++) {
          if (state.grids[z][vy][vx] === 1) { hasDiggable = true; break outer; }
        }
      }
    }
    expect(hasDiggable).toBe(true);
  });

  it('does nothing when all positions have nearby openings', () => {
    for (let z = 0; z < DEPTH; z++) {
      const groundVy = Math.floor(GROUND_LEVEL / VOXEL_SIZE);
      const endVy = Math.min(GRID_HEIGHT - 1, groundVy + 6);
      for (let vy = groundVy; vy <= endVy; vy++) {
        for (let vx = 0; vx < GRID_WIDTH; vx++) {
          state.grids[z][vy][vx] = 0;
        }
      }
    }
    expect(() => attemptCreateNewEntrance()).not.toThrow();
  });
});
