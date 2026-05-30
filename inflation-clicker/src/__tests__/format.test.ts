import { describe, it, expect } from 'vitest';
import { BigNum } from '../bignum';
import { formatNumber, formatTime } from '../format';

describe('formatNumber', () => {
  it('shows small integers as plain numbers', () => {
    expect(formatNumber(new BigNum(5, 0), 'kanji')).toBe('5');
    expect(formatNumber(new BigNum(1.5, 2), 'english')).toBe('150');
  });

  it('uses single kanji units when only one group is non-zero', () => {
    expect(formatNumber(new BigNum(1, 4), 'kanji')).toBe('1万');
    expect(formatNumber(new BigNum(1, 8), 'kanji')).toBe('1億');
    expect(formatNumber(new BigNum(1, 68), 'kanji')).toBe('1無量大数');
  });

  it('chains multiple kanji units (compound)', () => {
    // 1.5 × 10^12 = 1兆 + 5000億
    expect(formatNumber(new BigNum(1.5, 12), 'kanji')).toBe('1兆5000億');
    // 1.2345 × 10^50 = 123極 + 4500載
    expect(formatNumber(new BigNum(1.2345, 50), 'kanji')).toBe('123極4500載');
  });

  it('uses 上数法 命数 (矜羯羅…) by dividing, above 10^112', () => {
    // 10^112 = 矜羯羅 ちょうど
    expect(formatNumber(new BigNum(1, 112), 'kanji')).toBe('1矜羯羅');
    // 10^150 = 10^38(100澗) × 矜羯羅(10^112)
    expect(formatNumber(new BigNum(1, 150), 'kanji')).toBe('100澗矜羯羅');
    // 10^224 = 阿伽羅 ちょうど（登ると次の命数が出る）
    expect(formatNumber(new BigNum(1, 224), 'kanji')).toBe('1阿伽羅');
    // 10^448 = 最勝
    expect(formatNumber(new BigNum(1, 448), 'kanji')).toBe('1最勝');
  });

  it('stacks 無量大数 in the gap below the first 上数法 命数 (10^72〜10^111)', () => {
    // この帯には命数が無いので 無量大数 を積み上げる
    expect(formatNumber(new BigNum(1, 72), 'kanji')).toBe('1万無量大数');
    expect(formatNumber(new BigNum(1, 100), 'kanji')).toBe('1溝無量大数');
  });

  it('nests 上数法 命数 recursively inside the coefficient (suppresses 無量大数 chain)', () => {
    // 上数法は前の命数の 2 乗で増えるので、係数の中に「より小さい命数」が入り得る。
    // 係数を再帰整形することで「無量大数を何個も積み上げる」表記を抑える。
    // 例: 10^800 = 10^352 × 最勝(10^448)。10^352 = 10^128 × 阿伽羅(10^224)。10^128 = 1京 × 矜羯羅。
    expect(formatNumber(new BigNum(1, 800), 'kanji')).toBe('1京矜羯羅阿伽羅最勝');
    // 10^600 = 10^152 × 最勝。10^152 = 10^40 × 矜羯羅 = 1正 × 矜羯羅。
    expect(formatNumber(new BigNum(1, 600), 'kanji')).toBe('1正矜羯羅最勝');
    // 30分コースHP 10^2040 = 10^1144 × 阿婆羅(10^1792)? いや、阿婆羅は 1792、最勝は 448、阿伽羅は 224 …
    // joUnits の中で 10^2040 以下の最大は 阿婆羅(1792)。係数=10^248。次の最大は 阿伽羅(224)。係数'=10^24=1𥝱。
    expect(formatNumber(new BigNum(1, 2040), 'kanji')).toBe('1𥝱阿伽羅阿婆羅');
  });

  it('falls back to a power tower only when coeff exceeds the joUnit (グラハム数 class)', () => {
    // グラハム数級 = 10^(1.7×10^308): coeff.e >> u.e なので冪乗の塔へ
    expect(formatNumber(new BigNum(1, 1.7e308), 'kanji')).toBe('10^10^308');
  });

  it('uses k乗無量大数 notation at depth=3 for joUnit-range numbers', () => {
    // depth=3 では「最も近い無量大数のべき」一語で表す。指数 k は命数で整形され、
    // 先頭ブロック（端数倍率）を足して k と癒着させない（"11京…"のような誤読を防ぐ）。
    // e=1e20 は joUnit 範囲内（< 3.7e37）→ k乗無量大数 ＋ 上数法命数 3 連
    expect(formatNumber(new BigNum(1, 1e20), 'kanji')).toBe('1京6720兆3085億乗無量大数鉢羅麼怛羅諦羅偈羅');
    // e=5e30 も joUnit 範囲内
    expect(formatNumber(new BigNum(1, 5e30), 'kanji')).toBe('63𥝱1319垓3329京乗無量大数駄麼羅無我鉢頭摩');
  });

  it('uses english units', () => {
    expect(formatNumber(new BigNum(1, 6), 'english')).toBe('1 Million');
    expect(formatNumber(new BigNum(1, 9), 'english')).toBe('1 Billion');
    expect(formatNumber(new BigNum(1, 100), 'english')).toBe('1 Googol');
  });

  it('does not produce "Infinity" in english for huge exponents', () => {
    // 係数が Infinity になる桁では "Googol+" で打ち止め（"Infinity Googol" を出さない）
    expect(formatNumber(new BigNum(1, 500), 'english')).toBe('Googol+');
  });

  it('always renders scientific notation for sci', () => {
    expect(formatNumber(new BigNum(1, 2), 'sci')).toBe('1 × 10^2');
    expect(formatNumber(new BigNum(3.456, 20), 'sci')).toBe('3.456 × 10^20');
  });

  it('compacts huge exponents so the width does not explode (sci)', () => {
    expect(formatNumber(new BigNum(1, 1e18), 'sci')).toBe('1 × 10^1.00×10^18');
  });
});

describe('formatTime', () => {
  it('formats as mm:ss', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(600)).toBe('10:00');
  });

  it('rolls over to h:mm:ss past an hour', () => {
    expect(formatTime(3661)).toBe('1:01:01');
    expect(formatTime(3599)).toBe('59:59');
  });

  it('clamps negative / NaN to 00:00', () => {
    expect(formatTime(-5)).toBe('00:00');
    expect(formatTime(NaN)).toBe('00:00');
  });
});
