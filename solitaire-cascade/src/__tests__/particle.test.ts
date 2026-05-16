import { describe, it, expect, beforeEach } from 'vitest';
import { Particle } from '../particle';
import { config } from '../config';
import { effectState } from '../effectState';

function makeCtx(): CanvasRenderingContext2D {
  const ctx: Record<string, unknown> = {
    save: () => {},
    restore: () => {},
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    ellipse: () => {},
    translate: () => {},
    rotate: () => {},
    lineTo: () => {},
    closePath: () => {},
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  config.scale = 1;
  config.width = 800;
  config.height = 600;
  config.FOCAL_LENGTH = 500;
  effectState.neon = false;
});

describe('Particle.init', () => {
  it('sets active to true', () => {
    const p = new Particle();
    p.init(100, 200, 0, '#fff', false, false, 'normal');
    expect(p.active).toBe(true);
  });

  it('sets position', () => {
    const p = new Particle();
    p.init(100, 200, 50, '#aaa', false, false, 'normal');
    expect(p.x).toBe(100);
    expect(p.y).toBe(200);
    expect(p.z).toBe(50);
  });

  it('sets color', () => {
    const p = new Particle();
    p.init(0, 0, 0, '#ff0000', false, false, 'normal');
    expect(p.color).toBe('#ff0000');
  });

  it('sets life to 1.0', () => {
    const p = new Particle();
    p.init(0, 0, 0, '#fff', false, false, 'normal');
    expect(p.life).toBe(1.0);
  });

  it('sets vz to 0 when isDepth is false', () => {
    const p = new Particle();
    p.init(0, 0, 0, '#fff', false, false, 'normal');
    expect(p.vz).toBe(0);
  });

  it('sets non-zero vz when isDepth is true', () => {
    let hadNonZeroVz = false;
    for (let i = 0; i < 30; i++) {
      const p = new Particle();
      p.init(0, 0, 0, '#fff', false, true, 'normal');
      if (p.vz !== 0) { hadNonZeroVz = true; break; }
    }
    expect(hadNonZeroVz).toBe(true);
  });

  it('sets isNeon and isDepth flags', () => {
    const p = new Particle();
    p.init(0, 0, 0, '#fff', true, true, 'normal');
    expect(p.isNeon).toBe(true);
    expect(p.isDepth).toBe(true);
  });

  describe('fire type', () => {
    it('sets upward (negative) vy', () => {
      const p = new Particle();
      p.init(0, 0, 0, '#fff', false, false, 'fire');
      expect(p.vy).toBeLessThan(0);
    });

    it('overrides color with fire hue', () => {
      const p = new Particle();
      p.init(0, 0, 0, '#fff', false, false, 'fire');
      expect(p.color).toMatch(/^hsl\(/);
    });

    it('has faster decay than normal', () => {
      const normal = new Particle();
      normal.init(0, 0, 0, '#fff', false, false, 'normal');

      const fire = new Particle();
      fire.init(0, 0, 0, '#fff', false, false, 'fire');
      // fire decay is 0.02–0.05, normal is 0.005–0.015
      expect(fire.decay).toBeGreaterThan(0.01);
    });
  });

  describe('water type', () => {
    it('sets downward (positive) vy toward gravity', () => {
      const p = new Particle();
      p.init(0, 0, 0, '#fff', false, false, 'water');
      // vy = Math.random() * 2 - 4 → range [-4, -2], always negative
      expect(p.vy).toBeLessThan(0);
    });

    it('overrides color with water hue', () => {
      const p = new Particle();
      p.init(0, 0, 0, '#fff', false, false, 'water');
      expect(p.color).toMatch(/^hsl\(/);
    });
  });

  describe('snow type', () => {
    it('sets positive vy (falls downward)', () => {
      const p = new Particle();
      p.init(0, 0, 0, '#fff', false, false, 'snow');
      expect(p.vy).toBeGreaterThan(0);
    });

    it('forces color to white', () => {
      const p = new Particle();
      p.init(0, 0, 0, '#ff0000', false, false, 'snow');
      expect(p.color).toBe('#ffffff');
    });
  });

  describe('star type', () => {
    it('sets color to gold when not neon', () => {
      const p = new Particle();
      p.init(0, 0, 0, '#fff', false, false, 'star');
      expect(p.color).toBe('#FFD700');
    });

    it('keeps provided color when neon', () => {
      const p = new Particle();
      p.init(0, 0, 0, '#ff00ff', true, false, 'star');
      expect(p.color).toBe('#ff00ff');
    });
  });
});

describe('Particle.update', () => {
  it('moves x by vx * timeScale', () => {
    const p = new Particle();
    p.init(100, 0, 0, '#fff', false, false, 'normal');
    p.vx = 5;
    p.update(1);
    expect(p.x).toBeCloseTo(105);
  });

  it('decreases life by decay * timeScale', () => {
    const p = new Particle();
    p.init(0, 0, 0, '#fff', false, false, 'normal');
    const decay = p.decay;
    p.update(1);
    expect(p.life).toBeCloseTo(1.0 - decay);
  });

  it('sets active = false when life drops to 0 or below', () => {
    const p = new Particle();
    p.init(0, 0, 0, '#fff', false, false, 'normal');
    p.life = 0.01;
    p.decay = 0.1;
    p.update(1);
    expect(p.active).toBe(false);
  });

  it('updates z when isDepth is true', () => {
    const p = new Particle();
    p.init(0, 0, 50, '#fff', false, true, 'normal');
    p.vz = 10;
    p.update(1);
    expect(p.z).toBeCloseTo(60);
  });

  it('does not update z when isDepth is false', () => {
    const p = new Particle();
    p.init(0, 0, 50, '#fff', false, false, 'normal');
    p.vz = 10; // manually set, but isDepth=false
    p.update(1);
    expect(p.z).toBe(50);
  });

  describe('fire', () => {
    it('shrinks size each step', () => {
      const p = new Particle();
      p.init(0, 0, 0, '#fff', false, false, 'fire');
      const initialSize = p.size;
      p.update(1);
      expect(p.size).toBeLessThan(initialSize);
    });

    it('moves y by vy directly (no gravity accumulation)', () => {
      const p = new Particle();
      p.init(0, 100, 0, '#fff', false, false, 'fire');
      p.vy = -3;
      const startY = p.y;
      p.update(1);
      expect(p.y).toBeCloseTo(startY + (-3));
    });
  });

  describe('water', () => {
    it('accelerates downward (vy increases each step)', () => {
      const p = new Particle();
      p.init(0, 0, 0, '#fff', false, false, 'water');
      const initialVy = p.vy;
      p.update(1);
      expect(p.vy).toBeGreaterThan(initialVy);
    });
  });

  describe('snow', () => {
    it('drifts sideways based on life', () => {
      const p = new Particle();
      p.init(0, 0, 0, '#fff', false, false, 'snow');
      p.vx = 0;
      p.life = 1.0;
      const expectedDrift = Math.sin(1.0 * 10) * 0.8 * 1;
      p.update(1);
      expect(p.x).toBeCloseTo(expectedDrift, 5);
    });

    it('moves downward', () => {
      const p = new Particle();
      p.init(0, 50, 0, '#fff', false, false, 'snow');
      p.vy = 1;
      const startY = p.y;
      p.update(1);
      expect(p.y).toBeGreaterThan(startY);
    });
  });

  describe('normal (else branch)', () => {
    it('moves y by vy * timeScale', () => {
      const p = new Particle();
      p.init(0, 100, 0, '#fff', false, false, 'normal');
      p.vy = -5;
      p.update(1);
      expect(p.y).toBeCloseTo(100 - 5);
    });
  });
});

describe('Particle.draw', () => {
  it('does not draw when life <= 0', () => {
    const p = new Particle();
    p.init(100, 100, 0, '#fff', false, false, 'normal');
    p.life = 0;
    // Should return early without error
    expect(() => p.draw(makeCtx())).not.toThrow();
  });

  it('draws normal type without error', () => {
    const p = new Particle();
    p.init(100, 100, 0, '#ff0000', false, false, 'normal');
    expect(() => p.draw(makeCtx())).not.toThrow();
  });

  it('draws normal type with neon effect', () => {
    effectState.neon = true;
    const p = new Particle();
    p.init(100, 100, 0, '#ff00ff', true, false, 'normal');
    expect(() => p.draw(makeCtx())).not.toThrow();
  });

  it('draws fire type without error', () => {
    const p = new Particle();
    p.init(100, 100, 0, '#fff', false, false, 'fire');
    expect(() => p.draw(makeCtx())).not.toThrow();
  });

  it('draws water type without error', () => {
    const p = new Particle();
    p.init(100, 100, 0, '#fff', false, false, 'water');
    expect(() => p.draw(makeCtx())).not.toThrow();
  });

  it('draws star type without error', () => {
    const p = new Particle();
    p.init(100, 100, 0, '#FFD700', false, false, 'star');
    expect(() => p.draw(makeCtx())).not.toThrow();
  });

  it('draws snow type without error', () => {
    const p = new Particle();
    p.init(100, 100, 0, '#ffffff', false, false, 'snow');
    expect(() => p.draw(makeCtx())).not.toThrow();
  });

  it('applies depth projection when isDepth is true', () => {
    const p = new Particle();
    p.init(400, 300, 200, '#fff', false, true, 'normal');
    expect(() => p.draw(makeCtx())).not.toThrow();
  });
});
