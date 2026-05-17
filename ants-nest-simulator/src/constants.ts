export const WIDTH = 400;
export const HEIGHT = 400;
export const DEPTH = 3;

/** Coarse voxel size, in pixels. Internal grid is logical voxels; rendering remains pixel-fine.
 *  Pure resolution dial — must divide WIDTH and HEIGHT. Other constants below are pixel-anchored
 *  to the ant's body scale, so changing VOXEL_SIZE only changes how *grainy* the grid feels:
 *  small VOXEL_SIZE → more voxels per bite (less blocky paths), large → fewer (chunkier digs).
 *  Volume-conservation (dug count = dropped count) holds automatically regardless of VOXEL_SIZE. */
export const ALLOWED_VOXEL_SIZES = [2, 4] as const;
export const VOXEL_SIZE_STORAGE_KEY = 'antSim.voxelSize';
const DEFAULT_VOXEL_SIZE = 2;

function loadInitialVoxelSize(): number {
  try {
    const stored = (globalThis as { localStorage?: Storage }).localStorage?.getItem(
      VOXEL_SIZE_STORAGE_KEY,
    );
    const n = stored ? parseInt(stored, 10) : NaN;
    if ((ALLOWED_VOXEL_SIZES as readonly number[]).includes(n)) return n;
  } catch {
    // localStorage unavailable (e.g., Node test runner) — fall through to default
  }
  return DEFAULT_VOXEL_SIZE;
}

export const VOXEL_SIZE = loadInitialVoxelSize();
export const GRID_WIDTH = WIDTH / VOXEL_SIZE;
export const GRID_HEIGHT = HEIGHT / VOXEL_SIZE;

// ─── Ant body-scale constants (pixels, independent of VOXEL_SIZE) ─────────────
// These reflect the physical ant: jaw reach, sensing range, soil-grain size, etc.
// Tune them when the ant *itself* changes scale, not when adjusting grid coarseness.

/** Radius of a single dig "bite", in pixels (≈ant mandible span). */
export const DIG_RADIUS_PX = 2.2;
/** How far in front of the ant the dig is centered, in pixels. */
export const DIG_REACH_PX = 3.0;
/** Below this grain count, debug voxel-boundary lines are skipped (too dense to read). */
export const MIN_VOXEL_SIZE_FOR_GRID_LINES = 3;

/** Ground surface Y coordinate (pixels) */
export const GROUND_LEVEL = 40;

/** Depth of the undiggable protected layer (pixels) */
export const PROTECTED_DEPTH = 6;

/** Pheromone evaporation factor per step */
export const PHEROMONE_DECAY = 0.997;

/** Pheromone deposited per step while exploring */
export const PHEROMONE_DEPOSIT_EXPLORE = 0.001;

/** Pheromone deposited per step while returning with dirt (reinforces known paths) */
export const PHEROMONE_DEPOSIT_RETURN = 0.005;
