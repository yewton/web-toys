export const WIDTH = 400;
export const HEIGHT = 400;
export const DEPTH = 3;

/** Ground surface Y coordinate */
export const GROUND_LEVEL = 40;

/** Depth of the undiggable protected layer */
export const PROTECTED_DEPTH = 6;

/** Pheromone evaporation factor per step */
export const PHEROMONE_DECAY = 0.999;

/** Pheromone deposited per step while exploring */
export const PHEROMONE_DEPOSIT_EXPLORE = 0.001;

/** Pheromone deposited per step while returning with dirt (reinforces known paths) */
export const PHEROMONE_DEPOSIT_RETURN = 0.005;
