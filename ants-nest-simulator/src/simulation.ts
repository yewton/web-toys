import {
  WIDTH,
  HEIGHT,
  DEPTH,
  GROUND_LEVEL,
  PROTECTED_DEPTH,
  VOXEL_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT,
} from './constants';
import { state } from './state';
import { Ant } from './Ant';
import { makeDiggable, evaporatePheromone, syncSoilMaskAll } from './grid';
import { drawDebugFrame, drawDebugOverlay } from './debugView';

let _ctx: CanvasRenderingContext2D | null = null;

function physicsStep(): void {
  for (const ant of state.ants) ant.update();
  evaporatePheromone();
}

function renderNormal(ctx: CanvasRenderingContext2D): void {
  const antsByZ: Ant[][] = Array.from({ length: DEPTH }, () => []);
  for (const ant of state.ants) antsByZ[ant.z].push(ant);

  const { gradientCanvas, compositeCanvas, compositeCtx } = state;

  for (let z = 0; z < DEPTH; z++) {
    if (gradientCanvas && compositeCanvas && compositeCtx) {
      // Compose this layer's mask × gradient into the scratch canvas, then blit.
      // source-in keeps the gradient (and its alpha) only where the mask is opaque,
      // so an ant-deposited blob takes the same depth-color/alpha as the substrate
      // around it. This is what hides the "redeposit looks different" seam.
      // A subtle blur on the mask softens per-voxel circle seams in heavily
      // excavated regions; without it, dense tunnel networks read as a noisy
      // speckle texture rather than smooth flowing soil.
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

  const groundVy = Math.floor(GROUND_LEVEL / VOXEL_SIZE);
  const protectedVyEnd = Math.floor((GROUND_LEVEL + PROTECTED_DEPTH) / VOXEL_SIZE);

  // Shared y-axis color/alpha gradient, used at render time to tint each
  // per-Z soil mask. The alpha ramp (0.35 → 0.45) reproduces the original
  // "deeper voxels look more solid" depth cue without depending on the
  // mask paint color. Painted over the full canvas (not just below ground)
  // so surface-mound deposits above GROUND_LEVEL also receive a color —
  // pixels above the gradient's anchor inherit the top stop's color.
  const gCanvas = document.createElement('canvas');
  gCanvas.width = WIDTH;
  gCanvas.height = HEIGHT;
  const gCtx = gCanvas.getContext('2d')!;
  const gradient = gCtx.createLinearGradient(0, GROUND_LEVEL, 0, HEIGHT);
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

    // Per-Z binary mask. Each soil voxel paints itself as an opaque circle
    // (see syncSoilMaskAll); the union of overlapping circles produces the
    // visible substrate shape. Subsequent dig/fill operations resync the
    // affected mask region from the grid so the mask never accumulates
    // anti-aliased noise from past operations.
    const sCanvas = document.createElement('canvas');
    sCanvas.width = WIDTH;
    sCanvas.height = HEIGHT;
    const sCtx = sCanvas.getContext('2d', { willReadFrequently: true })!;

    for (let vy = 0; vy < GRID_HEIGHT; vy++) {
      for (let vx = 0; vx < GRID_WIDTH; vx++) {
        if (vy >= groundVy) {
          state.grids[z][vy][vx] = vy < protectedVyEnd ? 3 : 1;
        }
      }
    }

    state.soilCanvases.push(sCanvas);
    state.soilCtxs.push(sCtx);
    syncSoilMaskAll(z);
  }

  const entranceCount = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < entranceCount; i++) {
    const ex = WIDTH * (0.15 + Math.random() * 0.7);
    makeDiggable(ex, 1, 6, PROTECTED_DEPTH + 1);
  }

  state.ants = [];
  state.highlightedAnt = null;
  adjustAnts();
}

export function adjustAnts(): void {
  while (state.ants.length < state.targetAntCount) {
    const z = Math.floor(Math.random() * DEPTH);
    state.ants.push(new Ant(Math.random() * WIDTH, Math.random() * (GROUND_LEVEL - 10) + 5, z));
  }
  while (state.ants.length > state.targetAntCount) {
    const removed = state.ants.pop();
    if (removed === state.highlightedAnt) state.highlightedAnt = null;
  }
}

/** Runs physics for the given number of steps immediately without requestAnimationFrame, then renders once */
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
