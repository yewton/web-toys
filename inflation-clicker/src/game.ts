import { BigNum } from './bignum';
import {
  difficultyConfigs,
  ATTACK,
  GAUGE,
  chunkAtE,
  consumedAtDamage,
  damageEAtConsumed,
  displayBoxesForHp,
  totalSegmentsForHp,
  type Difficulty,
} from './config';
import {
  state,
  resetForDifficulty,
  save,
  loadSave,
  hasSavedGame,
  clearSave,
} from './state';
import {
  spawnDamage,
  spawnHitSpark,
  spawnBurst,
  spawnPowerUp,
  stepParticles,
  drawParticles,
  clearParticles,
} from './particles';
import {
  createGaugeState,
  advanceGauge,
  notifyAttack,
  sliceGauge,
  type GaugeState,
} from './hpGauge';
import { particles } from './particles';
import { drawGauge } from './gaugeView';
import {
  setupUI,
  renderScreen,
  updateStats,
  markStatsDirty,
  setPowering,
  setHardening,
  setEnemyHit,
  playPowerUp,
  playDefeat,
  showItemAt,
  hideItem,
  showSaved,
  triggerShake,
} from './ui';

let gaugeCanvas!: HTMLCanvasElement;
let gaugeCtx!: CanvasRenderingContext2D;
let fxCanvas!: HTMLCanvasElement;
let fxCtx!: CanvasRenderingContext2D;

let gauge: GaugeState;
let dpr = 1;
// 全画面のダメージ用キャンバスは DPR を抑える（モバイルの高 DPR で描画が重くならないように）
let fxDpr = 1;
let gaugeCssW = 0;
let gaugeCssH = 0;
let fxCssW = 0;
let fxCssH = 0;
let lastFrameNow = 0;

// 経過時間 / オートセーブ用の実時間トラッキング（経過時間は clamp 済み dt で積む）
let playSeconds = 0;
let lastSaveAt = 0;
const AUTOSAVE_MS = 5000;

// 再描画のダーティチェック（毎フレームの無駄な描画を避ける）
let gaugeForceRedraw = true;
let lastDrawnProgress = -1;
let lastAnimActive = false;
let fxHadParticles = false;
let lastHardenQ = -1;
// ヒット時の敵リコイル（叩くと 1 になり、毎フレーム素早く 0 へ戻る）
let hitImpulse = 0;
let lastHitQ = -1;
// 撃破演出の再生中フラグ（この間は攻撃を受け付けず、戻る画面もまだ出さない）
let defeatPlaying = false;
const DEFEAT_MS = 900;

/** displayedSegments / totalSegments を hp.e から計算して GaugeState を生成。 */
function makeGauge(hpE: number): GaugeState {
  return createGaugeState(displayBoxesForHp(hpE), totalSegmentsForHp(hpE));
}

/**
 * log10(10^a + 10^b)。累積ダメージ damageE への加算に使う。
 * a, b の差が大きいときに 10^大 を保ったまま小さい方を吸収する＝オーバーフローしない。
 */
function logAdd(a: number, b: number): number {
  if (!isFinite(a)) return b;
  if (!isFinite(b)) return a;
  const max = a >= b ? a : b;
  const min = a >= b ? b : a;
  return max + Math.log10(1 + Math.pow(10, min - max));
}

export function initGame(): void {
  gaugeCanvas = document.getElementById('gaugeCanvas') as HTMLCanvasElement;
  fxCanvas = document.getElementById('fxCanvas') as HTMLCanvasElement;
  gaugeCtx = gaugeCanvas.getContext('2d')!;
  fxCtx = fxCanvas.getContext('2d')!;

  state.hasSave = hasSavedGame();
  gauge = makeGauge(difficultyConfigs[state.difficulty].hp.e);

  setupUI({
    onStart: startGame,
    onContinue: continueGame,
    onReset: returnToMenu,
    onAttack: handleAttack,
    onItem: handleItem,
  });

  resizeCanvases();
  window.addEventListener('resize', resizeCanvases);
  requestAnimationFrame(loop);

  // 開発時のみ：手動・自動テストから状態を覗くためのフック＋動作確認用の自動クリック。
  // 本番ビルドでは import.meta.env.DEV が false になり tree-shake される。
  if (import.meta.env.DEV) {
    setupDevTools();
  }
}

/** 開発版だけの補助：状態フック＋自動クリック（数表記やバランスの動作確認用）。 */
function setupDevTools(): void {
  const enemyEl = document.getElementById('enemy') as HTMLElement;
  const itemEl = document.getElementById('item') as HTMLElement;

  const autoBtn = document.createElement('button');
  autoBtn.style.cssText =
    'position:fixed;right:8px;bottom:8px;z-index:9999;padding:6px 10px;border-radius:8px;' +
    'background:#111827;color:#a7f3d0;border:1px solid #34e89e66;font-size:12px;opacity:.85';
  const setLabel = () => {
    autoBtn.textContent = autoTimer ? '⏸ 自動クリック' : '▶ 自動クリック';
  };

  let autoTimer = 0;
  /** 自動クリック。on=切替, ms=間隔, takeItems=アイテムも自動取得するか。 */
  const autoClick = (on = true, ms = 60, takeItems = true): void => {
    window.clearInterval(autoTimer);
    autoTimer = 0;
    if (on) {
      autoTimer = window.setInterval(() => {
        if (state.screen !== 'playing') {
          if (state.screen !== 'menu') autoClick(false); // 撃破などで終わったら自動停止
          return;
        }
        const r = enemyEl.getBoundingClientRect();
        handleAttack(r.left + r.width / 2, r.top + r.height / 2);
        if (takeItems && state.itemAvailable) {
          const ir = itemEl.getBoundingClientRect();
          handleItem(ir.left + ir.width / 2, ir.top + ir.height / 2);
        }
      }, ms);
    }
    setLabel();
  };

  setLabel();
  autoBtn.addEventListener('click', () => autoClick(!autoTimer));
  document.body.appendChild(autoBtn);

  (window as unknown as { __clicker: unknown }).__clicker = {
    state,
    getGauge: () => gauge,
    particles,
    /** ダメージ倍率の指数を直接セット（atk.e と atkTargetE を揃えて＝ランプ無しで即反映） */
    setAtkExp: (e: number) => {
      state.atk = new BigNum(1, e);
      state.atkTargetE = e;
    },
    /** 累積ダメージ指数を直接セット（ゲージ位置のテスト用） */
    setDamageE: (e: number) => {
      state.damageE = e;
    },
    /** ゲージ位置（消費した箱数）を直接セット。コーススケーリング込みの逆変換で damageE に戻す。 */
    setConsumed: (boxes: number) => {
      state.damageE = damageEAtConsumed(boxes, state.maxHp.e);
    },
    /** 自動クリックの切替（コンソールからも：__clicker.autoClick(true, 30, false) 等） */
    autoClick,
  };
}

export function resizeCanvases(): void {
  dpr = window.devicePixelRatio || 1;

  gaugeCssW = gaugeCanvas.clientWidth;
  gaugeCssH = gaugeCanvas.clientHeight;
  gaugeCanvas.width = Math.round(gaugeCssW * dpr);
  gaugeCanvas.height = Math.round(gaugeCssH * dpr);

  fxDpr = Math.min(dpr, 2);
  fxCssW = window.innerWidth;
  fxCssH = window.innerHeight;
  fxCanvas.width = Math.round(fxCssW * fxDpr);
  fxCanvas.height = Math.round(fxCssH * fxDpr);

  // バッキングストアをリサイズすると内容が消えるので次フレームで必ず描き直す
  gaugeForceRedraw = true;
  // リサイズ後は攻撃力テキストの縮小（fitText）を計算し直させる
  markStatsDirty();
}

function loop(now: number): void {
  const dt = lastFrameNow === 0 ? 1 / 60 : Math.min(0.1, (now - lastFrameNow) / 1000);
  lastFrameNow = now;

  if (state.screen === 'playing' && !defeatPlaying) {
    // clamp 済みの dt で積むので、バックグラウンドで rAF が止まっても経過時間が跳ねない
    playSeconds += dt;
    state.elapsedTime = Math.floor(playSeconds);

    if (now - lastSaveAt > AUTOSAVE_MS) {
      save();
      showSaved();
      lastSaveAt = now;
    }
  }

  if (state.screen !== 'menu') {
    // 削った real segments 数（連続値、コース不問の per-click rate）。
    const cfg = difficultyConfigs[state.difficulty];
    const consumed = consumedAtDamage(state.damageE, cfg.hp.e);
    advanceGauge(gauge, consumed, now);

    // ゲージは「consumed が変わった / 赤残像追従中 / 箱フラッシュ・スライド中」のときだけ描き直す。
    const trailActive = gauge.displayedConsumed < consumed - 1e-6;
    const animEnd = GAUGE.BOX_FLASH_MS + GAUGE.BOX_SLIDE_MS;
    const flashActive = gauge.boxFlashAt.some((t) => t > 0 && now - t < animEnd);
    const animActive = trailActive || flashActive;
    const changed = Math.abs(consumed - lastDrawnProgress) > 1e-6;
    if (gaugeCssW > 0 && (gaugeForceRedraw || changed || animActive || lastAnimActive)) {
      drawGauge(gaugeCtx, gaugeCssW, gaugeCssH, dpr, gauge, consumed, now);
      lastDrawnProgress = consumed;
      gaugeForceRedraw = false;
    }
    lastAnimActive = animActive;

    updateStats();
    // 攻撃パネルのパワーアップ発光は「アイテム取得後、atk.e がまだ目標まで追いついていない」間だけ灯す。
    setPowering(state.screen === 'playing' && state.atk.e < state.atkTargetE);

    // 敵の硬化演出：HP残量割合（damageE / hp.e）で結晶シェルを濃くする。極限はほぼ 0 のまま。
    const hq = cfg.hp.e > 0 ? Math.round(Math.min(1, state.damageE / cfg.hp.e) * 50) / 50 : 0;
    if (hq !== lastHardenQ) {
      setHardening(hq);
      lastHardenQ = hq;
    }

    // ヒットのリコイルを素早く減衰させ、変化したときだけ敵に反映（transform のみ）
    if (hitImpulse > 0) hitImpulse = Math.max(0, hitImpulse - dt / 0.12);
    const hitQ = Math.round(hitImpulse * 20) / 20;
    if (hitQ !== lastHitQ) {
      setEnemyHit(hitQ);
      lastHitQ = hitQ;
    }
  }

  // ダメージ数値パーティクル：あるときだけ更新、無くなった最初のフレームで一度だけ消す
  if (particles.length > 0) {
    stepParticles(dt);
    fxCtx.setTransform(fxDpr, 0, 0, fxDpr, 0, 0);
    fxCtx.clearRect(0, 0, fxCssW, fxCssH);
    drawParticles(fxCtx, fxCssW);
    fxHadParticles = true;
  } else if (fxHadParticles) {
    fxCtx.setTransform(fxDpr, 0, 0, fxDpr, 0, 0);
    fxCtx.clearRect(0, 0, fxCssW, fxCssH);
    fxHadParticles = false;
  }

  requestAnimationFrame(loop);
}

/** 攻撃/演出まわりの一時状態を初期化（新規・再開どちらでも使う）。 */
function resetTransientFx(): void {
  defeatPlaying = false;
  hitImpulse = 0;
  lastHitQ = -1;
  setEnemyHit(0);
}

function startGame(diff: Difficulty): void {
  resetForDifficulty(diff);
  gauge = makeGauge(difficultyConfigs[diff].hp.e);
  clearParticles();
  resetTransientFx();
  playSeconds = 0;
  lastSaveAt = performance.now();
  state.screen = 'playing';
  hideItem();
  renderScreen();
  resizeCanvases();
  save();
}

function continueGame(): void {
  if (!loadSave()) return;
  const cfg = difficultyConfigs[state.difficulty];
  gauge = makeGauge(cfg.hp.e);
  // ロード直後に幻の赤残像 / 過去 box flash が出ないよう、表示状態を実値に合わせる
  const consumed = consumedAtDamage(state.damageE, cfg.hp.e);
  const slice = sliceGauge(consumed, gauge.totalSegments, gauge.displayedSegments);
  gauge.displayedConsumed = consumed;
  gauge.prevConsumedInt = Math.min(gauge.totalSegments, Math.floor(consumed));
  // depletion フェーズに既に入っていれば、それまでの flash は「過去のもの」として静かな黒状態へ。
  const cleared = gauge.displayedSegments - slice.segmentsLeft;
  for (let i = 0; i < cleared; i++) gauge.boxFlashAt[i] = 1; // 過去（now よりずっと前）扱い
  for (let i = cleared; i < gauge.boxFlashAt.length; i++) gauge.boxFlashAt[i] = 0;
  clearParticles();
  resetTransientFx();
  playSeconds = state.elapsedTime;
  lastSaveAt = performance.now();
  renderScreen();
  resizeCanvases();
  if (state.itemAvailable && state.screen === 'playing') {
    showItemAt(state.itemPos.top, state.itemPos.left);
  }
}

function returnToMenu(): void {
  // 撃破演出中（screen はまだ 'playing'）はセーブし直さない＝死んだ状態を残さない
  if (state.screen === 'playing' && !defeatPlaying) save();
  defeatPlaying = false;
  state.screen = 'menu';
  hideItem();
  renderScreen();
}

function handleAttack(x: number, y: number): void {
  if (state.screen !== 'playing' || defeatPlaying) return;
  notifyAttack(gauge, performance.now());

  const cfg = difficultyConfigs[state.difficulty];

  // アイテム取得後の徐々ランプ：atk.e を atkTargetE へ「chunkAtE / CLICK_BUDGET_PER_ITEM」歩で
  // 近づける。step を「現在の atk.e」で評価することで、handleItem 側の chunk と歩幅が一致し、
  // ちょうど CLICK_BUDGET_PER_ITEM クリックで追いつく。Phase B では chunk が伸びるので step も伸びる。
  if (state.atk.e < state.atkTargetE) {
    const step = chunkAtE(state.atk.e) / ATTACK.CLICK_BUDGET_PER_ITEM;
    state.atk = new BigNum(1, Math.min(state.atkTargetE, state.atk.e + step));
  }

  // 1 クリックのダメージ：m × 10^atk.e（m は 1〜9.99）。atk.e は上のランプで段階的に上がる。
  const m = 1 + Math.random() * 9;
  const dmgExp = state.atk.e + Math.log10(m);

  // 累積ダメージを log10 で加算。HP も指数表現なので、ゲージは「対数グラフ」的に動く。
  // atk.e が小さい（無アイテム）うちは、巨大な maxHp.e に対する寄与が小さく＝ゲージは
  // 見た目ほぼ動かない。アイテムで atk.e が桁ごと上がって初めて適切なペースで削れる。
  state.damageE = logAdd(state.damageE, dmgExp);

  // ダメージ数値の表示（先頭の数字は 1〜9 でばらつく）
  const dmg = new BigNum(m, state.atk.e);
  if (dmg.cmp(state.maxHit) > 0) state.maxHit = dmg;
  state.totalClicks++;
  spawnDamage(x, y, dmg);
  spawnHitSpark(x, y);
  hitImpulse = 1;

  // アイテム供給：取得から CLICK_BUDGET_PER_ITEM クリック貯まったら 1 つ出す。
  // totalItems の上限まで（理論上は撃破前後で出尽くす）。フェーズ制御はしない。
  state.clicksSinceItem++;
  if (
    !state.itemAvailable &&
    state.itemsCollected < cfg.totalItems &&
    state.clicksSinceItem >= ATTACK.CLICK_BUDGET_PER_ITEM
  ) {
    state.itemAvailable = true;
    state.itemPos = {
      top: `${20 + Math.random() * 60}%`,
      left: `${20 + Math.random() * 60}%`,
    };
    showItemAt(state.itemPos.top, state.itemPos.left);
  }

  if (state.damageE >= cfg.hp.e) {
    triggerDefeat();
  }
}

/** 撃破演出：敵が弾け、画面フラッシュ＋スパーク爆発のあと「撃破」画面を出す。 */
function triggerDefeat(): void {
  defeatPlaying = true;
  // この run は終了。再開用セーブを消す（死んだ 'playing' を Continue で再開させない）
  clearSave();

  // 敵の中心からスパークを撒く（溜まっていたダメージ数値は消してから）
  const rect = (document.getElementById('enemy') as HTMLElement).getBoundingClientRect();
  clearParticles();
  spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
  playDefeat();

  window.setTimeout(() => {
    // 演出中にタイトルへ戻る等で中断されていたら、結果画面を出さない
    if (!defeatPlaying) return;
    state.screen = 'cleared';
    defeatPlaying = false;
    renderScreen();
  }, DEFEAT_MS);
}

function handleItem(x: number, y: number): void {
  if (state.screen !== 'playing' || !state.itemAvailable) return;
  const cfg = difficultyConfigs[state.difficulty];
  state.itemsCollected += 1;
  state.itemAvailable = false;
  hideItem();

  // 攻撃力の「目標」指数を 1 アイテム分（= chunkAtE(atkTargetE)）上げる。Phase A では一定 C0、
  // Phase B では現在指数に比例した量。実際の atk.e は次のタップから handleAttack 内のランプで
  // 段階的に追従するので、取得直後にゲージが急に削れず、その後の数タップで滑らかに削れていく。
  const chunk = chunkAtE(state.atkTargetE);
  state.atkTargetE = Math.min(cfg.hp.e, state.atkTargetE + chunk);
  state.clicksSinceItem = 0;

  // バフ演出：取得地点からエメラルドの光＋攻撃パネルの強発光（文字なし）
  spawnPowerUp(x, y);
  playPowerUp();
  triggerShake();
  save();
}
