import {
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

/** Like `hasCardinalSoilNeighbour` but the world walls (OOB) do NOT count
 *  — only real in-bounds soil. Used to gate soil placement so a deposit
 *  cannot "stick" to the world boundary alone; it must connect to an
 *  actual existing soil voxel. Without this guard, drops near the ceiling
 *  / world edges accumulate freely because OOB-up is soil-typed for
 *  standing purposes, which would otherwise let mounds grow to the
 *  ceiling indefinitely. */
export function hasRealCardinalSoilNeighbour(vx: number, vy: number, vz: number): boolean {
  for (const [dx, dy, dz] of CARDINAL_OFFSETS) {
    const nx = vx + dx;
    const ny = vy + dy;
    const nz = vz + dz;
    if (nx < 0 || nx >= GRID_WIDTH) continue;
    if (ny < 0 || ny >= GRID_HEIGHT) continue;
    if (nz < 0 || nz >= DEPTH) continue;
    if (state.grids[nz][ny][nx] !== AIR) return true;
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

/** Returns the rgba string that matches the y-gradient applied to soil at
 *  pixel y. Used to render the voxel a carrying ant is holding so it visually
 *  matches the gradient colour it will take once placed. */
export function gradientRgbaAt(y: number): string {
  const t = Math.max(0, Math.min(1, (y - INITIAL_AIR_TOP_Y) / (HEIGHT - INITIAL_AIR_TOP_Y)));
  // Linear-interpolate between the two stops used in simulation.ts:
  //   stop 0: rgba(0, 180, 255, 0.35)
  //   stop 1: rgba(0, 120, 230, 0.45)
  const g = Math.round(180 + (120 - 180) * t);
  const b = Math.round(255 + (230 - 255) * t);
  const a = (0.35 + (0.45 - 0.35) * t).toFixed(2);
  return `rgba(0, ${g}, ${b}, ${a})`;
}

// ─── Mask painting ───────────────────────────────────────────────────────────
// Each soil voxel paints itself as a rounded rectangle whose corners are
// rounded only where both adjacent cardinal neighbours (in the same Z layer)
// are air. Where a neighbour is also soil, that side is shared with the
// neighbouring voxel and the corner stays sharp — so connected soil voxels
// form one continuous rounded polygon, and isolated voxels become near-pills.
// Stacking three transparency-blended layers gives the layered appearance.

const CORNER_RADIUS = VOXEL_SIZE * 0.5;

function paintVoxelRect(
  ctx: CanvasRenderingContext2D,
  grid: Uint8Array[],
  vx: number,
  vy: number,
): void {
  // OOB neighbours count as soil — at the world edge we want the soil to
  // butt up flat against the boundary, not rounded into nothing.
  const leftAir  = vx > 0                ? grid[vy][vx - 1] === AIR : false;
  const rightAir = vx < GRID_WIDTH - 1   ? grid[vy][vx + 1] === AIR : false;
  const upAir    = vy > 0                ? grid[vy - 1][vx] === AIR : false;
  const downAir  = vy < GRID_HEIGHT - 1  ? grid[vy + 1][vx] === AIR : false;
  const tl = upAir   && leftAir  ? CORNER_RADIUS : 0;
  const tr = upAir   && rightAir ? CORNER_RADIUS : 0;
  const br = downAir && rightAir ? CORNER_RADIUS : 0;
  const bl = downAir && leftAir  ? CORNER_RADIUS : 0;
  const px = vx * VOXEL_SIZE;
  const py = vy * VOXEL_SIZE;
  ctx.beginPath();
  ctx.roundRect(px, py, VOXEL_SIZE, VOXEL_SIZE, [tl, tr, br, bl]);
  ctx.fill();
}

export function syncSoilMaskAll(z: number): void {
  syncMaskRegion(z, 0, GRID_WIDTH - 1, 0, GRID_HEIGHT - 1);
}

/** Re-paint a single voxel's 3×3 neighbourhood. The padding catches the
 *  case where a neighbour's corner-rounding configuration also flips when
 *  this voxel toggles. */
function syncMaskVoxel(z: number, vx: number, vy: number): void {
  const pad = 1;
  syncMaskRegion(
    z,
    Math.max(0, vx - pad),
    Math.min(GRID_WIDTH - 1, vx + pad),
    Math.max(0, vy - pad),
    Math.min(GRID_HEIGHT - 1, vy + pad),
  );
}

function syncMaskRegion(
  z: number,
  loVx: number,
  hiVx: number,
  loVy: number,
  hiVy: number,
): void {
  const ctx = state.soilCtxs[z];
  if (!ctx) return;
  const x0 = loVx * VOXEL_SIZE;
  const y0 = loVy * VOXEL_SIZE;
  const w = (hiVx - loVx + 1) * VOXEL_SIZE;
  const h = (hiVy - loVy + 1) * VOXEL_SIZE;
  ctx.clearRect(x0, y0, w, h);
  ctx.fillStyle = '#fff';
  const grid = state.grids[z];
  for (let yy = loVy; yy <= hiVy; yy++) {
    const row = grid[yy];
    for (let xx = loVx; xx <= hiVx; xx++) {
      if (row[xx] > 0) paintVoxelRect(ctx, grid, xx, yy);
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
