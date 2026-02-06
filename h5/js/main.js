import { initCamera } from './camera.js';
import { initAudio } from './audio.js';
import { initCoze } from './coze.js?v=handsfree-1';
import { createUI } from './ui.js';
import { ConversationEngine } from './engine.js';

class Router {
  constructor(app) {
    this.app = app;
    this.currentScreen = 'home';
  }

  async go(screenId) {
    // Stop conversation engine when leaving mode screens
    if (this.currentScreen === 'explore' || this.currentScreen === 'companion') {
      await this.app.engine.stop();
    }

    // Hide all
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));

    // Show new
    const target = document.getElementById(`screen-${screenId}`);
    if (target) target.classList.add('active');

    this.currentScreen = screenId;

    // Enter unified flow
    if (screenId === 'explore') {
      await this.app.engine.enterMode({ mode: 'explore', cameraFacing: 'environment' });
    } else if (screenId === 'companion') {
      await this.app.engine.enterMode({ mode: 'companion', cameraFacing: 'user' });
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('MiniExplorer H5 v1.3 initializing...');

  try {
    // Services
    const camera = await initCamera(); // factory
    const audio = initAudio();
    const coze = initCoze();

    const app = { camera, audio, coze };
    app.ui = createUI();
    app.engine = new ConversationEngine({ app, ui: app.ui });
    app.router = new Router(app);

    // Make global for onclick handlers in HTML
    window.app = app;

    // Bind permission overlay start buttons
    const bindStart = (mode) => {
      const root = document.getElementById(`screen-${mode}`);
      const btn = root?.querySelector('.permission-overlay button');
      if (!btn) return;
      btn.addEventListener('click', async () => {
        try {
          await app.engine.startAfterUserGesture();
        } catch (e) {
          app.ui.setCameraHint(String(e?.message || e));
        }
      });
    };
    bindStart('explore');
    bindStart('companion');

    console.log('Ready');
  } catch (error) {
    console.error('Init failed:', error);
    alert('Init failed: ' + error.message);
  }
});
