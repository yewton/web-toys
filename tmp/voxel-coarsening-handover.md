# 蟻の巣シミュレータ ボクセル粗化 検討メモ（引き継ぎ）

作成: 2026-05-17
関連 PR: #19 (`fix(ants): render ant-deposited mound as soil in debug view` — マージ済)

## 出発点の問題提起

ユーザー観察:

1. 「蟻が回収して地表に置いた土は、既存の土とは異なる扱いになっている」（debug view からの推測）
2. 「現状の 1 セル単位が小さすぎて、デバッグ時にグリッド線を引けない」
3. やりたいこと: 内部表現を**粗いボクセル**として管理 → 描画はなだらかに繋がるよう工夫
4. 副作用として: `dropDirt` を簡素化し、「蟻が放棄した土はその場で土が再発生」というシンプルなロジックにしたい

## 現状把握（コード読みでの確認）

### 1. 「異なる扱い」は誤認だった

- `state.grids[z][y][x]` は `0`/`1`/`3` の 3 値で、ant-deposited も substrate も**同じ `1`**
- `digGel` / `fillDirt` / `dropDirt` / `dropDirtInside` はいずれも同じ `soilFillStyle(y)` で `soilCanvases[z]` にペイントするため、normal mode の描画では両者シームレス
- README にも明記: 「A single voxel type for both the original substrate and ant-deposited material」

### 2. 誤認の発生源は debug view の描画仕様

`ants-nest-simulator/src/debugView.ts:44` の `fillGridPixels` で、`y < GROUND_LEVEL` の領域は grids の中身に関わらず**常に navy `(10, 10, 24)` で塗っていた**。そのため地表上に積まれた type-1 セル（mound）は debug view では消えて見えていた。

**→ PR #19 で修正済。** any z で type-1 のセルは substrate と同じ brown ramp で描画されるようになった。検証: 45,000 step 後の mound セル `(0, 37)` の rendered RGB = `(109, 64, 23)` = substrate brown formula と完全一致。

### 3. 1セル=1px の制約

`WIDTH=HEIGHT=400`、UI 上のキャンバスは概ね同サイズで表示。1 セル単位ではグリッド線描画は実質不可能。これは粗ボクセル化の最も実害ある根拠。

## 粗ボクセル化への懸念事項

### A. 影響範囲が広く、大規模リファクタになる

ピクセル前提のマジックナンバーが多数:

| 場所 | 値 | 役割 |
|------|----|------|
| `Ant.ts:52-65` `isWideSpace()` | radius `r = 10` | 部屋判定 |
| `Ant.ts:78` | `sensorDist = 6` | 前後左右センサー |
| `Ant.ts:161-175` `digOneCell` | radius `1.5`、step `speed * 0.4` | 1 噛み |
| `grid.ts:75-97` `dropDirtInside` | radius `1.5 + rand` | 内部放棄 |
| `grid.ts:130-158` `dropDirt` | scan band `[MOUND_MIN_SCAN_Y, MOUND_MAX_SCAN_Y]`, drop radius `2-3.5` | 地表堆積 |
| `Ant.ts:262` 諸所 | `senseDist = 8` | フェロモン感知 |
| `Ant.ts:294` | `getGridType(this.x, this.y + 3, ...)` | 重力 |
| `Ant.ts:297` 諸所 | `speed = 0.7` | 移動速度 |

粒度を変えると**ほぼ全部要再キャリブ**。挙動が変わる可能性が高い。

### B. 描画のなだらかさを担保する追加実装が必要

粗ボクセルを四角タイルとして描画するとレトロゲーム調になる。ユーザーは「描画上でなだらかに繋がるよう工夫」と要望。実現手段:

- **Marching squares** で iso-surface 抽出
- **Signed distance field** + ガウシアン blur
- **Bilinear interpolation** で sub-voxel 補間（手軽だが品質は中）

いずれも frame-budget を消費する追加描画パスが必要。

### C. dropDirt の「surface scan」ロジックは load-bearing

現状の `dropDirt`:
1. ±60px 横方向にランダムな候補列を 8 回試行
2. 各候補列で `scanY` を下方向に走らせて最初の solid セルを見つける
3. solid セルが `[MOUND_MIN_SCAN_Y=25, MOUND_MAX_SCAN_Y=50]` の範囲にある列のみ採用
4. 候補が見つからなければ土を**捨てる**

これが現在の土山形状（地表縁にもっこり積み上がる）を実現している。`MOUND_TOP_LIMIT=20` の高さ制限もこの中で機能。

「その場に再発生」化すると:
- 地表蟻（y < GROUND_LEVEL）が `hasDirt=false` 化したタイミングで現在地に土を置く
- → 蟻の通り道に直接土が出現する → mound 形状は維持できず、地表全面が薄く埋まる動きになり得る
- 高さ制限ロジックが効かなくなる → 蟻が y=0 に張り付いた瞬間に土を置くと天井埋まり問題が再発する恐れ

「捨てる蟻が地表で `hasDirt=false` になったら現在地に dropDirtInside と同じく一塊置く」程度のシンプル化は可能だが、**Mound形状を犠牲にする覚悟**が要る。

### D. 既存 VRT への影響

- `tests/ant-nest-evolution.spec.ts` (25k steps, 5 screenshots)
- `tests/ant-nest-regression.spec.ts` (300k steps, surface_meanX 偏差 ±100 以内・天井蟻比率 ≤0.2)
- `tests/ant-nest-visual.spec.ts` (30k, LLM 評価)

これらは現状の挙動・見た目に対するベースラインなので、粗化＋dropDirt 簡素化を入れたら**全て撮り直し・評価し直し**が必要。

## 代替案

ユーザーの観察 1（誤認）は PR #19 で解消済。残る課題は観察 2 と 3（グリッド線視認 + 内部表現の粗化）。粗化を実施するかは要再判断。代替案:

### 案 1: Debug view だけ拡大表示する

内部表現は据え置き、debug view に**ズーム機能**を入れる。例: `Ctrl+クリック` した位置を中心に 4x 拡大した overlay を出す。
- 利点: 既存挙動・テスト一切に影響しない、最小実装
- 欠点: 全体俯瞰での視認性は変わらない

### 案 2: 階層的 representation

内部は今の 1px グリッドのまま、**論理ボクセル（例: 4x4 セル = 1 ボクセル）の集計値**を別バッファに持って debug 表示する。
- 利点: 挙動は不変、debug 視認性は大幅向上
- 欠点: 「ボクセル単位で挙動を観察したい」というニーズが満たせない

### 案 3: 本格的な粗化（ユーザー要望そのまま）

`VOXEL_SIZE = 4` 程度を導入し、`grids[z][gy][gx]` をボクセル座標に変更。

検討すべき設計:
- VOXEL_SIZE をいくつにするか（4 が現実的、8 だと挙動が荒くなる）
- 蟻の位置と速度はピクセル単位のままにするか、ボクセル単位にするか
  - 推奨: ピクセル単位のまま（蟻の動きは滑らかに保つ）。grid 参照時のみボクセル座標に変換
- センサー距離・dig radius を再キャリブ
- 描画は marching squares で。実装コスト: 2-4 時間程度
- dropDirt 簡素化（その場発生）と組み合わせるか別個に決める

### 案 4: 段階的アプローチ

Step 1: 案 2（階層的 debug 表示）を入れて視認性問題だけ先に解決
Step 2: しばらく観察して、本当に内部表現の粗化が必要か再判断

## 主要ファイル参照

| ファイル | 役割 | 修正の重さ |
|----------|------|------------|
| `ants-nest-simulator/src/constants.ts` | `WIDTH/HEIGHT/DEPTH/GROUND_LEVEL/PROTECTED_DEPTH` | 軽（`VOXEL_SIZE` 追加） |
| `ants-nest-simulator/src/state.ts` | grids/pheromone shape | 中（grids が voxel 単位に） |
| `ants-nest-simulator/src/grid.ts` | grid R/W、digGel、dropDirt 一式 | **重**（座標変換が全箇所） |
| `ants-nest-simulator/src/Ant.ts` | 蟻挙動、sensor、digOneCell | 重（マジックナンバー再キャリブ） |
| `ants-nest-simulator/src/simulation.ts` | 初期化、render loop | 中（grids 初期化のサイズ変更） |
| `ants-nest-simulator/src/debugView.ts` | デバッグ描画 | 中（ボクセル境界の描画追加） |
| `ants-nest-simulator/src/__tests__/grid.test.ts` | 既存単体テスト | 中（座標が voxel 単位に） |
| `tests/ant-nest-*.spec.ts` | VRT | 重（ベースライン再取得） |

## 次セッションへの推奨アクション

1. ユーザーの真の優先事項を確認: 「グリッド線視認」or 「内部表現の粗化」or 「dropDirt 簡素化」のどれが本命か
2. 上記に応じて案 1-4 から選択
3. 案 3 を選ぶ場合は、まず VOXEL_SIZE と「蟻の連続座標 vs 離散座標」を決める設計判断を先行させる
4. dropDirt の簡素化は粗化と独立に判断可能（ただし mound 形状を諦める覚悟が必要）

## 補足: grids 値の意味

| 値 | 意味 |
|----|------|
| `0` | air（通行可） |
| `1` | soil（掘削可、substrate + 蟻が積んだ土を統一） |
| `3` | 保護層（GROUND_LEVEL 直下 PROTECTED_DEPTH 層、不可掘） |

（値 `2` は欠番。値 `3` は entrance 開削で `1` に変換可能 = `makeDiggable`）
