# 時系列比較レポート — per-cell 掘削 (sustain 型) の評価

## 検証条件

- 旧 `digMode='tunnel'/'room'` を撤廃し、`digOneCell()` を **1 セル削り + 0.4 速度で前進 + 5% 確率で hasDirt 化 → 反転帰還** に再設計
- 地表アリ (hasDirt=false, y<GROUND_LEVEL) の wanderAngle を主に水平 70% + たまに下向き 30% に変更
- `tests/ant-nest-evolution.spec.ts` を各 worktree で実行 (25,000 step を 5,000 step 刻みで 5 枚)
- 並列実行: A=PORT 5175, B=5176, C=5177
- テストスクリプトは run 開始時に当該 label の既存スクショを自前で削除 (find -delete 不要)

## 結果 (各 approach × 5 タイムステップ)

|        | 5k step | 10k step | 15k step | 20k step | 25k step |
|:------:|:-:|:-:|:-:|:-:|:-:|
| **A** | ![A 5k](../web-toys-approach-A/tests/screenshots/evolution-A-005000.png) | ![A 10k](../web-toys-approach-A/tests/screenshots/evolution-A-010000.png) | ![A 15k](../web-toys-approach-A/tests/screenshots/evolution-A-015000.png) | ![A 20k](../web-toys-approach-A/tests/screenshots/evolution-A-020000.png) | ![A 25k](../web-toys-approach-A/tests/screenshots/evolution-A-025000.png) |
| **B** | ![B 5k](../web-toys-approach-B/tests/screenshots/evolution-B-005000.png) | ![B 10k](../web-toys-approach-B/tests/screenshots/evolution-B-010000.png) | ![B 15k](../web-toys-approach-B/tests/screenshots/evolution-B-015000.png) | ![B 20k](../web-toys-approach-B/tests/screenshots/evolution-B-020000.png) | ![B 25k](../web-toys-approach-B/tests/screenshots/evolution-B-025000.png) |
| **C** | ![C 5k](../web-toys-approach-C/tests/screenshots/evolution-C-005000.png) | ![C 10k](../web-toys-approach-C/tests/screenshots/evolution-C-010000.png) | ![C 15k](../web-toys-approach-C/tests/screenshots/evolution-C-015000.png) | ![C 20k](../web-toys-approach-C/tests/screenshots/evolution-C-020000.png) | ![C 25k](../web-toys-approach-C/tests/screenshots/evolution-C-025000.png) |

## 観察

### A — 保護層撤廃
- 地表が全幅にわたり凸凹の dirt 帯で覆われる。地表境界線が消失。
- 短いカーテン状トンネル多数。深い主トンネル形成は限定的。
- 50 匹中の活動は均一だが、「アリの巣」の視覚的アイデンティティが弱い (地表全体が荒地)。

### B — 薄い保護層 (PROTECTED_DEPTH=2)
- A と類似の挙動 (地表全幅で erosion)。
- type 3 を低速掘削するので地表境界の保持が若干弱い。
- A と C の中間に位置するが、視覚的に A 寄りで差別化価値が薄い。

### C — 保護層維持 + frustration 機構
- **5,000 step 時点で既に縦に伸びるトンネルが 2 本ほど形成され始める。**
- **25,000 step 時点で 5〜6 本の主トンネルが地下深くまで伸び、1 本は画面下端近くまで到達。**
- 地表は protected 層のおかげで明瞭な水平線として保たれている。
- アリは入口に集積し、深いトンネルへ降りていく挙動。地表に「ウロウロするだけ」のアリは観察されない。
- 「突然直線通路を作り上げる」「突然チャンバーを作り上げる」バースト挙動はなし。トンネルは 1 セルずつ徐々に伸びる。

### 共通の改善 (旧版との比較)
- ✅ バースト掘削の解消: digOneCell は半径 1.5 の単発で、連続化しても visual には「徐々に進む」と見える
- ✅ 部屋の突然出現の解消: room モード自体を削除
- ✅ 地表アリの横移動: wanderAngle の水平偏重で left↔right の長距離移動が見える

## 評価サマリ

| 評価軸 | A | B | C |
|---|:-:|:-:|:-:|
| バースト掘削の除去 | ◎ | ◎ | ◎ |
| 地表アリの横方向移動 | ◎ | ◎ | ◎ |
| 巣構造の形成 (主トンネル) | △ | △ | ◎ |
| 巣の視覚的アイデンティティ (地表境界 + 入口) | × | △ | ◎ |
| アリの活動性 (idle なし) | ◎ | ◎ | ◎ |
| 実装シンプルさ | ◎ | ○ | ○ |

## 推奨

### **Approach C を本採用**

ユーザーの 4 つの要件を全て満たす唯一のアプローチ:

1. ✅ 「突然直線通路を作り上げる」を除去 → `digOneCell` で 1 セルずつ
2. ✅ 「突然チャンバーを作り上げる」を除去 → room モード撤廃
3. ✅ 「半数程度の蟻が地表で一定の範囲に限りウロウロし続ける」を解消 → frustration 機構 + 横方向 wander
4. ✅ 巣シミュレータの視覚的アイデンティティ (地表 + 入口 + 地下トンネル) を保持

### main へのマージ手順 (確認後に実行)

C worktree (`/home/yewton/Projects/web-toys-approach-C`) の以下を main にコピー:
- `ants-nest-simulator/src/Ant.ts` (digOneCell sustain 化 + 水平 wander + surfaceFrustration)
- `ants-nest-simulator/src/grid.ts` (dropDirt のサーフェス受容範囲、makeDiggable 復活)
- `ants-nest-simulator/src/constants.ts` (PROTECTED_DEPTH=6 維持)
- `ants-nest-simulator/src/simulation.ts` (初期入口生成維持)
- `tests/ant-nest-evolution.spec.ts` (新規)

## 補足情報

- 結果スクリーンショット: 各 worktree の `tests/screenshots/evolution-{A,B,C}-{step}.png` 5 枚ずつ計 15 枚
- 各 worktree の typecheck / unit test: 全 PASS (A:144, B:148, C:150)
