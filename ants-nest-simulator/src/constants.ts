/**
 * Voxel-discrete redesign:
 *   - VOXEL_SIZE is a fixed compile-time constant (no UI selector).
 *   - Ants live at integer voxel coordinates (vx, vy, vz) and move one voxel
 *     per discrete step. Animation interpolates between voxel centres.
 *   - There is no runtime "surface" concept: the top portion is simply air at
 *     initialisation. Ground/surface plays no role in ant behaviour.
 *   - The protected layer (type 3) remains only as an initial-guidance hint.
 *   - Out-of-bounds voxels (x, y, z) are treated as invisible undiggable soil
 *     (type 3) — this is what gives the front/back of the world the wall-like
 *     property the design asks for.
 */

export const WIDTH = 400;
export const HEIGHT = 400;
export const DEPTH = 3;

/** Voxel size in pixels. Fixed: no UI selector. */
export const VOXEL_SIZE = 2;
export const GRID_WIDTH = WIDTH / VOXEL_SIZE;
export const GRID_HEIGHT = HEIGHT / VOXEL_SIZE;

// ─── Initial-state geometry ───────────────────────────────────────────────────
// These values shape the *initial* grid only — they are not referenced by
// runtime ant logic, rendering, or debug overlays. The ant treats the world
// as a uniform voxel grid of air / soil / protected.

/** Voxels strictly above this Y (pixels) start as air. */
export const INITIAL_AIR_TOP_Y = 40;

/** Initial protected-layer thickness in pixels (immediately below the air zone). */
export const PROTECTED_DEPTH = 6;

// ─── Movement ────────────────────────────────────────────────────────────────

/** Voxel-distance covered per simulation frame.
 *  Cardinal step (distance 1) → 1/SPEED frames.
 *  Diagonal step (distance √2 or √3) → that-many/SPEED frames.
 *  This keeps apparent linear velocity equal regardless of direction. */
export const STEP_SPEED = 0.3;

// ─── Behaviour probabilities ─────────────────────────────────────────────────

/** Per-arrival chance that a carrying ant tries to drop its voxel. Drop is
 *  also gated on minimum travel distance from the dig site (see
 *  CARRY_MIN_TRAVEL_SQ) so an ant cannot trivially refill the hole. */
export const DROP_PROB = 0.4;

/** Minimum squared voxel-distance from the dig site before a carrier is
 *  eligible to drop. Squared = 9 → 3 voxels Euclidean. Above this distance
 *  the drop is eager; below it the carrier keeps moving. */
export const CARRY_MIN_TRAVEL_SQ = 9;

/** Base chance per turn that an empty-handed ant decides to dig one of its
 *  cardinal soil neighbours. Tuned so 50 ants over ~100k frames visibly
 *  expand the tunnel network without instantly destroying the substrate. */
export const DIG_PROB_BASE = 0.5;

/** Chance multiplier when the ant has no valid air neighbours (dead-end). */
export const DIG_PROB_DEADEND = 1.0;

// ─── Pheromone ───────────────────────────────────────────────────────────────

export const PHEROMONE_DECAY = 0.997;
export const PHEROMONE_DEPOSIT_EXPLORE = 0.001;
export const PHEROMONE_DEPOSIT_RETURN = 0.005;

// ─── Direction weighting ─────────────────────────────────────────────────────

/** Multiplier applied to a candidate move's weight when the carry-upward
 *  bias prefers it (i.e. the candidate's dy is < 0). */
export const UPWARD_BIAS_STRENGTH = 2.5;

/** Mirror of UPWARD_BIAS_STRENGTH for empty-handed ants: a downward bias
 *  pulls explorers into the deeper soil so they actually dig new tunnels
 *  instead of indefinitely circling the surface mound. */
export const DOWNWARD_BIAS_STRENGTH = 1.5;

/** Multiplier applied per unit of pheromone differential when picking the
 *  next move target. Carrying ants are *attracted* to pheromones; explorers
 *  are *repelled* (negative effective sign). */
export const PHEROMONE_PULL_STRENGTH = 6.0;

/** Sharpness of the "follow current heading" preference. Higher = stricter
 *  forward alignment; 0 = direction is ignored when sampling. */
export const ANGLE_CONCENTRATION = 2.5;
