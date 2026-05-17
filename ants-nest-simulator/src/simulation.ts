import { WIDTH, HEIGHT, DEPTH, GROUND_LEVEL, PROTECTED_DEPTH } from './constants';
import { state } from './state';
import { Ant } from './Ant';
import { makeDiggable, evaporatePheromone } from './grid';
import { drawDebugFrame, drawDebugOverlay } from './debugView';

let _ctx: CanvasRenderingContext2D | null = null;

function physicsStep(): void {
  for (const ant of state.ants) ant.update();
  evaporatePheromone();
}

function renderNormal(ctx: CanvasRenderingContext2D): void {
  const antsByZ: Ant[][] = Array.from({ length: DEPTH }, () => []);
  for (const ant of state.ants) antsByZ[ant.z].push(ant);
  for (let z = 0; z < DEPTH; z++) {
    ctx.drawImage(state.soilCanvases[z], 0, 0);
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

  for (let z = 0; z < DEPTH; z++) {
    state.grids[z] = Array.from({ length: HEIGHT }, () => new Uint8Array(WIDTH));
    state.pheromone.push(new Float32Array(WIDTH * HEIGHT));

    const sCanvas = document.createElement('canvas');
    sCanvas.width = WIDTH;
    sCanvas.height = HEIGHT;
    const sCtx = sCanvas.getContext('2d', { willReadFrequently: true })!;

    const gradient = sCtx.createLinearGradient(0, GROUND_LEVEL, 0, HEIGHT);
    gradient.addColorStop(0, 'rgba(0, 180, 255, 0.35)');
    gradient.addColorStop(1, 'rgba(0, 120, 230, 0.45)');
    sCtx.fillStyle = gradient;

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        if (y >= GROUND_LEVEL) {
          state.grids[z][y][x] = y < GROUND_LEVEL + PROTECTED_DEPTH ? 3 : 1;
        }
      }
    }
    sCtx.fillRect(0, GROUND_LEVEL, WIDTH, HEIGHT - GROUND_LEVEL);

    state.soilCanvases.push(sCanvas);
    state.soilCtxs.push(sCtx);
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
