import { BigNum } from './bignum';
import { difficultyConfigs, difficultyOrder, type Difficulty } from './config';
import { formatNumber, formatTime, addRuby, kanjiUnits, joUnits } from './format';
import { state, hasSavedGameForDiff } from './state';

export interface UICallbacks {
  onStart: (diff: Difficulty) => void;
  onContinue: (diff: Difficulty) => void;
  onReset: () => void;
  onAttack: (x: number, y: number) => void;
  onItem: (x: number, y: number) => void;
}

let menuScreen!: HTMLElement;
let gameScreen!: HTMLElement;
let clearedOverlay!: HTMLElement;
let meisuuScreen!: HTMLElement;
let itemEl!: HTMLElement;
let enemyEl!: HTMLElement;
let atkPanel!: HTMLElement;
let saveStatusEl!: HTMLElement;
let killFlash!: HTMLElement;
let slowMoVeil!: HTMLElement;
let backBtn!: HTMLButtonElement;

let saveStatusTimer = 0;
let powerUpTimer = 0;
let armTimer = 0;
let shakeTimer = 0;
let hitVibeTimer = 0;
let powering = false;
// updateStats のダーティチェック用（毎フレームの DOM 書き込み・フォーマットを避ける）
let lastAtkE = NaN;
let lastElapsed = -1;

function $(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

export function setupUI(cb: UICallbacks): void {
  menuScreen = $('menuScreen');
  gameScreen = $('gameScreen');
  clearedOverlay = $('clearedOverlay');
  itemEl = $('item');
  enemyEl = $('enemy');
  atkPanel = $('atkPanel');
  saveStatusEl = $('saveStatus');
  killFlash = $('killFlash');
  slowMoVeil = $('slowMoVeil');
  backBtn = $('backBtn') as HTMLButtonElement;

  meisuuScreen = $('meisuuScreen');
  setupMeisuuScreen();

  buildMenu(cb);
  $('resetBtn').addEventListener('click', () => cb.onReset());
  backBtn.addEventListener('click', () => cb.onReset());

  bindAttack(enemyEl, cb);
  bindItem(itemEl, cb);

  renderScreen();
}

function buildMenu(cb: UICallbacks): void {
  const list = $('difficultyList');
  list.innerHTML = '';
  let extremeHeadingAdded = false;
  for (const diff of difficultyOrder) {
    const cfg = difficultyConfigs[diff];
    if (cfg.extreme && !extremeHeadingAdded) {
      const heading = document.createElement('div');
      heading.className = 'pt-3 pb-1 text-xs font-semibold tracking-widest text-amber-500/80';
      heading.textContent = '極限（自己責任）';
      list.appendChild(heading);
      extremeHeadingAdded = true;
    }
    const card = document.createElement('div');
    card.className = cfg.extreme
      ? 'w-full px-5 py-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.04]'
      : 'w-full px-5 py-4 rounded-lg border border-white/10 bg-white/[0.03]';

    const nameColor = cfg.extreme ? 'text-amber-200' : 'text-zinc-100';
    const descColor = cfg.extreme ? 'text-amber-500/70' : 'text-zinc-500';
    const contBtnId = `contBtn-${diff}`;
    const startBtnId = `startBtn-${diff}`;

    card.innerHTML =
      `<div class="text-lg font-semibold ${nameColor}">${cfg.name}</div>` +
      `<div class="text-sm ${descColor} mt-0.5">${cfg.desc}</div>` +
      `<div class="mt-3 flex gap-2">` +
        `<button id="${contBtnId}" class="hidden flex-1 px-3 py-2 text-sm rounded-md border border-emerald-400/30 ` +
          `bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20 transition-colors">` +
          `つづきから` +
        `</button>` +
        `<button id="${startBtnId}" class="flex-1 px-3 py-2 text-sm rounded-md border ` +
          `${cfg.extreme ? 'border-amber-500/25 bg-amber-500/[0.06] text-amber-200 hover:bg-amber-500/[0.12]' : 'border-white/10 bg-white/[0.05] text-zinc-200 hover:bg-white/[0.1]'} ` +
          `transition-colors">` +
          `はじめから` +
        `</button>` +
      `</div>`;

    card.querySelector(`#${contBtnId}`)!.addEventListener('click', (e) => {
      e.stopPropagation();
      cb.onContinue(diff);
    });
    card.querySelector(`#${startBtnId}`)!.addEventListener('click', (e) => {
      e.stopPropagation();
      cb.onStart(diff);
    });

    list.appendChild(card);
  }
}

/** メニュー表示時に各難易度カードの「つづきから」ボタンを最新セーブ状態で更新する。 */
function refreshMenuSaveButtons(): void {
  for (const diff of difficultyOrder) {
    const btn = document.getElementById(`contBtn-${diff}`);
    if (btn) btn.classList.toggle('hidden', !hasSavedGameForDiff(diff));
  }
}

function bindAttack(el: HTMLElement, cb: UICallbacks): void {
  el.addEventListener('mousedown', (e) => cb.onAttack(e.clientX, e.clientY));
  el.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      const t = e.touches[0];
      if (t) cb.onAttack(t.clientX, t.clientY);
    },
    { passive: false },
  );
}

function bindItem(el: HTMLElement, cb: UICallbacks): void {
  // バフ演出を出すため、アイテムの中心座標を渡す
  const fire = () => {
    const r = el.getBoundingClientRect();
    cb.onItem(r.left + r.width / 2, r.top + r.height / 2);
  };
  el.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    fire();
  });
  el.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      fire();
    },
    { passive: false },
  );
}

/** state.screen に応じて画面の表示を切り替える。 */
export function renderScreen(): void {
  // 画面が変わったら次の updateStats で必ず描き直す
  lastAtkE = NaN;
  lastElapsed = -1;
  menuScreen.classList.toggle('hidden', state.screen !== 'menu');
  gameScreen.classList.toggle('hidden', state.screen === 'menu');
  clearedOverlay.classList.toggle('hidden', state.screen !== 'cleared');
  if (state.screen === 'menu') {
    refreshMenuSaveButtons();
  }
  if (state.screen !== 'menu') {
    $('diffName').textContent = difficultyConfigs[state.difficulty].name;
    enemyEl.textContent = state.enemyEmoji;
  }
  // 撃破演出の名残をリセット（新規ゲーム/タイトルへ戻ったとき）
  if (state.screen !== 'cleared') {
    enemyEl.classList.remove('defeated');
    killFlash.classList.remove('show');
  }
  // スローモーションの暗転は撃破演出中のみ。結果画面 / メニュー / プレイへの切替で必ず外す
  // （結果画面に切替えた瞬間は #slowMoVeil 側の transition で滑らかにフェードアウトする）。
  slowMoVeil.classList.remove('show');
  if (state.screen === 'cleared') {
    fillResult();
    setHardening(0);
    // 連打の流れで即タイトルに戻らないよう、戻るボタンを少し遅れて有効化する
    backBtn.classList.add('arming');
    window.clearTimeout(armTimer);
    armTimer = window.setTimeout(() => backBtn.classList.remove('arming'), 700);
  }
}

/** log10 値（damageE 等）から BigNum を作る。0 以下や非有限は 0 として返す。 */
function bigNumFromLog10(log10: number): BigNum {
  if (!Number.isFinite(log10) || log10 <= 0) return new BigNum(0, 0);
  const e = Math.floor(log10);
  return new BigNum(Math.pow(10, log10 - e), e);
}

/** 撃破画面の各統計値をセットする。 */
function fillResult(): void {
  const cfg = difficultyConfigs[state.difficulty];
  const courseEl = document.getElementById('clearedCourse');
  if (courseEl) courseEl.textContent = cfg.name;

  const resultEnemyEl = document.getElementById('resultEnemy');
  if (resultEnemyEl) resultEnemyEl.textContent = enemyEl.textContent;

  $('clearedTime').textContent = formatTime(state.elapsedTime);

  // 総ダメージ＝累積ダメージ。撃破時点では damageE >= maxHp.e。
  const total = bigNumFromLog10(state.damageE);
  const damageEl = $('clearedDamage');
  damageEl.innerHTML = addRuby(formatNumber(total, 'kanji'));
  $('clearedDamageSci').textContent = formatNumber(total, 'sci');
  fitText(damageEl);

  $('clearedClicks').textContent = state.totalClicks.toLocaleString('ja-JP');

  const seconds = Math.max(1, state.elapsedTime);
  const cps = state.totalClicks / seconds;
  $('clearedCps').textContent = cps.toFixed(1);

  $('clearedItems').textContent = `${state.itemsCollected} / ${cfg.totalItems}`;

  const atkEl = $('clearedAtk');
  atkEl.innerHTML = addRuby(formatNumber(state.atk, 'kanji'));
  fitText(atkEl);

  const maxHitEl = $('clearedMaxHit');
  maxHitEl.innerHTML = state.maxHit.isZero() ? '0' : addRuby(formatNumber(state.maxHit, 'kanji'));
  fitText(maxHitEl);

  // 平均 DPS = totalDamage / elapsedTime。log10 空間で引いて BigNum 化。
  const dps = bigNumFromLog10(state.damageE - Math.log10(seconds));
  const dpsEl = $('clearedDps');
  dpsEl.innerHTML = addRuby(formatNumber(dps, 'kanji'));
  fitText(dpsEl);
}

/** 撃破演出：アイテム/バッジを消し、敵を弾けさせ、画面を一瞬フラッシュ＋スローモーションの暗転。 */
export function playDefeat(): void {
  hideItem();
  enemyEl.classList.add('defeated');
  killFlash.classList.remove('show');
  void killFlash.offsetWidth;
  killFlash.classList.add('show');
  // 中央以外を落として演出にフォーカス。結果画面へ切替わるときに renderScreen 側で外す。
  slowMoVeil.classList.add('show');
}

/**
 * テキストが枠からはみ出すぶんだけフォントを縮めて全体を見せる。
 * 桁が本当に大きいときも「全部見えるが小さい」状態にして横あふれを防ぐ。
 */
function fitText(el: HTMLElement): void {
  el.style.fontSize = ''; // まず CSS（レスポンシブ）の既定サイズへ戻す
  const cw = el.clientWidth;
  if (cw <= 0) return;
  const sw = el.scrollWidth;
  if (sw > cw) {
    const base = parseFloat(getComputedStyle(el).fontSize);
    el.style.fontSize = `${Math.max(11, base * (cw / sw) * 0.97)}px`;
  }
}

/**
 * ステータス更新（攻撃力＝伸びていく数字のみ）。
 * 攻撃力の指数と経過秒が変わらなければ何もしない（毎フレームの整形・DOM 書き込みを回避）。
 */
export function updateStats(): void {
  if (state.atk.e === lastAtkE && state.elapsedTime === lastElapsed) return;

  if (state.elapsedTime !== lastElapsed) {
    $('timerVal').textContent = formatTime(state.elapsedTime);
    lastElapsed = state.elapsedTime;
  }

  if (state.atk.e !== lastAtkE) {
    const atkVal = $('atkVal');
    atkVal.innerHTML = addRuby(formatNumber(state.atk, 'kanji'));
    $('atkSci').textContent = formatNumber(state.atk, 'sci');
    fitText(atkVal);
    lastAtkE = state.atk.e;
  }
}

/** リサイズ時などに次の updateStats で必ず再整形（fitText 再計算）させる。 */
export function markStatsDirty(): void {
  lastAtkE = NaN;
  lastElapsed = -1;
}

const ITEM_EMOJIS = ['🍣', '🍖', '🍙', '🍯', '🧉', '🍅', '🍄', '🍗', '🍢', '🍡'];

export function showItemAt(top: string, left: string): void {
  const span = itemEl.querySelector('span');
  if (span) span.textContent = ITEM_EMOJIS[Math.floor(Math.random() * ITEM_EMOJIS.length)];
  itemEl.style.top = top;
  itemEl.style.left = left;
  itemEl.classList.remove('hidden');
}

export function hideItem(): void {
  itemEl.classList.add('hidden');
}

export function showSaved(): void {
  saveStatusEl.textContent = '保存しました';
  window.clearTimeout(saveStatusTimer);
  saveStatusTimer = window.setTimeout(() => {
    saveStatusEl.textContent = '';
  }, 2000);
}

/** 攻撃力が目標へランプ中かどうかで攻撃表示の発光を切り替える。 */
export function setPowering(on: boolean): void {
  if (on === powering) return;
  powering = on;
  atkPanel.classList.toggle('powering', on);
}

/**
 * 敵の硬化度（0〜1）。大きいほど結晶シェル（リング）が濃く重なり、
 * ヒットしても怯みにくくなる（CSS 側で transform/リングに反映）。
 */
export function setHardening(level: number): void {
  enemyEl.style.setProperty('--harden', Math.max(0, Math.min(1, level)).toFixed(2));
}

const ENEMY_EMOJIS = ['🧌', '🗿', '🦹', '🐉', '🦖', '🐊', '🦂', '🐦‍🔥'];

export function setRandomEnemyEmoji(): void {
  state.enemyEmoji = ENEMY_EMOJIS[Math.floor(Math.random() * ENEMY_EMOJIS.length)];
  enemyEl.textContent = state.enemyEmoji;
}

/** ヒット時の敵リコイル量（0〜1）。transform のみ動かすので軽い。v=0 のとき振動クラスも除去。 */
export function setEnemyHit(v: number): void {
  if (v === 0) {
    window.clearTimeout(hitVibeTimer);
    enemyEl.classList.remove('hit-vibe');
  }
  enemyEl.style.setProperty('--hit', Math.max(0, Math.min(1, v)).toFixed(2));
}

/** ヒット時の振動＋フラッシュ演出を起動する。連打でもリセットして再生。 */
export function triggerEnemyHit(): void {
  enemyEl.classList.remove('hit-vibe');
  void enemyEl.offsetWidth;
  enemyEl.classList.add('hit-vibe');
  window.clearTimeout(hitVibeTimer);
  hitVibeTimer = window.setTimeout(() => enemyEl.classList.remove('hit-vibe'), 350);
}

/** アイテム取得時のバフ演出：攻撃パネルを一瞬強く発光させる（文字は出さない）。 */
export function playPowerUp(): void {
  atkPanel.classList.remove('buffed');
  void atkPanel.offsetWidth; // reflow でアニメーション再起動
  atkPanel.classList.add('buffed');
  window.clearTimeout(powerUpTimer);
  powerUpTimer = window.setTimeout(() => atkPanel.classList.remove('buffed'), 600);
}

export function triggerShake(): void {
  gameScreen.classList.remove('shake');
  void gameScreen.offsetWidth;
  gameScreen.classList.add('shake');
  window.clearTimeout(shakeTimer);
  shakeTimer = window.setTimeout(() => gameScreen.classList.remove('shake'), 300);
}

function buildMeisuuRows(
  entries: { e: number; n?: number; name: string; reading: string }[],
  nameColor: string,
  expColor: string,
): string {
  return entries
    .map(({ name, reading, e, n }) => {
      // joUnits（n あり）は 7×2^n 形式、kanjiUnits は 10の何乗かをそのまま表示
      const expHtml =
        n !== undefined
          ? `10^(7·2<sup>${n}</sup>)`
          : `10<sup>${e.toLocaleString('en')}</sup>`;
      return (
        `<div class="flex items-start justify-between gap-3 py-2.5">` +
        `<div>` +
        `<span class="${nameColor} font-medium">${name}</span>` +
        `<span class="text-zinc-600 text-xs ml-1.5">${reading}</span>` +
        `</div>` +
        `<span class="${expColor} tabular-nums text-sm shrink-0">${expHtml}</span>` +
        `</div>`
      );
    })
    .join('');
}

function setupMeisuuScreen(): void {
  const list = $('meisuuList');

  // kanjiUnits は降順なので昇順に並べ直して表示する
  const kanjiRows = buildMeisuuRows([...kanjiUnits].reverse(), 'text-zinc-100', 'text-zinc-400');
  // joUnits も降順なので昇順に並べ直す
  const joRows = buildMeisuuRows([...joUnits].reverse(), 'text-amber-200', 'text-amber-400/70');

  list.innerHTML =
    `<section class="mb-8">` +
    `<h3 class="text-xs uppercase tracking-widest text-emerald-500/80 mb-0.5">万進法</h3>` +
    `<p class="text-xs text-zinc-600 mb-3">万の何乗かで表す日本の命数法</p>` +
    `<div class="divide-y divide-white/5 border-y border-white/5">${kanjiRows}</div>` +
    `</section>` +
    `<section>` +
    `<h3 class="text-xs uppercase tracking-widest text-amber-500/80 mb-0.5">華厳経 上数法</h3>` +
    `<p class="text-xs text-zinc-600 mb-3">前の命数の2乗ずつ増加する大数（10^(7×2^n)）</p>` +
    `<div class="divide-y divide-white/5 border-y border-white/5">${joRows}</div>` +
    `</section>`;

  $('meisuuBtn').addEventListener('click', () => meisuuScreen.classList.remove('hidden'));
  $('meisuuBackBtn').addEventListener('click', () => meisuuScreen.classList.add('hidden'));
}
