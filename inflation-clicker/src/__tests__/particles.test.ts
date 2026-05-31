import { describe, it, expect, beforeEach } from 'vitest';
import { BigNum } from '../bignum';
import {
  particles,
  spawnDamage,
  spawnHitSpark,
  spawnBurst,
  spawnPowerUp,
  stepParticles,
  clearParticles,
  drawParticles,
} from '../particles';

function makeCtx(): CanvasRenderingContext2D {
  const ctx: Record<string, unknown> = {
    textAlign: '',
    lineJoin: '',
    miterLimit: 0,
    globalAlpha: 1,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    font: '',
    strokeText: () => {},
    fillText: () => {},
    measureText: (s: string) => ({ width: s.length * 10 }),
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  clearParticles();
});

describe('spawnDamage', () => {
  it('adds a particle with formatted damage strings', () => {
    spawnDamage(100, 200, new BigNum(1, 12));
    expect(particles.length).toBe(1);
    expect(particles[0]!.kanji).toBe('1兆');
  });

  it('caps the particle count', () => {
    for (let i = 0; i < 200; i++) spawnDamage(0, 0, new BigNum(1, 3));
    expect(particles.length).toBeLessThanOrEqual(36);
  });
});

describe('stepParticles', () => {
  it('moves particles and decelerates vertical velocity', () => {
    spawnDamage(0, 0, new BigNum(1, 3));
    const p = particles[0]!;
    const startVy = p.vy;
    stepParticles();
    expect(p.vy).toBeCloseTo(startVy * 0.92, 8);
  });

  it('removes particles once their life runs out', () => {
    spawnDamage(0, 0, new BigNum(1, 3));
    particles[0]!.life = 0.01;
    stepParticles();
    expect(particles.length).toBe(0);
  });
});

describe('spawnBurst', () => {
  it('spawns radial spark particles', () => {
    spawnBurst(100, 100);
    expect(particles.length).toBeGreaterThan(0);
    expect(particles.every((p) => p.spark === true)).toBe(true);
  });
});

describe('spawnHitSpark', () => {
  it('spawns an impact ring plus sparks', () => {
    spawnHitSpark(50, 60);
    expect(particles.some((p) => p.ring === true)).toBe(true);
    expect(particles.some((p) => p.spark === true)).toBe(true);
  });
});

describe('spawnPowerUp', () => {
  it('spawns an emerald ring and upward sparks (buff effect)', () => {
    spawnPowerUp(100, 200);
    expect(particles.some((p) => p.ring === true)).toBe(true);
    const sparks = particles.filter((p) => p.spark === true);
    expect(sparks.length).toBeGreaterThan(0);
    // 大半が上向き（vy < 0）に立ち上る
    expect(sparks.filter((p) => p.vy < 0).length).toBeGreaterThan(sparks.length / 2);
  });
});

describe('drawParticles', () => {
  it('renders damage text without throwing using a mock context', () => {
    spawnDamage(50, 50, new BigNum(2, 30));
    expect(() => drawParticles(makeCtx(), 390)).not.toThrow();
  });

  it('renders spark burst without throwing', () => {
    spawnBurst(50, 50);
    expect(() => drawParticles(makeCtx(), 390)).not.toThrow();
  });
});
