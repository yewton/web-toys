import type { Ant } from './Ant';

export type ViewMode = 'normal' | 'debug' | 'overlay';

export interface SimState {
  grids: Uint8Array[][];
  pheromone: Float32Array[];
  soilCanvases: HTMLCanvasElement[];
  soilCtxs: CanvasRenderingContext2D[];
  ants: Ant[];
  targetAntCount: number;
  simulationSpeed: number;
  highlightedAnt: Ant | null;
  viewMode: ViewMode;
}

export const state: SimState = {
  grids: [],
  pheromone: [],
  soilCanvases: [],
  soilCtxs: [],
  ants: [],
  targetAntCount: 50,
  simulationSpeed: 1,
  highlightedAnt: null,
  viewMode: 'normal',
};
