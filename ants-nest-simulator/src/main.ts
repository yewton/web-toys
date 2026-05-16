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

initSimulation();
startLoop(canvas);

Object.assign(window, { __antSimAdvance: advanceSimulation });
