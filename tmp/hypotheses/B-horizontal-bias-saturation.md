# 仮説B: 水平分岐確率の早期飽和

## 症状との対応

「巣が下方向に伸びず、既存域の周囲で水平に広がるだけ」状態を説明。深部開拓の停止に寄与。

## 該当箇所

- `ants-nest-simulator/src/Ant.ts:235-247`:
  ```ts
  const localPh = getPheromone(this.x, this.y, this.z);
  const horizontalBias = Math.min(0.65, localPh * 1.8);
  const r = Math.random();
  if (r < horizontalBias) {
    // 水平方向 (0 or PI) に掘る
  } else {
    // 下方向 (PI/2 中心) に掘る
  }
  ```

## メカニズム

`localPh = 0.36` で `horizontalBias` が上限 65% に張り付く。仮説Aで述べた通り高フェロモン領域は時間とともに拡大するため、後半ほぼ全ての digging 開始位置で「65% 水平、35% 下」になる。トンネル先端は既存トンネル横にしか伸びない。

## 検証方法

### 計測

`startDigging()` が呼ばれた瞬間に `localPh`, `horizontalBias`, 選択された分岐（horizontal / down）をログ出力。10k 区間ごとに集計。

**仮説が正なら:** 後半ほど「horizontal 選択率」が 60%+ で頭打ちになり、down 選択率が 35% 程度に張り付く。前半（30k以下）は逆に down が多いはず。

### 介入実験

```ts
const horizontalBias = Math.min(0.45, localPh * 1.2);
```
に下げて再実行。

**仮説が正なら:** 下方向への新トンネル生成が継続し、200k以降も巣が縦に成長する。
