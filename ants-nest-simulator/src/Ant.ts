import { WIDTH, HEIGHT, DEPTH, GROUND_LEVEL, PROTECTED_DEPTH, PHEROMONE_DEPOSIT_EXPLORE, PHEROMONE_DEPOSIT_RETURN } from './constants';
import { getGridType, digGel, dropDirtInside, dropDirt, dirtColor, depositPheromone, getPheromone, makeDiggable } from './grid';

function wrapAngle(diff: number): number {
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return diff;
}

export class Ant {
  x: number;
  y: number;
  z: number;
  angle: number;
  readonly speed = 0.7;

  wanderAngle = Math.PI / 2;
  wanderTimer = 0;

  hasDirt = false;
  dropTimer = 0;
  turnCount = 0;
  surfaceFrustration = 0;

  drawX: number;
  drawY: number;
  drawAngle: number;
  presentationTargetAngle: number;
  walkCycle: number;

  prevX: number;
  prevY: number;
  accumDx = 0;
  accumDy = 0;

  constructor(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.angle = Math.random() * Math.PI * 2;

    this.drawX = x;
    this.drawY = y;
    this.drawAngle = this.angle;
    this.presentationTargetAngle = this.angle;
    this.walkCycle = Math.random() * Math.PI * 2;

    this.prevX = x;
    this.prevY = y;
  }

  private isWideSpace(): boolean {
    let emptyCount = 0;
    const r = 10;
    let total = 0;
    for (let dy = -r; dy <= r; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        if (dx * dx + dy * dy <= r * r) {
          total++;
          if (getGridType(this.x + dx, this.y + dy, this.z) === 0) emptyCount++;
        }
      }
    }
    return emptyCount / total > 0.65;
  }

  update(): void {
    const currentGridType = getGridType(this.x, this.y, this.z);
    if (currentGridType === 1 && this.y < GROUND_LEVEL) {
      // Ant got buried inside a surface mound — dig itself free.
      digGel(this.x, this.y, this.z, 2.5);
    } else if (currentGridType === 3) {
      this.y -= 2.0;
    }

    this.angle = ((this.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    const sensorDist = 6;
    const leftAngle = this.angle - Math.PI / 3;
    const rightAngle = this.angle + Math.PI / 3;

    const frontType = getGridType(
      this.x + Math.cos(this.angle) * sensorDist,
      this.y + Math.sin(this.angle) * sensorDist,
      this.z,
    );
    const leftType = getGridType(
      this.x + Math.cos(leftAngle) * sensorDist,
      this.y + Math.sin(leftAngle) * sensorDist,
      this.z,
    );
    const rightType = getGridType(
      this.x + Math.cos(rightAngle) * sensorDist,
      this.y + Math.sin(rightAngle) * sensorDist,
      this.z,
    );

    const frontVal = frontType > 0 ? 1 : 0;
    const leftVal = leftType > 0 ? 1 : 0;
    const rightVal = rightType > 0 ? 1 : 0;

    if (this.y < GROUND_LEVEL + 5 && !this.hasDirt) {
      const underType = getGridType(this.x, this.y + 6, this.z);
      if (underType === 1 || underType === 0) {
        this.angle += wrapAngle(Math.PI / 2 - this.angle) * 0.3;
      }
    }

    if (this.y < GROUND_LEVEL && getGridType(this.x, this.y + 8, this.z) === 0) {
      this.angle += wrapAngle(Math.PI / 2 - this.angle) * 0.05;
    }

    if (frontVal === 1) {
      this.handleObstacle(frontType, leftVal, rightVal);
    } else {
      this.handleFreeMovement();
    }

    if (this.y >= GROUND_LEVEL) this.surfaceFrustration = 0;

    this.x = Math.max(0, Math.min(WIDTH, this.x));
    this.y = Math.max(0, Math.min(HEIGHT, this.y));
    if (this.x === 0) this.angle = 0;
    if (this.x === WIDTH) this.angle = Math.PI;
    if (this.y === 0) this.angle = Math.PI / 2;
    if (this.y === HEIGHT) this.angle = -Math.PI / 2;
  }

  private handleObstacle(frontType: number, leftVal: number, rightVal: number): void {
    const isDeadEnd = leftVal === 1 && rightVal === 1;
    let digProb = 0;

    if (!this.hasDirt && frontType === 1) {
      const depthRatio = Math.max(0, (this.y - GROUND_LEVEL) / (HEIGHT - GROUND_LEVEL));
      const inWideSpace = this.y >= GROUND_LEVEL + 15 ? this.isWideSpace() : false;

      if (this.y < GROUND_LEVEL + PROTECTED_DEPTH + 5) {
        digProb = 0.8;
      } else if (isDeadEnd) {
        digProb = 1.0;
      } else {
        digProb = 0.002 + depthRatio * 0.015;
      }

      if (inWideSpace) digProb = 0;
    }

    if (digProb > 0 && Math.random() < digProb) {
      this.digOneCell();
    } else {
      this.avoidObstacle(frontType, leftVal, rightVal);
    }
  }

  /**
   * Per-cell dig with forward sustain: shave one small chunk of gel (radius 1.5) and step forward
   * a fraction of normal speed. Tunnels lengthen via repeated single-bite digs, never via a burst.
   * On each bite there's a small chance the ant decides "I have enough" — it grabs the dirt, turns
   * around, and heads back toward the surface to deposit it.
   */
  private digOneCell(): void {
    const digX = this.x + Math.cos(this.angle) * 2;
    const digY = this.y + Math.sin(this.angle) * 2;
    digGel(digX, digY, this.z, 1.5);
    this.x += Math.cos(this.angle) * this.speed * 0.4;
    this.y += Math.sin(this.angle) * this.speed * 0.4;
    this.angle += (Math.random() - 0.5) * 0.15;
    if (Math.random() < 0.05) {
      this.hasDirt = true;
      this.angle += Math.PI;
      this.wanderAngle = this.y >= GROUND_LEVEL ? -Math.PI / 2 : Math.PI / 2;
      this.wanderTimer = 100;
      this.turnCount = 0;
    }
  }

  private avoidObstacle(frontType: number, leftVal: number, rightVal: number): void {
    this.turnCount++;

    if (frontType === 3 && this.y < GROUND_LEVEL + 30) {
      if (!this.hasDirt) this.surfaceFrustration++;
      const dir = Math.random() > 0.5 ? 0 : Math.PI;
      this.angle = dir + (Math.random() - 0.5) * 0.4;
      this.x += Math.cos(this.angle) * this.speed;
      this.y += Math.sin(this.angle) * this.speed;
    } else if (this.turnCount > 3) {
      this.angle += (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2 + Math.random() * (Math.PI / 2));
      this.turnCount = 0;
    } else {
      if (leftVal === 0 && rightVal === 1) {
        this.angle -= 0.3;
      } else if (rightVal === 0 && leftVal === 1) {
        this.angle += 0.3;
      } else {
        this.angle += (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2 + Math.random() * 0.5);
      }
      this.x += Math.cos(this.angle) * this.speed * 0.5;
      this.y += Math.sin(this.angle) * this.speed * 0.5;
    }
  }

  private handleFreeMovement(): void {
    this.turnCount = 0;

    this.wanderTimer--;
    if (this.wanderTimer <= 0) {
      const depthRatio = Math.max(0, (this.y - GROUND_LEVEL) / (HEIGHT - GROUND_LEVEL));
      if (this.hasDirt) {
        this.wanderAngle = this.y >= GROUND_LEVEL
          ? -Math.PI / 2 + (Math.random() - 0.5) * 0.3
          : Math.PI / 2 + (Math.random() - 0.5) * 0.3;
        this.wanderTimer = 100 + Math.random() * 150;
      } else if (this.y < GROUND_LEVEL) {
        // Surface explorer: prefer long horizontal traversals so they sample the whole surface.
        if (Math.random() < 0.3) {
          this.wanderAngle = Math.PI / 2 + (Math.random() - 0.5) * 0.6;
        } else {
          const dir = Math.random() > 0.5 ? 0 : Math.PI;
          this.wanderAngle = dir + (Math.random() - 0.5) * 0.5;
        }
        this.wanderTimer = 250 + Math.random() * 300;
      } else if (Math.random() < depthRatio * 0.7) {
        this.wanderAngle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
        this.wanderTimer = 100 + Math.random() * 200;
      } else {
        this.wanderAngle = Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
        this.wanderTimer = 100 + Math.random() * 200;
      }
    }

    if (Math.random() < 0.05) {
      const possibleZ: number[] = [];
      if (this.z > 0 && getGridType(this.x, this.y, this.z - 1) === 0) possibleZ.push(this.z - 1);
      if (this.z < DEPTH - 1 && getGridType(this.x, this.y, this.z + 1) === 0) possibleZ.push(this.z + 1);
      if (possibleZ.length > 0) {
        this.z = possibleZ[Math.floor(Math.random() * possibleZ.length)];
      }
    }

    if (this.hasDirt && this.y >= GROUND_LEVEL) {
      const depthRatio = Math.max(0, (this.y - GROUND_LEVEL) / (HEIGHT - GROUND_LEVEL));
      if (Math.random() < 0.0001 + depthRatio * 0.005) {
        this.hasDirt = false;
        dropDirtInside(this.x, this.y, this.z);
        this.wanderAngle = Math.PI / 2;
        this.wanderTimer = 100;
      }
    }

    if (this.hasDirt && this.y < GROUND_LEVEL) {
      if (this.dropTimer <= 0) this.dropTimer = 30 + Math.random() * 80;
      this.dropTimer--;
      if (this.dropTimer <= 0) {
        this.hasDirt = false;
        dropDirt(this.x, this.y, this.z);
        this.wanderAngle = Math.PI / 2;
        this.wanderTimer = 100;
      }
    }

    if (this.y >= GROUND_LEVEL) {
      const senseDist = 8;
      const la = this.angle - Math.PI / 3;
      const ra = this.angle + Math.PI / 3;
      const leftPh = getPheromone(
        this.x + Math.cos(la) * senseDist,
        this.y + Math.sin(la) * senseDist,
        this.z,
      );
      const rightPh = getPheromone(
        this.x + Math.cos(ra) * senseDist,
        this.y + Math.sin(ra) * senseDist,
        this.z,
      );
      const phDiff = leftPh - rightPh;
      if (this.hasDirt) {
        this.angle -= phDiff * 0.3;
      } else {
        this.angle += phDiff * 0.1;
      }

      const deposit = this.hasDirt ? PHEROMONE_DEPOSIT_RETURN : PHEROMONE_DEPOSIT_EXPLORE;
      depositPheromone(this.x, this.y, this.z, deposit);
    }

    // Frustrated surface ants open a fresh entrance where they happen to be.
    if (!this.hasDirt && this.y < GROUND_LEVEL && this.surfaceFrustration > 120) {
      makeDiggable(this.x, this.z, 4, PROTECTED_DEPTH + 1);
      this.surfaceFrustration = 0;
    }

    this.angle += wrapAngle(this.wanderAngle - this.angle) * (this.hasDirt ? 0.12 : 0.03);

    if (getGridType(this.x, this.y + 3, this.z) === 0) this.y += 0.5;

    const currentSpeed = this.y >= GROUND_LEVEL ? this.speed * 1.5 : this.speed;
    this.x += Math.cos(this.angle) * currentSpeed;
    this.y += Math.sin(this.angle) * currentSpeed;
  }

  updateAnimation(): void {
    // Minimum distance the actual position must diverge from the drawn position
    // before any visual update occurs. Suppresses spinning-in-place appearance.
    const DRAW_THRESHOLD = 3.0;

    const dx = this.x - this.prevX;
    const dy = this.y - this.prevY;

    if (Math.hypot(dx, dy) > 15) {
      this.accumDx = 0;
      this.accumDy = 0;
    } else {
      this.accumDx += dx;
      this.accumDy += dy;
    }

    if (Math.hypot(this.accumDx, this.accumDy) > 3.0) {
      this.presentationTargetAngle = Math.atan2(this.accumDy, this.accumDx);
      this.accumDx = 0;
      this.accumDy = 0;
    }

    this.prevX = this.x;
    this.prevY = this.y;

    const drawDx = this.x - this.drawX;
    const drawDy = this.y - this.drawY;
    const drawDist = Math.hypot(drawDx, drawDy);

    let stepDx = 0;
    let stepDy = 0;

    if (drawDist > 15) {
      this.drawX = this.x;
      this.drawY = this.y;
      this.drawAngle = this.presentationTargetAngle;
    } else if (drawDist > DRAW_THRESHOLD) {
      stepDx = drawDx * 0.4;
      stepDy = drawDy * 0.4;
      this.drawX += stepDx;
      this.drawY += stepDy;
      this.drawAngle += wrapAngle(this.presentationTargetAngle - this.drawAngle) * 0.15;
    }

    this.walkCycle += Math.hypot(stepDx, stepDy) * 0.6;
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

    const scale = 1 + (this.z - 1) * 0.2;
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

    if (this.hasDirt) {
      ctx.fillStyle = `rgba(0, ${dirtColor(this.drawY)}, 0.9)`;
      ctx.beginPath();
      ctx.arc(6, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
