import { WIDTH, HEIGHT, DEPTH, GROUND_LEVEL, PROTECTED_DEPTH, PHEROMONE_DEPOSIT_EXPLORE, PHEROMONE_DEPOSIT_RETURN } from './constants';
import { getGridType, digGel, dropDirtInside, dropDirt, dirtColor, depositPheromone, getPheromone, makeDiggable } from './grid';

function wrapAngle(diff: number): number {
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return diff;
}

type DigMode = 'none' | 'tunnel' | 'room';

export class Ant {
  x: number;
  y: number;
  z: number;
  angle: number;
  readonly speed = 0.7;

  digMode: DigMode = 'none';
  digTimer = 0;
  targetDigAngle = 0;
  wanderAngle = Math.PI / 2;
  wanderTimer = 0;

  hasDirt = false;
  dropTimer = 0;
  turnCount = 0;

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
    // Prevent burial: push upward if trapped in dirt above ground
    const currentGridType = getGridType(this.x, this.y, this.z);
    if (currentGridType >= 2 && this.y < GROUND_LEVEL) {
      this.y -= 2.0;
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

    // Near the surface, steer toward the entrance when a hole is underfoot
    if (this.y < GROUND_LEVEL + 5 && !this.hasDirt) {
      const underType = getGridType(this.x, this.y + 6, this.z);
      if (underType === 1 || underType === 0) {
        this.angle += wrapAngle(Math.PI / 2 - this.angle) * 0.3;
      }
    }

    if (this.y < GROUND_LEVEL && getGridType(this.x, this.y + 8, this.z) === 0) {
      this.angle += wrapAngle(Math.PI / 2 - this.angle) * 0.05;
    }

    if (this.digMode !== 'none') {
      this.updateDigging(frontVal);
    } else {
      this.updateWalking(frontVal, leftVal, rightVal, frontType, leftType, rightType);
    }

    this.x = Math.max(0, Math.min(WIDTH, this.x));
    this.y = Math.max(0, Math.min(HEIGHT, this.y));
    if (this.x === 0) this.angle = 0;
    if (this.x === WIDTH) this.angle = Math.PI;
    if (this.y === 0) this.angle = Math.PI / 2;
    if (this.y === HEIGHT) this.angle = -Math.PI / 2;
  }

  private updateDigging(frontVal: number): void {
    if (this.digMode === 'tunnel' && frontVal === 0) {
      this.digMode = 'none';
      this.hasDirt = true;
      return;
    }

    const radius = this.digMode === 'room' ? 10 : 1.5;
    const digX = this.x + Math.cos(this.angle) * 2;
    const digY = this.y + Math.sin(this.angle) * 2;

    digGel(digX, digY, this.z, radius);

    if (this.digMode === 'tunnel') {
      this.x += Math.cos(this.angle) * (this.speed * 0.4);
      this.y += Math.sin(this.angle) * (this.speed * 0.4);

      this.angle += wrapAngle(this.targetDigAngle - this.angle) * 0.15;
      this.angle += (Math.random() - 0.5) * 0.1;

      if (Math.random() < 0.03) {
        const nextZ = this.z + (Math.random() < 0.5 ? -1 : 1);
        if (nextZ >= 0 && nextZ < DEPTH) this.z = nextZ;
      }
    } else {
      this.x += Math.cos(this.angle) * (this.speed * 0.1);
      this.y += Math.sin(this.angle) * (this.speed * 0.1);
      this.angle += 0.3 + (Math.random() - 0.5) * 0.2;

      if (this.z - 1 >= 0) digGel(digX, digY, this.z - 1, radius * 0.6);
      if (this.z + 1 < DEPTH) digGel(digX, digY, this.z + 1, radius * 0.6);
    }

    this.digTimer--;
    if (this.digTimer <= 0) {
      this.digMode = 'none';
      this.hasDirt = true;
      this.angle += Math.PI;
      this.wanderAngle = -Math.PI / 2;
      this.wanderTimer = 100;
      this.turnCount = 0;
    }
  }

  private updateWalking(
    frontVal: number,
    leftVal: number,
    rightVal: number,
    frontType: number,
    _leftType: number,
    _rightType: number,
  ): void {
    if (frontVal === 1) {
      this.handleObstacle(frontType, leftVal, rightVal);
    } else {
      this.handleFreeMovement();
    }
  }

  private handleObstacle(frontType: number, leftVal: number, rightVal: number): void {
    const isDeadEnd = leftVal === 1 && rightVal === 1;
    let digProb = 0;

    if (!this.hasDirt && (frontType === 1 || frontType === 2)) {
      const depthRatio = Math.max(0, (this.y - GROUND_LEVEL) / (HEIGHT - GROUND_LEVEL));
      const inWideSpace = this.y >= GROUND_LEVEL + 15 ? this.isWideSpace() : false;

      if (this.y < GROUND_LEVEL + PROTECTED_DEPTH + 5 && frontType === 1) {
        digProb = 0.8;
      } else if (isDeadEnd) {
        digProb = 1.0;
      } else {
        digProb = 0.002 + depthRatio * 0.015;
      }

      if (inWideSpace) digProb = 0;
    }

    if (digProb > 0 && Math.random() < digProb) {
      this.startDigging(isDeadEnd);
    } else {
      this.avoidObstacle(frontType, leftVal, rightVal);
    }
  }

  private startDigging(isDeadEnd: boolean): void {
    this.turnCount = 0;

    const depthFromGround = this.y - GROUND_LEVEL;
    const roomProb = depthFromGround > 150 ? 0.2 : 0.1;

    if (this.y >= GROUND_LEVEL + 15 && isDeadEnd && Math.random() < roomProb) {
      this.digMode = 'room';
      this.digTimer = 200 + Math.random() * 200;
    } else {
      this.digMode = 'tunnel';
      this.digTimer = 120 + Math.random() * 80;

      if (this.y < GROUND_LEVEL + PROTECTED_DEPTH + 5) {
        this.targetDigAngle = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      } else {
        // High pheromone (busy area) → branch horizontally; low (unexplored) → dig downward
        const localPh = getPheromone(this.x, this.y, this.z);
        const horizontalBias = Math.min(0.65, localPh * 1.8);
        const r = Math.random();
        if (r < horizontalBias) {
          this.targetDigAngle = Math.random() > 0.5
            ? (Math.random() - 0.5) * 0.5
            : Math.PI + (Math.random() - 0.5) * 0.5;
        } else {
          const r2 = Math.random();
          if (r2 < 0.50) this.targetDigAngle = Math.PI / 2;
          else if (r2 < 0.70) this.targetDigAngle = Math.PI / 2 + (Math.random() - 0.5) * Math.PI / 3;
          else if (r2 < 0.90) this.targetDigAngle = Math.PI / 2 - (Math.random() - 0.5) * Math.PI / 3;
          else this.targetDigAngle = Math.random() > 0.5 ? Math.PI / 6 : Math.PI - Math.PI / 6;
        }
      }
    }
  }

  private avoidObstacle(frontType: number, leftVal: number, rightVal: number): void {
    this.turnCount++;

    if ((frontType === 3 || frontType === 2) && this.y < GROUND_LEVEL + 30) {
      const turn = (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 3 + Math.random() * Math.PI / 3);
      this.angle += turn;
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
        this.wanderAngle = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
      } else if (Math.random() < depthRatio * 0.7) {
        this.wanderAngle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
      } else {
        this.wanderAngle = Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
      }
      this.wanderTimer = 100 + Math.random() * 200;
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

    // Sense pheromone underground and steer accordingly
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
        // Returning: follow stronger pheromone (stick to known routes)
        this.angle -= phDiff * 0.3;
      } else {
        // Exploring: slightly prefer weaker pheromone (seek uncharted areas)
        this.angle += phDiff * 0.1;
      }

      // Deposit pheromone
      const deposit = this.hasDirt ? PHEROMONE_DEPOSIT_RETURN : PHEROMONE_DEPOSIT_EXPLORE;
      depositPheromone(this.x, this.y, this.z, deposit);
    }

    // Agent-driven entrance creation: open a new entrance in isolated surface areas
    if (!this.hasDirt && this.y < GROUND_LEVEL + 3 && this.wanderTimer <= 0 && Math.random() < 0.0003) {
      const checkRadius = 35;
      let hasNearbyOpening = false;
      outer: for (let cx = Math.max(0, Math.floor(this.x - checkRadius)); cx <= Math.min(WIDTH - 1, Math.ceil(this.x + checkRadius)); cx += 3) {
        for (let cy = GROUND_LEVEL; cy <= GROUND_LEVEL + PROTECTED_DEPTH + 2; cy++) {
          const t = getGridType(cx, cy, this.z);
          if (t === 0 || t === 1) { hasNearbyOpening = true; break outer; }
        }
      }
      if (!hasNearbyOpening) {
        makeDiggable(this.x, this.z, 4, PROTECTED_DEPTH + 1);
      }
    }

    if (this.y >= GROUND_LEVEL) {
      this.angle += wrapAngle(this.wanderAngle - this.angle) * (this.hasDirt ? 0.12 : 0.03);
    } else {
      this.angle += (Math.random() - 0.5) * 0.2;
    }

    if (getGridType(this.x, this.y + 3, this.z) === 0) this.y += 0.5;

    const currentSpeed = this.y >= GROUND_LEVEL ? this.speed * 1.5 : this.speed;
    this.x += Math.cos(this.angle) * currentSpeed;
    this.y += Math.sin(this.angle) * currentSpeed;
  }

  updateAnimation(): void {
    const dx = this.x - this.prevX;
    const dy = this.y - this.prevY;

    if (Math.hypot(dx, dy) > 15) {
      this.accumDx = 0;
      this.accumDy = 0;
    } else {
      this.accumDx += dx;
      this.accumDy += dy;
    }

    if (Math.hypot(this.accumDx, this.accumDy) > 2.0) {
      this.presentationTargetAngle = Math.atan2(this.accumDy, this.accumDx);
      this.accumDx = 0;
      this.accumDy = 0;
    }

    this.prevX = this.x;
    this.prevY = this.y;

    const drawDx = this.x - this.drawX;
    const drawDy = this.y - this.drawY;

    if (Math.hypot(drawDx, drawDy) > 15) {
      this.drawX = this.x;
      this.drawY = this.y;
    } else {
      this.drawX += drawDx * 0.4;
      this.drawY += drawDy * 0.4;
    }

    this.drawAngle += wrapAngle(this.presentationTargetAngle - this.drawAngle) * 0.15;

    this.walkCycle += Math.hypot(drawDx * 0.4, drawDy * 0.4) * 0.6;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.drawX, this.drawY);

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
