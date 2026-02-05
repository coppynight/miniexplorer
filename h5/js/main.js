import { initCamera } from './camera.js';
import { initAudio } from './audio.js';
import { initCoze } from './coze.js';
import { initUI } from './ui.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('MiniExplorer H5 initializing...');

  try {
    const camera = await initCamera();
    const audio = initAudio();
    const coze = initCoze();

    const app = { camera, audio, coze };
    window.MiniExplorerApp = app;

    initUI(app);
    console.log('Initialization complete');
  } catch (error) {
    console.error('Initialization failed:', error);
    const status = document.getElementById('status-display');
    if (status) status.textContent = `Init failed: ${String(error?.message || error)}`;
  }
});
