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
  DIG_RADIUS_PX,
} from './constants';
import { state } from './state';

/**
 * Cell values (per voxel):
 *   0 = air
 *   1 = soil (diggable — covers both original substrate and ant-deposited material)
 *   3 = protected (not diggable; pinned topsoil)
 *
 * All public coordinates (cx, cy, radius, etc.) are in *pixels*. The grid is
 * stored at coarse voxel resolution (VOXEL_SIZE px per cell).
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
 * the function returns the count of changed voxels.
 */
function applyToVoxelCircle(
  cx: number,
  cy: number,
  radius: number,
  test: (vx: number, vy: number) => boolean,
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
      }
    }
  }
  return changed;
}

/**
 * Synchronizes a region of the soilCanvas mask with the underlying grid data.
 * Redraws a slightly padded area to ensure fringes are clean.
 */
function syncRegionToCanvas(z: number, minVx: number, minVy: number, maxVx: number, maxVy: number): void {
  const ctx = state.soilCtxs[z];
  const padding = 1;
  const radius = VOXEL_SIZE_PX * 0.75; // Balanced overlap for smooth but narrow paths

  const clearX = Math.max(0, (minVx - padding) * VOXEL_SIZE_PX);
  const clearY = Math.max(0, (minVy - padding) * VOXEL_SIZE_PX);
  const clearW = (maxVx - minVx + padding * 2 + 1) * VOXEL_SIZE_PX;
  const clearH = (maxVy - minVy + padding * 2 + 1) * VOXEL_SIZE_PX;
  ctx.clearRect(clearX, clearY, clearW, clearH);

  ctx.fillStyle = 'white';
  for (let vy = Math.max(0, minVy - padding); vy <= Math.min(GRID_HEIGHT - 1, maxVy + padding); vy++) {
    for (let vx = Math.max(0, minVx - padding); vx <= Math.min(GRID_WIDTH - 1, maxVx + padding); vx++) {
      if (state.grids[z][vy][vx] > 0) {
        ctx.beginPath();
        ctx.arc(
          vx * VOXEL_SIZE_PX + VOXEL_SIZE_PX / 2,
          vy * VOXEL_SIZE_PX + VOXEL_SIZE_PX / 2,
          radius, 0, Math.PI * 2
        );
        ctx.fill();
      }
    }
  }
}

/** Excavates diggable soil (1) in a circle centered at (cx, cy). Returns dug voxel count. */
export function digGel(cx: number, cy: number, z: number, radius: number): number {
  if (z < 0 || z >= DEPTH) return 0;

  let minVx = GRID_WIDTH, maxVx = 0, minVy = GRID_HEIGHT, maxVy = 0;
  const r2 = radius * radius;

  const dug = applyToVoxelCircle(cx, cy, radius, (vx, vy) => {
    // Strict center-point test to keep tunnels narrow (Fine-look)
    const dx = (vx + 0.5) * VOXEL_SIZE_PX - cx;
    const dy = (vy + 0.5) * VOXEL_SIZE_PX - cy;

    if (dx * dx + dy * dy <= r2 && state.grids[z][vy][vx] === 1) {
      state.grids[z][vy][vx] = 0;
      minVx = Math.min(minVx, vx); maxVx = Math.max(maxVx, vx);
      minVy = Math.min(minVy, vy); maxVy = Math.max(maxVy, vy);
      return true;
    }
    return false;
  });

  if (dug > 0) syncRegionToCanvas(z, minVx, minVy, maxVx, maxVy);
  return dug;
}

export function dirtColor(cy: number): string {
  const ratio = Math.max(0, Math.min(1, (cy - GROUND_LEVEL) / (HEIGHT - GROUND_LEVEL)));
  const g = Math.round(180 - (180 - 120) * ratio);
  const b = Math.round(255 - (255 - 230) * ratio);
  return `${g}, ${b}`;
}

/**
 * Soil fill color used for drawing into the mask canvas.
 * Since we use a mask-based approach, this is always solid white.
 */
export function soilFillStyle(): string {
  return 'white';
}

/** Back-compat alias retained for external imports; same as soilFillStyle. */
export const dirtFillStyle = soilFillStyle;

/** Drops a mouthful of soil underground. Returns placed count. */
export function dropDirtInside(cx: number, cy: number, z: number): number {
  if (z < 0 || z >= DEPTH) return 0;

  let minVx = GRID_WIDTH, maxVx = 0, minVy = GRID_HEIGHT, maxVy = 0;
  const radius = DIG_RADIUS_PX;
  const r2 = radius * radius;

  const placed = applyToVoxelCircle(cx, cy, radius, (vx, vy) => {
    if (vy * VOXEL_SIZE_PX < GROUND_LEVEL) return false;
    const dx = (vx + 0.5) * VOXEL_SIZE_PX - cx;
    const dy = (vy + 0.5) * VOXEL_SIZE_PX - cy;

    if (dx * dx + dy * dy <= r2 && state.grids[z][vy][vx] === 0) {
      state.grids[z][vy][vx] = 1;
      minVx = Math.min(minVx, vx); maxVx = Math.max(maxVx, vx);
      minVy = Math.min(minVy, vy); maxVy = Math.max(maxVy, vy);
      return true;
    }
    return false;
  });

  if (placed > 0) syncRegionToCanvas(z, minVx, minVy, maxVx, maxVy);
  return placed;
}

/** Fills empty cells with soil and paints into the mask canvas. Returns placed count. */
export function fillDirt(cx: number, cy: number, z: number, radius: number): number {
  if (z < 0 || z >= DEPTH) return 0;

  let minVx = GRID_WIDTH, maxVx = 0, minVy = GRID_HEIGHT, maxVy = 0;
  const r2 = radius * radius;

  const placed = applyToVoxelCircle(cx, cy, radius, (vx, vy) => {
    const dx = (vx + 0.5) * VOXEL_SIZE_PX - cx;
    const dy = (vy + 0.5) * VOXEL_SIZE_PX - cy;

    if (dx * dx + dy * dy <= r2 && state.grids[z][vy][vx] === 0) {
      state.grids[z][vy][vx] = 1;
      minVx = Math.min(minVx, vx); maxVx = Math.max(maxVx, vx);
      minVy = Math.min(minVy, vy); maxVy = Math.max(maxVy, vy);
      return true;
    }
    return false;
  });

  if (placed > 0) syncRegionToCanvas(z, minVx, minVy, maxVx, maxVy);
  return placed;
}

/** Visible mound may not pile above this Y. */
const MOUND_TOP_LIMIT = 20;

/**
 * Surface-deposit: place soil on top of the first solid below.
 * Repeat until the given amount (voxel count) is satisfied.
 */
export function dropDirt(x: number, y: number, z: number, amount: number): number {
  if (z < 0 || z >= DEPTH || amount <= 0) return 0;

  let remaining = amount;
  let attempts = 0;
  const maxAttempts = amount * 8 + 4;
  const startScanY = Math.max(0, Math.floor(y) - VOXEL_SIZE_PX);
  const radius = DIG_RADIUS_PX;
  const jitter = 6.0;

  while (remaining > 0 && attempts < maxAttempts) {
    attempts++;
    const offset = (Math.random() - 0.5) * jitter * 2;
    const targetX = Math.max(VOXEL_SIZE_PX, Math.min(WIDTH - VOXEL_SIZE_PX, x + offset));

    let hitY = -1;
    for (let scanY = startScanY; scanY < HEIGHT; scanY++) {
      if (getGridType(targetX, scanY, z) > 0) { hitY = scanY; break; }
    }
    if (hitY < 0) continue;

    // Center the circle so it overlaps with the surface hit
    const placeY = hitY - radius * 0.8;
    if (placeY <= MOUND_TOP_LIMIT) continue;

    const placed = fillDirt(targetX, placeY, z, radius);
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

/** Excavates a small rectangle of soil to create an entrance by making it diggable.
 *  cx, width, depth are all in pixels. */
export function openEntrance(cx: number, z: number, width: number, depth: number): void {
  if (z < 0 || z >= DEPTH) return;

  const minVx = Math.max(0, Math.floor((cx - width) / VOXEL_SIZE_PX));
  const maxVx = Math.min(GRID_WIDTH - 1, Math.floor((cx + width) / VOXEL_SIZE_PX));
  const minVy = Math.max(0, Math.floor(GROUND_LEVEL / VOXEL_SIZE_PX));
  const maxVy = Math.min(GRID_HEIGHT - 1, Math.floor((GROUND_LEVEL + depth) / VOXEL_SIZE_PX));

  const ctx = state.soilCtxs[z];
  ctx.fillStyle = 'white';
  for (let vy = minVy; vy <= maxVy; vy++) {
    for (let vx = minVx; vx <= maxVx; vx++) {
      if (state.grids[z][vy][vx] === 3) {
        state.grids[z][vy][vx] = 1;
        ctx.fillRect(vx, vy, 1, 1);
      }
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

    openEntrance(targetX, targetZ, 5, PROTECTED_DEPTH + 1);
    openEntrance(targetX, (targetZ + 1) % DEPTH, 3, PROTECTED_DEPTH + 1);
  }
}
/**
 * Simple settling logic: loose soil (Type 1) above ground level falls down or slides.
 */
export function settleSoil(): void {
  for (let z = 0; z < DEPTH; z++) {
    const grid = state.grids[z];
    const groundVy = Math.floor(GROUND_LEVEL / VOXEL_SIZE);

    for (let vy = groundVy - 1; vy >= 0; vy--) {
      const startVx = Math.random() < 0.5 ? 0 : GRID_WIDTH - 1;
      const endVx = startVx === 0 ? GRID_WIDTH : -1;
      const stepVx = startVx === 0 ? 1 : -1;

      for (let vx = startVx; vx !== endVx; vx += stepVx) {
        if (grid[vy][vx] === 1) {
          let targetX = vx;
          let targetY = vy + 1;

          if (grid[targetY][vx] === 0) {
            // Straight down
          } else {
            const canLeft = vx > 0 && grid[targetY][vx - 1] === 0;
            const canRight = vx < GRID_WIDTH - 1 && grid[targetY][vx + 1] === 0;
            if (canLeft && canRight) targetX = vx + (Math.random() < 0.5 ? -1 : 1);
            else if (canLeft) targetX = vx - 1;
            else if (canRight) targetX = vx + 1;
            else continue;
          }

          grid[vy][vx] = 0;
          grid[targetY][targetX] = 1;
          syncRegionToCanvas(z, Math.min(vx, targetX), vy, Math.max(vx, targetX), targetY);
        }
      }
    }
  }
}

