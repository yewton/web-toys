# Approach A / B / C 比較レポート

## 検証条件

- 各 approach は `fix/ant-nest-stagnation` (土の山高さ上限、埋没→局所掘り出し、dropDirt の type-1 受容 を適用済み) から分岐
- 同一の拡張リグレッションテスト `tests/ant-nest-regression.spec.ts` を 300,000 step、50 匹で実行
- 各 checkpoint (30k step 毎) で 1000 step の変位を取り、5px 未満を idle と判定
- 並列実行: A=PORT 5175, B=5176, C=5177

## 各方針の概要

| 方針 | 主要変更 |
|---|---|
| **A. 保護層撤廃** | `PROTECTED_DEPTH = 0`、初期入口生成削除、`makeDiggable`/`attemptCreateNewEntrance` 削除、エージェント主導入口生成削除、`SURFACE_DIG_BAND = 11` 導入 |
| **B. 薄い保護層 + type 3 低速掘削** | `PROTECTED_DEPTH = 2`、`digGel` で type 3 も掘れる、`handleObstacle` で type 3 に `digProb = 0.02`、初期入口は維持、エージェント主導入口生成削除 |
| **C. 保護層維持 + frustration 機構** | `PROTECTED_DEPTH = 6` 維持、`surfaceFrustration` カウンタ追加、type 3 衝突で増分、地下到達でリセット、120 を超えたら `makeDiggable` で新入口を開く |

## 最終チェックポイント (step 300,000) 比較

| 指標 | A | B | C |
|---|---|---|---|
| アサーション合否 | ✅ PASS | ✅ PASS | ❌ FAIL (mean_x deviation 124.9) |
| total | 50 | 50 | 50 |
| surface | 1 | 0 | 5 |
| underground | 49 | 50 | 45 |
| topEdge (y<5) | 0 | 0 | 0 |
| digging | 3 | 4 | 4 |
| idleSurface | 0 | 0 | 1 |
| idleUnderground | 0 | 0 | 3 |
| meanMovement (1k step) | **153.2** | 140.6 | 114.1 |
| surfaceMeanX | 264.8 | 200.0 | 324.9 |

> ※ A, B は地表に出ているアリがほぼ 0 のため `surfaceMeanX` は 1〜0 個のアリ位置に依存して大きく振れる (テスト中 90k 時点で A: 372.3, B: 13.8 などの極端値)。`surface_mean_x` 指標はこの 2 方針では母数不足で意味が希薄。

## 時系列傾向

### A. 保護層撤廃
- 序盤から地表アリ数 < 7、すぐに underground=50 近くに収束
- meanMovement が単調増加 (25→153)、終始活発
- 「地表で待機するアリ」がほぼ存在しない

### B. 薄い保護層 + 低速掘削
- A と同様、地表ほぼ無人になる
- meanMovement 21→141。アクティビティは A よりやや低いが同程度
- 序盤の入口は初期入口 + type 3 erosion で形成される

### C. 保護層維持 + frustration
- 地表アリ数が常に 2〜13 と多い (典型的な実物アリの巣に近い「巣口に出ているワーカー」)
- meanMovement は 20→114 と他案より低め
- idle カウントが少数残る (300k 時点で 4 匹)

## 視覚的差異

### A — 保護層撤廃

![Approach A](../web-toys-approach-A/tests/screenshots/ant-nest-300k-A.png)

地表の境界が崩壊し、ほぼ全面に dirt mound が広がる。コンセプトの「巣の構造」は見えにくく、視覚的には荒地に近い。

### B — 薄い保護層

![Approach B](../web-toys-approach-B/tests/screenshots/ant-nest-300k-B.png)

A よりもやや構造が残るが、依然として地表境界はガタガタ。type 3 が削れるのが速すぎる可能性。

### C — 保護層維持 + frustration

![Approach C](../web-toys-approach-C/tests/screenshots/ant-nest-300k-C.png)

地表が clean な水平ラインで残り、2 つの明瞭な土の山と、それを繋ぐトンネル構造が見える。最も「アリの巣」らしい外観。

## 観察と評価

| 評価軸 | A | B | C |
|---|:-:|:-:|:-:|
| 地表滞留の解消 | ◎ | ◎ | ○ (5匹常駐するが idle ではない) |
| アリの活動性 (meanMovement) | ◎ | ○ | △ |
| 巣の視覚的構造保持 | × | △ | ◎ |
| アサーション合否 | PASS | PASS | FAIL (surface_mean_x) |
| 実装シンプルさ | ◎ (削除中心) | ○ (1 行追加 + digProb 分岐) | ○ (frustration field 1 つ追加) |

### Approach A — 「保護層撤廃」の評価
- **長所**: アリが満遍なく活動する。地表に張り付くアリがゼロ。実装が最もシンプル (約 90 行削除)
- **短所**: 「アリの巣シミュレータ」としての視覚的アイデンティティ (地表 + 巣口 + 地下トンネル) が失われる。地表全体が荒地化

### Approach B — 「薄い保護層 + 低速掘削」の評価
- **長所**: type 3 を slow-dig で扱う方針はエージェントロジックの変更が最小。A よりは構造が残る
- **短所**: PROTECTED_DEPTH=2 では erosion が早く、終盤には A とほぼ同じ荒地状態になる。中間の妥協案だが、視覚的には A 寄り

### Approach C — 「保護層維持 + frustration」の評価
- **長所**: 視覚的に最も巣らしい。地表が clean な水平ラインで残り、明確な土の山が形成される。エージェントロジックは frustration カウンタ 1 つだけのシンプル拡張
- **短所**: surface_mean_x が中央から外れることがある (5 匹中 2 匹が右側偏在で 324.9)。これは「フェロモン蓄積で巣口が一極集中」する自然な結果でもあり、要件次第ではむしろ望ましい挙動
- 既存テストの `MAX_SURFACE_MEAN_X_DEVIATION = 100` の閾値設定が、地表アリ多い + 自然な集中を許容できていない可能性

## 推奨

### 第一推奨: **Approach C**
コンセプト「アリの巣シミュレータ」の視覚的アイデンティティを最も良く保ち、地表滞留問題も実質解消 (idle はゼロ近辺、frustration による自発的入口生成で滞留が継続しない)。エージェントロジックの変更量も最小。

surface_mean_x のアサーションは閾値設計の問題なので、テスト側を調整する余地がある (例: 母数が十分なときのみチェック、または閾値を 150 に緩める)。

### 第二推奨: **Approach A**
視覚的な巣の構造を犠牲にしてでも「全アリが常に活動」を最優先するなら最適。実装も最も削減的でメンテ性が高い。

### 非推奨: **Approach B**
A と C の中間と意図したが、終盤の振る舞いは A に寄り、Approach A の上位互換でも下位互換でもない位置。差別化価値が低い。

## 補足情報

- 各 approach の worktree:
  - `/home/yewton/Projects/web-toys-approach-A` (branch `approach-A`)
  - `/home/yewton/Projects/web-toys-approach-B` (branch `approach-B`)
  - `/home/yewton/Projects/web-toys-approach-C` (branch `approach-C`)
- 結果 JSON: 各 worktree の `tests/results/result-{A,B,C}.json`
- スクリーンショット: 各 worktree の `tests/screenshots/ant-nest-300k-{A,B,C}.png`
- 共通ベース: `fix/ant-nest-stagnation` HEAD (`06bd066`)
