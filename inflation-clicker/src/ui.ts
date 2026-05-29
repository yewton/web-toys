import { difficultyConfigs, difficultyOrder, type Difficulty } from './config';
import { formatNumber, formatTime } from './format';
import { state } from './state';

export interface UICallbacks {
  onStart: (diff: Difficulty) => void;
  onContinue: () => void;
  onReset: () => void;
  onAttack: (x: number, y: number) => void;
  onItem: (x: number, y: number) => void;
}

let menuScreen!: HTMLElement;
let gameScreen!: HTMLElement;
let clearedOverlay!: HTMLElement;
let continueBtn!: HTMLButtonElement;
let itemEl!: HTMLElement;
let enemyEl!: HTMLElement;
let atkPanel!: HTMLElement;
let saveStatusEl!: HTMLElement;
let killFlash!: HTMLElement;
let backBtn!: HTMLButtonElement;

let saveStatusTimer = 0;
let powerUpTimer = 0;
let armTimer = 0;
let shakeTimer = 0;
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
  continueBtn = $('continueBtn') as HTMLButtonElement;
  itemEl = $('item');
  enemyEl = $('enemy');
  atkPanel = $('atkPanel');
  saveStatusEl = $('saveStatus');
  killFlash = $('killFlash');
  backBtn = $('backBtn') as HTMLButtonElement;

  buildMenu(cb);
  continueBtn.addEventListener('click', () => cb.onContinue());
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
    // 極限モードの手前に「極限（自己責任）」見出しを挿入
    if (cfg.extreme && !extremeHeadingAdded) {
      const heading = document.createElement('div');
      heading.className = 'pt-3 pb-1 text-xs font-semibold tracking-widest text-amber-500/80';
      heading.textContent = '極限（自己責任）';
      list.appendChild(heading);
      extremeHeadingAdded = true;
    }
    const btn = document.createElement('button');
    btn.className = cfg.extreme
      ? 'group w-full px-5 py-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.04] ' +
        'hover:border-amber-400/50 hover:bg-amber-500/[0.08] transition-colors text-left'
      : 'group w-full px-5 py-4 rounded-lg border border-white/10 bg-white/[0.03] ' +
        'hover:border-emerald-400/40 hover:bg-white/[0.06] transition-colors text-left';
    btn.innerHTML =
      `<div class="text-lg font-semibold ${cfg.extreme ? 'text-amber-200' : 'text-zinc-100'}">${cfg.name}</div>` +
      `<div class="text-sm ${cfg.extreme ? 'text-amber-500/70' : 'text-zinc-500'}">${cfg.desc}</div>`;
    btn.addEventListener('click', () => cb.onStart(diff));
    list.appendChild(btn);
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
  continueBtn.classList.toggle('hidden', !state.hasSave);
  if (state.screen !== 'menu') {
    $('diffName').textContent = difficultyConfigs[state.difficulty].name;
  }
  // 撃破演出の名残をリセット（新規ゲーム/タイトルへ戻ったとき）
  if (state.screen !== 'cleared') {
    enemyEl.classList.remove('defeated');
    killFlash.classList.remove('show');
  }
  if (state.screen === 'cleared') {
    $('clearedTime').textContent = formatTime(state.elapsedTime);
    setHardening(0);
    // 連打の流れで即タイトルに戻らないよう、戻るボタンを少し遅れて有効化する
    backBtn.classList.add('arming');
    window.clearTimeout(armTimer);
    armTimer = window.setTimeout(() => backBtn.classList.remove('arming'), 700);
  }
}

/** 撃破演出：アイテム/バッジを消し、敵を弾けさせ、画面を一瞬フラッシュ。 */
export function playDefeat(): void {
  hideItem();
  enemyEl.classList.add('defeated');
  killFlash.classList.remove('show');
  void killFlash.offsetWidth;
  killFlash.classList.add('show');
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
    atkVal.textContent = formatNumber(state.atk, 'kanji');
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

export function showItemAt(top: string, left: string): void {
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

/** ヒット時の敵リコイル量（0〜1）。transform のみ動かすので軽い。 */
export function setEnemyHit(v: number): void {
  enemyEl.style.setProperty('--hit', Math.max(0, Math.min(1, v)).toFixed(2));
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
