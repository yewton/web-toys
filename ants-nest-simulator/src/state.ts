import type { Ant } from './Ant';

export interface SimState {
  grids: Uint8Array[][];
  pheromone: Float32Array[];
  gelCanvases: HTMLCanvasElement[];
  gelCtxs: CanvasRenderingContext2D[];
  dirtCanvases: HTMLCanvasElement[];
  dirtCtxs: CanvasRenderingContext2D[];
  ants: Ant[];
  targetAntCount: number;
  simulationSpeed: number;
}

export const state: SimState = {
  grids: [],
  pheromone: [],
  gelCanvases: [],
  gelCtxs: [],
  dirtCanvases: [],
  dirtCtxs: [],
  ants: [],
  targetAntCount: 50,
  simulationSpeed: 1,
};
