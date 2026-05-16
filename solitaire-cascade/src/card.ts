import type { Suit, CardValue, EffectState } from './types';
import { config } from './config';
import { getFaceTexture, getBackTexture } from './textures';

export type SpawnParticleFn = (x: number, y: number, z: number, color: string, neon: boolean, depth: boolean) => void;

export class Card {
  active = false;
  options: EffectState = {} as EffectState;
  suit: Suit = '♠';
  val: CardValue = 'A';
  scaleMultiplier = 1.0;
  x = 0; y = 0; z = 0; age = 0;
  vx = 0; vy = 0; vz = 0;
  gravity = 0.2; bounce = 0.75;
  evicting = false; zBounces = 0;
  rotation = 0; rotationSpeed = 0;
  zRotation = 0; zRotationSpeed = 0;
  hue = 0; opacity = 1.0;
  timeSinceLastTrail = 1.0;
  shouldDrawTrail = true;

  init(x: number, y: number, options: EffectState, suit: Suit, val: CardValue): void {
    const { scale } = config;
    this.options = { ...options };
    this.suit = suit; this.val = val;
    this.scaleMultiplier = 1.0;
    this.x = x - 35.5 * scale;
    this.y = y - 48  * scale;
    this.z = 0; this.age = 0;

    const dir = Math.random() < 0.5 ? -1 : 1;
    this.vx = dir * (Math.random() * 2.0 + 1.5);
    this.vy = -Math.random() * 3 - 1;

    if (options.chaos) {
      this.vx = (Math.random() - 0.5) * 20;
      this.vy = (Math.random() - 0.5) * 20;
      this.gravity = (Math.random() - 0.5) * 1.5;
      this.bounce  = 0.9 + Math.random() * 0.2;
    } else {
      this.gravity = 0.2; this.bounce = 0.75;
    }
    this.active = true; this.evicting = false; this.zBounces = 0;
    this.vz = options.depth ? (Math.random() - 0.5) * 15 : 0;
    this.rotation      = 0;
    this.rotationSpeed = options.spin  ? (Math.random() - 0.5) * 0.2 : 0;
    this.zRotation     = 0;
    this.zRotationSpeed = options.zSpin ? (Math.random() - 0.5) * 0.3 : 0;
    this.hue = Math.random() * 360; this.opacity = 1.0;
    this.timeSinceLastTrail = 1.0; this.shouldDrawTrail = true;
  }

  update(timeScale: number, particleCount: number, maxParticles: number, onSpawnParticle: SpawnParticleFn): void {
    if (!this.active) return;
    const { scale, height, width } = config;
    this.age += timeScale;

    this.timeSinceLastTrail += timeScale;
    this.shouldDrawTrail = false;
    if (this.timeSinceLastTrail >= 1.0) {
      this.shouldDrawTrail = true;
      this.timeSinceLastTrail -= 1.0;
    }

    if (this.scaleMultiplier < (this.options.giant ? 2 : 1)) {
      this.scaleMultiplier += 0.08 * timeScale;
    }

    this.vy += this.gravity * timeScale;
    this.x  += this.vx * timeScale;
    this.y  += this.vy * timeScale;

    if (this.options.depth) {
      this.z += this.vz * timeScale;
      if (!this.evicting) {
        if (this.z > 1000 || this.z < -400) {
          this.z = Math.max(-400, Math.min(1000, this.z));
          this.vz *= -1; this.zBounces++;
        }
        if (this.zBounces > 2) { this.evicting = true; this.vz = this.vz > 0 ? 40 : -40; }
      }
    }
    this.rotation  += this.rotationSpeed  * timeScale;
    this.zRotation += this.zRotationSpeed * timeScale;

    if (!this.evicting) {
      const cb = this.y + 96 * this.scaleMultiplier * scale;
      if (this.options.chaos) {
        if (cb >= height) { this.y = height - 96 * this.scaleMultiplier * scale; this.vy *= -this.bounce; }
        else if (this.y <= 0) { this.y = 0; this.vy *= -this.bounce; }
        if (this.x <= 0) { this.x = 0; this.vx *= -this.bounce; }
        else if (this.x + 71 * this.scaleMultiplier * scale >= width) { this.x = width - 71 * this.scaleMultiplier * scale; this.vx *= -this.bounce; }
        if (this.age > 200) this.evicting = true;
      } else {
        if (cb >= height) {
          this.y = height - 96 * this.scaleMultiplier * scale;
          if (Math.abs(this.vy) < 0.8 && this.age > 20) { this.evicting = true; this.vx *= 1.5; }
          else { this.vy *= -this.bounce; }
        }
      }
    }

    if (this.options.particles && particleCount < maxParticles && Math.random() < timeScale) {
      onSpawnParticle(
        this.x + 35.5 * scale, this.y + 48 * scale, this.z,
        `hsl(${this.hue},100%,70%)`, this.options.neon, this.options.depth,
      );
    }

    if (this.evicting) this.opacity -= 0.03 * timeScale;

    const mx = 150 * scale, my = 150 * scale;
    if (this.opacity <= 0 || this.x < -mx || this.x > width + mx || this.y > height + my || this.z < -2000 || this.z > 4000) {
      this.active = false;
    }
  }

  draw(ctxTarget: CanvasRenderingContext2D): void {
    if (this.opacity <= 0) return;
    const { FOCAL_LENGTH, width, height, scale } = config;
    let px  = this.x + (71 * this.scaleMultiplier * scale) / 2;
    let py  = this.y + (96 * this.scaleMultiplier * scale) / 2;
    let pcw = 71 * this.scaleMultiplier * scale;
    let pch = 96 * this.scaleMultiplier * scale;
    let sz  = 1;
    if (this.options.depth) {
      sz  = Math.max(0.05, FOCAL_LENGTH / (FOCAL_LENGTH + this.z));
      px  = (px  - width  / 2) * sz + width  / 2;
      py  = (py  - height / 2) * sz + height / 2;
      pcw *= sz; pch *= sz;
    }

    ctxTarget.save();
    ctxTarget.translate(px, py);
    ctxTarget.globalAlpha = this.opacity;
    if (this.options.spin) ctxTarget.rotate(this.rotation);

    let isFace = true;
    if (this.options.zSpin) {
      const zs = Math.cos(this.zRotation);
      ctxTarget.scale(zs, 1);
      if (zs < 0) isFace = false;
    }

    if (this.options.neon) {
      this.hue = (this.hue + 2) % 360;
      const col = `hsl(${this.hue},100%,70%)`;
      ctxTarget.strokeStyle = col;
      ctxTarget.lineWidth   = 12 * sz * scale;
      ctxTarget.globalAlpha = this.opacity * 0.4;
      ctxTarget.strokeRect(-pcw / 2, -pch / 2, pcw, pch);
      ctxTarget.lineWidth   = 3 * sz * scale;
      ctxTarget.globalAlpha = this.opacity;
      ctxTarget.strokeRect(-pcw / 2, -pch / 2, pcw, pch);
    }

    ctxTarget.drawImage(
      isFace ? getFaceTexture(this.suit, this.val) : getBackTexture(),
      -pcw / 2, -pch / 2, pcw, pch,
    );
    ctxTarget.restore();
  }
}
