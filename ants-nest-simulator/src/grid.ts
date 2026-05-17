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
  DROP_GRAIN_RADIUS_PX,
  DROP_JITTER_PX,
} from './constants';
import { state } from './state';

/**
 * Cell values (per voxel):
 *   0 = air
 *   1 = soil (diggable — covers both original substrate and ant-deposited material)
 *   3 = protected (not diggable; pinned topsoil)
 *
 * All public coordinates (cx, cy, radius, etc.) are in *pixels*. The grid is
 * stored at coarse voxel resolution (VOXEL_SIZE px per cell). Pixel circles
 * drawn to soilCanvases preserve a finer-than-grid silhouette so the visible
 * shape stays smooth even though the logic is coarse.
 *
 * Rendering model: soilCanvases are binary opaque-white *masks* — they encode
 * only "is there soil here?", not the color. At render time the mask is
 * composited with a shared y-gradient canvas so every soil pixel (original
 * substrate, ant redeposit, surface mound) takes the same gradient color and
 * alpha. This is what lets ant-moved soil disappear into the surroundings
 * instead of looking like a separately-colored lump.
 *
 * digGel / fillDirt / dropDirtInside all return the count of voxels they
 * changed, so callers can conserve dug material when redepositing it.
 */

const VOXEL_SIZE_PX = VOXEL_SIZE;

/** Returns the cell type at pixel (x, y, z); out-of-bounds is treated as wall (1) */
export function getGridType(x: number, y: number, z: number): number {
  if (z < 0 || z >= DEPTH) return 1;
  const vx = Math.floor(x / VOXEL_SIZE_PX);
  const vy = Math.floor(y / VOXEL_SIZE_PX);
  if (vx < 0 || vx >= GRID_WIDTH || vy >= GRID_HEIGHT) return 1;
  if (vy < 0) return 0;
  return state.grids[z][vy][vx];
}

/**
 * Iterate the voxel rect that intersects a pixel-space circle (cx, cy, r).
 * Predicate `test(vx, vy)` returns true if the voxel was actually changed;
 * the function returns the count of changed voxels. `out` (if provided) is
 * widened to the bounding box of changed voxels.
 */
function applyToVoxelCircle(
  cx: number,
  cy: number,
  radius: number,
  test: (vx: number, vy: number) => boolean,
  out?: ChangedRect,
): number {
  const minVx = Math.max(0, Math.floor((cx - radius) / VOXEL_SIZE_PX));
  const maxVx = Math.min(GRID_WIDTH - 1, Math.floor((cx + radius) / VOXEL_SIZE_PX));
  const minVy = Math.max(0, Math.floor((cy - radius) / VOXEL_SIZE_PX));
  const maxVy = Math.min(GRID_HEIGHT - 1, Math.floor((cy + radius) / VOXEL_SIZE_PX));
  const r2 = radius * radius;

  let changed = 0;
  for (let vy = minVy; vy <= maxVy; vy++) {
    const rectMinY = vy * VOXEL_SIZE_PX;
    const rectMaxY = rectMinY + VOXEL_SIZE_PX;
    for (let vx = minVx; vx <= maxVx; vx++) {
      const rectMinX = vx * VOXEL_SIZE_PX;
      const rectMaxX = rectMinX + VOXEL_SIZE_PX;
      const closestX = cx < rectMinX ? rectMinX : cx > rectMaxX ? rectMaxX : cx;
      const closestY = cy < rectMinY ? rectMinY : cy > rectMaxY ? rectMaxY : cy;
      const dx = closestX - cx;
      const dy = closestY - cy;
      if (dx * dx + dy * dy <= r2 && test(vx, vy)) {
        changed++;
        if (out) {
          if (vx < out.minVx) out.minVx = vx;
          if (vx > out.maxVx) out.maxVx = vx;
          if (vy < out.minVy) out.minVy = vy;
          if (vy > out.maxVy) out.maxVy = vy;
        }
      }
    }
  }
  return changed;
}

interface ChangedRect {
  minVx: number;
  maxVx: number;
  minVy: number;
  maxVy: number;
}
function newChangedRect(): ChangedRect {
  return { minVx: GRID_WIDTH, maxVx: -1, minVy: GRID_HEIGHT, maxVy: -1 };
}

/**
 * Rebuild the mask for the given voxel rectangle directly from the grid. This
 * keeps the mask a pure function of the grid: anti-aliased circle edges from
 * past dig/fill operations don't accumulate as a noisy speckle texture over
 * thousands of steps. The cleared/redrawn region is padded by one voxel so
 * neighbouring blob overlaps remain seamless.
 *
 * Mask is built by stamping an opaque circle for each soil voxel. The radius
 * is slightly larger than half VOXEL_SIZE so neighbouring stamps merge into a
 * smooth blob with no gaps; the visible substrate edges therefore remain
 * smoothly curved even though the underlying grid is coarse.
 */
// Per-voxel stamp radii. Each soil voxel contributes a circular blob; the
// union of overlapping blobs is the visible substrate. Below ground a tight
// stamp (just under VOXEL_SIZE) keeps tunnel silhouettes crisp; above ground
// a deliberately fat stamp lets the sparse, jitter-scattered surface-mound
// voxels merge into a single cohesive pile instead of reading as a row of
// isolated towers floating above the ground line.
const VOXEL_MASK_RADIUS = VOXEL_SIZE_PX * 0.85;
const MOUND_MASK_RADIUS = VOXEL_SIZE_PX * 1.3;
const GROUND_VY = Math.floor(GROUND_LEVEL / VOXEL_SIZE_PX);
export function syncSoilMaskAll(z: number): void {
  syncMaskRegion(z, { minVx: 0, maxVx: GRID_WIDTH - 1, minVy: 0, maxVy: GRID_HEIGHT - 1 });
}
function syncMaskRegion(z: number, rect: ChangedRect): void {
  if (rect.maxVx < rect.minVx) return;
  const ctx = state.soilCtxs[z];
  const padding = 1;
  const loVx = Math.max(0, rect.minVx - padding);
  const hiVx = Math.min(GRID_WIDTH - 1, rect.maxVx + padding);
  const loVy = Math.max(0, rect.minVy - padding);
  const hiVy = Math.min(GRID_HEIGHT - 1, rect.maxVy + padding);

  const x0 = loVx * VOXEL_SIZE_PX;
  const y0 = loVy * VOXEL_SIZE_PX;
  const w = (hiVx - loVx + 1) * VOXEL_SIZE_PX;
  const h = (hiVy - loVy + 1) * VOXEL_SIZE_PX;
  ctx.clearRect(x0, y0, w, h);

  ctx.fillStyle = '#fff';
  const grid = state.grids[z];
  for (let vy = loVy; vy <= hiVy; vy++) {
    const cy = (vy + 0.5) * VOXEL_SIZE_PX;
    const radius = vy < GROUND_VY ? MOUND_MASK_RADIUS : VOXEL_MASK_RADIUS;
    const row = grid[vy];
    for (let vx = loVx; vx <= hiVx; vx++) {
      if (row[vx] > 0) {
        const cx = (vx + 0.5) * VOXEL_SIZE_PX;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/** Excavates diggable soil (1) in a circle centered at (cx, cy). Returns dug voxel count. */
export function digGel(cx: number, cy: number, z: number, radius: number): number {
  if (z < 0 || z >= DEPTH) return 0;

  const changed = newChangedRect();
  const dug = applyToVoxelCircle(cx, cy, radius, (vx, vy) => {
    if (state.grids[z][vy][vx] === 1) {
      state.grids[z][vy][vx] = 0;
      return true;
    }
    return false;
  }, changed);

  if (dug > 0) syncMaskRegion(z, changed);
  return dug;
}

export function dirtColor(cy: number): string {
  const ratio = Math.max(0, Math.min(1, (cy - GROUND_LEVEL) / (HEIGHT - GROUND_LEVEL)));
  const g = Math.round(180 - (180 - 120) * ratio);
  const b = Math.round(255 - (255 - 230) * ratio);
  return `${g}, ${b}`;
}

/**
 * Mask fill style for soilCanvases. The mask is binary (opaque or clear); the
 * y-gradient color is applied at render time by compositing the mask with a
 * shared gradient canvas.
 */
export function soilFillStyle(): string {
  return '#fff';
}

/** Back-compat alias retained for external imports. */
export const dirtFillStyle = soilFillStyle;

/** Drops a small soil clump underground (loose fill after digging). Returns placed count. */
export function dropDirtInside(cx: number, cy: number, z: number): number {
  if (z < 0 || z >= DEPTH) return 0;
  const radius = DROP_GRAIN_RADIUS_PX * (0.8 + Math.random() * 0.4);

  const changed = newChangedRect();
  const placed = applyToVoxelCircle(cx, cy, radius, (vx, vy) => {
    if (vy * VOXEL_SIZE_PX < GROUND_LEVEL) return false;
    if (state.grids[z][vy][vx] === 0) {
      state.grids[z][vy][vx] = 1;
      return true;
    }
    return false;
  }, changed);

  if (placed > 0) syncMaskRegion(z, changed);
  return placed;
}

/** Fills empty cells with soil and paints into the unified soil canvas. Returns placed count. */
export function fillDirt(cx: number, cy: number, z: number, radius: number): number {
  if (z < 0 || z >= DEPTH) return 0;

  const changed = newChangedRect();
  const placed = applyToVoxelCircle(cx, cy, radius, (vx, vy) => {
    if (state.grids[z][vy][vx] === 0) {
      state.grids[z][vy][vx] = 1;
      return true;
    }
    return false;
  }, changed);

  if (placed > 0) syncMaskRegion(z, changed);
  return placed;
}

/** Visible mound may not pile above this Y. */
const MOUND_TOP_LIMIT = 20;

/**
 * Surface-deposit: stack `amount` voxels of soil near the ant, on top of the
 * first solid below. Each iteration picks a slightly jittered column so the
 * pile spreads laterally instead of forming a single pillar.
 *
 * Returns the number of voxels actually placed (may be less than `amount`
 * if every nearby column has hit the mound cap or run out of empty space).
 *
 * Safety: refuses to stack any higher than MOUND_TOP_LIMIT.
 */
export function dropDirt(x: number, y: number, z: number, amount: number): number {
  if (z < 0 || z >= DEPTH || amount <= 0) return 0;

  let remaining = amount;
  let attempts = 0;
  const maxAttempts = amount * 8 + 4;
  const startScanY = Math.max(0, Math.floor(y) - VOXEL_SIZE_PX);
  const edgeMargin = Math.max(VOXEL_SIZE_PX, DROP_GRAIN_RADIUS_PX);

  while (remaining > 0 && attempts < maxAttempts) {
    attempts++;
    const offset = (Math.random() - 0.5) * DROP_JITTER_PX * 2;
    const targetX = Math.max(edgeMargin, Math.min(WIDTH - edgeMargin, x + offset));

    let hitY = -1;
    for (let scanY = startScanY; scanY < HEIGHT; scanY++) {
      if (getGridType(targetX, scanY, z) > 0) { hitY = scanY; break; }
    }
    if (hitY < 0) continue;

    const placeY = hitY - DROP_GRAIN_RADIUS_PX * 0.6;
    if (placeY <= MOUND_TOP_LIMIT) continue;

    const placed = fillDirt(targetX, placeY, z, DROP_GRAIN_RADIUS_PX);
    if (placed === 0) continue;
    remaining -= placed;
  }
  return amount - remaining;
}

/** Deposits pheromone at pixel (x, y, z). Pheromone is stored per-voxel. */
export function depositPheromone(x: number, y: number, z: number, amount: number): void {
  if (z < 0 || z >= DEPTH) return;
  const vx = Math.floor(x / VOXEL_SIZE_PX);
  const vy = Math.floor(y / VOXEL_SIZE_PX);
  if (vx < 0 || vx >= GRID_WIDTH || vy < 0 || vy >= GRID_HEIGHT) return;
  const idx = vy * GRID_WIDTH + vx;
  state.pheromone[z][idx] = Math.min(1.0, state.pheromone[z][idx] + amount);
}

/** Returns the pheromone concentration at pixel (x, y, z) */
export function getPheromone(x: number, y: number, z: number): number {
  if (z < 0 || z >= DEPTH) return 0;
  const vx = Math.floor(x / VOXEL_SIZE_PX);
  const vy = Math.floor(y / VOXEL_SIZE_PX);
  if (vx < 0 || vx >= GRID_WIDTH || vy < 0 || vy >= GRID_HEIGHT) return 0;
  return state.pheromone[z][vy * GRID_WIDTH + vx];
}

/** Evaporates all pheromone by one step */
export function evaporatePheromone(): void {
  for (let z = 0; z < DEPTH; z++) {
    const ph = state.pheromone[z];
    for (let i = 0; i < ph.length; i++) {
      if (ph[i] > 0) ph[i] *= PHEROMONE_DECAY;
    }
  }
}

/** Converts part of the protected layer (3) to diggable soil (1) to open an entrance.
 *  cx, width, depth are all in pixels. */
export function makeDiggable(cx: number, z: number, width: number, depth: number): void {
  if (z < 0 || z >= DEPTH) return;

  const minVx = Math.max(0, Math.floor((cx - width) / VOXEL_SIZE_PX));
  const maxVx = Math.min(GRID_WIDTH - 1, Math.floor((cx + width) / VOXEL_SIZE_PX));
  const minVy = Math.max(0, Math.floor(GROUND_LEVEL / VOXEL_SIZE_PX));
  const maxVy = Math.min(GRID_HEIGHT - 1, Math.floor((GROUND_LEVEL + depth) / VOXEL_SIZE_PX));

  for (let vy = minVy; vy <= maxVy; vy++) {
    for (let vx = minVx; vx <= maxVx; vx++) {
      if (state.grids[z][vy][vx] === 3) state.grids[z][vy][vx] = 1;
    }
  }
}

/** Automatically generates a new entrance away from existing tunnel openings */
export function attemptCreateNewEntrance(): void {
  const margin = 25;
  const validXs: number[] = [];

  for (let x = margin; x < WIDTH - margin; x += VOXEL_SIZE_PX) {
    let hasHoleNearby = false;

    outer: for (let checkX = x - margin; checkX <= x + margin; checkX += VOXEL_SIZE_PX) {
      for (let checkY = GROUND_LEVEL; checkY <= GROUND_LEVEL + 15; checkY += VOXEL_SIZE_PX) {
        for (let z = 0; z < DEPTH; z++) {
          const t = getGridType(checkX, checkY, z);
          if (t === 0 || t === 1) {
            hasHoleNearby = true;
            break outer;
          }
        }
      }
    }

    if (!hasHoleNearby) validXs.push(x);
  }

  if (validXs.length > 0) {
    const targetX = validXs[Math.floor(Math.random() * validXs.length)];
    const targetZ = Math.floor(Math.random() * DEPTH);

    makeDiggable(targetX, targetZ, 5, PROTECTED_DEPTH + 1);
    makeDiggable(targetX, (targetZ + 1) % DEPTH, 3, PROTECTED_DEPTH + 1);
  }
}
