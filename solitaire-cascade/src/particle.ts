import type { ParticleType } from './types';
import { config } from './config';
import { effectState } from './effectState';

export class Particle {
  active = false;
  type: ParticleType = 'normal';
  x = 0; y = 0; z = 0;
  isNeon = false; isDepth = false;
  life = 1.0;
  color = '#ffffff';
  size = 4;
  decay = 0.01;
  vx = 0; vy = 0; vz = 0;
  rotation = 0;

  init(x: number, y: number, z: number, color: string, isNeon: boolean, isDepth: boolean, type: ParticleType): void {
    const { scale } = config;
    this.type = type; this.x = x; this.y = y; this.z = z;
    this.isNeon = isNeon; this.isDepth = isDepth;
    this.active = true; this.life = 1.0; this.color = color;
    this.size  = Math.max(3, (Math.random() * 8  + 4) * scale);
    this.decay = 0.005 + Math.random() * 0.01;
    this.vx = (Math.random() - 0.5) * 6;
    this.vy = (Math.random() - 0.5) * 6;
    this.vz = isDepth ? (Math.random() - 0.5) * 10 : 0;
    this.rotation = Math.random() * 6.28;

    if (type === 'fire') {
      this.vx *= 0.5;
      this.vy  = -Math.random() * 5 - 2;
      this.size  = Math.max(6, (Math.random() * 14 + 8) * scale);
      this.decay = 0.02 + Math.random() * 0.03;
      this.color = `hsl(${Math.floor(Math.random() * 50) + 10}, 100%, 60%)`;
    } else if (type === 'water') {
      this.vx *= 0.5;
      this.vy  = Math.random() * 2 - 4;
      this.size  = Math.max(3, (Math.random() * 6  + 3) * scale);
      this.decay = 0.01 + Math.random() * 0.01;
      this.color = `hsl(${Math.floor(Math.random() * 40) + 200}, 100%, 70%)`;
    } else if (type === 'snow') {
      this.vx *= 0.3;
      this.vy  = Math.random() * 1 + 0.5;
      this.size  = Math.max(2, (Math.random() * 4  + 2) * scale);
      this.decay = 0.005 + Math.random() * 0.005;
      this.color = '#ffffff';
    } else if (type === 'star') {
      this.vx *= 1.5; this.vy *= 1.5;
      this.size  = Math.max(4, (Math.random() * 8  + 4) * scale);
      this.decay = 0.01 + Math.random() * 0.01;
      if (!isNeon) this.color = '#FFD700';
    }
  }

  update(timeScale: number): void {
    this.x += this.vx * timeScale;
    if (this.type === 'fire') {
      this.y    += this.vy * timeScale;
      this.size *= Math.pow(0.96, timeScale);
    } else if (this.type === 'water') {
      this.vy += 0.25 * timeScale;
      this.y  += this.vy * timeScale;
    } else if (this.type === 'snow') {
      this.y += this.vy * timeScale;
      this.x += Math.sin(this.life * 10) * 0.8 * timeScale;
    } else {
      this.y += this.vy * timeScale;
    }
    if (this.isDepth) this.z += this.vz * timeScale;
    this.life -= this.decay * timeScale;
    if (this.life <= 0) this.active = false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { FOCAL_LENGTH, width, height } = config;
    let px = this.x, py = this.y, ps = this.size;
    if (this.isDepth) {
      const sz = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + this.z));
      px = (px - width  / 2) * sz + width  / 2;
      py = (py - height / 2) * sz + height / 2;
      ps *= sz;
    }

    ctx.save();
    ctx.globalAlpha = this.life;

    if (this.type === 'fire') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(px, py, ps * 2, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(px, py, ps * 0.6, 0, 6.28); ctx.fill();
    } else if (this.type === 'water') {
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.ellipse(px, py, ps * 0.8, ps * 1.4, 0, 0, 6.28); ctx.fill();
    } else if (this.type === 'star') {
      ctx.fillStyle = this.color;
      ctx.translate(px, py); ctx.rotate(this.rotation);
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        ctx.lineTo( Math.cos((18 + i * 72) / 180 * Math.PI) * ps,      -Math.sin((18 + i * 72) / 180 * Math.PI) * ps);
        ctx.lineTo( Math.cos((54 + i * 72) / 180 * Math.PI) * ps * 0.5, -Math.sin((54 + i * 72) / 180 * Math.PI) * ps * 0.5);
      }
      ctx.closePath(); ctx.fill();
    } else {
      if (effectState.neon && this.type !== 'snow') {
        ctx.globalAlpha = this.life * 0.4;
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(px, py, ps * 2.2, 0, 6.28); ctx.fill();
      }
      ctx.globalAlpha = this.life;
      ctx.fillStyle = (effectState.neon && this.type !== 'snow') ? '#ffffff' : this.color;
      ctx.beginPath(); ctx.arc(px, py, ps, 0, 6.28); ctx.fill();
    }
    ctx.restore();
  }
}
