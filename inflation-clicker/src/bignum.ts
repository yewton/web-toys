/**
 * 仮数 (m) と指数 (e) で巨大数を表す軽量クラス。
 * 値は常に `m × 10^e`（1 <= m < 10、または m === 0）に正規化される。
 * クリッカーの HP / 攻撃力 / 累計ダメージはすべてこの型で扱う。
 */
export class BigNum {
  m: number;
  e: number;

  constructor(mantissa: number, exponent: number) {
    if (Number.isNaN(mantissa) || Number.isNaN(exponent)) {
      this.m = 0;
      this.e = 0;
    } else {
      this.m = mantissa;
      this.e = exponent;
      this.normalize();
    }
  }

  /** 仮数を 1 <= m < 10 に収め、はみ出した桁を指数へ繰り上げる。 */
  normalize(): void {
    if (this.m === 0) {
      this.e = 0;
      return;
    }
    if (Math.abs(this.m) < 1e-10) {
      this.m = 0;
      this.e = 0;
      return;
    }
    const adjustE = Math.floor(Math.log10(this.m));
    if (adjustE !== 0) {
      this.m /= Math.pow(10, adjustE);
      this.e += adjustE;
    }
    if (this.m >= 10) {
      this.m /= 10;
      this.e += 1;
    }
  }

  add(other: BigNum): BigNum {
    if (this.m === 0) return new BigNum(other.m, other.e);
    if (other.m === 0) return new BigNum(this.m, this.e);
    const diff = this.e - other.e;
    // 指数が 15 桁以上離れていれば小さい方は無視できる
    if (diff > 15) return new BigNum(this.m, this.e);
    if (diff < -15) return new BigNum(other.m, other.e);
    if (diff >= 0) return new BigNum(this.m + other.m * Math.pow(10, -diff), this.e);
    return new BigNum(other.m + this.m * Math.pow(10, diff), other.e);
  }

  sub(other: BigNum): BigNum {
    if (this.m === 0) return new BigNum(0, 0);
    if (other.m === 0) return new BigNum(this.m, this.e);
    const diff = this.e - other.e;
    if (diff > 15) return new BigNum(this.m, this.e);
    if (diff < -15) return new BigNum(0, 0);
    const newM = this.m - other.m * Math.pow(10, -diff);
    if (newM <= 0) return new BigNum(0, 0);
    return new BigNum(newM, this.e);
  }

  /** 通常の number を掛ける（ダメージ乱数係数など）。 */
  mulNum(n: number): BigNum {
    if (this.m === 0 || n === 0) return new BigNum(0, 0);
    return new BigNum(this.m * n, this.e);
  }

  /** this < other → -1, this === other → 0, this > other → 1。 */
  cmp(other: BigNum): number {
    if (this.m === 0 && other.m === 0) return 0;
    if (this.m === 0) return -1;
    if (other.m === 0) return 1;
    if (this.e > other.e) return 1;
    if (this.e < other.e) return -1;
    if (this.m > other.m) return 1;
    if (this.m < other.m) return -1;
    return 0;
  }

  isZero(): boolean {
    return this.m === 0 && this.e === 0;
  }

  /**
   * ゲージ計算用の安全な log10。
   * 小さな値でも 1 打目からゲージが動くよう +1 のオフセットを噛ませる。
   */
  log10Safe(): number {
    if (this.m === 0 && this.e === 0) return 0;
    if (this.e === 0) return Math.log10(this.m + 1);
    return Math.log10(this.m) + this.e;
  }
}
