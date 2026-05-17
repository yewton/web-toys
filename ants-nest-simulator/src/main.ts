import './style.css';
import { WIDTH, HEIGHT, VOXEL_SIZE, VOXEL_SIZE_STORAGE_KEY, ALLOWED_VOXEL_SIZES } from './constants';
import { state, type ViewMode } from './state';
import { initSimulation, startLoop, advanceSimulation } from './simulation';
import { toggleLegend, hitTestLegend } from './debugView';

const canvas = document.getElementById('simCanvas') as HTMLCanvasElement;
canvas.width = WIDTH;
canvas.height = HEIGHT;

document.getElementById('antCount')!.addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement;
  state.targetAntCount = parseInt(input.value);
  document.getElementById('antCountVal')!.textContent = String(state.targetAntCount);
});

document.getElementById('simSpeed')!.addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement;
  state.simulationSpeed = parseInt(input.value);
  document.getElementById('simSpeedVal')!.textContent = `${state.simulationSpeed}x`;
});

document.getElementById('resetBtn')!.addEventListener('click', initSimulation);

document.querySelectorAll('[data-view-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = (btn as HTMLElement).dataset.viewMode as ViewMode;
    state.viewMode = mode;
    document.querySelectorAll('[data-view-mode]').forEach((b) => {
      const el = b as HTMLElement;
      const active = b === btn;
      el.classList.toggle('view-btn-active', active);
      el.classList.toggle('view-btn-inactive', !active);
    });
  });
});

// Voxel size selector. VOXEL_SIZE is baked in at module-load (it sizes the
// grid/pheromone arrays), so we persist the choice and reload to apply.
document.querySelectorAll<HTMLElement>('[data-voxel-size]').forEach((btn) => {
  const size = parseInt(btn.dataset.voxelSize!, 10);
  const active = size === VOXEL_SIZE;
  btn.classList.toggle('view-btn-active', active);
  btn.classList.toggle('view-btn-inactive', !active);
  btn.addEventListener('click', () => {
    if (size === VOXEL_SIZE) return;
    if (!(ALLOWED_VOXEL_SIZES as readonly number[]).includes(size)) return;
    try {
      localStorage.setItem(VOXEL_SIZE_STORAGE_KEY, String(size));
    } catch {
      // ignore: localStorage may be blocked
    }
    location.reload();
  });
});

const HIGHLIGHT_RADIUS = 15;

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (WIDTH / rect.width);
  const cy = (e.clientY - rect.top) * (HEIGHT / rect.height);

  if (state.viewMode === 'debug' && hitTestLegend(cx, cy)) {
    toggleLegend();
    return;
  }

  let closest = null;
  let closestDist = HIGHLIGHT_RADIUS;
  for (const ant of state.ants) {
    const d = Math.hypot(ant.drawX - cx, ant.drawY - cy);
    if (d < closestDist) { closestDist = d; closest = ant; }
  }

  state.highlightedAnt = closest === state.highlightedAnt ? null : closest;
});

initSimulation();
startLoop(canvas);

Object.assign(window, { __antSimAdvance: advanceSimulation, __antSimState: state });
