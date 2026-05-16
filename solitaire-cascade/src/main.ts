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
