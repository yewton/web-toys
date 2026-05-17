# アリの巣シミュレータ 滞留/停滞 問題の仮説リスト

長時間（120k step 以降）で「巣の状態がほぼ変わらない」「右上に滞留」が観測された問題に対する仮説と検証方法。

| ID | タイトル | 影響 |
|---|---|---|
| [A](A-pheromone-positive-feedback.md) | フェロモン正のフィードバック過剰 | 主要因。アリの集中 + 巣形状凍結 |
| [B](B-horizontal-bias-saturation.md) | 水平分岐確率の早期飽和 | 深部開拓停止 |
| [C](C-obstacle-avoidance-asymmetry.md) | 障害物回避の左右非対称 | 右上滞留の直接原因 |
| [D](D-new-entrance-rate-too-low.md) | 新エントランス生成レートが低すぎる | フロンティア固定。Aを悪化 |
| [E](E-bottom-edge-trap.md) | 画面下端のアリトラップ | 下端アリ集団の直接原因 |

## 共通検証手段

- 30k / 60k / 120k / 200k / 300k step 時点でスクリーンショット (`tests/ant-nest-long-run.spec.ts` 既存)
- アリ位置統計とフェロモン濃度ヒストグラムを `window.__antSimAdvance` 呼び出し後に `page.evaluate` で取得してログ化
- 介入実験はパラメータ・ロジック変更を該当ファイルに直接適用し、同じ test を再実行して差分比較

## 関連ファイル

- `ants-nest-simulator/src/Ant.ts`
- `ants-nest-simulator/src/grid.ts`
- `ants-nest-simulator/src/constants.ts`
- `ants-nest-simulator/src/simulation.ts`
- `tests/ant-nest-long-run.spec.ts`
