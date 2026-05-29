import { BigNum } from './bignum';
import { formatNumber } from './format';

/** クリックごとに飛び出すダメージ数値のパーティクル。 */
export interface DamageParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 残り寿命 1.0 → 0（透明度兼用、実時間で減る） */
  life: number;
  /** 基本フォントサイズ */
  size: number;
  kanji: string;
  /** 漢数字の下に小さく添える科学表記（馴染みのない命数でも大きさが分かるように） */
  sci?: string;
  /** 画面幅に収めるため実描画に使うフォントサイズ（初回描画時に算出してキャッシュ） */
  dispSize?: number;
  /** 収めたあとのテキスト半幅（x クランプ用） */
  halfW?: number;
  /** スパーク（文字ではなく小さな光点として描く：撃破／ヒット演出） */
  spark?: boolean;
  /** ヒットのインパクトリング（広がる輪として描く） */
  ring?: boolean;
  /** スパーク／リングの色 */
  color?: string;
}

export const particles: DamageParticle[] = [];
// 本気タップでも溜まりすぎないよう控えめに。
const MAX_PARTICLES = 36;
// 同時に表示するダメージ「数値」の上限。連打で数字が重なって白飛びするのを防ぐ
// （スパーク／リングはこれに含めない）。超えたら最も古い数値から捨てる。
const MAX_DAMAGE_NUMBERS = 4;
// 実時間での寿命（秒）。fps が落ちても見た目の滞留時間は一定。短めにして重なり（白飛び）を抑える。
const LIFETIME_SEC = 0.6;

const isNumber = (p: DamageParticle): boolean => !p.spark && !p.ring;

export function spawnDamage(x: number, y: number, dmg: BigNum): void {
  // 小さめ＋大きく散らして、連打しても数字が重なって白く潰れないようにする。
  const size = Math.min(40, 22 + Math.log10(dmg.e + 1) * 3);
  // 表示中の数値が上限に達していたら、最古の数値を捨ててから足す（重なり＝白飛びを抑える）。
  let nums = 0;
  for (const p of particles) if (isNumber(p)) nums++;
  while (nums >= MAX_DAMAGE_NUMBERS) {
    const idx = particles.findIndex(isNumber);
    if (idx < 0) break;
    particles.splice(idx, 1);
    nums--;
  }
  if (particles.length >= MAX_PARTICLES) particles.shift();
  particles.push({
    x: x + (Math.random() - 0.5) * 96,
    // 敵の上側の暗い空間に出す。明るい本体に白文字が重なって白飛び＝読みづらくなるのを避ける。
    y: y - 58 - Math.random() * 30,
    vx: (Math.random() - 0.5) * 4,
    vy: -4.5 - Math.random() * 3,
    life: 1,
    size,
    // 複合漢数字を復活（先頭から最大 3 単位を連結：998兆999億9999万 のように）。
    kanji: formatNumber(dmg, 'kanji', 3),
    // 下に小さく科学表記を添えて、馴染みのない命数でも大きさが伝わるようにする。
    sci: formatNumber(dmg, 'sci'),
  });
}

/**
 * 物理更新。dt（秒）で進めるので、fps に依らず一定の実時間で飛んで消える。
 * 寿命の尽きたものは配列から除去。
 */
export function stepParticles(dt = 1 / 60): void {
  const f = Math.min(3, dt * 60); // 速度・減衰のフレーム換算（カクついても暴れない上限）
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!;
    p.x += p.vx * f;
    p.y += p.vy * f;
    const decel = Math.pow(0.92, f);
    p.vx *= decel;
    p.vy *= decel;
    p.life -= dt / LIFETIME_SEC;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

/** 攻撃ヒット時の着弾エフェクト：広がるリング 1 つ＋小スパーク 2 つ（軽量）。 */
export function spawnHitSpark(x: number, y: number): void {
  if (particles.length >= MAX_PARTICLES) particles.shift();
  particles.push({ x, y, vx: 0, vy: 0, life: 1, size: 7, kanji: '', ring: true, color: '#ffffff' });
  for (let i = 0; i < 2; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 3 + Math.random() * 4;
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 1,
      life: 1,
      size: 2 + Math.random() * 2,
      kanji: '',
      spark: true,
      color: '#ffffff',
    });
  }
}

/** アイテム取得時のバフ演出：取得地点からエメラルドの波紋＋立ち上る光。 */
export function spawnPowerUp(x: number, y: number): void {
  // バフの波紋（大きめのエメラルドリング）
  if (particles.length >= MAX_PARTICLES) particles.shift();
  particles.push({ x, y, vx: 0, vy: 0, life: 1, size: 14, kanji: '', ring: true, color: '#34e89e' });
  // 上方向中心に立ち上るエメラルドのスパーク（力が満ちる感じ）
  for (let i = 0; i < 12; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9; // 上向き扇状
    const sp = 3 + Math.random() * 5;
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      life: 1,
      size: 2.5 + Math.random() * 2.5,
      kanji: '',
      spark: true,
      color: '#5eead4',
    });
  }
}

/** 撃破時に中心 (x,y) から放射状にスパークを撒く（撃破演出）。 */
export function spawnBurst(x: number, y: number): void {
  const colors = ['#ffffff', '#7dd3fc', '#27e35a', '#ffd21a'];
  const count = 22;
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const sp = 4 + Math.random() * 8;
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 1,
      size: 2 + Math.random() * 3, // スパークは半径として使う
      kanji: '',
      spark: true,
      color: colors[i % colors.length]!,
    });
  }
}

export function clearParticles(): void {
  particles.length = 0;
}

const FX_MARGIN = 8;
// drawParticles が最後にフィット計算した画面幅（変わったら再計算する）
let lastFitScreenW = 0;

/**
 * パーティクルを描画する（座標は CSS px 前提、screenW は CSS px の画面幅）。
 * 各数値は画面幅に収まるようフォントを縮小し、はみ出さないよう x をクランプする
 * （桁が巨大でも全体が画面内に見える＝雰囲気が伝わる）。白抜き＋黒フチ 1 行で軽量。
 */
export function drawParticles(ctx: CanvasRenderingContext2D, screenW: number): void {
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const maxW = Math.max(40, screenW - FX_MARGIN * 2);
  // 極太(Arial Black 900)はグレアして読みづらいので、やや軽い 800 のボールドにする。
  const baseFont = (px: number) => `italic 800 ${px}px "Arial", "Helvetica Neue", sans-serif`;

  // 画面幅が変わったら、生存中の数値のフィット結果を作り直させる
  if (screenW !== lastFitScreenW) {
    for (const p of particles) p.dispSize = undefined;
    lastFitScreenW = screenW;
  }

  // 1パス目：リング／スパーク（数値の背面に来るよう先に描く）
  for (const p of particles) {
    if (p.ring) {
      // インパクトリング：寿命とともに広がりながら薄れる（控えめにして白飛びを防ぐ）。
      ctx.globalAlpha = Math.max(0, p.life) * 0.45;
      ctx.strokeStyle = p.color ?? '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + (1 - p.life) * 22, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.spark) {
      // スパークは小さな光点。寿命とともに縮んで消える。
      ctx.globalAlpha = Math.max(0, p.life) * 0.8;
      ctx.fillStyle = p.color ?? '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.size * p.life), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 2パス目：ダメージ数値は常にスパーク／リングの上に描く（緑スパークに塗り潰されて色が転ぶのを防ぐ）。
  ctx.strokeStyle = '#000';
  for (const p of particles) {
    if (p.ring || p.spark) continue;
    // 初回だけ計測して、画面幅に収まる表示サイズと半幅を決める
    if (p.dispSize === undefined) {
      ctx.font = baseFont(p.size);
      const w = ctx.measureText(p.kanji).width;
      p.dispSize = w > maxW ? p.size * (maxW / w) : p.size;
      p.halfW = Math.min(w, maxW) / 2;
    }
    const half = p.halfW ?? 0;
    const x = Math.max(FX_MARGIN + half, Math.min(screenW - FX_MARGIN - half, p.x));

    // 寿命の大半は不透明（敵のオーラに重なっても色が混ざらず＝色が転ばず読める）、最後だけ素早く消える。
    ctx.globalAlpha = p.life > 0.25 ? 1 : Math.max(0, p.life) / 0.25;
    // 黒フチで背景から分離（コントラスト確保）。太すぎると字が潰れるので控えめに。
    ctx.lineWidth = Math.max(2.5, p.dispSize * 0.15);
    ctx.font = baseFont(p.dispSize);
    ctx.strokeText(p.kanji, x, p.y);
    // 純白はギラつくので、ほんのり暖色を含むオフホワイトにする。
    ctx.fillStyle = '#fff7ea';
    ctx.fillText(p.kanji, x, p.y);

    // 漢数字の下に科学表記を小さく添える（馴染みのない命数でも大きさが分かるように）。
    if (p.sci) {
      const sciSize = Math.max(11, p.dispSize * 0.42);
      const sciY = p.y + p.dispSize * 0.62;
      ctx.font = `600 ${sciSize}px "Arial", sans-serif`;
      ctx.lineWidth = Math.max(2, sciSize * 0.18);
      ctx.strokeText(p.sci, x, sciY);
      ctx.fillStyle = '#bfead8'; // 控えめなミントグレー
      ctx.fillText(p.sci, x, sciY);
    }
  }
  ctx.globalAlpha = 1;
}
