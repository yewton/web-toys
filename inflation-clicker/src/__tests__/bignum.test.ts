import { describe, it, expect } from 'vitest';
import { BigNum } from '../bignum';

describe('BigNum.normalize', () => {
  it('keeps 1 <= m < 10', () => {
    const n = new BigNum(123, 0);
    expect(n.m).toBeCloseTo(1.23, 8);
    expect(n.e).toBe(2);
  });

  it('treats 0 as exponent 0', () => {
    const n = new BigNum(0, 50);
    expect(n.m).toBe(0);
    expect(n.e).toBe(0);
  });

  it('falls back to 0 for NaN inputs', () => {
    const n = new BigNum(NaN, NaN);
    expect(n.isZero()).toBe(true);
  });
});

describe('BigNum.add', () => {
  it('adds same-magnitude numbers', () => {
    const r = new BigNum(2, 5).add(new BigNum(3, 5));
    expect(r.m).toBeCloseTo(5, 8);
    expect(r.e).toBe(5);
  });

  it('ignores values 15+ orders of magnitude smaller', () => {
    const big = new BigNum(1, 100);
    const r = big.add(new BigNum(1, 10));
    expect(r.cmp(big)).toBe(0);
  });

  it('treats zero as identity', () => {
    const r = new BigNum(0, 0).add(new BigNum(7, 3));
    expect(r.cmp(new BigNum(7, 3))).toBe(0);
  });
});

describe('BigNum.sub', () => {
  it('subtracts to a positive result', () => {
    const r = new BigNum(5, 3).sub(new BigNum(2, 3));
    expect(r.m).toBeCloseTo(3, 8);
    expect(r.e).toBe(3);
  });

  it('clamps to zero when result would be negative', () => {
    const r = new BigNum(1, 0).sub(new BigNum(5, 0));
    expect(r.isZero()).toBe(true);
  });

  it('returns zero when subtracting a vastly larger number', () => {
    const r = new BigNum(1, 5).sub(new BigNum(1, 100));
    expect(r.isZero()).toBe(true);
  });
});

describe('BigNum.mulNum', () => {
  it('scales the mantissa', () => {
    const r = new BigNum(2, 4).mulNum(3);
    expect(r.m).toBeCloseTo(6, 8);
    expect(r.e).toBe(4);
  });

  it('returns zero when multiplied by zero', () => {
    expect(new BigNum(2, 4).mulNum(0).isZero()).toBe(true);
  });
});

describe('BigNum.cmp', () => {
  it('orders by exponent then mantissa', () => {
    expect(new BigNum(1, 10).cmp(new BigNum(9, 9))).toBe(1);
    expect(new BigNum(2, 5).cmp(new BigNum(3, 5))).toBe(-1);
    expect(new BigNum(5, 5).cmp(new BigNum(5, 5))).toBe(0);
  });

  it('treats zero as smallest', () => {
    expect(new BigNum(0, 0).cmp(new BigNum(1, 0))).toBe(-1);
    expect(new BigNum(1, 0).cmp(new BigNum(0, 0))).toBe(1);
    expect(new BigNum(0, 0).cmp(new BigNum(0, 0))).toBe(0);
  });
});

describe('BigNum.log10Safe', () => {
  it('is zero for zero', () => {
    expect(new BigNum(0, 0).log10Safe()).toBe(0);
  });

  it('approximates the magnitude for large numbers', () => {
    expect(new BigNum(1, 100).log10Safe()).toBeCloseTo(100, 6);
  });
});
