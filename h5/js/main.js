import { initCamera } from './camera.js';
import { initAudio } from './audio.js';
import { initCoze } from './coze.js';
import { initUI } from './ui.js'; // We'll refactor this next

class Router {
  constructor(app) {
    this.app = app;
    this.currentScreen = 'home';
  }

  async go(screenId) {
    // Teardown previous screen
    if (this.currentScreen === 'explore' || this.currentScreen === 'companion') {
      await this.app.camera.stop();
      this.app.audio.stop(); // Stop any pending recording
    }

    // Hide all
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    
    // Show new
    const target = document.getElementById(`screen-${screenId}`);
    if (target) target.classList.add('active');
    
    this.currentScreen = screenId;

    // Setup new screen
    if (screenId === 'explore') {
      // Explore: back camera, preview in #camera-preview
      try {
        await this.app.camera.start({ facingMode: 'environment', elementId: 'camera-preview' });
      } catch (e) {
        console.error('Explore camera failed', e);
        alert('相机启动失败: ' + e.message);
      }
    } else if (screenId === 'companion') {
      // Companion: front camera, preview in #companion-preview
      try {
        await this.app.camera.start({ facingMode: 'user', elementId: 'companion-preview' });
      } catch (e) {
        console.error('Companion camera failed', e);
        // Companion can work without camera? Maybe. For now alert.
      }
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
    app.router = new Router(app);

    // Make global for onclick handlers in HTML
    window.app = app;

    // Init UI Logic (bind buttons etc)
    // We will update ui.js to export initExploreUI and initCompanionUI
    initUI(app); 

    console.log('Ready');
  } catch (error) {
    console.error('Init failed:', error);
    alert('Init failed: ' + error.message);
  }
});
