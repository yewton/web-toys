import { describe, it, expect } from 'vitest';
import {
  ATTACK,
  GAUGE_DENSITY,
  chunkAtE,
  consumedAtDamage,
  consumedFromDamageE,
  damageEAtConsumed,
  damageEFromConsumed,
  difficultyConfigs,
  difficultyOrder,
  expPerBoxAt,
  totalItemsForHp,
  totalSegmentsForHp,
} from '../config';

describe('chunkAtE', () => {
  it('returns C0 in Phase A', () => {
    expect(chunkAtE(0)).toBe(GAUGE_DENSITY.C0);
    expect(chunkAtE(50)).toBe(GAUGE_DENSITY.C0);
    expect(chunkAtE(GAUGE_DENSITY.INFL_E)).toBe(GAUGE_DENSITY.C0);
  });

  it('grows linearly with e in Phase B', () => {
    expect(chunkAtE(200)).toBeCloseTo(200 / GAUGE_DENSITY.INFL_E, 10);
    expect(chunkAtE(1e6)).toBeCloseTo(1e6 / GAUGE_DENSITY.INFL_E, 10);
  });

  it('is C¹ continuous at the threshold', () => {
    const eps = 1e-6;
    expect(chunkAtE(GAUGE_DENSITY.INFL_E - eps)).toBeCloseTo(
      chunkAtE(GAUGE_DENSITY.INFL_E + eps),
      6,
    );
  });
});

describe('expPerBoxAt', () => {
  it('is ITEMS_PER_BOX × chunkAtE', () => {
    for (const e of [0, 50, 100, 500, 1e6]) {
      expect(expPerBoxAt(e)).toBeCloseTo(GAUGE_DENSITY.ITEMS_PER_BOX * chunkAtE(e), 10);
    }
  });
});

describe('consumedFromDamageE', () => {
  it('returns 0 at 0 (and below)', () => {
    expect(consumedFromDamageE(0)).toBe(0);
    expect(consumedFromDamageE(-10)).toBe(0);
  });

  it('is linear in Phase A', () => {
    // 1 box ≒ ITEMS_PER_BOX × C0 = 10
    expect(consumedFromDamageE(10)).toBeCloseTo(1, 10);
    expect(consumedFromDamageE(50)).toBeCloseTo(5, 10);
    expect(consumedFromDamageE(GAUGE_DENSITY.INFL_E)).toBeCloseTo(10, 10);
  });

  it('continues smoothly into Phase B', () => {
    const atThreshold = consumedFromDamageE(GAUGE_DENSITY.INFL_E);
    const justAfter = consumedFromDamageE(GAUGE_DENSITY.INFL_E + 1e-6);
    expect(justAfter).toBeCloseTo(atThreshold, 6);
  });

  it('grows logarithmically in Phase B', () => {
    // Δconsumed per decade of damageE = (INFL_E / ITEMS_PER_BOX) × ln(10)
    const a = consumedFromDamageE(1000);
    const b = consumedFromDamageE(10000);
    const expected = (GAUGE_DENSITY.INFL_E / GAUGE_DENSITY.ITEMS_PER_BOX) * Math.log(10);
    expect(b - a).toBeCloseTo(expected, 6);
  });

  it('handles huge damageE (extreme courses) without overflow', () => {
    expect(Number.isFinite(consumedFromDamageE(3.7e37))).toBe(true);
    expect(Number.isFinite(consumedFromDamageE(1.7e308))).toBe(true);
  });
});

describe('damageEFromConsumed (inverse)', () => {
  it('round-trips through consumedFromDamageE', () => {
    for (const d of [0, 5, 50, 100, 500, 7168, 3.7e37]) {
      const c = consumedFromDamageE(d);
      const back = damageEFromConsumed(c);
      // 巨大な d でも相対誤差で評価
      if (d === 0) expect(back).toBe(0);
      else expect(back).toBeCloseTo(d, Math.min(6, 12 - Math.floor(Math.log10(d) + 1)));
    }
  });
});

describe('totalItemsForHp', () => {
  it('matches the per-box invariant: 1 box ≈ ITEMS_PER_BOX items', () => {
    // 各コースで totalItems / totalSegments がほぼ ITEMS_PER_BOX (=10) になる
    for (const diff of difficultyOrder) {
      const cfg = difficultyConfigs[diff];
      const segs = totalSegmentsForHp(cfg.hp.e);
      const items = totalItemsForHp(cfg.hp.e);
      const ratio = items / segs;
      expect(ratio).toBeGreaterThan(GAUGE_DENSITY.ITEMS_PER_BOX * 0.85);
      expect(ratio).toBeLessThan(GAUGE_DENSITY.ITEMS_PER_BOX * 1.15);
    }
  });

  it('Phase A 全域カバーは INFL_E / C0 アイテム', () => {
    expect(totalItemsForHp(GAUGE_DENSITY.INFL_E)).toBe(
      Math.round(GAUGE_DENSITY.INFL_E / GAUGE_DENSITY.C0),
    );
  });
});

describe('per-click drain invariant', () => {
  it('1 クリックでのゲージ削り率が e に依らず ≒ 1 / (CLICK_BUDGET × ITEMS_PER_BOX)', () => {
    // chunk(e) / (CLICK_BUDGET × expPerBoxAt(e)) は分母分子で chunk が打ち消されて定数
    const expected = 1 / (ATTACK.CLICK_BUDGET_PER_ITEM * GAUGE_DENSITY.ITEMS_PER_BOX);
    for (const e of [10, 100, 500, 1e6, 1e30]) {
      const rate = chunkAtE(e) / (ATTACK.CLICK_BUDGET_PER_ITEM * expPerBoxAt(e));
      expect(rate).toBeCloseTo(expected, 10);
    }
  });
});

describe('consumedAtDamage (course-scaled)', () => {
  it('hits totalSegments exactly at hp.e (no leftover gauge at defeat)', () => {
    for (const diff of difficultyOrder) {
      const cfg = difficultyConfigs[diff];
      const total = totalSegmentsForHp(cfg.hp.e);
      const consumedAtDefeat = consumedAtDamage(cfg.hp.e, cfg.hp.e);
      expect(consumedAtDefeat).toBeCloseTo(total, 6);
    }
  });

  it('starts at 0 for damageE=0', () => {
    for (const diff of difficultyOrder) {
      expect(consumedAtDamage(0, difficultyConfigs[diff].hp.e)).toBe(0);
    }
  });

  it('round-trips through damageEAtConsumed', () => {
    const hpE = difficultyConfigs.mabara.hp.e; // 摩婆羅
    for (const d of [10, 100, 500, hpE * 0.7, hpE]) {
      const c = consumedAtDamage(d, hpE);
      const back = damageEAtConsumed(c, hpE);
      expect(back).toBeCloseTo(d, 6);
    }
  });

  it('scaling factor is close to 1 (preserves per-click feel)', () => {
    for (const diff of difficultyOrder) {
      const cfg = difficultyConfigs[diff];
      const raw = consumedFromDamageE(cfg.hp.e);
      const scaled = consumedAtDamage(cfg.hp.e, cfg.hp.e);
      const ratio = scaled / raw;
      expect(ratio).toBeGreaterThan(0.99);
      expect(ratio).toBeLessThan(1.05); // 無量大数 (raw=6.8 → 7) で最大 ~1.03
    }
  });
});

describe('difficultyConfigs', () => {
  it('has 4 main courses + 1 extreme flavor', () => {
    expect(difficultyOrder).toEqual(['muryotaisu', 'mabara', 'kaibun', 'fukasetsu', 'graham']);
    expect(difficultyConfigs.graham.extreme).toBe(true);
    expect(difficultyConfigs.fukasetsu.extreme).toBeFalsy();
    expect(difficultyConfigs.muryotaisu.extreme).toBeFalsy();
  });

  it('uses chunkAtE-derived totalItems for each course', () => {
    for (const diff of difficultyOrder) {
      const cfg = difficultyConfigs[diff];
      expect(cfg.totalItems).toBe(totalItemsForHp(cfg.hp.e));
    }
  });
});
