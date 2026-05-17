import type { Ant } from './Ant';

export interface SimState {
  grids: Uint8Array[][];
  pheromone: Float32Array[];
  soilCanvases: HTMLCanvasElement[];
  soilCtxs: CanvasRenderingContext2D[];
  ants: Ant[];
  targetAntCount: number;
  simulationSpeed: number;
}

export const state: SimState = {
  grids: [],
  pheromone: [],
  soilCanvases: [],
  soilCtxs: [],
  ants: [],
  targetAntCount: 50,
  simulationSpeed: 1,
};
