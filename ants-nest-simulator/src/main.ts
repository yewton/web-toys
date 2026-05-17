import './style.css';
import { WIDTH, HEIGHT } from './constants';
import { state } from './state';
import { initSimulation, startLoop, advanceSimulation } from './simulation';

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

const HIGHLIGHT_RADIUS = 15;

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (WIDTH / rect.width);
  const cy = (e.clientY - rect.top) * (HEIGHT / rect.height);

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
