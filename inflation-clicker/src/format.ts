import { BigNum } from './bignum';

export type FormatType = 'kanji' | 'english' | 'sci';

// 4 桁ごとの漢数字単位（指数 4〜68 をすべて網羅）。降順。
export const kanjiUnits = [
  { e: 68, name: '無量大数', reading: 'むりょうたいすう' },
  { e: 64, name: '不可思議', reading: 'ふかしぎ' },
  { e: 60, name: '那由他', reading: 'なゆた' },
  { e: 56, name: '阿僧祇', reading: 'あそうぎ' },
  { e: 52, name: '恒河沙', reading: 'ごうがしゃ' },
  { e: 48, name: '極', reading: 'ごく' },
  { e: 44, name: '載', reading: 'さい' },
  { e: 40, name: '正', reading: 'せい' },
  { e: 36, name: '澗', reading: 'かん' },
  { e: 32, name: '溝', reading: 'こう' },
  { e: 28, name: '穣', reading: 'じょう' },
  { e: 24, name: '𥝱', reading: 'じょ' },
  { e: 20, name: '垓', reading: 'がい' },
  { e: 16, name: '京', reading: 'けい' },
  { e: 12, name: '兆', reading: 'ちょう' },
  { e: 8, name: '億', reading: 'おく' },
  { e: 4, name: '万', reading: 'まん' },
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

// 華厳経「上数法」命数の定義データ（n 昇順）。e = 7 × 2^n。n=4（矜羯羅）〜 n=122（不可説不可説転）。
// 値が命数の閾値を超えたら、その命数で割った商（万進法／無量大数積み上げ）＋命数名で表す。
const joUnitData: { n: number; name: string; reading: string }[] = [
  { n:   4, name: '矜羯羅',        reading: 'こんがら' },
  { n:   5, name: '阿伽羅',        reading: 'あから' },
  { n:   6, name: '最勝',          reading: 'さいしょう' },
  { n:   7, name: '摩婆羅',        reading: 'まばら' },
  { n:   8, name: '阿婆羅',        reading: 'あばら' },
  { n:   9, name: '多婆羅',        reading: 'たばら' },
  { n:  10, name: '界分',          reading: 'かいぶん' },
  { n:  11, name: '普摩',          reading: 'ふま' },
  { n:  12, name: '禰摩',          reading: 'ねま' },
  { n:  13, name: '阿婆鈐',        reading: 'あばけん' },
  { n:  14, name: '弥伽婆',        reading: 'みかば' },
  { n:  15, name: '毘攞伽',        reading: 'びらか' },
  { n:  16, name: '毘伽婆',        reading: 'びかば' },
  { n:  17, name: '僧羯邏摩',      reading: 'そうがらま' },
  { n:  18, name: '毘薩羅',        reading: 'びさら' },
  { n:  19, name: '毘贍婆',        reading: 'びせんば' },
  { n:  20, name: '毘盛伽',        reading: 'びじょうが' },
  { n:  21, name: '毘素陀',        reading: 'びすだ' },
  { n:  22, name: '毘婆訶',        reading: 'びばか' },
  { n:  23, name: '毘薄底',        reading: 'びばてい' },
  { n:  24, name: '毘佉擔',        reading: 'びきゃたん' },
  { n:  25, name: '称量',          reading: 'しょうりょう' },
  { n:  26, name: '一持',          reading: 'いちじ' },
  { n:  27, name: '異路',          reading: 'いろ' },
  { n:  28, name: '顛倒',          reading: 'てんどう' },
  { n:  29, name: '三末耶',        reading: 'さんまや' },
  { n:  30, name: '毘睹羅',        reading: 'びとら' },
  { n:  31, name: '奚婆羅',        reading: 'けいばら' },
  { n:  32, name: '伺察',          reading: 'しさつ' },
  { n:  33, name: '周広',          reading: 'しゅうこう' },
  { n:  34, name: '高出',          reading: 'こうしゅつ' },
  { n:  35, name: '最妙',          reading: 'さいみょう' },
  { n:  36, name: '泥羅婆',        reading: 'ないらば' },
  { n:  37, name: '訶理婆',        reading: 'かりば' },
  { n:  38, name: '一動',          reading: 'いちどう' },
  { n:  39, name: '訶理蒲',        reading: 'かりぼ' },
  { n:  40, name: '訶理三',        reading: 'かりさん' },
  { n:  41, name: '奚魯伽',        reading: 'けいろか' },
  { n:  42, name: '達攞歩陀',      reading: 'たつらほだ' },
  { n:  43, name: '訶魯那',        reading: 'かろな' },
  { n:  44, name: '摩魯陀',        reading: 'まろだ' },
  { n:  45, name: '懺慕陀',        reading: 'ざんぼだ' },
  { n:  46, name: '瑿攞陀',        reading: 'えいらだ' },
  { n:  47, name: '摩魯摩',        reading: 'まろま' },
  { n:  48, name: '調伏',          reading: 'ちょうぶく' },
  { n:  49, name: '離憍慢',        reading: 'りきょうまん' },
  { n:  50, name: '不動',          reading: 'ふどう' },
  { n:  51, name: '極量',          reading: 'ごくりょう' },
  { n:  52, name: '阿麼怛羅',      reading: 'あまたら' },
  { n:  53, name: '勃麼怛羅',      reading: 'ぼまたら' },
  { n:  54, name: '伽麼怛羅',      reading: 'がまたら' },
  { n:  55, name: '那麼怛羅',      reading: 'なまたら' },
  { n:  56, name: '奚麼怛羅',      reading: 'けいまたら' },
  { n:  57, name: '鞞麼怛羅',      reading: 'べいまたら' },
  { n:  58, name: '鉢羅麼怛羅',    reading: 'はらまたら' },
  { n:  59, name: '尸婆麼怛羅',    reading: 'しばまたら' },
  { n:  60, name: '翳羅',          reading: 'えいら' },
  { n:  61, name: '薜羅',          reading: 'べいら' },
  { n:  62, name: '諦羅',          reading: 'たいら' },
  { n:  63, name: '偈羅',          reading: 'げら' },
  { n:  64, name: '歩羅',          reading: 'そほら' },
  { n:  65, name: '泥羅',          reading: 'ないら' },
  { n:  66, name: '計羅',          reading: 'けいら' },
  { n:  67, name: '細羅',          reading: 'さいら' },
  { n:  68, name: '睥羅',          reading: 'へいら' },
  { n:  69, name: '謎羅',          reading: 'めいら' },
  { n:  70, name: '娑攞荼',        reading: 'しゃらだ' },
  { n:  71, name: '謎魯陀',        reading: 'めいろだ' },
  { n:  72, name: '契魯陀',        reading: 'けいろだ' },
  { n:  73, name: '摩睹羅',        reading: 'まとら' },
  { n:  74, name: '娑母羅',        reading: 'しゃもら' },
  { n:  75, name: '阿野娑',        reading: 'あやしゃ' },
  { n:  76, name: '迦麼羅',        reading: 'かまら' },
  { n:  77, name: '摩伽婆',        reading: 'まかば' },
  { n:  78, name: '阿怛羅',        reading: 'あたら' },
  { n:  79, name: '醯魯耶',        reading: 'けいろや' },
  { n:  80, name: '薜魯婆',        reading: 'べいろば' },
  { n:  81, name: '羯羅波',        reading: 'からは' },
  { n:  82, name: '訶婆婆',        reading: 'かばば' },
  { n:  83, name: '毘婆羅',        reading: 'びばら' },
  { n:  84, name: '那婆羅',        reading: 'なばら' },
  { n:  85, name: '摩攞羅',        reading: 'まらら' },
  { n:  86, name: '娑婆羅',        reading: 'しゃばら' },
  { n:  87, name: '迷攞普',        reading: 'めいらふ' },
  { n:  88, name: '者麼羅',        reading: 'しゃまら' },
  { n:  89, name: '駄麼羅',        reading: 'だまら' },
  { n:  90, name: '鉢攞麼陀',      reading: 'はらまだ' },
  { n:  91, name: '毘迦摩',        reading: 'びかま' },
  { n:  92, name: '烏波跋多',      reading: 'うはばた' },
  { n:  93, name: '演説',          reading: 'えんぜつ' },
  { n:  94, name: '無尽',          reading: 'むじん' },
  { n:  95, name: '出生',          reading: 'しゅっしょう' },
  { n:  96, name: '無我',          reading: 'むが' },
  { n:  97, name: '阿畔多',        reading: 'あばんた' },
  { n:  98, name: '青蓮華',        reading: 'しょうれんげ' },
  { n:  99, name: '鉢頭摩',        reading: 'はどま' },
  { n: 100, name: '僧祇',          reading: 'そうぎ' },
  { n: 101, name: '趣',            reading: 'しゅ' },
  { n: 102, name: '至',            reading: 'し' },
  { n: 103, name: '阿僧祇',        reading: 'あそうぎ' },
  { n: 104, name: '阿僧祇転',      reading: 'あそうぎてん' },
  { n: 105, name: '無量',          reading: 'むりょう' },
  { n: 106, name: '無量転',        reading: 'むりょうてん' },
  { n: 107, name: '無辺',          reading: 'むへん' },
  { n: 108, name: '無辺転',        reading: 'むへんてん' },
  { n: 109, name: '無等',          reading: 'むとう' },
  { n: 110, name: '無等転',        reading: 'むとうてん' },
  { n: 111, name: '不可数',        reading: 'ふかすう' },
  { n: 112, name: '不可数転',      reading: 'ふかすうてん' },
  { n: 113, name: '不可称',        reading: 'ふかしょう' },
  { n: 114, name: '不可称転',      reading: 'ふかしょうてん' },
  { n: 115, name: '不可思',        reading: 'ふかし' },
  { n: 116, name: '不可思転',      reading: 'ふかしてん' },
  { n: 117, name: '不可量',        reading: 'ふかりょう' },
  { n: 118, name: '不可量転',      reading: 'ふかりょうてん' },
  { n: 119, name: '不可説',        reading: 'ふかせつ' },
  { n: 120, name: '不可説転',      reading: 'ふかせつてん' },
  { n: 121, name: '不可説不可説',  reading: 'ふかせつふかせつ' },
  { n: 122, name: '不可説不可説転', reading: 'ふかせつふかせつてん' },
];

// 上数法命数（指数の降順）。formatNumber での find と ui.ts の表示の両方に使う。
export const joUnits = joUnitData
  .map(({ n, name, reading }) => ({ e: 7 * Math.pow(2, n), n, name, reading }))
  .reverse();

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
 * `_joDepth` は上数法命数の連鎖深さを制限するための内部パラメータ（呼び出し元は省略可）。
 */
export function formatNumber(value: BigNum, type: FormatType, kanjiUnits = COMPOUND_MAX_UNITS, _joDepth = 0): string {
  const { m, e } = value;
  if (e < 4 && type !== 'sci') return Math.floor(m * Math.pow(10, e)).toString();

  if (type === 'kanji') {
    // 〜10^72 弱は万進法の複合漢数字。
    if (e < KANJI_MAX_E) return compoundKanji(value, kanjiUnits);
    // 上数法の命数（矜羯羅 10^112 など）以上なら、その命数で割った商＋命数名で表す。
    // 例: 10^112 → "1矜羯羅"、10^800 → "1京矜羯羅阿伽羅最勝"。
    // _joDepth で連鎖を最大 3 段に制限する（10^(1e20) 等の中間値が長大な列になるのを防ぐ）。
    // 係数が冪乗の塔（'^' を含む）になった場合はその段の joUnit 結合を諦めてフォールバックへ。
    const u = _joDepth < 3 ? joUnits.find((j) => e >= j.e) : undefined;
    if (u) {
      const coeff = new BigNum(m, e - u.e);
      let coeffStr: string | null;
      if (coeff.e < KANJI_MAX_E) {
        coeffStr = compoundKanji(coeff, kanjiUnits);
      } else if (coeff.e < u.e) {
        const sub = formatNumber(coeff, 'kanji', kanjiUnits, _joDepth + 1);
        coeffStr = sub.includes('^') ? null : sub;
      } else {
        coeffStr = compoundAboveMuryo(coeff, kanjiUnits);
      }
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
