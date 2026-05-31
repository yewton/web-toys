// dev.sh shot から呼ばれる薄いスクショヘルパー。
// playwright の chromium を headless 起動し URL を開いて PNG を保存するだけ。
// 単体でも使える: node scripts/_shot.mjs <url> [out.png] [--full] [--wait ms] [--size WxH]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const url = args[0];
if (!url) {
  console.error('usage: node scripts/_shot.mjs <url> [out.png] [--full] [--wait ms] [--size WxH]');
  process.exit(1);
}

let out = 'tmp/shot.png';
let fullPage = false;
let waitMs = 600; // 既定: 描画/初期アニメーションが落ち着く程度に少し待つ
let width = 1280;
let height = 800;

for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a === '--full') fullPage = true;
  else if (a === '--wait') waitMs = Number(args[++i]);
  else if (a === '--size') {
    const m = /^(\d+)x(\d+)$/.exec(args[++i] ?? '');
    if (m) { width = Number(m[1]); height = Number(m[2]); }
  } else if (!a.startsWith('--')) out = a; // 最初の非フラグ引数を出力先とみなす
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url, { waitUntil: 'networkidle' });
  if (waitMs > 0) await page.waitForTimeout(waitMs);
  await page.screenshot({ path: out, fullPage });
  console.log(`saved ${out} (${width}x${height}${fullPage ? ', full' : ''}, waited ${waitMs}ms) <- ${url}`);
} finally {
  await browser.close();
}
