import type { Ant } from './Ant';

export type ViewMode = 'normal' | 'debug' | 'overlay';

export interface SimState {
  /** Per-Z voxel grids. Values: 0 = air, 1 = soil (diggable), 3 = protected. */
  grids: Uint8Array[][];
  /** Per-Z per-voxel pheromone (flat row-major). */
  pheromone: Float32Array[];
  /** Per-Z opaque-white mask canvases. White = soil present. Mask is re-derived
   *  from the grid on every dig/place so it never accumulates AA noise. */
  soilCanvases: HTMLCanvasElement[];
  soilCtxs: CanvasRenderingContext2D[];
  /** Shared y-axis colour/alpha gradient. Composited with the mask at render
   *  time so all soil pixels (initial substrate, redeposited, surface mound)
   *  take the same tint. */
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
