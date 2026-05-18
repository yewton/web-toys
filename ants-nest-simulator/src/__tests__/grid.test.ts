import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../state';
import {
  DEPTH,
  PHEROMONE_DECAY,
  GRID_WIDTH,
  GRID_HEIGHT,
} from '../constants';
import {
  AIR,
  SOIL_DIGGABLE,
  SOIL_PROTECTED,
  CARDINAL_OFFSETS,
  getVoxel,
  isAir,
  isSoil,
  hasCardinalSoilNeighbour,
  canStandAt,
  digVoxel,
  placeVoxel,
  depositPheromone,
  getPheromone,
  evaporatePheromone,
  makeDiggable,
  initialAirEndVy,
  initialProtectedEndVy,
  pixelToVoxel,
  voxelCentrePx,
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
    roundRect: () => {},
    fill: () => {},
    clearRect: () => {},
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

describe('getVoxel', () => {
  it('returns AIR for an unset cell', () => {
    expect(getVoxel(0, 0, 0)).toBe(AIR);
  });

  it('returns the value stored in the grid', () => {
    state.grids[1][10][20] = SOIL_PROTECTED;
    expect(getVoxel(20, 10, 1)).toBe(SOIL_PROTECTED);
  });

  it('reports out-of-bounds Z as undiggable soil (3)', () => {
    expect(getVoxel(5, 5, -1)).toBe(SOIL_PROTECTED);
    expect(getVoxel(5, 5, DEPTH)).toBe(SOIL_PROTECTED);
  });

  it('reports out-of-bounds X/Y as undiggable soil (3)', () => {
    expect(getVoxel(-1, 0, 0)).toBe(SOIL_PROTECTED);
    expect(getVoxel(GRID_WIDTH, 0, 0)).toBe(SOIL_PROTECTED);
    expect(getVoxel(0, -1, 0)).toBe(SOIL_PROTECTED);
    expect(getVoxel(0, GRID_HEIGHT, 0)).toBe(SOIL_PROTECTED);
  });
});

describe('isAir / isSoil', () => {
  it('isAir is true only for AIR; OOB is not air', () => {
    expect(isAir(0, 0, 0)).toBe(true);
    state.grids[0][0][0] = SOIL_DIGGABLE;
    expect(isAir(0, 0, 0)).toBe(false);
    expect(isAir(-1, 0, 0)).toBe(false);
  });

  it('isSoil is the inverse of isAir for in-bounds voxels and true for OOB', () => {
    expect(isSoil(0, 0, 0)).toBe(false);
    state.grids[0][0][0] = SOIL_DIGGABLE;
    expect(isSoil(0, 0, 0)).toBe(true);
    expect(isSoil(-1, 0, 0)).toBe(true);
  });
});

describe('hasCardinalSoilNeighbour / canStandAt', () => {
  it('an isolated air voxel surrounded by air has no soil neighbour', () => {
    expect(hasCardinalSoilNeighbour(50, 50, 1)).toBe(false);
  });

  it('an air voxel adjacent to a soil voxel is stand-valid', () => {
    state.grids[0][10][10] = SOIL_DIGGABLE;
    expect(canStandAt(11, 10, 0)).toBe(true);
  });

  it('air voxels at the world edge are stand-valid because OOB counts as soil', () => {
    expect(canStandAt(0, 0, 0)).toBe(true);
    expect(canStandAt(GRID_WIDTH - 1, GRID_HEIGHT - 1, 0)).toBe(true);
  });

  it('canStandAt is false for a soil voxel itself', () => {
    state.grids[0][10][10] = SOIL_DIGGABLE;
    expect(canStandAt(10, 10, 0)).toBe(false);
  });

  it('OOB voxels can never be stood in (they are soil-typed)', () => {
    expect(canStandAt(-1, 0, 0)).toBe(false);
  });

  it('all 6 cardinal offsets are unit cardinal vectors', () => {
    expect(CARDINAL_OFFSETS).toHaveLength(6);
    for (const [dx, dy, dz] of CARDINAL_OFFSETS) {
      expect(Math.abs(dx) + Math.abs(dy) + Math.abs(dz)).toBe(1);
    }
  });
});

describe('digVoxel', () => {
  it('removes a diggable soil voxel and returns true', () => {
    state.grids[0][10][10] = SOIL_DIGGABLE;
    expect(digVoxel(10, 10, 0)).toBe(true);
    expect(state.grids[0][10][10]).toBe(AIR);
  });

  it('does not touch protected voxels and returns false', () => {
    state.grids[0][10][10] = SOIL_PROTECTED;
    expect(digVoxel(10, 10, 0)).toBe(false);
    expect(state.grids[0][10][10]).toBe(SOIL_PROTECTED);
  });

  it('does nothing when the voxel is already air', () => {
    expect(digVoxel(10, 10, 0)).toBe(false);
  });

  it('ignores out-of-bounds coordinates', () => {
    expect(digVoxel(-1, 0, 0)).toBe(false);
    expect(digVoxel(0, 0, -1)).toBe(false);
    expect(digVoxel(GRID_WIDTH, 0, 0)).toBe(false);
  });
});

describe('placeVoxel', () => {
  it('fills an air voxel with diggable soil and returns true', () => {
    expect(placeVoxel(10, 10, 0)).toBe(true);
    expect(state.grids[0][10][10]).toBe(SOIL_DIGGABLE);
  });

  it('does not overwrite a non-air voxel', () => {
    state.grids[0][10][10] = SOIL_PROTECTED;
    expect(placeVoxel(10, 10, 0)).toBe(false);
    expect(state.grids[0][10][10]).toBe(SOIL_PROTECTED);
  });

  it('ignores out-of-bounds coordinates', () => {
    expect(placeVoxel(-1, 0, 0)).toBe(false);
    expect(placeVoxel(0, 0, DEPTH)).toBe(false);
  });

  it('round-trips with digVoxel (volume conservation invariant)', () => {
    state.grids[0][10][10] = SOIL_DIGGABLE;
    expect(digVoxel(10, 10, 0)).toBe(true);
    expect(placeVoxel(10, 10, 0)).toBe(true);
    expect(state.grids[0][10][10]).toBe(SOIL_DIGGABLE);
  });
});

describe('makeDiggable', () => {
  it('converts protected voxels in the targeted rectangle to diggable', () => {
    const z = 0;
    const startVy = initialAirEndVy();
    for (let dvy = 0; dvy < 3; dvy++) {
      state.grids[z][startVy + dvy][20] = SOIL_PROTECTED;
    }
    makeDiggable(20, z, 1, 3);
    expect(state.grids[z][startVy][20]).toBe(SOIL_DIGGABLE);
  });

  it('leaves cells that are not protected unchanged', () => {
    const z = 0;
    const startVy = initialAirEndVy();
    state.grids[z][startVy][20] = SOIL_DIGGABLE;
    makeDiggable(20, z, 1, 1);
    expect(state.grids[z][startVy][20]).toBe(SOIL_DIGGABLE);
  });

  it('ignores out-of-bounds z without throwing', () => {
    expect(() => makeDiggable(20, -1, 1, 1)).not.toThrow();
    expect(() => makeDiggable(20, DEPTH, 1, 1)).not.toThrow();
  });
});

describe('depositPheromone / getPheromone', () => {
  it('starts at 0', () => {
    expect(getPheromone(10, 10, 0)).toBe(0);
  });

  it('stores deposited amount', () => {
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

  it('returns 0 for out-of-bounds queries', () => {
    expect(getPheromone(10, 10, -1)).toBe(0);
    expect(getPheromone(-1, 10, 0)).toBe(0);
    expect(getPheromone(10, -1, 0)).toBe(0);
    expect(getPheromone(GRID_WIDTH, 10, 0)).toBe(0);
    expect(getPheromone(10, GRID_HEIGHT, 0)).toBe(0);
  });

  it('deposit silently ignores out-of-bounds coordinates', () => {
    depositPheromone(10, -1, 0, 0.5);
    depositPheromone(10, GRID_HEIGHT, 0, 0.5);
    depositPheromone(10, 10, -1, 0.5);
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

describe('pixel/voxel helpers', () => {
  it('pixelToVoxel rounds down by VOXEL_SIZE', () => {
    expect(pixelToVoxel(0)).toBe(0);
    expect(pixelToVoxel(3.9)).toBe(0);
    expect(pixelToVoxel(4)).toBe(1);
  });

  it('voxelCentrePx returns the centre of the voxel rectangle', () => {
    expect(voxelCentrePx(0)).toBe(2);
    expect(voxelCentrePx(10)).toBe(42);
  });
});

describe('initial-state helpers', () => {
  it('protectedEndVy is strictly after airEndVy', () => {
    expect(initialProtectedEndVy()).toBeGreaterThan(initialAirEndVy());
  });
});
