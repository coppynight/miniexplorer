function $(id) {
  return document.getElementById(id);
}

// ==================== Common Helpers ====================

function speak(text) {
  if (!text) return;
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    window.speechSynthesis.speak(u);
  } catch (_) {}
}

function bindPressAndHold(btn, { onStart, onEnd }) {
  let pressed = false;

  const start = async (e) => {
    // Prevent default to stop scrolling/selection
    if (e.type !== 'mousedown') e.preventDefault?.(); 
    if (pressed) return;
    pressed = true;
    await onStart?.();
  };

  const end = async (e) => {
    if (e.type !== 'mouseup' && e.type !== 'mouseleave') e.preventDefault?.();
    if (!pressed) return;
    pressed = false;
    await onEnd?.();
  };

  btn.addEventListener('touchstart', start, { passive: false });
  btn.addEventListener('touchend', end, { passive: false });
  btn.addEventListener('touchcancel', end, { passive: false });
  
  btn.addEventListener('mousedown', start);
  btn.addEventListener('mouseup', end);
  btn.addEventListener('mouseleave', end);
}

// ==================== Explore Mode Logic ====================

function initExploreUI(app) {
  const btn = $('explore-btn');
  const btnIcon = $('explore-btn-icon');
  const btnText = $('explore-btn-text');
  const status = $('explore-status');
  const aiFace = $('explore-ai-face');
  const aiDot = $('explore-ai-dot');
  const waves = $('explore-waves');

  const setExploreState = (state) => {
    // states: idle, listening, speaking
    btn.className = `main-btn ${state}`;
    aiDot.className = `ai-indicator-dot ${state}`;
    
    if (state === 'idle') {
      btnIcon.textContent = '🎤';
      btnText.textContent = '按住说话';
      aiFace.textContent = '😊';
      waves.classList.remove('active');
    } else if (state === 'listening') {
      btnIcon.textContent = '🎵';
      btnText.textContent = '听着呢...';
      aiFace.textContent = '😮';
      status.textContent = '我在听...';
      waves.classList.add('active');
    } else if (state === 'speaking') {
      btnIcon.textContent = '💬';
      btnText.textContent = '思考中...';
      aiFace.textContent = '🥰';
      waves.classList.remove('active');
    }
  };

  let capturedImage = null;

  bindPressAndHold(btn, {
    onStart: async () => {
      setExploreState('listening');
      
      // Warm up audio
      await app.audio.ensureStream();

      // Capture frame immediately
      try {
        capturedImage = await app.camera.captureFrame();
        // Flash effect
        const flash = $('flash');
        flash.classList.add('active');
        setTimeout(() => flash.classList.remove('active'), 200);
      } catch (e) {
        console.warn('Capture failed', e);
        capturedImage = null;
      }

      await app.audio.start();
    },

    onEnd: async () => {
      setExploreState('speaking');
      status.textContent = '思考中...';

      const audioBlob = await app.audio.stop();
      const imageBlob = capturedImage;
      capturedImage = null;

      if (!audioBlob) {
        status.textContent = '录音失败';
        setExploreState('idle');
        return;
      }

      try {
        const { replyText, debug } = await app.coze.runChat({
          imageBlob, // Explore mode sends image
          audioBlob
        });

        const text = replyText || '（没听清）';
        status.textContent = text; // Show text in status bar for now
        speak(text);
        
        // Reset after a while
        setTimeout(() => {
            if (status.textContent === text) status.textContent = '对准想看的东西';
            setExploreState('idle');
        }, 5000);

      } catch (e) {
        status.textContent = '出错: ' + e.message;
        setExploreState('idle');
      }
    }
  });
}

// ==================== Companion Mode Logic ====================

function initCompanionUI(app) {
  const btn = $('companion-btn');
  const btnIcon = $('companion-btn-icon');
  const btnText = $('companion-btn-text');
  const status = $('companion-status');
  const sphere = $('companion-sphere');
  const face = $('companion-face');
  const waves = $('companion-waves');

  const setCompState = (state) => {
    btn.className = `main-btn ${state}`;
    // Reset sphere classes
    sphere.className = 'companion-sphere'; 
    if (state !== 'idle') sphere.classList.add(state);

    if (state === 'idle') {
      btnIcon.textContent = '💬';
      btnText.textContent = '按住聊天';
      face.textContent = '😊';
      waves.classList.remove('active');
    } else if (state === 'listening') {
      btnIcon.textContent = '👂';
      btnText.textContent = '听着呢...';
      face.textContent = '😮';
      status.textContent = '我在听...';
      waves.classList.add('active');
    } else if (state === 'speaking') {
      btnIcon.textContent = '💭';
      btnText.textContent = '思考中...';
      face.textContent = '🥰';
      waves.classList.remove('active');
    }
  };

  bindPressAndHold(btn, {
    onStart: async () => {
      setCompState('listening');
      await app.audio.ensureStream();
      await app.audio.start();
    },

    onEnd: async () => {
      setCompState('speaking');
      status.textContent = '思考中...';

      const audioBlob = await app.audio.stop();

      if (!audioBlob) {
        status.textContent = '录音失败';
        setCompState('idle');
        return;
      }

      try {
        // Companion mode: NO image, just audio
        const { replyText } = await app.coze.runChat({
          imageBlob: null, 
          audioBlob
        });

        const text = replyText || '（没听清）';
        status.textContent = text;
        speak(text);

        // Reset
        setTimeout(() => {
             if (status.textContent === text) status.textContent = '想聊什么？';
             setCompState('idle');
        }, 5000);

      } catch (e) {
        status.textContent = '出错: ' + e.message;
        setCompState('idle');
      }
    }
  });
}

export function initUI(app) {
  initExploreUI(app);
  initCompanionUI(app);
}
