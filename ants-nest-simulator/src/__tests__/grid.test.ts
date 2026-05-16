import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../state';
import { WIDTH, HEIGHT, DEPTH, GROUND_LEVEL, PHEROMONE_DECAY } from '../constants';
import {
  dirtColor,
  getGridType,
  depositPheromone,
  getPheromone,
  evaporatePheromone,
  makeDiggable,
} from '../grid';

function makeGrids() {
  return Array.from({ length: DEPTH }, () =>
    Array.from({ length: HEIGHT }, () => new Uint8Array(WIDTH)),
  );
}

function makePheromone() {
  return Array.from({ length: DEPTH }, () => new Float32Array(WIDTH * HEIGHT));
}

beforeEach(() => {
  state.grids = makeGrids();
  state.pheromone = makePheromone();
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
});
