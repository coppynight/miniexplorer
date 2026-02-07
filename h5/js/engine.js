import { speak } from './speech.js';

// Simple RMS-based VAD + MediaRecorder segmenter.
// Note: tuned for iPhone Safari-ish environment; thresholds may need adjustment.

export class ConversationEngine {
  constructor({ app, ui }) {
    this.app = app;
    this.ui = ui;

    this.mode = 'explore';
    this.cameraFacing = 'environment';

    this.state = 'BOOTING';

    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
    this.vadRaf = null;

    this.threshold = 0.02; // RMS threshold; will auto-calibrate lightly
    this.silenceMs = 800;
    this.lastVoiceAt = 0;
    this.isRecording = false;

    this.pendingImageBlob = null;
  }

  async enterMode({ mode, cameraFacing }) {
    this.mode = mode;
    this.cameraFacing = cameraFacing;
    this.ui.setMode(mode);

    // Stop any previous run.
    await this.stop();

    // Show permission overlay.
    this.ui.showPermissionOverlay(true);
    this.ui.setState('NEED_PERMISSION', mode);
  }

  async startAfterUserGesture() {
    // Must be called from a user gesture.
    // 1) Mic is mandatory
    this.ui.setState('BOOTING', this.mode);

    await this.app.audio.ensureStream();

    // 2) Camera is optional
    try {
      await this.app.camera.start({
        facingMode: this.cameraFacing,
        elementId: this.mode === 'explore' ? 'camera-preview' : 'companion-preview'
      });
      this.ui.setCameraHint(null);
    } catch (e) {
      // Non-blocking
      this.ui.setCameraHint('未开启相机，本次不发送画面');
    }

    // 3) Unlock TTS best-effort (may help iOS)
    try { speak(''); } catch (_) {}

    // 4) Setup VAD
    await this._setupVAD();

    this.ui.showPermissionOverlay(false);
    this.ui.setState('LISTENING', this.mode);

    this._startVADLoop();
  }

  async _setupVAD() {
    if (this.audioContext) return;

    const stream = await this.app.audio.ensureStream();
    const AC = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AC();

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.sourceNode.connect(this.analyser);

    // Light calibration: sample 300ms noise floor
    const start = performance.now();
    let sum = 0;
    let n = 0;
    while (performance.now() - start < 300) {
      sum += this._getRMS();
      n += 1;
      await new Promise((r) => setTimeout(r, 30));
    }
    const avg = n ? sum / n : 0.005;
    // threshold = noise floor * 3, clamped
    this.threshold = Math.min(0.06, Math.max(0.015, avg * 3));
  }

  _getRMS() {
    const analyser = this.analyser;
    if (!analyser) return 0;
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
    return Math.sqrt(sumSq / buf.length);
  }

  _startVADLoop() {
    const loop = async () => {
      const rms = this._getRMS();
      const now = performance.now();

      const isVoice = rms > this.threshold;

      if (isVoice) {
        this.lastVoiceAt = now;
        if (!this.isRecording) {
          await this._beginSegment();
        }
      }

      if (this.isRecording) {
        if (now - this.lastVoiceAt > this.silenceMs) {
          await this._endSegmentAndSend();
        }
      }

      this.vadRaf = requestAnimationFrame(loop);
    };

    this.vadRaf = requestAnimationFrame(loop);
  }

  async _beginSegment() {
    this.isRecording = true;
    this.ui.setState('RECORDING', this.mode);

    // Capture a frame if camera is active (optional)
    this.pendingImageBlob = null;
    try {
      this.pendingImageBlob = await this.app.camera.captureFrame();
    } catch (_) {
      // ignore
    }

    // Start recording
    await this.app.audio.start();
  }

  async _endSegmentAndSend() {
    this.isRecording = false;
    this.ui.setState('THINKING', this.mode);

    const audioBlob = await this.app.audio.stop();
    const imageBlob = this.pendingImageBlob;
    this.pendingImageBlob = null;

    if (!audioBlob) {
      this.ui.setState('LISTENING', this.mode);
      return;
    }

    try {
      const { replyText } = await this.app.coze.runChat({
        imageBlob,
        audioBlob
      });

      const text = (replyText || '').trim();
      if (text) {
        this.ui.setReplyText(text);
        this.ui.setState('SPEAKING', this.mode);
        speak(text);

        // Bye detection: assistant says bye => exit
        if (/(再见|拜拜|byebye|bye|goodbye)/i.test(text)) {
          await this.stop();
          this.app.router.go('home');
          return;
        }
      }

    } catch (e) {
      this.ui.setCameraHint(String(e?.message || e));
    }

    // Return to listening after short settle
    setTimeout(() => {
      if (!this.isRecording) this.ui.setState('LISTENING', this.mode);
    }, 600);
  }

  async stop() {
    if (this.vadRaf) {
      cancelAnimationFrame(this.vadRaf);
      this.vadRaf = null;
    }

    try { this.app.audio.teardown?.(); } catch (_) {}
    try { this.app.camera.stop?.(); } catch (_) {}

    // keep audioContext? close to save resources
    if (this.audioContext) {
      try { await this.audioContext.close(); } catch (_) {}
    }
    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;

    this.isRecording = false;
    this.pendingImageBlob = null;
  }
}
