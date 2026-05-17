import {
  WIDTH,
  HEIGHT,
  DEPTH,
  INITIAL_AIR_TOP_Y,
  GRID_WIDTH,
  GRID_HEIGHT,
} from './constants';
import { state } from './state';
import { Ant } from './Ant';
import {
  SOIL_DIGGABLE,
  SOIL_PROTECTED,
  canStandAt,
  digVoxel,
  evaporatePheromone,
  initialAirEndVy,
  initialProtectedEndVy,
  makeDiggable,
  syncSoilMaskAll,
} from './grid';
import { drawDebugFrame, drawDebugOverlay } from './debugView';

let _ctx: CanvasRenderingContext2D | null = null;

function physicsStep(): void {
  for (const ant of state.ants) ant.update();
  evaporatePheromone();
}

function renderNormal(ctx: CanvasRenderingContext2D): void {
  const antsByZ: Ant[][] = Array.from({ length: DEPTH }, () => []);
  for (const ant of state.ants) antsByZ[ant.vz].push(ant);

  const { gradientCanvas, compositeCanvas, compositeCtx } = state;

  for (let z = 0; z < DEPTH; z++) {
    if (gradientCanvas && compositeCanvas && compositeCtx) {
      compositeCtx.globalCompositeOperation = 'source-over';
      compositeCtx.clearRect(0, 0, WIDTH, HEIGHT);
      compositeCtx.filter = 'blur(1px)';
      compositeCtx.drawImage(state.soilCanvases[z], 0, 0);
      compositeCtx.filter = 'none';
      compositeCtx.globalCompositeOperation = 'source-in';
      compositeCtx.drawImage(gradientCanvas, 0, 0);
      compositeCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(compositeCanvas, 0, 0);
    } else {
      ctx.drawImage(state.soilCanvases[z], 0, 0);
    }
    for (const ant of antsByZ[z]) ant.draw(ctx, ant === state.highlightedAnt);
  }
}

function renderFrame(): void {
  if (!_ctx) return;
  for (const ant of state.ants) ant.updateAnimation();
  _ctx.clearRect(0, 0, WIDTH, HEIGHT);

  switch (state.viewMode) {
    case 'normal':
      renderNormal(_ctx);
      break;
    case 'debug':
      drawDebugFrame(_ctx);
      break;
    case 'overlay':
      renderNormal(_ctx);
      drawDebugOverlay(_ctx);
      break;
  }
}

export function initSimulation(): void {
  state.grids = [];
  state.pheromone = [];
  state.soilCanvases = [];
  state.soilCtxs = [];

  const airEndVy = initialAirEndVy();
  const protectedEndVy = initialProtectedEndVy();

  // Gradient canvas: same y-axis tint applied to every soil pixel, regardless
  // of whether it was original substrate or an ant-deposited grain. Painted
  // across the full canvas so mound deposits above INITIAL_AIR_TOP_Y still
  // pick up a colour stop instead of rendering as transparent specks.
  const gCanvas = document.createElement('canvas');
  gCanvas.width = WIDTH;
  gCanvas.height = HEIGHT;
  const gCtx = gCanvas.getContext('2d')!;
  const gradient = gCtx.createLinearGradient(0, INITIAL_AIR_TOP_Y, 0, HEIGHT);
  gradient.addColorStop(0, 'rgba(0, 180, 255, 0.35)');
  gradient.addColorStop(1, 'rgba(0, 120, 230, 0.45)');
  gCtx.fillStyle = gradient;
  gCtx.fillRect(0, 0, WIDTH, HEIGHT);
  state.gradientCanvas = gCanvas;

  const cCanvas = document.createElement('canvas');
  cCanvas.width = WIDTH;
  cCanvas.height = HEIGHT;
  state.compositeCanvas = cCanvas;
  state.compositeCtx = cCanvas.getContext('2d')!;

  for (let z = 0; z < DEPTH; z++) {
    state.grids[z] = Array.from({ length: GRID_HEIGHT }, () => new Uint8Array(GRID_WIDTH));
    state.pheromone.push(new Float32Array(GRID_WIDTH * GRID_HEIGHT));

    const sCanvas = document.createElement('canvas');
    sCanvas.width = WIDTH;
    sCanvas.height = HEIGHT;
    const sCtx = sCanvas.getContext('2d', { willReadFrequently: true })!;

    // Seed the grid: air on top, then a thin protected band, then diggable
    // soil all the way down. This is the only place INITIAL_AIR_TOP_Y / the
    // protected band influence the world; runtime logic never references them.
    for (let vy = 0; vy < GRID_HEIGHT; vy++) {
      const row = state.grids[z][vy];
      if (vy < airEndVy) {
        // air (already 0)
      } else if (vy < protectedEndVy) {
        for (let vx = 0; vx < GRID_WIDTH; vx++) row[vx] = SOIL_PROTECTED;
      } else {
        for (let vx = 0; vx < GRID_WIDTH; vx++) row[vx] = SOIL_DIGGABLE;
      }
    }

    state.soilCanvases.push(sCanvas);
    state.soilCtxs.push(sCtx);
    syncSoilMaskAll(z);
  }

  // Initial entrances: punch holes through the protected band, then pre-dig
  // a starter shaft + a small lateral chamber into the diggable soil below.
  //
  // The single-voxel dig/drop cycle is geometrically slow: an empty ant must
  // walk all the way to a wall, dig one voxel, walk all the way back to an
  // open region, drop it. From a flat substrate it takes thousands of cycles
  // before any tunnel network is large enough to be visually meaningful. The
  // starter geometry kicks the simulation past that warm-up — ants then
  // extend it through normal play.
  const SHAFT_DEPTH_VY = 30;
  const SHAFT_HALF_W = 2;
  const CHAMBER_HALF_W = 6;
  const CHAMBER_HEIGHT_VY = 4;
  const entranceCount = 5 + Math.floor(Math.random() * 3);
  const top = initialAirEndVy();
  for (let i = 0; i < entranceCount; i++) {
    const cvx = Math.floor(GRID_WIDTH * (0.1 + Math.random() * 0.8));
    const ez = Math.floor(Math.random() * DEPTH);
    // 1) Convert protected → diggable for the shaft mouth.
    makeDiggable(cvx, ez, SHAFT_HALF_W + 1, 4);
    // 2) Vertical shaft down.
    for (let dvy = 0; dvy < SHAFT_DEPTH_VY; dvy++) {
      for (let dvx = -SHAFT_HALF_W; dvx <= SHAFT_HALF_W; dvx++) {
        digVoxel(cvx + dvx, top + dvy, ez);
      }
    }
    // 3) Lateral chamber at the bottom of the shaft.
    const chamberVy = top + SHAFT_DEPTH_VY - 1;
    for (let dvy = 0; dvy < CHAMBER_HEIGHT_VY; dvy++) {
      for (let dvx = -CHAMBER_HALF_W; dvx <= CHAMBER_HALF_W; dvx++) {
        digVoxel(cvx + dvx, chamberVy - dvy, ez);
      }
    }
  }

  state.ants = [];
  state.highlightedAnt = null;
  adjustAnts();
}

export function adjustAnts(): void {
  while (state.ants.length < state.targetAntCount) {
    state.ants.push(spawnAnt());
  }
  while (state.ants.length > state.targetAntCount) {
    const removed = state.ants.pop();
    if (removed === state.highlightedAnt) state.highlightedAnt = null;
  }
}

/** Spawn an ant somewhere in the initial air region, at a stand-valid voxel.
 *  Falls back to a near-the-floor placement if no candidate is found after a
 *  reasonable number of attempts (e.g. the entire top region is somehow
 *  unreachable). */
function spawnAnt(): Ant {
  const airEndVy = initialAirEndVy();
  const z = Math.floor(Math.random() * DEPTH);
  for (let attempt = 0; attempt < 64; attempt++) {
    const vx = Math.floor(Math.random() * GRID_WIDTH);
    const vy = airEndVy - 1 - Math.floor(Math.random() * Math.min(4, airEndVy));
    if (vy < 0) continue;
    if (canStandAt(vx, vy, z)) return new Ant(vx, vy, z);
  }
  // Fallback: place on top of the protected band (which always exists),
  // scanning a few columns to find a valid stand voxel.
  for (let vx = 0; vx < GRID_WIDTH; vx++) {
    if (canStandAt(vx, airEndVy - 1, z)) return new Ant(vx, airEndVy - 1, z);
  }
  return new Ant(Math.floor(GRID_WIDTH / 2), Math.max(0, airEndVy - 1), z);
}

/** Runs physics for N steps immediately (no rAF), then renders once.
 *  Exposed on window for Playwright. */
export function advanceSimulation(steps: number): void {
  adjustAnts();
  for (let i = 0; i < steps; i++) physicsStep();
  renderFrame();
}

export function startLoop(canvas: HTMLCanvasElement): void {
  _ctx = canvas.getContext('2d')!;

  function tick(): void {
    adjustAnts();
    for (let step = 0; step < state.simulationSpeed; step++) {
      physicsStep();
    }
    renderFrame();
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
