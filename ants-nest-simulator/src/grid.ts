import {
  WIDTH,
  HEIGHT,
  DEPTH,
  INITIAL_AIR_TOP_Y,
  PROTECTED_DEPTH,
  PHEROMONE_DECAY,
  VOXEL_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT,
} from './constants';
import { state } from './state';

/**
 * Voxel-discrete grid.
 *
 * Cell values:
 *   0 = air
 *   1 = soil (diggable; initial substrate and ant-deposited material both)
 *   3 = protected (not diggable; initial-state hint near the surface)
 *
 * All public coordinates in this module are **voxel** indices (vx, vy, vz).
 * Pixel ↔ voxel conversion is the caller's job; see `pixelToVoxel` /
 * `voxelCentrePx` for helpers. The renderer paints into a per-Z mask canvas
 * sized to (WIDTH, HEIGHT) pixels — each soil voxel stamps an opaque circle
 * so adjacent voxels merge into a smooth blob. The mask is composited at
 * render time with the shared y-gradient canvas so every soil pixel shares
 * the same depth-tint regardless of provenance.
 *
 * Out-of-bounds rule: any voxel outside [0, GRID_WIDTH) × [0, GRID_HEIGHT) ×
 * [0, DEPTH) is reported as type 3 (invisible undiggable soil). This gives
 * the front of z=0 and the back of z=DEPTH-1 the "wall" property that lets
 * ants walk along the outermost layer.
 */

export const SOIL_PROTECTED = 3;
export const SOIL_DIGGABLE = 1;
export const AIR = 0;

/** Returns the voxel value at (vx, vy, vz). OOB = SOIL_PROTECTED. */
export function getVoxel(vx: number, vy: number, vz: number): number {
  if (vz < 0 || vz >= DEPTH) return SOIL_PROTECTED;
  if (vx < 0 || vx >= GRID_WIDTH) return SOIL_PROTECTED;
  if (vy < 0 || vy >= GRID_HEIGHT) return SOIL_PROTECTED;
  return state.grids[vz][vy][vx];
}

/** True if the voxel is soil-like (non-air). OOB counts as soil. */
export function isSoil(vx: number, vy: number, vz: number): boolean {
  return getVoxel(vx, vy, vz) !== AIR;
}

/** True if the voxel is air (0). OOB is *not* air. */
export function isAir(vx: number, vy: number, vz: number): boolean {
  return getVoxel(vx, vy, vz) === AIR;
}

/** 6-cardinal-neighbour offsets, used both for "can-stand" adjacency and dig
 *  reach. Diagonals are reserved for movement candidate generation only. */
export const CARDINAL_OFFSETS: readonly [number, number, number][] = [
  [ 1, 0, 0], [-1, 0, 0],
  [ 0, 1, 0], [ 0,-1, 0],
  [ 0, 0, 1], [ 0, 0,-1],
];

/** True if the voxel has at least one soil-like 6-cardinal neighbour.
 *  An ant may only step into an air voxel that satisfies this — i.e. it
 *  must be "leaning against" a wall, not free-floating in mid-air. */
export function hasCardinalSoilNeighbour(vx: number, vy: number, vz: number): boolean {
  for (const [dx, dy, dz] of CARDINAL_OFFSETS) {
    if (isSoil(vx + dx, vy + dy, vz + dz)) return true;
  }
  return false;
}

/** Standing rule: the voxel itself is air, AND at least one cardinal
 *  neighbour is soil. This is the only constraint on ant placement. */
export function canStandAt(vx: number, vy: number, vz: number): boolean {
  if (!isAir(vx, vy, vz)) return false;
  return hasCardinalSoilNeighbour(vx, vy, vz);
}

/** Dig a single diggable-soil voxel. Returns true if the voxel was changed. */
export function digVoxel(vx: number, vy: number, vz: number): boolean {
  if (vz < 0 || vz >= DEPTH) return false;
  if (vx < 0 || vx >= GRID_WIDTH) return false;
  if (vy < 0 || vy >= GRID_HEIGHT) return false;
  if (state.grids[vz][vy][vx] !== SOIL_DIGGABLE) return false;
  state.grids[vz][vy][vx] = AIR;
  syncMaskVoxel(vz, vx, vy);
  return true;
}

/** Place a single soil voxel into air. Returns true if the voxel was changed. */
export function placeVoxel(vx: number, vy: number, vz: number): boolean {
  if (vz < 0 || vz >= DEPTH) return false;
  if (vx < 0 || vx >= GRID_WIDTH) return false;
  if (vy < 0 || vy >= GRID_HEIGHT) return false;
  if (state.grids[vz][vy][vx] !== AIR) return false;
  state.grids[vz][vy][vx] = SOIL_DIGGABLE;
  syncMaskVoxel(vz, vx, vy);
  return true;
}

/** Convert initial protected voxels (3) → diggable (1) inside a rectangle,
 *  used at init time to carve guidance entrances through the protected layer. */
export function makeDiggable(
  vxCentre: number,
  vz: number,
  vxHalfWidth: number,
  vyDepth: number,
): void {
  if (vz < 0 || vz >= DEPTH) return;
  const minVx = Math.max(0, vxCentre - vxHalfWidth);
  const maxVx = Math.min(GRID_WIDTH - 1, vxCentre + vxHalfWidth);
  const startVy = initialAirEndVy();
  const endVy = Math.min(GRID_HEIGHT - 1, startVy + vyDepth - 1);
  let changed = false;
  for (let vy = startVy; vy <= endVy; vy++) {
    for (let vx = minVx; vx <= maxVx; vx++) {
      if (state.grids[vz][vy][vx] === SOIL_PROTECTED) {
        state.grids[vz][vy][vx] = SOIL_DIGGABLE;
        changed = true;
      }
    }
  }
  if (changed) syncSoilMaskAll(vz);
}

// ─── Pheromone ───────────────────────────────────────────────────────────────

export function depositPheromone(vx: number, vy: number, vz: number, amount: number): void {
  if (vz < 0 || vz >= DEPTH) return;
  if (vx < 0 || vx >= GRID_WIDTH) return;
  if (vy < 0 || vy >= GRID_HEIGHT) return;
  const idx = vy * GRID_WIDTH + vx;
  state.pheromone[vz][idx] = Math.min(1.0, state.pheromone[vz][idx] + amount);
}

export function getPheromone(vx: number, vy: number, vz: number): number {
  if (vz < 0 || vz >= DEPTH) return 0;
  if (vx < 0 || vx >= GRID_WIDTH) return 0;
  if (vy < 0 || vy >= GRID_HEIGHT) return 0;
  return state.pheromone[vz][vy * GRID_WIDTH + vx];
}

export function evaporatePheromone(): void {
  for (let z = 0; z < DEPTH; z++) {
    const ph = state.pheromone[z];
    for (let i = 0; i < ph.length; i++) {
      if (ph[i] > 0) ph[i] *= PHEROMONE_DECAY;
    }
  }
}

// ─── Pixel/voxel helpers ─────────────────────────────────────────────────────

export function pixelToVoxel(px: number): number {
  return Math.floor(px / VOXEL_SIZE);
}

export function voxelCentrePx(v: number): number {
  return (v + 0.5) * VOXEL_SIZE;
}

// ─── Mask painting ───────────────────────────────────────────────────────────
// Each soil voxel paints itself as an opaque circle. Overlapping circles merge
// into a smooth blob, so the visible substrate stays curved even though the
// underlying grid is coarse.

const VOXEL_MASK_RADIUS = VOXEL_SIZE * 0.85;

export function syncSoilMaskAll(z: number): void {
  const ctx = state.soilCtxs[z];
  if (!ctx) return;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#fff';
  const grid = state.grids[z];
  for (let vy = 0; vy < GRID_HEIGHT; vy++) {
    const cy = voxelCentrePx(vy);
    const row = grid[vy];
    for (let vx = 0; vx < GRID_WIDTH; vx++) {
      if (row[vx] > 0) {
        const cx = voxelCentrePx(vx);
        ctx.beginPath();
        ctx.arc(cx, cy, VOXEL_MASK_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/** Re-paint a single voxel's neighbourhood after a dig/place. We clear a
 *  small rect and re-stamp the surrounding 3×3 voxels so adjacent overlaps
 *  remain seamless. */
function syncMaskVoxel(z: number, vx: number, vy: number): void {
  const ctx = state.soilCtxs[z];
  if (!ctx) return;
  const pad = 1;
  const loVx = Math.max(0, vx - pad);
  const hiVx = Math.min(GRID_WIDTH - 1, vx + pad);
  const loVy = Math.max(0, vy - pad);
  const hiVy = Math.min(GRID_HEIGHT - 1, vy + pad);
  const x0 = loVx * VOXEL_SIZE;
  const y0 = loVy * VOXEL_SIZE;
  const w = (hiVx - loVx + 1) * VOXEL_SIZE;
  const h = (hiVy - loVy + 1) * VOXEL_SIZE;
  ctx.clearRect(x0, y0, w, h);
  ctx.fillStyle = '#fff';
  const grid = state.grids[z];
  for (let yy = loVy; yy <= hiVy; yy++) {
    const cy = voxelCentrePx(yy);
    const row = grid[yy];
    for (let xx = loVx; xx <= hiVx; xx++) {
      if (row[xx] > 0) {
        const cx = voxelCentrePx(xx);
        ctx.beginPath();
        ctx.arc(cx, cy, VOXEL_MASK_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ─── Initial-state setup helpers ─────────────────────────────────────────────

/** Voxel y at which the initial air region ends (i.e. first soil voxel row). */
export function initialAirEndVy(): number {
  return Math.floor(INITIAL_AIR_TOP_Y / VOXEL_SIZE);
}

/** Voxel y at which the protected layer ends and free diggable soil begins. */
export function initialProtectedEndVy(): number {
  return Math.floor((INITIAL_AIR_TOP_Y + PROTECTED_DEPTH) / VOXEL_SIZE);
}
