import './style.css';
import { initGame } from './game';

// iOS Safari は viewport の user-scalable=no を無視するため、
// ピンチズーム（gesture イベント）を明示的に抑止して連打中の暴発拡大を防ぐ。
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

initGame();
