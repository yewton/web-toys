# 仮説C: 障害物回避の左右非対称（右上バイアス）

## 症状との対応

300kステップで右上に小さなアリ集団が固まる現象の直接的説明。

## 該当箇所

- `ants-nest-simulator/src/Ant.ts:255-258`:
  ```ts
  if ((frontType === 3 || frontType === 2) && this.y < GROUND_LEVEL + 30) {
    this.angle = Math.cos(this.angle) > 0 ? -0.2 : Math.PI + 0.2;
    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed;
  }
  ```

## メカニズム

地表近く (y < 70) で protected zone(3) または dirt mound(2) に正面衝突したとき:
- 右向き (`cos > 0`): `angle = -0.2` → 右上に逃げる
- 左向き (`cos < 0`): `angle = PI + 0.2` → 左下に押し戻される

「右向きアリは上昇、左向きアリは下降」という非対称ルール。長時間動かすと:
- 右向きアリが画面右側で表層を回り続ける → 画面右端でも y=0 や x=WIDTH の境界クランプ (`Ant.ts:124-129`) と相互作用し、右上に滞留
- 左向きアリは地中に押し戻されて既存トンネルに合流

dirt mound は地表に時間とともに増えるため、衝突頻度が後半ほど高まり、バイアスが累積する。

## 検証方法

### 計測

- 全アリの `x` 座標の平均を 1k step ごとにログ出力。バイアスが無ければ `WIDTH/2 = 200` 近辺で安定するはず。
- 表層 (`y < GROUND_LEVEL`) のアリだけに絞った平均も別途出力。

**仮説が正なら:** 表層アリの `mean(x)` が時間とともに 200 → 250〜300 へ単調漂流する。

### 介入実験

該当行を左右対称な分岐に置換:
```ts
const turn = (Math.random() > 0.5 ? 1 : -1) * (Math.PI/3 + Math.random() * Math.PI/3);
this.angle += turn;
```

**仮説が正なら:** 表層アリの `mean(x)` が時間に依らず 200 近辺で振動するだけになる。右上集団も消える。
