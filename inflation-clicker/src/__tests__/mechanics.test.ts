import { describe, it, expect, beforeEach } from 'vitest';
import { BigNum } from '../bignum';
import { ATTACK, GAUGE_DENSITY, difficultyConfigs } from '../config';
import { state, resetForDifficulty } from '../state';
import { logAdd, stepAttack, stepItem } from '../mechanics';

const cfg = difficultyConfigs.muryotaisu; // hp.e=68, Phase A 内で完結する素直なコース

beforeEach(() => {
  resetForDifficulty('muryotaisu');
  state.screen = 'playing';
});

describe('logAdd', () => {
  it('adds two equal magnitudes (10^5 + 10^5 = 2×10^5)', () => {
    expect(logAdd(5, 5)).toBeCloseTo(Math.log10(2) + 5, 10);
  });

  it('absorbs a vastly smaller term without overflow', () => {
    // 10^300 + 10^10 ≈ 10^300（小さい方は無視できる）
    expect(logAdd(300, 10)).toBeCloseTo(300, 10);
  });

  it('treats -Infinity (=log10 of 0) as identity', () => {
    expect(logAdd(-Infinity, 7)).toBe(7);
    expect(logAdd(7, -Infinity)).toBe(7);
  });
});

describe('stepAttack — post-item ramp', () => {
  it('catches atk.e up to atkTargetE in exactly CLICK_BUDGET_PER_ITEM clicks (Phase A)', () => {
    // アイテムを 1 個取ると atkTargetE は chunkAtE(0)=C0 だけ上がる。
    stepItem(state, cfg);
    expect(state.atkTargetE).toBeCloseTo(GAUGE_DENSITY.C0, 10);

    // BUDGET-1 クリックでは追いつかない…
    for (let i = 0; i < ATTACK.CLICK_BUDGET_PER_ITEM - 1; i++) stepAttack(state, cfg, 1);
    expect(state.atk.e).toBeLessThan(state.atkTargetE);

    // …ちょうど BUDGET クリック目で追いつく。
    stepAttack(state, cfg, 1);
    expect(state.atk.e).toBeCloseTo(state.atkTargetE, 8);
  });

  it('does not move atk.e once it has caught up to the target', () => {
    // ランプが無い（atkTargetE=0）うちは atk.e は動かない＝アイテムを取らないと伸びない。
    stepAttack(state, cfg, 5);
    expect(state.atk.e).toBe(0);
  });
});

describe('stepAttack — damage accumulation', () => {
  it('accumulates damageE via logAdd and tracks the largest single hit', () => {
    state.atk = new BigNum(1, 10);
    state.atkTargetE = 10; // ランプ無しで atk.e 固定
    const before = state.damageE;
    const r = stepAttack(state, cfg, 3);
    // 1 発 = 3×10^10 → damageE ≈ logAdd(before, 10+log10(3))
    expect(r.dmg.e).toBe(10);
    expect(r.dmg.m).toBeCloseTo(3, 8);
    expect(state.damageE).toBeCloseTo(logAdd(before, 10 + Math.log10(3)), 10);
    expect(state.maxHit.cmp(new BigNum(3, 10))).toBe(0);
    expect(state.totalClicks).toBe(1);
  });

  it('keeps the previous maxHit when a smaller hit lands', () => {
    state.atk = new BigNum(1, 20);
    state.atkTargetE = 20;
    stepAttack(state, cfg, 9); // maxHit = 9×10^20
    state.atk = new BigNum(1, 20);
    state.atkTargetE = 20;
    stepAttack(state, cfg, 2); // 2×10^20 < 9×10^20
    expect(state.maxHit.cmp(new BigNum(9, 20))).toBe(0);
  });
});

describe('stepAttack — item supply cadence', () => {
  it('spawns one item every CLICK_BUDGET_PER_ITEM clicks', () => {
    let spawns = 0;
    for (let i = 1; i <= ATTACK.CLICK_BUDGET_PER_ITEM; i++) {
      const r = stepAttack(state, cfg, 1);
      if (r.spawnItem) spawns++;
      // BUDGET 到達クリックでだけ立つ
      expect(r.spawnItem).toBe(i === ATTACK.CLICK_BUDGET_PER_ITEM);
    }
    expect(spawns).toBe(1);
    expect(state.itemAvailable).toBe(true);
  });

  it('does not spawn while an item is already on screen', () => {
    state.itemAvailable = true;
    for (let i = 0; i < ATTACK.CLICK_BUDGET_PER_ITEM * 2; i++) {
      expect(stepAttack(state, cfg, 1).spawnItem).toBe(false);
    }
  });

  it('stops spawning once totalItems have been collected', () => {
    state.itemsCollected = cfg.totalItems;
    state.clicksSinceItem = ATTACK.CLICK_BUDGET_PER_ITEM;
    expect(stepAttack(state, cfg, 1).spawnItem).toBe(false);
  });

  it('guarantees the final item appears on the very next click', () => {
    // N-1 個目を取った直後は clicksSinceItem=BUDGET なので、次の 1 クリックで即スポーン。
    state.itemsCollected = cfg.totalItems - 2;
    stepItem(state, cfg); // → itemsCollected = totalItems-1, clicksSinceItem = BUDGET
    expect(state.clicksSinceItem).toBe(ATTACK.CLICK_BUDGET_PER_ITEM);
    expect(stepAttack(state, cfg, 1).spawnItem).toBe(true);
  });
});

describe('stepAttack — defeat threshold', () => {
  it('flags defeated exactly when damageE reaches hp.e', () => {
    state.atk = new BigNum(1, cfg.hp.e);
    state.atkTargetE = cfg.hp.e;
    state.damageE = cfg.hp.e - 5; // まだ届かない
    const r = stepAttack(state, cfg, 9); // 9×10^hp.e を加算 → 超える
    expect(r.defeated).toBe(true);
    expect(state.damageE).toBeGreaterThanOrEqual(cfg.hp.e);
  });

  it('is not defeated while damageE stays below hp.e', () => {
    state.atk = new BigNum(1, 10);
    state.atkTargetE = 10;
    expect(stepAttack(state, cfg, 1).defeated).toBe(false);
  });
});

describe('stepItem — target ramp', () => {
  it('bumps atkTargetE by chunkAtE per item but never past hp.e', () => {
    stepItem(state, cfg);
    expect(state.atkTargetE).toBeCloseTo(GAUGE_DENSITY.C0, 10);
    expect(state.itemsCollected).toBe(1);
    expect(state.itemAvailable).toBe(false);
  });

  it('clamps atkTargetE at hp.e', () => {
    state.atkTargetE = cfg.hp.e - 0.5;
    stepItem(state, cfg);
    expect(state.atkTargetE).toBe(cfg.hp.e);
  });
});
