import { describe, it, expect } from 'vitest';
import { GAUGE } from '../config';
import {
  sliceGauge,
  createGaugeState,
  advanceGauge,
  notifyAttack,
  boxStatus,
  finalLayer,
} from '../hpGauge';

describe('sliceGauge — finite (totalSegments ≤ displayedSegments)', () => {
  // 1分コース相当：total=20, displayed=20
  it('shows full bar + all row boxes alive at consumed=0', () => {
    expect(sliceGauge(0, 20, 20)).toEqual({ segmentsLeft: 20, barFill: 1, isFinal: false });
  });

  it('drains the current bar within a segment without changing segmentsLeft', () => {
    expect(sliceGauge(0.3, 20, 20)).toEqual({
      segmentsLeft: 20,
      barFill: expect.closeTo(0.7, 8) as number,
      isFinal: false,
    });
    expect(sliceGauge(0.7, 20, 20)).toEqual({
      segmentsLeft: 20,
      barFill: expect.closeTo(0.3, 8) as number,
      isFinal: false,
    });
  });

  it('drops segmentsLeft by 1 when consumed crosses an integer', () => {
    const s = sliceGauge(5, 20, 20);
    expect(s.segmentsLeft).toBe(15);
    expect(s.barFill).toBe(1);
  });

  it('flags isFinal exactly on the last segment', () => {
    expect(sliceGauge(19, 20, 20).isFinal).toBe(true);
    expect(sliceGauge(19.5, 20, 20)).toEqual({
      segmentsLeft: 1,
      barFill: expect.closeTo(0.5, 8) as number,
      isFinal: true,
    });
  });

  it('returns empty at full consumption', () => {
    expect(sliceGauge(20, 20, 20)).toEqual({ segmentsLeft: 0, barFill: 0, isFinal: false });
  });
});

describe('sliceGauge — over-cap (totalSegments > displayedSegments)', () => {
  // 30分相当：total=600, displayed=60。540 segments を消費するまで segmentsLeft は cap に張り付く。
  it('caps segmentsLeft at displayedSegments throughout the silent phase', () => {
    expect(sliceGauge(0, 600, 60).segmentsLeft).toBe(60);
    expect(sliceGauge(100, 600, 60).segmentsLeft).toBe(60);
    expect(sliceGauge(540, 600, 60).segmentsLeft).toBe(60);
  });

  it('produces the same barFill as a finite course for the same consumed', () => {
    // 同じ consumed フラクションに対して bar は同じ削れ具合になる＝コース共通の per-click feel。
    expect(sliceGauge(5.3, 600, 60).barFill).toBeCloseTo(0.7, 8);
    expect(sliceGauge(5.3, 20, 20).barFill).toBeCloseTo(0.7, 8);
  });

  it('starts depleting once consumed crosses totalSegments − displayedSegments', () => {
    // 541 消費した時点で「真の残り」= 59 個。cap(60) を割り、segmentsLeft=59 に。
    expect(sliceGauge(541, 600, 60).segmentsLeft).toBe(59);
    expect(sliceGauge(599, 600, 60)).toEqual({ segmentsLeft: 1, barFill: 1, isFinal: true });
    expect(sliceGauge(599.5, 600, 60).barFill).toBeCloseTo(0.5, 8);
  });

  it('handles astronomically over-cap (extreme courses)', () => {
    // graham 相当：total=5e307, displayed=60。consumed=任意の現実値 → segmentsLeft=60 のまま。
    expect(sliceGauge(0, 5e307, 60).segmentsLeft).toBe(60);
    expect(sliceGauge(1e10, 5e307, 60).segmentsLeft).toBe(60);
    expect(sliceGauge(1.234, 5e307, 60).barFill).toBeCloseTo(0.766, 3);
  });
});

describe('advanceGauge — red trail', () => {
  it('snaps the trail forward when consumed crosses a segment boundary', () => {
    const g = createGaugeState(20, 20);
    g.displayedConsumed = 0.4;
    advanceGauge(g, 1.2, 1000);
    // consumedFloor = 1 → displayedConsumed snaps to ≥ 1
    expect(g.displayedConsumed).toBeGreaterThanOrEqual(1);
    expect(g.displayedConsumed).toBeLessThanOrEqual(1.2);
  });

  it('holds the trail right after an attack', () => {
    const g = createGaugeState(20, 20);
    g.displayedConsumed = 0;
    notifyAttack(g, 1000);
    advanceGauge(g, 0.6, 1000 + GAUGE.TRAIL_HOLD_MS - 1);
    expect(g.displayedConsumed).toBe(0); // まだ進まない
  });

  it('catches up after the hold window', () => {
    const g = createGaugeState(20, 20);
    g.displayedConsumed = 0;
    g.lastAttackTime = 0;
    advanceGauge(g, 0.6, GAUGE.TRAIL_HOLD_MS + 100);
    // diff 0.6 × 0.15 = 0.09 だが Math.max(0.002, ...) で 0.09 → displayedConsumed ≈ 0.09
    expect(g.displayedConsumed).toBeCloseTo(0.09, 6);
    expect(g.displayedConsumed).toBeLessThan(0.6);
  });
});

describe('advanceGauge — depletion phase (totalSegments ≤ displayedSegments)', () => {
  it('flashes the leftmost box when crossing the first integer (finite course)', () => {
    const g = createGaugeState(20, 20); // total=20, displayed=20 → flashStart=0
    advanceGauge(g, 1, 500);
    expect(g.prevConsumedInt).toBe(1);
    expect(g.boxFlashAt[0]).toBe(500);
    expect(g.boxFlashAt[1]).toBe(0);
  });
});

describe('advanceGauge — conveyor phase (over-cap)', () => {
  it('flashes box[0] once on each integer crossing during conveyor', () => {
    const g = createGaugeState(7, 20); // 1分相当：displayed=7, total=20, flashStart=13
    advanceGauge(g, 1, 500);
    expect(g.boxFlashAt[0]).toBe(500); // コンベア中なので box[0] が flash
    expect(g.boxFlashAt[1]).toBe(0); // 他は静止
  });

  it('does not overwrite an in-progress conveyor flash with a new one', () => {
    const g = createGaugeState(7, 20);
    advanceGauge(g, 1, 500);
    // まだアニメ中（FLASH+SLIDE 未満）で次の crossing が来ても box[0] は維持される
    advanceGauge(g, 2, 600);
    expect(g.boxFlashAt[0]).toBe(500); // 古いタイムスタンプのまま
  });

  it('resets box[0] after FLASH+SLIDE so the next cycle can fire', () => {
    const g = createGaugeState(7, 20);
    advanceGauge(g, 1, 500);
    expect(g.boxFlashAt[0]).toBe(500);
    // アニメ完了時刻に到達 → 次の advance で box[0] がリセット
    advanceGauge(g, 1, 500 + GAUGE.BOX_FLASH_MS + GAUGE.BOX_SLIDE_MS + 10);
    expect(g.boxFlashAt[0]).toBe(0);
    // その後の crossing で新しいサイクルが開始
    advanceGauge(g, 2, 1500);
    expect(g.boxFlashAt[0]).toBe(1500);
  });

  it('starts depletion-mode flashing once consumed crosses flashStart', () => {
    const g = createGaugeState(7, 20); // flashStart=13
    g.prevConsumedInt = 13;
    advanceGauge(g, 14, 900);
    // dispIdx = 14 - 13 = 0 → box[0] flash（depletion 側）
    expect(g.boxFlashAt[0]).toBe(900);
    g.prevConsumedInt = 14;
    advanceGauge(g, 15, 1000);
    expect(g.boxFlashAt[1]).toBe(1000); // 次の depletion で box[1]
  });
});

describe('boxStatus (left to right)', () => {
  it('keeps the rightmost boxes alive, excluding the currently-draining bar', () => {
    const g = createGaugeState(5, 5);
    // segmentsLeft=3 → 表示は cleared=2 で左 2 つ dead/flash、右 2 つ alive。bar は別。
    expect(boxStatus(g, 0, 3, 1000)).toBe('dead');
    expect(boxStatus(g, 1, 3, 1000)).toBe('dead');
    expect(boxStatus(g, 2, 3, 1000)).toBe('alive');
    expect(boxStatus(g, 3, 3, 1000)).toBe('alive');
  });

  it('has no alive boxes on the final gauge', () => {
    const g = createGaugeState(5, 5);
    for (let i = 0; i < 4; i++) expect(boxStatus(g, i, 1, 1000)).not.toBe('alive');
  });

  it('flashes red just after clearing, then turns dead', () => {
    const g = createGaugeState(5, 5);
    g.boxFlashAt[1] = 1000;
    expect(boxStatus(g, 1, 3, 1000 + GAUGE.BOX_FLASH_MS - 1)).toBe('flash');
    expect(boxStatus(g, 1, 3, 1000 + GAUGE.BOX_FLASH_MS + 1)).toBe('dead');
  });
});

describe('finalLayer', () => {
  it('shows green (front) near full', () => {
    expect(finalLayer(1)).toEqual({ layerIndex: 2, frontRemain: 1 });
    const s = finalLayer(0.9);
    expect(s.layerIndex).toBe(2);
    expect(s.frontRemain).toBeCloseTo(0.7, 6);
  });

  it('reveals blue in the middle third', () => {
    const s = finalLayer(0.5);
    expect(s.layerIndex).toBe(1);
    expect(s.frontRemain).toBeCloseTo(0.5, 6);
  });

  it('reveals yellow in the deepest third', () => {
    const s = finalLayer(0.2);
    expect(s.layerIndex).toBe(0);
    expect(s.frontRemain).toBeCloseTo(0.6, 6);
  });

  it('is empty at zero', () => {
    expect(finalLayer(0)).toEqual({ layerIndex: 0, frontRemain: 0 });
  });
});
