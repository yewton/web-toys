import { describe, it, expect, beforeEach } from 'vitest';
import { Card } from '../card';
import { config } from '../config';
import type { EffectState } from '../types';

function makeCtx(): CanvasRenderingContext2D {
  const ctx: Record<string, unknown> = {
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    globalAlpha: 1,
    strokeStyle: '',
    lineWidth: 1,
    fillStyle: '',
    globalCompositeOperation: 'source-over',
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    ellipse: () => {},
    strokeRect: () => {},
    drawImage: () => {},
    closePath: () => {},
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

const baseOptions: EffectState = {
  spin: false, giant: false, zSpin: false, depth: false,
  neon: false, chaos: false, particles: false, continuousDrag: false,
};

beforeEach(() => {
  config.scale = 1;
  config.width = 800;
  config.height = 600;
  config.FOCAL_LENGTH = 500;
});

describe('Card.init', () => {
  it('sets active to true', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    expect(card.active).toBe(true);
  });

  it('sets suit and value', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♥', 'K');
    expect(card.suit).toBe('♥');
    expect(card.val).toBe('K');
  });

  it('positions card centered on spawn point', () => {
    const card = new Card();
    card.init(100, 100, baseOptions, '♠', 'A');
    expect(card.x).toBeCloseTo(100 - 35.5);
    expect(card.y).toBeCloseTo(100 - 48);
  });

  it('resets z and age to 0', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    expect(card.z).toBe(0);
    expect(card.age).toBe(0);
  });

  it('resets evicting to false', () => {
    const card = new Card();
    card.evicting = true;
    card.init(400, 300, baseOptions, '♠', 'A');
    expect(card.evicting).toBe(false);
  });

  it('sets default gravity and bounce for non-chaos mode', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    expect(card.gravity).toBe(0.2);
    expect(card.bounce).toBe(0.75);
  });

  it('chaos: applies randomized bounce (≥ 0.9)', () => {
    const card = new Card();
    card.init(400, 300, { ...baseOptions, chaos: true }, '♠', 'A');
    expect(card.bounce).toBeGreaterThanOrEqual(0.9);
    expect(card.bounce).toBeLessThanOrEqual(1.1);
  });

  it('depth: sets non-zero vz', () => {
    let hadNonZeroVz = false;
    for (let i = 0; i < 30; i++) {
      const card = new Card();
      card.init(400, 300, { ...baseOptions, depth: true }, '♠', 'A');
      if (card.vz !== 0) { hadNonZeroVz = true; break; }
    }
    expect(hadNonZeroVz).toBe(true);
  });

  it('non-depth: vz is 0', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    expect(card.vz).toBe(0);
  });

  it('spin: sets non-zero rotationSpeed', () => {
    let hadSpin = false;
    for (let i = 0; i < 30; i++) {
      const card = new Card();
      card.init(400, 300, { ...baseOptions, spin: true }, '♠', 'A');
      if (card.rotationSpeed !== 0) { hadSpin = true; break; }
    }
    expect(hadSpin).toBe(true);
  });

  it('non-spin: rotationSpeed is 0', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    expect(card.rotationSpeed).toBe(0);
  });

  it('zSpin: sets non-zero zRotationSpeed', () => {
    let hadZSpin = false;
    for (let i = 0; i < 30; i++) {
      const card = new Card();
      card.init(400, 300, { ...baseOptions, zSpin: true }, '♠', 'A');
      if (card.zRotationSpeed !== 0) { hadZSpin = true; break; }
    }
    expect(hadZSpin).toBe(true);
  });

  it('non-zSpin: zRotationSpeed is 0', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    expect(card.zRotationSpeed).toBe(0);
  });

  it('copies options (isolated from source object)', () => {
    const opts = { ...baseOptions };
    const card = new Card();
    card.init(400, 300, opts, '♠', 'A');
    opts.neon = true;
    expect(card.options.neon).toBe(false);
  });
});

describe('Card.update', () => {
  it('does nothing when inactive', () => {
    const card = new Card(); // active = false by default
    card.update(1, 0, 100, () => {});
    expect(card.age).toBe(0);
  });

  it('increments age by timeScale', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    card.update(1, 0, 100, () => {});
    expect(card.age).toBe(1);
  });

  it('applies gravity to vy', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    const initialVy = card.vy;
    card.update(1, 0, 100, () => {});
    expect(card.vy).toBeCloseTo(initialVy + 0.2);
  });

  it('moves x and y by velocity', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    card.vx = 10;
    card.vy = 0;
    const startX = card.x, startY = card.y;
    card.update(1, 0, 100, () => {});
    expect(card.x).toBeCloseTo(startX + 10);
    // y moves by vy after gravity: 0 + 0.2 = 0.2
    expect(card.y).toBeCloseTo(startY + 0.2);
  });

  it('marks shouldDrawTrail = true when timeSinceLastTrail >= 1', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    card.timeSinceLastTrail = 1.0; // default after init
    card.update(0.1, 0, 100, () => {});
    expect(card.shouldDrawTrail).toBe(true);
  });

  it('marks shouldDrawTrail = false when timeSinceLastTrail < 1', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    card.timeSinceLastTrail = 0.1;
    card.update(0.5, 0, 100, () => {});
    expect(card.shouldDrawTrail).toBe(false);
  });

  it('grows scaleMultiplier toward giant target (2)', () => {
    const card = new Card();
    card.init(400, 300, { ...baseOptions, giant: true }, '♠', 'A');
    card.scaleMultiplier = 0.5;
    card.update(1, 0, 100, () => {});
    expect(card.scaleMultiplier).toBeGreaterThan(0.5);
  });

  it('does not increase scaleMultiplier when already at target', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A'); // target = 1
    card.scaleMultiplier = 1.0;
    card.update(1, 0, 100, () => {});
    expect(card.scaleMultiplier).toBe(1.0);
  });

  it('bounces off the bottom (non-chaos)', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    // Position so bottom edge is past config.height
    card.y = config.height - 96 + 10; // bottom = height + 10
    card.vy = 5;
    card.age = 0; // young card won't settle-evict
    card.gravity = 0; // remove gravity for predictability
    card.update(1, 0, 100, () => {});
    expect(card.vy).toBeLessThan(0);
  });

  it('starts evicting when settled at bottom (low vy, old card)', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    card.y = config.height - 96 + 10;
    card.vy = 0.3; // small vy → |vy| < 0.8 → settles
    card.age = 25; // > 20 → evicts
    card.gravity = 0;
    card.update(1, 0, 100, () => {});
    expect(card.evicting).toBe(true);
  });

  it('reduces opacity when evicting', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    card.evicting = true;
    card.opacity = 0.9;
    card.update(1, 0, 100, () => {});
    expect(card.opacity).toBeLessThan(0.9);
  });

  it('deactivates when opacity reaches 0', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    card.evicting = true;
    card.opacity = 0.01;
    card.update(1, 0, 100, () => {});
    expect(card.active).toBe(false);
  });

  it('deactivates when x moves far off-screen left', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    card.x = -300; // beyond mx = 150
    card.vx = -1;
    card.update(1, 0, 100, () => {});
    expect(card.active).toBe(false);
  });

  it('deactivates when y moves far off-screen bottom', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    card.evicting = true; // skip bounce clamping so y stays beyond threshold
    card.y = config.height + 200; // 800 > height(600) + my(150) = 750
    card.update(1, 0, 100, () => {});
    expect(card.active).toBe(false);
  });

  it('spawns particle when particles enabled and count < max (timeScale=1 always fires)', () => {
    const card = new Card();
    card.init(400, 300, { ...baseOptions, particles: true }, '♠', 'A');
    let spawned = false;
    card.update(1, 0, 100, () => { spawned = true; });
    expect(spawned).toBe(true);
  });

  it('does not spawn particle when count >= max', () => {
    const card = new Card();
    card.init(400, 300, { ...baseOptions, particles: true }, '♠', 'A');
    let spawned = false;
    card.update(1, 100, 100, () => { spawned = true; }); // count = max
    expect(spawned).toBe(false);
  });

  describe('chaos mode', () => {
    it('evicts after age exceeds 200', () => {
      const card = new Card();
      card.init(400, 300, { ...baseOptions, chaos: true }, '♠', 'A');
      card.age = 200; // becomes 201 after update
      card.update(1, 0, 100, () => {});
      expect(card.evicting).toBe(true);
    });

    it('bounces at top boundary', () => {
      const card = new Card();
      card.init(400, 300, { ...baseOptions, chaos: true }, '♠', 'A');
      card.y = 0;
      card.vy = -5;
      card.gravity = 0;
      card.update(1, 0, 100, () => {});
      expect(card.vy).toBeGreaterThan(0);
    });

    it('bounces at bottom boundary', () => {
      const card = new Card();
      card.init(400, 300, { ...baseOptions, chaos: true }, '♠', 'A');
      card.y = config.height;
      card.vy = 5;
      card.gravity = 0;
      card.update(1, 0, 100, () => {});
      expect(card.vy).toBeLessThan(0);
    });

    it('bounces at left boundary', () => {
      const card = new Card();
      card.init(400, 300, { ...baseOptions, chaos: true }, '♠', 'A');
      card.x = 0;
      card.vx = -5;
      card.update(1, 0, 100, () => {});
      expect(card.vx).toBeGreaterThan(0);
    });

    it('bounces at right boundary', () => {
      const card = new Card();
      card.init(400, 300, { ...baseOptions, chaos: true }, '♠', 'A');
      card.x = config.width;
      card.vx = 5;
      card.update(1, 0, 100, () => {});
      expect(card.vx).toBeLessThan(0);
    });
  });

  describe('depth mode', () => {
    it('updates z by vz * timeScale', () => {
      const card = new Card();
      card.init(400, 300, { ...baseOptions, depth: true }, '♠', 'A');
      card.vz = 10;
      card.z = 0;
      card.update(1, 0, 100, () => {});
      expect(card.z).toBeCloseTo(10);
    });

    it('bounces z when exceeding +1000', () => {
      const card = new Card();
      card.init(400, 300, { ...baseOptions, depth: true }, '♠', 'A');
      card.z = 1050;
      card.vz = 50;
      card.update(1, 0, 100, () => {});
      expect(card.vz).toBeLessThan(0);
    });

    it('bounces z when below -400', () => {
      const card = new Card();
      card.init(400, 300, { ...baseOptions, depth: true }, '♠', 'A');
      card.z = -450;
      card.vz = -50;
      card.update(1, 0, 100, () => {});
      expect(card.vz).toBeGreaterThan(0);
    });

    it('starts evicting after 3+ z bounces (high z, vz goes negative → eviction vz set to -40)', () => {
      const card = new Card();
      card.init(400, 300, { ...baseOptions, depth: true }, '♠', 'A');
      card.zBounces = 3;
      card.z = 1050;
      card.vz = 50; // bounces → vz becomes -50 → eviction uses vz=-40
      card.update(1, 0, 100, () => {});
      expect(card.evicting).toBe(true);
      expect(card.vz).toBe(-40);
    });

    it('starts evicting after 3+ z bounces (low z, vz goes positive → eviction vz set to 40)', () => {
      const card = new Card();
      card.init(400, 300, { ...baseOptions, depth: true }, '♠', 'A');
      card.zBounces = 3;
      card.z = -450;
      card.vz = -50; // bounces → vz becomes +50 → eviction uses vz=40
      card.update(1, 0, 100, () => {});
      expect(card.evicting).toBe(true);
      expect(card.vz).toBe(40);
    });

    it('deactivates when z exceeds 4000', () => {
      const card = new Card();
      card.init(400, 300, { ...baseOptions, depth: true }, '♠', 'A');
      card.evicting = true;
      card.z = 4100;
      card.update(1, 0, 100, () => {});
      expect(card.active).toBe(false);
    });
  });
});

describe('Card.draw', () => {
  it('does not draw when opacity <= 0', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    card.opacity = 0;
    expect(() => card.draw(makeCtx())).not.toThrow();
  });

  it('draws face without effects', () => {
    const card = new Card();
    card.init(400, 300, baseOptions, '♠', 'A');
    expect(() => card.draw(makeCtx())).not.toThrow();
  });

  it('draws with spin effect', () => {
    const card = new Card();
    card.init(400, 300, { ...baseOptions, spin: true }, '♥', 'K');
    card.rotation = Math.PI / 4;
    expect(() => card.draw(makeCtx())).not.toThrow();
  });

  it('draws with zSpin showing face side', () => {
    const card = new Card();
    card.init(400, 300, { ...baseOptions, zSpin: true }, '♦', 'Q');
    card.zRotation = 0; // cos(0) = 1 > 0 → face
    expect(() => card.draw(makeCtx())).not.toThrow();
  });

  it('draws with zSpin showing back side', () => {
    const card = new Card();
    card.init(400, 300, { ...baseOptions, zSpin: true }, '♣', 'J');
    card.zRotation = Math.PI / 2 + 0.1; // cos > 0.5*PI → cos < 0 → back
    expect(() => card.draw(makeCtx())).not.toThrow();
  });

  it('draws with neon effect', () => {
    const card = new Card();
    card.init(400, 300, { ...baseOptions, neon: true }, '♠', 'A');
    expect(() => card.draw(makeCtx())).not.toThrow();
  });

  it('draws with depth projection', () => {
    const card = new Card();
    card.init(400, 300, { ...baseOptions, depth: true }, '♠', 'A');
    card.z = 200;
    expect(() => card.draw(makeCtx())).not.toThrow();
  });

  it('draws with all effects combined', () => {
    const card = new Card();
    card.init(400, 300, {
      spin: true, giant: true, zSpin: true, depth: true,
      neon: true, chaos: true, particles: true, continuousDrag: true,
    }, '♥', '10');
    expect(() => card.draw(makeCtx())).not.toThrow();
  });
});
