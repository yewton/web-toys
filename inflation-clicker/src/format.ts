import { BigNum } from './bignum';

export type FormatType = 'kanji' | 'english' | 'sci';

// 4 桁ごとの漢数字単位（指数 4〜68 をすべて網羅）。降順。
const kanjiUnits = [
  { e: 68, name: '無量大数' }, { e: 64, name: '不可思議' }, { e: 60, name: '那由他' },
  { e: 56, name: '阿僧祇' }, { e: 52, name: '恒河沙' }, { e: 48, name: '極' },
  { e: 44, name: '載' }, { e: 40, name: '正' }, { e: 36, name: '澗' },
  { e: 32, name: '溝' }, { e: 28, name: '穣' }, { e: 24, name: '𥝱' },
  { e: 20, name: '垓' }, { e: 16, name: '京' }, { e: 12, name: '兆' },
  { e: 8, name: '億' }, { e: 4, name: '万' },
];

// 漢数字で表せる上限（9999 無量大数 ≈ 10^72）
const KANJI_MAX_E = 72;
// 連ねて表示する単位数の上限
const COMPOUND_MAX_UNITS = 3;

const engUnits = [
  { e: 100, name: 'Googol' }, { e: 63, name: 'Vigintillion' }, { e: 60, name: 'Novemdecillion' },
  { e: 57, name: 'Octodecillion' }, { e: 54, name: 'Septendecillion' }, { e: 51, name: 'Sexdecillion' },
  { e: 48, name: 'Quindecillion' }, { e: 45, name: 'Quattuordecillion' }, { e: 42, name: 'Tredecillion' },
  { e: 39, name: 'Duodecillion' }, { e: 36, name: 'Undecillion' }, { e: 33, name: 'Decillion' },
  { e: 30, name: 'Nonillion' }, { e: 27, name: 'Octillion' }, { e: 24, name: 'Septillion' },
  { e: 21, name: 'Sextillion' }, { e: 18, name: 'Quintillion' }, { e: 15, name: 'Quadrillion' },
  { e: 12, name: 'Trillion' }, { e: 9, name: 'Billion' }, { e: 6, name: 'Million' },
];

/**
 * 漢数字を複数単位つなげて表示する（例: 123極4500載67正）。
 * 仮数の有効桁から上位 COMPOUND_MAX_UNITS 単位ぶんを取り出す。
 * 4 <= e < KANJI_MAX_E のときのみ意味を持つ（呼び出し側で範囲チェック済み前提）。
 */
function compoundKanji(value: BigNum, maxUnits = COMPOUND_MAX_UNITS): string {
  let e = Math.floor(value.e);
  let m = value.m;

  // 仮数を有効桁の整数列にする（先頭が 10^e の位）
  const SIG = 12;
  let digits = Math.round(m * Math.pow(10, SIG - 1)).toString();
  if (digits.length > SIG) {
    // 9.999… → 10000… への繰り上がり
    e += 1;
    digits = digits.slice(0, SIG);
  }

  // 10^p の位の数字（既知の有効桁の外は 0）
  const digitAt = (p: number): number => {
    const idx = e - p;
    if (idx < 0 || idx >= digits.length) return 0;
    return digits.charCodeAt(idx) - 48;
  };

  const parts: string[] = [];
  for (const u of kanjiUnits) {
    if (u.e > e) continue; // この単位より上の桁は無い
    // u.e 〜 u.e+3 の 4 桁グループ
    const group =
      digitAt(u.e) + digitAt(u.e + 1) * 10 + digitAt(u.e + 2) * 100 + digitAt(u.e + 3) * 1000;
    if (group > 0) {
      parts.push(`${group}${u.name}`);
      if (parts.length >= maxUnits) break;
    }
  }
  return parts.length > 0 ? parts.join('') : Math.floor(m * Math.pow(10, e)).toString();
}

/**
 * 指数を横幅が爆発しないよう整形する。
 * 小さければ整数、巨大なら指数自身も a×10^b 表記にして桁あふれを防ぐ。
 */
function formatExp(e: number): string {
  const fe = Math.floor(e);
  if (fe < 1e6) return String(fe);
  return fe.toExponential(2).replace('e+', '×10^').replace('e-', '×10^-');
}

/**
 * 正の数 x を漢数字で表す（主に「10 の指数」を漢数字化するために使う）。
 * 漢数字の範囲（〜10^72 弱）に収まれば複合漢数字、超えれば指数自身を再帰的に
 * 10^… で表すので、漢字が消えず・常に数字を伴い・冪乗の塔として表現できる。
 */
function kanjiOfNumber(x: number): string {
  if (x < 10000) return String(Math.floor(x));
  const ex = Math.floor(Math.log10(x));
  if (ex < KANJI_MAX_E) {
    return compoundKanji(new BigNum(x / Math.pow(10, ex), ex));
  }
  return `10^${kanjiOfNumber(ex)}`;
}

// 無量大数 = 10^68。これを超単位として「無量大数^k」を積み上げ、10^68 超を複合漢数字で表す。
const MURYO_E = 68;
// 無量大数 を積み上げる上限。これより k が大きい（＝桁が大きすぎて読めない／重い）ときは
// 冪乗の塔表記にフォールバックする。
const MURYO_MAX_STACK = 16;

// 華厳経「上数法」の命数（無量大数より上、指数が倍々）。指数の降順。
// 値が命数の閾値を超えたら、その命数で割った商（万進法／無量大数積み上げ）＋命数名で表す。
// 登るにつれて 矜羯羅→阿伽羅→最勝… と先頭の命数名が変わる。
const joUnits: { e: number; name: string }[] = [
  { e: 57344, name: '阿婆鈐' },
  { e: 28672, name: '禰摩' },
  { e: 14336, name: '普摩' },
  { e: 7168, name: '界分' },
  { e: 3584, name: '多婆羅' },
  { e: 1792, name: '阿婆羅' },
  { e: 896, name: '摩婆羅' },
  { e: 448, name: '最勝' },
  { e: 224, name: '阿伽羅' },
  { e: 112, name: '矜羯羅' },
];

/**
 * 無量大数(10^68)を超える数を「先頭ブロックの複合漢数字 ＋ 無量大数 ×k」で表す。
 * 例: 10^112 → "1載無量大数"（載=10^44, ×無量大数=10^68 で 10^112）、10^136 → "1無量大数無量大数"。
 * k = floor(e/68) が大きすぎる場合は null（呼び出し側で冪乗の塔へ）。
 */
function compoundAboveMuryo(value: BigNum, maxUnits: number): string | null {
  const k = Math.floor(value.e / MURYO_E);
  if (k < 1 || k > MURYO_MAX_STACK) return null;
  // 先頭ブロック = m × 10^(e − 68k)（< 10^68 なので万進法の複合漢数字で表せる）。
  // 仮数を [1,10) に正規化してから渡す。
  let headM = value.m;
  let headE = value.e - MURYO_E * k;
  while (headM >= 10) {
    headM /= 10;
    headE += 1;
  }
  const head = compoundKanji(new BigNum(headM, headE), maxUnits);
  return head + '無量大数'.repeat(k);
}

/**
 * BigNum を漢数字（複数単位連結 / 冪乗の塔）/ 英語短縮形 / 科学表記の文字列へ変換する。
 * `kanjiUnits` で連結する漢数字の単位数を絞れる（飛ぶダメージ数値は短くして読みやすく）。
 */
export function formatNumber(value: BigNum, type: FormatType, kanjiUnits = COMPOUND_MAX_UNITS): string {
  const { m, e } = value;
  if (e < 4 && type !== 'sci') return Math.floor(m * Math.pow(10, e)).toString();

  if (type === 'kanji') {
    // 〜10^72 弱は万進法の複合漢数字。
    if (e < KANJI_MAX_E) return compoundKanji(value, kanjiUnits);
    // 上数法の命数（矜羯羅 10^112 など）以上なら、その命数で割った商＋命数名で表す。
    // 例: 10^112 → "1矜羯羅"、10^150 → "100澗矜羯羅"、10^224 → "1阿伽羅"。
    const u = joUnits.find((j) => e >= j.e);
    if (u) {
      const coeff = new BigNum(m, e - u.e);
      const coeffStr =
        coeff.e < KANJI_MAX_E ? compoundKanji(coeff, kanjiUnits) : compoundAboveMuryo(coeff, kanjiUnits);
      if (coeffStr !== null) return coeffStr + u.name;
    }
    // 命数の無いレンジ（10^72〜10^111）は無量大数を積み上げ（例: "1万無量大数"）。
    // 命数を超える／積み上げきれない（グラハム数級など）ときは指数を漢数字化した冪乗の塔（"10^10^308"）。
    return compoundAboveMuryo(value, kanjiUnits) ?? `10^${kanjiOfNumber(e)}`;
  }

  if (type === 'english') {
    if (e >= 1e100) return 'Googolplex';
    for (const u of engUnits) {
      if (e >= u.e) {
        const val = m * Math.pow(10, e - u.e);
        // 桁が大きすぎて係数が Infinity になる場合は "Googol+" のように打ち止める
        if (!Number.isFinite(val)) return `${u.name}+`;
        return `${Math.floor(val)} ${u.name}`;
      }
    }
  }

  const cleanM = parseFloat(m.toFixed(4));
  return `${cleanM} × 10^${formatExp(e)}`;
}

/** 経過秒を mm:ss（1 時間以上は h:mm:ss）にする。負値・NaN は 0 扱い。 */
export function formatTime(sec: number): string {
  const s = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const ss = (s % 60).toString().padStart(2, '0');
  const m = Math.floor(s / 60);
  if (m < 60) return `${m.toString().padStart(2, '0')}:${ss}`;
  const mm = (m % 60).toString().padStart(2, '0');
  const h = Math.floor(m / 60);
  return `${h}:${mm}:${ss}`;
}
