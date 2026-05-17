# 仮説D: 新エントランス生成レートが低すぎる

## 症状との対応

巣の入口が初期生成された 2〜4 箇所からほぼ増えないため、フロンティアが固定される。仮説Aを悪化させる遠因。

## 該当箇所

- `ants-nest-simulator/src/Ant.ts:351-363`:
  ```ts
  if (!this.hasDirt && this.y < GROUND_LEVEL + 3 && this.wanderTimer <= 0 && Math.random() < 0.0003) {
    const checkRadius = 35;
    let hasNearbyOpening = false;
    outer: for (...) {
      ...
      if (t === 0 || t === 1) { hasNearbyOpening = true; break outer; }
    }
    if (!hasNearbyOpening) {
      makeDiggable(this.x, this.z, 4, PROTECTED_DEPTH + 1);
    }
  }
  ```
- `ants-nest-simulator/src/simulation.ts:68-72` 初期 entrance:
  ```ts
  const entranceCount = 2 + Math.floor(Math.random() * 3);
  ```

## メカニズム

- 確率 0.0003/step × 1アリ × 表層滞在比率（数%程度）→ 全体で1分間に新エントランスが生成される期待値は < 1 個。
- かつ `checkRadius = 35` の中に既存開口があれば不可。`WIDTH=400` で開口が3つあれば、それぞれ ±35 の帯で約 210px がブロック。残り領域（≈190px）のみが候補。
- 結果として 100k step 経過しても entrance 数は実質変化しない。表層では決まった少数の入口に集中。

## 検証方法

### 計測

`makeDiggable` の呼び出し回数を `Ant.ts:362` 経路と `simulation.ts` 初期化経路で別カウンタにし、step ごとにログ。

**仮説が正なら:** 初期化後 200k step での agent-driven 呼び出し回数が 0〜数回程度。

### 介入実験

確率を `0.0003 → 0.002`、`checkRadius = 35 → 20` に変えて再実行。

**仮説が正なら:** 300k 時点で表層に追加開口が複数現れ、新しい場所から下方向トンネルが伸び始める。

## 補足

`grid.ts:202` の `attemptCreateNewEntrance()` がより本格的な実装として既に存在するが、現状どこからも呼ばれていない（main.ts の確認が必要）。これを定期実行（例: 5000step ごと）するだけでも改善する可能性がある。
