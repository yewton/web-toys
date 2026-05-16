import { describe, it, expect, beforeEach } from 'vitest';
import { effectState, effectConfig, particleConfig, getDynamicLimits, currentParticleType, setCurrentParticleType } from '../effectState';
import type { EffectState, ParticleType } from '../types';

function resetEffects() {
  const keys = Object.keys(effectState) as (keyof EffectState)[];
  for (const k of keys) (effectState[k] as boolean) = false;
}

beforeEach(() => {
  resetEffects();
  setCurrentParticleType('normal');
});

describe('getDynamicLimits', () => {
  it('returns baseline when no effects are active', () => {
    const { cards, particles } = getDynamicLimits();
    expect(cards).toBe(300);
    expect(particles).toBe(1000);
  });

  it('reduces card limit by 120 when neon is on', () => {
    effectState.neon = true;
    const { cards } = getDynamicLimits();
    expect(cards).toBe(180);
  });

  it('reduces particle limit by 400 when neon is on', () => {
    effectState.neon = true;
    const { particles } = getDynamicLimits();
    expect(particles).toBe(600);
  });

  it('reduces card limit by 150 when depth is on', () => {
    effectState.depth = true;
    const { cards } = getDynamicLimits();
    expect(cards).toBe(150);
  });

  it('stacks reductions for neon + depth', () => {
    effectState.neon = true;
    effectState.depth = true;
    const { cards, particles } = getDynamicLimits();
    // 300 - 120 - 150 = 30, clamped to min 40
    expect(cards).toBe(40);
    expect(particles).toBe(600);
  });

  it('enforces minimum card limit of 40', () => {
    effectState.neon = true;
    effectState.depth = true;
    const { cards } = getDynamicLimits();
    expect(cards).toBeGreaterThanOrEqual(40);
  });

  it('enforces minimum particle limit of 100', () => {
    effectState.neon = true;
    const { particles } = getDynamicLimits();
    expect(particles).toBeGreaterThanOrEqual(100);
  });
});

describe('effectConfig', () => {
  it('has unique ids', () => {
    const ids = effectConfig.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each id matches a key of EffectState', () => {
    const validKeys: (keyof EffectState)[] = [
      'spin', 'giant', 'zSpin', 'depth', 'neon', 'chaos', 'particles', 'continuousDrag',
    ];
    for (const { id } of effectConfig) {
      expect(validKeys).toContain(id);
    }
  });
});

describe('particleConfig', () => {
  it('has unique ids', () => {
    const ids = particleConfig.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('setCurrentParticleType', () => {
  it('updates currentParticleType', () => {
    setCurrentParticleType('fire');
    expect(currentParticleType).toBe('fire');
  });

  it('can be set to each particle type', () => {
    const types: ParticleType[] = ['normal', 'fire', 'water', 'snow', 'star'];
    for (const t of types) {
      setCurrentParticleType(t);
      expect(currentParticleType).toBe(t);
    }
  });

  it('resets back to normal', () => {
    setCurrentParticleType('star');
    setCurrentParticleType('normal');
    expect(currentParticleType).toBe('normal');
  });
});
