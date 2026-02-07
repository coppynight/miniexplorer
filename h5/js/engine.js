import { speak } from './speech.js';

// SpeechRecognition-based flow (capture frame + transcript -> Coze)
export class ConversationEngine {
  constructor({ app, ui }) {
    this.app = app;
    this.ui = ui;

    this.mode = 'explore';
    this.cameraFacing = 'environment';

    this.recognition = null;
    this.recognitionActive = false;
    this.isProcessing = false;

    this.pendingImageBlob = null;
  }

  async enterMode({ mode, cameraFacing }) {
    this.mode = mode;
    this.cameraFacing = cameraFacing;
    this.ui.setMode(mode);

    await this.stop();

    this.ui.showPermissionOverlay(true);
    this.ui.setState('NEED_PERMISSION', mode);
  }

  async startAfterUserGesture() {
    this.ui.setState('BOOTING', this.mode);

    // 1) Mic permission (required for speech recognition)
    try { await this.app.audio.ensureStream(); } catch (_) {}

    // 2) Camera optional
    try {
      await this.app.camera.start({
        facingMode: this.cameraFacing,
        elementId: this.mode === 'explore' ? 'camera-preview' : 'companion-preview'
      });
      this.ui.setCameraHint(null);
    } catch (_) {
      this.ui.setCameraHint('未开启相机，本次不发送画面');
    }

    // 3) Unlock TTS (may help iOS)
    try { window.speechSynthesis?.getVoices?.(); } catch (_) {}
    try { speak(''); } catch (_) {}

    // 4) SpeechRecognition setup
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      this.ui.setCameraHint('speech_recognition_not_supported');
      return;
    }

    this.recognition = new SR();
    this.recognition.lang = 'zh-CN';
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.ui.setState('RECORDING', this.mode);
    };

    this.recognition.onerror = (e) => {
      this.ui.setCameraHint(`语音识别错误: ${e?.error || 'unknown'}`);
    };

    this.recognition.onend = () => {
      if (this.recognitionActive) {
        setTimeout(() => {
          try { this.recognition?.start(); } catch (_) {}
        }, 150);
      }
    };

    this.recognition.onresult = async (event) => {
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0]?.transcript || '';
      }
      finalText = finalText.trim();
      if (!finalText) return;
      await this._handleTranscript(finalText);
    };

    this.ui.showPermissionOverlay(false);
    this.ui.setState('LISTENING', this.mode);

    this.recognitionActive = true;
    try { this.recognition.start(); } catch (_) {}
  }

  async _handleTranscript(text) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    this.ui.setState('THINKING', this.mode);

    // capture frame
    this.pendingImageBlob = null;
    try {
      this.pendingImageBlob = await this.app.camera.captureFrame();
    } catch (_) {}

    try {
      const { replyText } = await this.app.coze.runChat({
        imageBlob: this.pendingImageBlob,
        audioBlob: null,
        promptText: text
      });

      const reply = (replyText || '').trim();
      if (reply) {
        this.ui.setReplyText(reply);
        this.ui.setState('SPEAKING', this.mode);
        speak(reply);

        if (/(再见|拜拜|byebye|bye|goodbye)/i.test(reply)) {
          await this.stop();
          this.app.router.go('home');
          return;
        }
      }
    } catch (e) {
      this.ui.setCameraHint(String(e?.message || e));
    }

    setTimeout(() => {
      this.ui.setState('LISTENING', this.mode);
      this.isProcessing = false;
    }, 500);
  }

  async stop() {
    this.recognitionActive = false;
    try { this.recognition?.stop(); } catch (_) {}
    this.recognition = null;

    try { this.app.audio.teardown?.(); } catch (_) {}
    try { this.app.camera.stop?.(); } catch (_) {}

    this.isProcessing = false;
    this.pendingImageBlob = null;
  }
}
