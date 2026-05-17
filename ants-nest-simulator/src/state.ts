import type { Ant } from './Ant';

export type ViewMode = 'normal' | 'debug' | 'overlay';

export interface SimState {
  grids: Uint8Array[][];
  pheromone: Float32Array[];
  /** Per-Z opaque-white masks. White = soil present, transparent = air. */
  soilCanvases: HTMLCanvasElement[];
  soilCtxs: CanvasRenderingContext2D[];
  /** Shared y-axis gradient canvas. Composed with the mask at render time so
   *  original substrate and ant-deposited soil share the same color/alpha. */
  gradientCanvas: HTMLCanvasElement | null;
  /** Scratch canvas used to composite mask × gradient each frame. */
  compositeCanvas: HTMLCanvasElement | null;
  compositeCtx: CanvasRenderingContext2D | null;
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
  gradientCanvas: null,
  compositeCanvas: null,
  compositeCtx: null,
  ants: [],
  targetAntCount: 50,
  simulationSpeed: 1,
  highlightedAnt: null,
  viewMode: 'normal',
};
