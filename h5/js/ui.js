function $(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function setStateBadge(mode, text, tone) {
  const id = mode === 'explore' ? 'explore-state' : 'companion-state';
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = `state-badge ${tone || ''}`.trim();
}

// Unified UI adapter for Explore/Companion.
export function createUI() {
  const debugUIEnabled = false;
  const ui = {
    mode: 'explore',

    // --- Debug events panel ---
    _eventPanelReady: false,
    _eventPanelOpen: false,
    _eventMax: 300,

    _ensureEventPanel() {
      if (!debugUIEnabled) return;
      if (this._eventPanelReady) return;
      const fab = $('event-fab');
      const panel = $('event-panel');
      const closeBtn = $('event-close');
      const clearBtn = $('event-clear');

      if (!fab || !panel) return; // panel not present

      const setOpen = (open) => {
        this._eventPanelOpen = !!open;
        panel.style.display = this._eventPanelOpen ? 'block' : 'none';
      };

      fab.addEventListener('click', () => setOpen(!this._eventPanelOpen));
      closeBtn?.addEventListener('click', () => setOpen(false));
      clearBtn?.addEventListener('click', () => {
        const list = $('event-list');
        if (list) list.innerHTML = '';
      });

      this._eventPanelReady = true;
    },

    addEvent({ side = 'client', name, detail }) {
      if (!debugUIEnabled) return;
      // side: client|server
      this._ensureEventPanel();
      const list = $('event-list');
      if (!list) return;

      const now = new Date();
      const t = now.toLocaleTimeString('zh-CN', { hour12: false });

      const row = document.createElement('div');
      row.className = `event-row ${side}`;

      const detailText = typeof detail === 'string'
        ? detail.slice(0, 220)
        : '';

      row.innerHTML = `
        <div class="t">${t}</div>
        <div class="side">[${side}]</div>
        <div class="name">${String(name || '').slice(0, 64)}</div>
        <div class="detail">${detailText ? String(detailText).replace(/</g, '&lt;') : ''}</div>
      `.trim();

      list.appendChild(row);

      // trim
      while (list.childNodes.length > this._eventMax) {
        list.removeChild(list.firstChild);
      }

      // autoscroll if open
      if (this._eventPanelOpen) {
        list.scrollTop = list.scrollHeight;
      }
    },

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

    setErrorHint(text) {
      const friendly = text || '我刚刚卡了一下，点一下再试试～';
      if (this.mode === 'explore') {
        setText('explore-status', friendly);
      } else {
        setText('companion-status', friendly);
      }
      setStateBadge(this.mode, 'Retry', 'error');
    },

    setReplyText(text) {
      if (this.mode === 'explore') {
        setText('explore-status', text);
      } else {
        setText('companion-status', text);
      }
    },

    setRealtimeStatus(label, status, error) {
      if (!debugUIEnabled) return;
      const el = document.getElementById('realtime-status');
      if (!el) return;
      el.textContent = error ? `${label}（${error}）` : label;
      el.classList.remove('connected', 'connecting', 'error');
      if (status) el.classList.add(status);
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
          setStateBadge(mode, 'Ready');
        }

        if (state === 'LISTENING') {
          face.textContent = '😮';
          dot.className = 'ai-indicator-dot listening';
          waves.classList.remove('active');
          setStateBadge(mode, 'Listening');
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
          setStateBadge(mode, 'Listening');
        }

        if (state === 'THINKING') {
          face.textContent = '🥰';
          dot.className = 'ai-indicator-dot speaking';
          waves.classList.remove('active');
          setText('explore-status', '让我想想…');
          setStateBadge(mode, 'Thinking');
        }

        if (state === 'SPEAKING') {
          face.textContent = '🥰';
          dot.className = 'ai-indicator-dot speaking';
          waves.classList.remove('active');
          setStateBadge(mode, 'Speaking');
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
          setStateBadge(mode, 'Ready');
        }

        if (state === 'LISTENING') {
          sphere.classList.add('listening');
          face.textContent = '😮';
          waves.classList.remove('active');
          setStateBadge(mode, 'Listening');
          if ($('companion-status')?.textContent?.includes('点一下')) {
            setText('companion-status', '我在听，随时说话');
          }
        }

        if (state === 'RECORDING') {
          sphere.classList.add('listening');
          face.textContent = '😮';
          waves.classList.add('active');
          setText('companion-status', '我在听…');
          setStateBadge(mode, 'Listening');
        }

        if (state === 'THINKING') {
          sphere.classList.add('speaking');
          face.textContent = '🥰';
          waves.classList.remove('active');
          setText('companion-status', '让我想想…');
          setStateBadge(mode, 'Thinking');
        }

        if (state === 'SPEAKING') {
          sphere.classList.add('speaking');
          face.textContent = '🥰';
          waves.classList.remove('active');
          setStateBadge(mode, 'Speaking');
        }
      }
    }
  };

  // initialize debug panel binding (no-op if elements absent)
  ui._ensureEventPanel();

  return ui;
}
