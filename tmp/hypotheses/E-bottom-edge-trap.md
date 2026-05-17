# 仮説E: 画面下端のアリトラップ

## 症状との対応

120k 以降のスクリーンショットで画面下端中央〜左寄りにアリと土の塊が集中する現象を説明。

## 該当箇所

- `ants-nest-simulator/src/Ant.ts:124-129` 境界クランプ:
  ```ts
  this.x = Math.max(0, Math.min(WIDTH, this.x));
  this.y = Math.max(0, Math.min(HEIGHT, this.y));
  if (this.y === HEIGHT) this.angle = -Math.PI / 2;
  ```
- `ants-nest-simulator/src/Ant.ts:280-287` wanderAngle 再設定:
  ```ts
  if (this.hasDirt) {
    this.wanderAngle = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
  } else if (Math.random() < depthRatio * 1.5) {
    this.wanderAngle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
  } else {
    this.wanderAngle = Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
  }
  ```

## メカニズム

下端 (y=HEIGHT) に到達すると angle が `-PI/2`（上向き）に強制される。しかし:
- `hasDirt=false` のアリは `depthRatio ≈ 1` なので約 75% で wanderAngle が `-PI/2 ± PI/2`（上方向半円）にリセット → 一度上に戻る
- だが、wanderAngle 自体はランダムにまた `PI/2` 系（下向き）に切り替わる可能性もあり、行き戻りを繰り返す
- 一旦下端に到達したアリが効率的に上に戻る積極的なドライブが無い → 下端付近で振動

加えて `hasDirt=true` で下端に来た場合、`y >= GROUND_LEVEL` の `dropDirtInside` 確率は `0.0001 + depthRatio * 0.005 ≈ 0.005` で、200step 程度かかる。その間、下端で旋回し続ける。dropDirtInside は周囲に dirt を作り、トンネルを部分的に塞ぐ → 後続アリも同じ場所に詰まる。

## 検証方法

### 計測

`y > HEIGHT - 20` 帯にいるアリの数を 1k step ごとに集計。

**仮説が正なら:** ステップ進行とともに下端帯のアリ数が単調増加し、ある値で飽和する。

### 介入実験

下端到達アリに「強制的に大きく上向きトリガー」を追加:
```ts
if (this.y > HEIGHT - 10) {
  this.wanderAngle = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
  this.wanderTimer = 200;
  this.angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.5;
}
```

**仮説が正なら:** 下端帯のアリ数が低いまま安定。下端の土堆積も消える。

## 補足

仮説Aの帰巣フェロモン強化と相互作用している可能性が高い: 既存の下方向ロングトンネルに沿った帰巣フェロモンが強く、新規アリも同じトンネルを辿って下端まで到達 → トラップに合流、というループ。仮説Aの対策で間接的に緩和される可能性もある。
