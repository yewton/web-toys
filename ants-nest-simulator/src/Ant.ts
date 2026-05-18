import {
  STEP_SPEED,
  DROP_PROB,
  DIG_PROB_BASE,
  DIG_PROB_DEADEND,
  CARRY_MIN_TRAVEL_SQ,
  PHEROMONE_DEPOSIT_EXPLORE,
  PHEROMONE_DEPOSIT_RETURN,
  UPWARD_BIAS_STRENGTH,
  DOWNWARD_BIAS_STRENGTH,
  PHEROMONE_PULL_STRENGTH,
  ANGLE_CONCENTRATION,
} from './constants';
import {
  SOIL_DIGGABLE,
  CARDINAL_OFFSETS,
  getVoxel,
  isAir,
  canStandAt,
  digVoxel,
  placeVoxel,
  depositPheromone,
  getPheromone,
  voxelCentrePx,
  gradientRgbaAt,
} from './grid';

/**
 * Voxel-discrete ant.
 *
 * State machine per `update()` call:
 *   - If currently mid-step (interpolating between two voxels): advance
 *     `moveProgress` by `STEP_SPEED / moveDistance`; on completion snap to the
 *     destination voxel and deposit pheromone there.
 *   - Otherwise (idle at a voxel): pick exactly one of {drop, dig, move}.
 *     A move sets `isMoving = true` so the next frame begins interpolation.
 *
 * Movement rule (the simulation's whole geometric invariant):
 *   The destination voxel must be air AND have at least one 6-cardinal soil
 *   neighbour. Out-of-bounds counts as soil, so ants can crawl along the
 *   world edges but can never escape them.
 *
 * Carry rule: an ant carries either 0 or exactly 1 voxel of soil — never more.
 */

const TWO_PI = Math.PI * 2;
function wrapAngle(diff: number): number {
  while (diff < -Math.PI) diff += TWO_PI;
  while (diff > Math.PI) diff -= TWO_PI;
  return diff;
}

/** All 26 3D Moore-neighbour offsets, precomputed with the squared distance
 *  used for movement-cost scaling. */
interface NeighbourOffset {
  dx: number;
  dy: number;
  dz: number;
  distance: number;
  /** Pre-computed 2D heading angle of (dx, dy). NaN when dx == 0 && dy == 0
   *  (pure Z move) — those candidates skip angle weighting. */
  angle: number;
}
const NEIGHBOUR_OFFSETS: readonly NeighbourOffset[] = (() => {
  const list: NeighbourOffset[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const angle = (dx === 0 && dy === 0) ? NaN : Math.atan2(dy, dx);
        list.push({ dx, dy, dz, distance, angle });
      }
    }
  }
  return list;
})();

interface MoveCandidate {
  offset: NeighbourOffset;
  weight: number;
}

export class Ant {
  // ─── Discrete state ────────────────────────────────────────────────────────
  vx: number;
  vy: number;
  vz: number;
  /** 2D heading preference, in radians. Smooths between successive moves. */
  angle: number;
  /** True iff the ant is currently carrying exactly 1 voxel of soil. */
  carrying = false;
  /** Voxel coords where the currently-carried voxel was dug from. Used to
   *  gate drops on a minimum travel distance, so an ant cannot trivially
   *  fill the same voxel it just emptied. */
  digSiteVx = 0;
  digSiteVy = 0;
  digSiteVz = 0;

  // ─── Move-in-progress state ────────────────────────────────────────────────
  isMoving = false;
  srcVx = 0;
  srcVy = 0;
  srcVz = 0;
  tgtVx = 0;
  tgtVy = 0;
  tgtVz = 0;
  moveDistance = 1;
  moveProgress = 0;

  // ─── Animation (pixels) ────────────────────────────────────────────────────
  drawX: number;
  drawY: number;
  drawAngle: number;
  walkCycle: number;

  constructor(vx: number, vy: number, vz: number) {
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    this.angle = Math.random() * TWO_PI;
    this.drawX = voxelCentrePx(vx);
    this.drawY = voxelCentrePx(vy);
    this.drawAngle = this.angle;
    this.walkCycle = Math.random() * TWO_PI;
  }

  /** One simulation step (called every physics tick). */
  update(): void {
    if (this.isMoving) {
      this.advanceMove();
      return;
    }
    this.idleTurn();
  }

  // ─── Interpolation tick ────────────────────────────────────────────────────

  private advanceMove(): void {
    this.moveProgress += STEP_SPEED / this.moveDistance;
    if (this.moveProgress >= 1) {
      this.vx = this.tgtVx;
      this.vy = this.tgtVy;
      this.vz = this.tgtVz;
      this.isMoving = false;
      this.moveProgress = 0;
      // Pheromone trail: carrying ants reinforce return path, explorers
      // leave a faint sniff so other explorers diffuse outward.
      depositPheromone(
        this.vx,
        this.vy,
        this.vz,
        this.carrying ? PHEROMONE_DEPOSIT_RETURN : PHEROMONE_DEPOSIT_EXPLORE,
      );
    }
  }

  // ─── Idle action selection ─────────────────────────────────────────────────

  private idleTurn(): void {
    // Drop attempt (carrying only): bias toward placing the voxel below
    // the ant so successive deposits form a mound from the top down.
    if (this.carrying && Math.random() < DROP_PROB) {
      if (this.tryDrop()) return;
    }

    const candidates = this.collectMoveCandidates();

    // Dead-end: no valid neighbour to step into. Force a dig of an adjacent
    // soil voxel so the ant can re-open a path (or fill itself silly if its
    // hands are already full — pick up no extra in that case).
    if (candidates.length === 0) {
      if (Math.random() < DIG_PROB_DEADEND) {
        this.forceDigAdjacent();
        return;
      }
    }

    // Dig in front (only with free hands): peek at the cardinal voxel nearest
    // the heading; if it is diggable, take a bite instead of moving.
    if (!this.carrying && Math.random() < DIG_PROB_BASE) {
      if (this.tryDigForward()) return;
    }

    // Default action: pick a candidate weighted by heading + pheromone + bias
    // and start interpolating toward it.
    if (candidates.length > 0) {
      this.startMove(this.sampleCandidate(candidates));
      return;
    }

    // No candidates AND we didn't force-dig: spin the heading and wait.
    this.angle += (Math.random() - 0.5) * 0.8;
  }

  // ─── Drop ──────────────────────────────────────────────────────────────────

  /** Place the carried voxel into the first viable adjacent air voxel.
   *  Drop is gated on the carrier having moved at least sqrt(CARRY_MIN_TRAVEL_SQ)
   *  voxels from the dig site — without this an ant would trivially fill the
   *  voxel it just emptied. Returns true if a voxel was placed.
   *
   *  Preference order: lateral → above → below. Lateral first because we
   *  want surface mounds to spread *horizontally* rather than backfilling
   *  the vertical shaft the carrier just travelled up. Below comes last
   *  because that's exactly the direction of the shaft. */
  private tryDrop(): boolean {
    const dvx = this.vx - this.digSiteVx;
    const dvy = this.vy - this.digSiteVy;
    const dvz = this.vz - this.digSiteVz;
    if (dvx * dvx + dvy * dvy + dvz * dvz < CARRY_MIN_TRAVEL_SQ) return false;

    const above: NeighbourOffset[] = [];
    const lateral: NeighbourOffset[] = [];
    const below: NeighbourOffset[] = [];
    for (const o of NEIGHBOUR_OFFSETS) {
      if (!isAir(this.vx + o.dx, this.vy + o.dy, this.vz + o.dz)) continue;
      if (o.dy < 0) above.push(o);
      else if (o.dy === 0) lateral.push(o);
      else below.push(o);
    }
    for (const bucket of [lateral, above, below]) {
      shuffleInPlace(bucket);
      for (const o of bucket) {
        if (placeVoxel(this.vx + o.dx, this.vy + o.dy, this.vz + o.dz)) {
          this.carrying = false;
          return true;
        }
      }
    }
    return false;
  }

  // ─── Dig ───────────────────────────────────────────────────────────────────

  /** Dig the most heading-aligned soil voxel out of the ant's 6 cardinal
   *  neighbours. Because an ant lives in an air voxel with a soil neighbour,
   *  "in front" is almost always more air; targeting a soil-side wall is
   *  what actually progresses the tunnel network. Returns true on a dig. */
  private tryDigForward(): boolean {
    const ax = Math.cos(this.angle);
    const ay = Math.sin(this.angle);
    let bestDot = -Infinity;
    let bestOff: readonly [number, number, number] | null = null;
    for (const off of CARDINAL_OFFSETS) {
      const [dx, dy, dz] = off;
      if (getVoxel(this.vx + dx, this.vy + dy, this.vz + dz) !== SOIL_DIGGABLE) continue;
      // 2D heading score; Z-only neighbours score 0 (neutral) so the ant can
      // still dig sideways into the adjacent layer when nothing else is aligned.
      const dot = dx === 0 && dy === 0 ? 0 : dx * ax + dy * ay;
      if (dot > bestDot) {
        bestDot = dot;
        bestOff = off;
      }
    }
    if (!bestOff) return false;
    const dx = bestOff[0], dy = bestOff[1], dz = bestOff[2];
    if (digVoxel(this.vx + dx, this.vy + dy, this.vz + dz)) {
      this.carrying = true;
      this.digSiteVx = this.vx + dx;
      this.digSiteVy = this.vy + dy;
      this.digSiteVz = this.vz + dz;
      return true;
    }
    return false;
  }

  /** Last-resort: when the ant is sealed in and there are no valid moves,
   *  dig the first diggable cardinal neighbour. The dug voxel is discarded
   *  if hands are full (rescue dig, not productive). */
  private forceDigAdjacent(): void {
    for (const [dx, dy, dz] of CARDINAL_OFFSETS) {
      const nx = this.vx + dx;
      const ny = this.vy + dy;
      const nz = this.vz + dz;
      if (getVoxel(nx, ny, nz) === SOIL_DIGGABLE) {
        const dug = digVoxel(nx, ny, nz);
        if (dug && !this.carrying) this.carrying = true;
        return;
      }
    }
  }

  // ─── Move ──────────────────────────────────────────────────────────────────

  private collectMoveCandidates(): MoveCandidate[] {
    const out: MoveCandidate[] = [];
    for (const o of NEIGHBOUR_OFFSETS) {
      const tx = this.vx + o.dx;
      const ty = this.vy + o.dy;
      const tz = this.vz + o.dz;
      if (!canStandAt(tx, ty, tz)) continue;
      out.push({ offset: o, weight: this.weightCandidate(o, tx, ty, tz) });
    }
    return out;
  }

  /** Compose the heading-bias × upward-bias × pheromone-bias product. */
  private weightCandidate(o: NeighbourOffset, tx: number, ty: number, tz: number): number {
    // Heading alignment (von-Mises-ish): peaks at delta=0, falls off smoothly.
    // Pure-Z candidates (NaN angle) get a neutral score so the ant can still
    // change layer without the heading vetoing it.
    let angleScore = 1;
    if (!Number.isNaN(o.angle)) {
      const delta = wrapAngle(o.angle - this.angle);
      angleScore = Math.exp(ANGLE_CONCENTRATION * (Math.cos(delta) - 1));
    }
    // Vertical bias: carriers pulled up (toward the surface mound), empty
    // explorers pulled down (toward fresh diggable soil). Without the
    // explorer-down bias, ants tend to circle the surface forever.
    let vertical = 1;
    if (this.carrying && o.dy < 0) vertical = 1 + UPWARD_BIAS_STRENGTH;
    else if (!this.carrying && o.dy > 0) vertical = 1 + DOWNWARD_BIAS_STRENGTH;
    // Pheromone influence: carriers are *attracted* to the return trail
    // (faster trip back along an already-cleared route), but empty
    // explorers are *repelled* (gentler factor) so they fan out toward
    // unvisited soil instead of cycling around the surface mound where
    // pheromone density is highest.
    const ph = getPheromone(tx, ty, tz);
    const pheromoneFactor = this.carrying
      ? 1 + PHEROMONE_PULL_STRENGTH * ph
      : 1 / (1 + PHEROMONE_PULL_STRENGTH * 0.4 * ph);
    return angleScore * vertical * pheromoneFactor;
  }

  private sampleCandidate(cands: MoveCandidate[]): NeighbourOffset {
    let total = 0;
    for (const c of cands) total += c.weight;
    if (total <= 0) return cands[Math.floor(Math.random() * cands.length)].offset;
    let r = Math.random() * total;
    for (const c of cands) {
      r -= c.weight;
      if (r <= 0) return c.offset;
    }
    return cands[cands.length - 1].offset;
  }

  private startMove(o: NeighbourOffset): void {
    this.srcVx = this.vx;
    this.srcVy = this.vy;
    this.srcVz = this.vz;
    this.tgtVx = this.vx + o.dx;
    this.tgtVy = this.vy + o.dy;
    this.tgtVz = this.vz + o.dz;
    this.moveDistance = o.distance;
    this.moveProgress = 0;
    this.isMoving = true;
    // Snap heading toward the move so successive moves prefer the same
    // direction (straighter tunnels). Pure-Z moves leave the heading alone.
    if (!Number.isNaN(o.angle)) {
      this.angle += wrapAngle(o.angle - this.angle) * 0.5;
    }
  }

  // ─── Drawing ───────────────────────────────────────────────────────────────

  /** Compute the pixel position the ant should be drawn at this frame,
   *  interpolating between source and target voxel centres when mid-step. */
  private interpolatedPx(): { x: number; y: number } {
    if (this.isMoving) {
      const sx = voxelCentrePx(this.srcVx);
      const sy = voxelCentrePx(this.srcVy);
      const tx = voxelCentrePx(this.tgtVx);
      const ty = voxelCentrePx(this.tgtVy);
      const t = this.moveProgress;
      return { x: sx + (tx - sx) * t, y: sy + (ty - sy) * t };
    }
    return { x: voxelCentrePx(this.vx), y: voxelCentrePx(this.vy) };
  }

  updateAnimation(): void {
    const target = this.interpolatedPx();
    const dx = target.x - this.drawX;
    const dy = target.y - this.drawY;
    // Snap on large discrepancies (e.g. respawn or visual reset).
    if (Math.hypot(dx, dy) > 30) {
      this.drawX = target.x;
      this.drawY = target.y;
    } else {
      this.drawX += dx * 0.5;
      this.drawY += dy * 0.5;
    }
    const stepDist = Math.hypot(dx, dy);
    this.drawAngle += wrapAngle(this.angle - this.drawAngle) * 0.2;
    this.walkCycle += stepDist * 0.6;
  }

  draw(ctx: CanvasRenderingContext2D, isHighlighted = false): void {
    ctx.save();
    ctx.translate(this.drawX, this.drawY);

    if (isHighlighted) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 150);
      const r = 14 + pulse * 4;
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(255, 220, 0, 0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 220, 0, ${0.75 + pulse * 0.25})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(0, -r - 3);
      ctx.lineTo(-5, -r - 11);
      ctx.lineTo(5, -r - 11);
      ctx.closePath();
      ctx.fillStyle = `rgba(255, 220, 0, ${0.85 + pulse * 0.15})`;
      ctx.fill();
    }

    const scale = 1 + (this.vz - 1) * 0.2;
    ctx.scale(scale, scale);
    ctx.rotate(this.drawAngle);

    const w = Math.sin(this.walkCycle) * 2;

    ctx.strokeStyle = '#2d3748';
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    ctx.moveTo(1, 0); ctx.lineTo(3, -4 + w);
    ctx.moveTo(1, 0); ctx.lineTo(3, 4 - w);
    ctx.moveTo(-1, 0); ctx.lineTo(-1, -4 - w);
    ctx.moveTo(-1, 0); ctx.lineTo(-1, 4 + w);
    ctx.moveTo(-3, 0); ctx.lineTo(-5, -4 + w);
    ctx.moveTo(-3, 0); ctx.lineTo(-5, 4 - w);
    ctx.stroke();

    ctx.fillStyle = '#1a202c';
    ctx.beginPath(); ctx.ellipse(-2, 0, 2.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(1, 0, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, 0, 1.8, 0, Math.PI * 2); ctx.fill();

    ctx.beginPath();
    ctx.moveTo(5, 0); ctx.lineTo(7, -2);
    ctx.moveTo(5, 0); ctx.lineTo(7, 2);
    ctx.stroke();

    if (this.carrying) {
      // Match the gradient applied to soil at this y, so the carried voxel
      // visually matches the colour it will take once placed.
      ctx.fillStyle = gradientRgbaAt(this.drawY);
      ctx.beginPath();
      ctx.arc(6, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function shuffleInPlace<T>(a: T[]): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}
