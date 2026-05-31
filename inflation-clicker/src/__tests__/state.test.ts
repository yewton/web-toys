import { describe, it, expect, beforeEach } from 'vitest';
import { BigNum } from '../bignum';
import {
  state,
  resetForDifficulty,
  save,
  hasSavedGameForDiff,
  loadSaveForDiff,
  clearSaveForDiff,
  migrateLegacySave,
} from '../state';

// node 環境には localStorage が無いので最小限のインメモリ実装を差し込む。
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string): string | null {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, String(v));
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
  clear(): void {
    this.store.clear();
  }
  has(k: string): boolean {
    return this.store.has(k);
  }
}

let storage: MemoryStorage;
const KEY = (diff: string) => `inflationClicker.save.${diff}`;
const LEGACY_KEY = 'inflationClicker.save';

beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  resetForDifficulty('mabara');
});

describe('save / loadSaveForDiff round-trip', () => {
  it('persists and restores all gameplay fields (incl. enemyEmoji)', () => {
    state.screen = 'playing';
    state.atk = new BigNum(3, 120);
    state.atkTargetE = 130;
    state.damageE = 200;
    state.itemsCollected = 7;
    state.itemAvailable = true;
    state.itemPos = { top: '33%', left: '44%' };
    state.clicksSinceItem = 5;
    state.elapsedTime = 321;
    state.totalClicks = 99;
    state.maxHit = new BigNum(8, 119);
    state.enemyEmoji = '🐉';
    save();

    // 別の状態に上書きしてから読み戻す
    resetForDifficulty('muryotaisu');
    state.enemyEmoji = '🧌';
    expect(loadSaveForDiff('mabara')).toBe(true);

    expect(state.screen).toBe('playing');
    expect(state.difficulty).toBe('mabara');
    expect(state.atk.cmp(new BigNum(3, 120))).toBe(0);
    expect(state.atkTargetE).toBe(130);
    expect(state.damageE).toBe(200);
    expect(state.itemsCollected).toBe(7);
    expect(state.itemAvailable).toBe(true);
    expect(state.itemPos).toEqual({ top: '33%', left: '44%' });
    expect(state.clicksSinceItem).toBe(5);
    expect(state.elapsedTime).toBe(321);
    expect(state.totalClicks).toBe(99);
    expect(state.maxHit.cmp(new BigNum(8, 119))).toBe(0);
    expect(state.enemyEmoji).toBe('🐉');
  });

  it('writes to a per-difficulty key', () => {
    state.screen = 'playing';
    save();
    expect(storage.has(KEY('mabara'))).toBe(true);
    expect(storage.has(KEY('muryotaisu'))).toBe(false);
  });

  it('does not save while on the menu screen', () => {
    state.screen = 'menu';
    save();
    expect(storage.has(KEY('mabara'))).toBe(false);
  });
});

describe('hasSavedGameForDiff', () => {
  it('is false when there is no save', () => {
    expect(hasSavedGameForDiff('mabara')).toBe(false);
  });

  it('is true for a playing/cleared save and false for a stored menu state', () => {
    state.screen = 'playing';
    save();
    expect(hasSavedGameForDiff('mabara')).toBe(true);

    // screen=menu は save() がスキップするので、直接 cleared を書いて確認する
    state.screen = 'cleared';
    save();
    expect(hasSavedGameForDiff('mabara')).toBe(true);
  });

  it('is false for corrupted JSON', () => {
    storage.setItem(KEY('mabara'), '{not valid json');
    expect(hasSavedGameForDiff('mabara')).toBe(false);
  });
});

describe('loadSaveForDiff — guards', () => {
  it('returns false when the requested difficulty has no save', () => {
    expect(loadSaveForDiff('kaibun')).toBe(false);
  });

  it('rejects a save whose stored difficulty does not match the requested one', () => {
    state.screen = 'playing';
    save(); // → key mabara, difficulty mabara
    // mabara のセーブを別キー(kaibun)へ移植して不整合を作る
    storage.setItem(KEY('kaibun'), storage.getItem(KEY('mabara'))!);
    expect(loadSaveForDiff('kaibun')).toBe(false);
  });

  it('falls back to defaults for missing optional fields', () => {
    storage.setItem(
      KEY('mabara'),
      JSON.stringify({
        screen: 'playing',
        difficulty: 'mabara',
        maxHp: { m: 1, e: 896 },
        atk: { m: 1, e: 0 },
        // atkTargetE / damageE / itemsCollected / maxHit / enemyEmoji を省略
      }),
    );
    state.enemyEmoji = '🦖';
    expect(loadSaveForDiff('mabara')).toBe(true);
    expect(state.atkTargetE).toBe(state.atk.e); // atk.e にフォールバック
    expect(state.damageE).toBe(0);
    expect(state.itemsCollected).toBe(0);
    expect(state.maxHit.isZero()).toBe(true);
    expect(state.enemyEmoji).toBe('🦖'); // 省略時は既存の絵文字を保持
  });
});

describe('clearSaveForDiff', () => {
  it('removes only the targeted difficulty save', () => {
    state.screen = 'playing';
    save();
    resetForDifficulty('kaibun');
    state.screen = 'playing';
    save();

    clearSaveForDiff('mabara');
    expect(storage.has(KEY('mabara'))).toBe(false);
    expect(storage.has(KEY('kaibun'))).toBe(true);
  });
});

describe('migrateLegacySave', () => {
  it('moves a legacy single-slot save to its per-difficulty key and removes the legacy key', () => {
    const legacy = JSON.stringify({
      screen: 'playing',
      difficulty: 'kaibun',
      maxHp: { m: 1, e: 7168 },
      atk: { m: 1, e: 0 },
    });
    storage.setItem(LEGACY_KEY, legacy);

    migrateLegacySave();

    expect(storage.has(LEGACY_KEY)).toBe(false);
    expect(storage.getItem(KEY('kaibun'))).toBe(legacy);
    expect(hasSavedGameForDiff('kaibun')).toBe(true);
  });

  it('does not overwrite an existing per-difficulty save', () => {
    const existing = JSON.stringify({
      screen: 'playing',
      difficulty: 'kaibun',
      maxHp: { m: 1, e: 7168 },
      atk: { m: 2, e: 50 },
    });
    storage.setItem(KEY('kaibun'), existing);
    storage.setItem(
      LEGACY_KEY,
      JSON.stringify({ screen: 'playing', difficulty: 'kaibun', maxHp: { m: 1, e: 7168 }, atk: { m: 1, e: 0 } }),
    );

    migrateLegacySave();

    expect(storage.getItem(KEY('kaibun'))).toBe(existing); // 上書きされない
    expect(storage.has(LEGACY_KEY)).toBe(false); // それでも legacy は掃除される
  });

  it('is a no-op when there is no legacy save', () => {
    expect(() => migrateLegacySave()).not.toThrow();
  });
});
