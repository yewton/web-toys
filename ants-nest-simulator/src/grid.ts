import { WIDTH, HEIGHT, DEPTH, GROUND_LEVEL, PROTECTED_DEPTH, PHEROMONE_DECAY } from './constants';
import { state } from './state';

/** Returns the cell type at (x, y, z); out-of-bounds is treated as wall (1) */
export function getGridType(x: number, y: number, z: number): number {
  if (z < 0 || z >= DEPTH) return 1;
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  if (gx < 0 || gx >= WIDTH || gy >= HEIGHT) return 1;
  if (gy < 0) return 0;
  return state.grids[z][gy][gx];
}

/** Excavates gel (1) or dirt (2) in a circle centered at (cx, cy) */
export function digGel(cx: number, cy: number, z: number, radius: number): void {
  if (z < 0 || z >= DEPTH) return;

  let dugGel = false;
  let dugDirt = false;

  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if (y >= 0 && y < HEIGHT && x >= 0 && x < WIDTH) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
          if (state.grids[z][y][x] === 1) {
            state.grids[z][y][x] = 0;
            dugGel = true;
          } else if (state.grids[z][y][x] === 2) {
            state.grids[z][y][x] = 0;
            dugDirt = true;
          }
        }
      }
    }
  }

  if (dugGel) {
    const gCtx = state.gelCtxs[z];
    gCtx.save();
    gCtx.globalCompositeOperation = 'destination-out';
    gCtx.beginPath();
    gCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    gCtx.fill();
    gCtx.restore();
  }
  if (dugDirt) {
    const dCtx = state.dirtCtxs[z];
    dCtx.save();
    dCtx.globalCompositeOperation = 'destination-out';
    dCtx.beginPath();
    dCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    dCtx.fill();
    dCtx.restore();
  }
}

export function dirtColor(cy: number): string {
  const ratio = Math.max(0, Math.min(1, (cy - GROUND_LEVEL) / (HEIGHT - GROUND_LEVEL)));
  const g = Math.round(180 - (180 - 120) * ratio);
  const b = Math.round(255 - (255 - 230) * ratio);
  return `${g}, ${b}`;
}

/** Drops a small dirt clump underground (simulates loose fill after digging) */
export function dropDirtInside(cx: number, cy: number, z: number): void {
  if (z < 0 || z >= DEPTH) return;
  const radius = 1.5 + Math.random();

  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if (y >= GROUND_LEVEL && y < HEIGHT && x >= 0 && x < WIDTH) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
          if (state.grids[z][y][x] === 0) {
            state.grids[z][y][x] = 1;
          }
        }
      }
    }
  }

  const gb = dirtColor(cy);
  const gCtx = state.gelCtxs[z];
  gCtx.save();
  gCtx.globalCompositeOperation = 'source-over';
  gCtx.fillStyle = `rgba(0, ${gb}, 0.8)`;
  gCtx.beginPath();
  gCtx.arc(cx, cy, radius, 0, Math.PI * 2);
  gCtx.fill();
  gCtx.restore();
}

/** Fills empty cells with dirt (2) and updates the render layer */
export function fillDirt(cx: number, cy: number, z: number, radius: number): void {
  if (z < 0 || z >= DEPTH) return;

  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if (y >= 0 && y < HEIGHT && x >= 0 && x < WIDTH) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
          if (state.grids[z][y][x] === 0) {
            state.grids[z][y][x] = 2;
          }
        }
      }
    }
  }

  const gb = dirtColor(cy);
  const dCtx = state.dirtCtxs[z];
  dCtx.fillStyle = `rgba(0, ${gb}, 0.6)`;
  dCtx.beginPath();
  dCtx.arc(cx, cy, radius, 0, Math.PI * 2);
  dCtx.fill();
}

/** Visible mound may not appear above this Y. Leaves y=0..MOUND_TOP_LIMIT clear for surface ants. */
const MOUND_TOP_LIMIT = 20;
/** Earliest scanY allowed; fillDirt drops at scanY-1.5 with radius up to 3.5, so scanY must clear MOUND_TOP_LIMIT+5. */
const MOUND_MIN_SCAN_Y = MOUND_TOP_LIMIT + 5;
/** Reject scans that fall deep below the surface — those are tunnel interiors, not the surface edge. */
const MOUND_MAX_SCAN_Y = GROUND_LEVEL + 10;

/** Drops ant-carried dirt near the surface. Skips the drop if all candidate columns have piled past the cap. */
export function dropDirt(x: number, y: number, z: number): void {
  let dropX = x;
  let targetY = -1;

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidateX = Math.max(2, Math.min(WIDTH - 2, x + (Math.random() - 0.5) * 60));

    let scanY = Math.floor(y);
    let hitType = 0;
    for (; scanY < HEIGHT; scanY++) {
      hitType = getGridType(candidateX, scanY, z);
      if (hitType > 0) break;
    }

    // Accept any solid (gel/dirt/protected) at the surface edge; reject deep hits (tunnel interior).
    if (hitType > 0 && scanY >= MOUND_MIN_SCAN_Y && scanY <= MOUND_MAX_SCAN_Y) {
      dropX = candidateX;
      targetY = scanY;
      break;
    }
  }

  if (targetY < 0) return; // No valid surface column found — discard the dirt.

  const dropY = targetY - 1.5;
  const radius = 2 + Math.random() * 1.5;
  fillDirt(dropX, dropY, z, radius);
}

/** Deposits pheromone at (x, y, z) */
export function depositPheromone(x: number, y: number, z: number, amount: number): void {
  if (z < 0 || z >= DEPTH) return;
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  if (gx < 0 || gx >= WIDTH || gy < 0 || gy >= HEIGHT) return;
  const idx = gy * WIDTH + gx;
  state.pheromone[z][idx] = Math.min(1.0, state.pheromone[z][idx] + amount);
}

/** Returns the pheromone concentration at (x, y, z) */
export function getPheromone(x: number, y: number, z: number): number {
  if (z < 0 || z >= DEPTH) return 0;
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  if (gx < 0 || gx >= WIDTH || gy < 0 || gy >= HEIGHT) return 0;
  return state.pheromone[z][gy * WIDTH + gx];
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

/** Converts part of the protected layer (3) to diggable gel (1) to open an entrance */
export function makeDiggable(cx: number, z: number, width: number, depth: number): void {
  if (z < 0 || z >= DEPTH) return;

  for (let y = GROUND_LEVEL; y <= GROUND_LEVEL + depth; y++) {
    for (let x = Math.floor(cx - width); x <= Math.ceil(cx + width); x++) {
      if (y >= 0 && y < HEIGHT && x >= 0 && x < WIDTH) {
        if (state.grids[z][y][x] === 3) {
          state.grids[z][y][x] = 1;
        }
      }
    }
  }
}

/** Automatically generates a new entrance away from existing tunnel openings */
export function attemptCreateNewEntrance(): void {
  const margin = 25;
  const validXs: number[] = [];

  for (let x = margin; x < WIDTH - margin; x += 5) {
    let hasHoleNearby = false;

    outer: for (let checkX = x - margin; checkX <= x + margin; checkX++) {
      for (let checkY = GROUND_LEVEL; checkY <= GROUND_LEVEL + 15; checkY++) {
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
