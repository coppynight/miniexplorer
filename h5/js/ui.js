function $(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

// Unified UI adapter for Explore/Companion.
export function createUI() {
  const ui = {
    mode: 'explore',

    setMode(mode) {
      this.mode = mode;
      if (mode === 'explore') {
        setText('explore-status', '对准想看的东西');
      } else {
        setText('companion-status', '想聊什么？');
      }
    },

    showPermissionOverlay(show) {
      const root = document.getElementById(`screen-${this.mode}`);
      if (!root) return;
      const overlay = root.querySelector('.permission-overlay');
      if (overlay) overlay.style.display = show ? 'flex' : 'none';
    },

    setCameraHint(text) {
      // Reuse status area for hint.
      if (this.mode === 'explore') {
        if (text) setText('explore-status', text);
      } else {
        if (text) setText('companion-status', text);
      }
    },

    setReplyText(text) {
      if (this.mode === 'explore') {
        setText('explore-status', text);
      } else {
        setText('companion-status', text);
      }
    },

    setState(state, mode = this.mode) {
      // state: NEED_PERMISSION|LISTENING|RECORDING|THINKING|SPEAKING
      this.mode = mode;

      if (mode === 'explore') {
        const dot = $('explore-ai-dot');
        const face = $('explore-ai-face');
        const waves = $('explore-waves');

        if (state === 'NEED_PERMISSION') {
          face.textContent = '😊';
          dot.className = 'ai-indicator-dot idle';
          waves.classList.remove('active');
          setText('explore-status', '点一下开始对话（需要麦克风）');
        }

        if (state === 'LISTENING') {
          face.textContent = '😮';
          dot.className = 'ai-indicator-dot listening';
          waves.classList.remove('active');
          // keep current text
          if ($('explore-status')?.textContent?.includes('点一下')) {
            setText('explore-status', '对准想看的东西，随时说话');
          }
        }

        if (state === 'RECORDING') {
          face.textContent = '😮';
          dot.className = 'ai-indicator-dot listening';
          waves.classList.add('active');
          setText('explore-status', '我在听…');
        }

        if (state === 'THINKING') {
          face.textContent = '🥰';
          dot.className = 'ai-indicator-dot speaking';
          waves.classList.remove('active');
          setText('explore-status', '让我想想…');
        }

        if (state === 'SPEAKING') {
          face.textContent = '🥰';
          dot.className = 'ai-indicator-dot speaking';
          waves.classList.remove('active');
        }
      } else {
        const sphere = $('companion-sphere');
        const face = $('companion-face');
        const waves = $('companion-waves');

        sphere.className = 'companion-sphere';

        if (state === 'NEED_PERMISSION') {
          face.textContent = '😊';
          waves.classList.remove('active');
          setText('companion-status', '点一下开始对话（需要麦克风）');
        }

        if (state === 'LISTENING') {
          sphere.classList.add('listening');
          face.textContent = '😮';
          waves.classList.remove('active');
          if ($('companion-status')?.textContent?.includes('点一下')) {
            setText('companion-status', '我在听，随时说话');
          }
        }

        if (state === 'RECORDING') {
          sphere.classList.add('listening');
          face.textContent = '😮';
          waves.classList.add('active');
          setText('companion-status', '我在听…');
        }

        if (state === 'THINKING') {
          sphere.classList.add('speaking');
          face.textContent = '🥰';
          waves.classList.remove('active');
          setText('companion-status', '让我想想…');
        }

        if (state === 'SPEAKING') {
          sphere.classList.add('speaking');
          face.textContent = '🥰';
          waves.classList.remove('active');
        }
      }
    }
  };

  return ui;
}
