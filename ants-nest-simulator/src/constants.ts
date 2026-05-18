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

/** Voxel size in pixels. Fixed: no UI selector. 4 px keeps single-voxel
 *  tunnels visible (4 px wide) in the 400 px canvas — the previous 2 px
 *  size made the discrete digging behaviour barely readable. */
export const VOXEL_SIZE = 4;
export const GRID_WIDTH = WIDTH / VOXEL_SIZE;
export const GRID_HEIGHT = HEIGHT / VOXEL_SIZE;

// ─── Initial-state geometry ───────────────────────────────────────────────────
// These values shape the *initial* grid only — they are not referenced by
// runtime ant logic, rendering, or debug overlays. The ant treats the world
// as a uniform voxel grid of air / soil / protected.

/** Voxels strictly above this Y (pixels) start as air. */
export const INITIAL_AIR_TOP_Y = 40;

/** Initial protected-layer thickness in pixels (immediately below the air
 *  zone). 12 px ≈ 3 voxels at VOXEL_SIZE=4, matching the previous voxel
 *  count of protected substrate. */
export const PROTECTED_DEPTH = 12;

// ─── Movement ────────────────────────────────────────────────────────────────

/** Voxel-distance covered per simulation frame.
 *  Cardinal step (distance 1) → 1/SPEED frames.
 *  Diagonal step (distance √2 or √3) → that-many/SPEED frames.
 *  This keeps apparent linear velocity equal regardless of direction. */
export const STEP_SPEED = 0.3;

// ─── Behaviour probabilities ─────────────────────────────────────────────────

/** Per-arrival chance that a carrying ant tries to drop its voxel. */
export const DROP_PROB = 0.6;

/** Minimum squared voxel-distance from the dig site before a carrier is
 *  eligible to drop. Set to 2 (Euclidean √2 = one lateral or diagonal
 *  step) — just enough to prevent immediate same-voxel refill. The closer
 *  we let the carrier drop to the dig site, the more naturally the mound
 *  settles right at the soil/air boundary instead of being pushed upward
 *  by extra travel. */
export const CARRY_MIN_TRAVEL_SQ = 2;

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
/** Per-frame pheromone an XY-stuck ant emits as a "come help me" signal.
 *  Much higher than the regular trail deposits so the local gradient pulls
 *  nearby ants in, who may then dig the wall and free the stuck ant. */
export const PHEROMONE_DEPOSIT_DISTRESS = 0.08;

// ─── Direction weighting ─────────────────────────────────────────────────────

/** Carrier-up bias. Set to 0: carriers no longer have a vertical
 *  preference, so the carry-distance gate (CARRY_MIN_TRAVEL_SQ) is the
 *  only thing separating dig from drop. Drops land naturally close to
 *  the dig site rather than being conveyor-belted up to the ceiling. */
export const UPWARD_BIAS_STRENGTH = 0;

/** Empty-ant downward bias — pulls explorers into the deeper soil so
 *  they actually dig new tunnels instead of circling the surface mound. */
export const DOWNWARD_BIAS_STRENGTH = 0.8;

/** Multiplier applied per unit of pheromone differential when picking the
 *  next move target. Kept modest so the trail influences ants without
 *  overriding the heading/vertical biases — a strong pull pumps carriers
 *  back and forth between the dig site and the established surface trail,
 *  which is the secondary mechanism that drove deposits to the ceiling. */
export const PHEROMONE_PULL_STRENGTH = 2.0;

/** Sharpness of the "follow current heading" preference. Higher = stricter
 *  forward alignment; 0 = direction is ignored when sampling. Increased
 *  so empty ants returning to the dig zone follow roughly the same route
 *  back to the tunnel face, which is what lets the dig site elongate
 *  into a tunnel instead of sprawling into a funnel. */
export const ANGLE_CONCENTRATION = 5.0;

/** A cavity is considered "wide" — and so unsuitable for further digging —
 *  if at least this fraction of the 3×3 (current-Z-layer) neighbours of the
 *  ant are air. Sample is kept tight (2D, 8 cells) so the check only stops
 *  digging once the immediate surroundings are mostly hollow — i.e. an
 *  ant standing at the bottom of a deepening trench still has soil below
 *  it and is allowed to drill further. A spherical sample including the
 *  open air region above the ant tripped the threshold after just a few
 *  voxels were dug, capping every entrance at a shallow funnel. */
export const WIDE_CAVITY_AIR_RATIO = 0.7;
