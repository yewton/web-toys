import './style.css';
import { preRenderTextures } from './textures';
import { initCanvases, resize, setupInputHandlers, startLoop } from './game';
import { setupUI } from './ui';

preRenderTextures();
initCanvases();
resize();
setupUI();
setupInputHandlers();
startLoop();

window.addEventListener('resize', resize);
// visualViewport fires when browser toolbar shows/hides on mobile
window.visualViewport?.addEventListener('resize', resize);
// Re-check after full load in case mobile viewport settled to different dimensions
window.addEventListener('load', resize);
