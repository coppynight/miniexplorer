function $(id) {
  return document.getElementById(id);
}

function appendMessage({ role, text }) {
  const container = $('messages');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  container.appendChild(el);

  // Keep only last N messages
  const MAX = 6;
  while (container.children.length > MAX) {
    container.removeChild(container.firstChild);
  }
}

function setStatus(text) {
  const el = $('status-display');
  if (el) el.textContent = text;
}

function speak(text) {
  if (!text) return;
  if (!('speechSynthesis' in window)) return;

  // iOS Safari: speechSynthesis often requires user gesture;
  // but calling it after a gesture-triggered flow usually works.
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1.0;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  } catch (_) {}
}

function bindPressAndHold(btn, { onStart, onEnd }) {
  let pressed = false;

  const start = async (e) => {
    e?.preventDefault?.();
    if (pressed) return;
    pressed = true;
    await onStart?.();
  };

  const end = async (e) => {
    e?.preventDefault?.();
    if (!pressed) return;
    pressed = false;
    await onEnd?.();
  };

  // Touch
  btn.addEventListener('touchstart', start, { passive: false });
  btn.addEventListener('touchend', end, { passive: false });
  btn.addEventListener('touchcancel', end, { passive: false });

  // Mouse fallback
  btn.addEventListener('mousedown', start);
  btn.addEventListener('mouseup', end);
  btn.addEventListener('mouseleave', end);
}

export function initUI(app) {
  const btn = $('record-btn');
  if (!btn) throw new Error('record-btn not found');

  appendMessage({ role: 'system', text: '欢迎来到探索模式。按住说话会截取当前画面并发送给 AI。' });
  setStatus('Ready');

  let capturedImage = null;

  bindPressAndHold(btn, {
    onStart: async () => {
      btn.classList.add('recording');
      setStatus('Requesting permissions...');

      // Warm-up permissions under user gesture
      await app.camera.start();
      await app.audio.ensureStream();

      setStatus('Capturing frame...');
      try {
        capturedImage = await app.camera.captureFrame();
      } catch (e) {
        capturedImage = null;
      }

      setStatus('Recording...');
      appendMessage({ role: 'user', text: '🎙️（说话中…）' });
      await app.audio.start();
    },

    onEnd: async () => {
      btn.classList.remove('recording');
      setStatus('Stopping...');

      const audioBlob = await app.audio.stop();
      const imageBlob = capturedImage;
      capturedImage = null;

      if (!audioBlob) {
        setStatus('录音失败（没有拿到音频）');
        appendMessage({ role: 'system', text: '⚠️ 录音失败：没有拿到音频数据。' });
        return;
      }

      setStatus('Uploading + chatting...');
      try {
        const { replyText, debug } = await app.coze.runChat({
          imageBlob,
          audioBlob
        });

        const text = replyText || '（未返回文本）';
        appendMessage({ role: 'assistant', text });
        setStatus('Done');

        speak(text);

        // Expose for debugging
        window.__MINIEXPLORER_DEBUG__ = debug;
      } catch (e) {
        const msg = String(e?.message || e);
        setStatus('Error');
        appendMessage({ role: 'system', text: `⚠️ ${msg}` });
      }
    }
  });

  // First tap hint to unlock audio on iOS
  btn.addEventListener('click', () => {
    // no-op; this user gesture can help unlock speechSynthesis.
  });
}
