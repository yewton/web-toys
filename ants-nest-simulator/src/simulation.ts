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
import { openEntrance, evaporatePheromone, settleSoil } from './grid';
import { drawDebugFrame, drawDebugOverlay } from './debugView';

let _ctx: CanvasRenderingContext2D | null = null;
let _physicsTick = 0;

function physicsStep(): void {
  for (const ant of state.ants) ant.update();
  evaporatePheromone();
  if (_physicsTick++ % 3 === 0) settleSoil();
}

function renderNormal(ctx: CanvasRenderingContext2D): void {
  const { gradientCanvas, offscreenCanvas, offscreenCtx, soilCanvases } = state;
  if (!gradientCanvas || !offscreenCanvas || !offscreenCtx) return;

  const antsByZ: Ant[][] = Array.from({ length: DEPTH }, () => []);
  for (const ant of state.ants) antsByZ[ant.z].push(ant);

  for (let z = 0; z < DEPTH; z++) {
    // Composite soil using the mask
    offscreenCtx.clearRect(0, 0, WIDTH, HEIGHT);
    offscreenCtx.drawImage(gradientCanvas, 0, 0);
    offscreenCtx.globalCompositeOperation = 'destination-in';
    offscreenCtx.drawImage(soilCanvases[z], 0, 0);
    offscreenCtx.globalCompositeOperation = 'source-over';

    ctx.globalAlpha = 0.4;
    ctx.drawImage(offscreenCanvas, 0, 0);
    ctx.globalAlpha = 1.0;

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

  // Initialize shared canvases
  const gCanvas = document.createElement('canvas');
  gCanvas.width = WIDTH;
  gCanvas.height = HEIGHT;
  const gCtx = gCanvas.getContext('2d')!;
  const gradient = gCtx.createLinearGradient(0, GROUND_LEVEL, 0, HEIGHT);
  gradient.addColorStop(0, 'rgb(0, 180, 255)');
  gradient.addColorStop(1, 'rgb(0, 120, 230)');
  gCtx.fillStyle = gradient;
  gCtx.fillRect(0, 0, WIDTH, HEIGHT);
  state.gradientCanvas = gCanvas;

  const oCanvas = document.createElement('canvas');
  oCanvas.width = WIDTH;
  oCanvas.height = HEIGHT;
  state.offscreenCanvas = oCanvas;
  state.offscreenCtx = oCanvas.getContext('2d')!;

  for (let z = 0; z < DEPTH; z++) {
    state.grids[z] = Array.from({ length: GRID_HEIGHT }, () => new Uint8Array(GRID_WIDTH));
    state.pheromone.push(new Float32Array(GRID_WIDTH * GRID_HEIGHT));

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
    // Fill mask with solid color where soil exists
    sCtx.fillStyle = 'white';
    sCtx.fillRect(0, GROUND_LEVEL, WIDTH, HEIGHT - GROUND_LEVEL);

    state.soilCanvases.push(sCanvas);
    state.soilCtxs.push(sCtx);
  }

  const entranceCount = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < entranceCount; i++) {
    const ex = WIDTH * (0.15 + Math.random() * 0.7);
    for (let z = 0; z < DEPTH; z++) {
      openEntrance(ex, z, 6, PROTECTED_DEPTH + 1);
    }
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
