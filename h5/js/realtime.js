import { RealtimeClient, EventNames, RealtimeUtils } from 'https://esm.sh/@coze/realtime-api@1.3.2';

const DEFAULT_BASE = 'https://api.coze.cn';

const STATUS_LABELS = {
  idle: 'Realtime: 未连接',
  connecting: 'Realtime: 连接中…',
  connected: 'Realtime: 已连接',
  error: 'Realtime: 连接失败'
};

function formatError(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  return err?.message || String(err);
}

function extractText(event) {
  const payload = event?.data || event?.message || event?.payload || event;
  if (!payload) return null;
  if (typeof payload.text === 'string') return payload.text;
  if (typeof payload.content === 'string') return payload.content;
  if (payload.content && typeof payload.content.text === 'string') return payload.content.text;
  if (Array.isArray(payload.content)) {
    const textPart = payload.content.find((part) => part?.text);
    if (textPart?.text) return textPart.text;
  }
  return null;
}

function ensureUserId() {
  const key = 'COZE_USER_ID';
  let userId = localStorage.getItem(key);
  if (!userId) {
    userId = (globalThis.crypto?.randomUUID?.() || `uid_${Date.now()}_${Math.random().toString(16).slice(2)}`);
    localStorage.setItem(key, userId);
  }
  return userId;
}

const defaultGetConfig = () => ({
  baseUrl: localStorage.getItem('COZE_BASE_URL') || DEFAULT_BASE,
  token: localStorage.getItem('COZE_TOKEN') || '',
  botId: localStorage.getItem('COZE_BOT_ID') || '7598529675404886059',
  // 对齐 realtime-console：默认用 1024；如需自定义再在 localStorage 覆盖
  connectorId: localStorage.getItem('COZE_CONNECTOR_ID') || '1024',
  // 对齐 playground：Room Mode 默认 default
  roomMode: localStorage.getItem('COZE_ROOM_MODE') || 'default',
  debug: localStorage.getItem('COZE_DEBUG') === '1'
});

export function initRealtime({ ui, getConfig } = {}) {
  const resolveConfig = getConfig || defaultGetConfig;
  let client = null;
  let status = 'idle';
  let audioEnabled = false;
  let videoEnabled = false;

  const setStatus = (next, err) => {
    status = next;
    const label = STATUS_LABELS[next] || STATUS_LABELS.idle;
    ui?.setRealtimeStatus?.(label, next, formatError(err));
  };

  const bindEvents = (c) => {
    if (!c?.on) return;

    // Like realtime-console: log all client/server events into debug panel.
    if (EventNames?.ALL_CLIENT) {
      c.on(EventNames.ALL_CLIENT, (evt) => {
        const name = (typeof evt === 'string')
          ? evt
          : (evt?.event_type || evt?.type || evt?.event?.type || evt?.data?.type || evt?.data?.event_type || 'unknown');
        ui?.addEvent?.({ side: 'client', name, detail: (typeof evt === 'string' ? '' : evt) });
      });
    }

    if (EventNames?.ALL_SERVER) {
      c.on(EventNames.ALL_SERVER, (evt) => {
        const name = (typeof evt === 'string')
          ? evt
          : (evt?.event_type || evt?.type || evt?.event?.type || evt?.data?.type || evt?.data?.event_type || 'unknown');
        ui?.addEvent?.({ side: 'server', name, detail: (typeof evt === 'string' ? '' : evt) });
      });
    }

    if (EventNames?.CONNECTED) {
      c.on(EventNames.CONNECTED, () => setStatus('connected'));
    }
    if (EventNames?.DISCONNECTED) {
      c.on(EventNames.DISCONNECTED, () => setStatus('idle'));
    }
    if (EventNames?.ERROR) {
      c.on(EventNames.ERROR, (e) => setStatus('error', e));
    }

    if (EventNames?.AUDIO_USER_SPEECH_STARTED) {
      c.on(EventNames.AUDIO_USER_SPEECH_STARTED, () => ui?.setState?.('RECORDING'));
    }
    if (EventNames?.AUDIO_USER_SPEECH_STOPPED) {
      c.on(EventNames.AUDIO_USER_SPEECH_STOPPED, () => ui?.setState?.('LISTENING'));
    }
    if (EventNames?.AUDIO_AGENT_SPEECH_STARTED) {
      c.on(EventNames.AUDIO_AGENT_SPEECH_STARTED, () => ui?.setState?.('SPEAKING'));
    }
    if (EventNames?.AUDIO_AGENT_SPEECH_STOPPED) {
      c.on(EventNames.AUDIO_AGENT_SPEECH_STOPPED, () => ui?.setState?.('LISTENING'));
    }

    if (EventNames?.CONVERSATION_MESSAGE_DELTA) {
      c.on(EventNames.CONVERSATION_MESSAGE_DELTA, (event) => {
        const text = extractText(event);
        if (text) ui?.setReplyText?.(text);
      });
    }
    if (EventNames?.CONVERSATION_MESSAGE_COMPLETED) {
      c.on(EventNames.CONVERSATION_MESSAGE_COMPLETED, (event) => {
        const role = event?.data?.role || event?.message?.role;
        if (role && role !== 'assistant') return;
        const text = extractText(event);
        if (text) ui?.setReplyText?.(text);
      });
    }
  };

  const buildClientConfig = ({ videoRenderDomId } = {}) => {
    const cfg = resolveConfig() || {};
    const userId = ensureUserId();

    return {
      baseURL: cfg.baseUrl || DEFAULT_BASE,
      accessToken: cfg.token,
      botId: cfg.botId,
      allowPersonalAccessTokenInBrowser: true,
      audioMutedDefault: true,
      debug: !!cfg.debug,

      // 对齐 realtime-console / playground
      connectorId: cfg.connectorId || '1024',
      userId,
      roomMode: cfg.roomMode || 'default',

      ...(videoRenderDomId
        ? {
            videoConfig: {
              renderDom: videoRenderDomId,
              videoOnDefault: false
            }
          }
        : {})
    };
  };

  const ensureClient = ({ videoRenderDomId } = {}) => {
    // renderDom 和 mode 强绑定；但还要考虑 baseUrl/accessToken/botId 等配置变化。
    // 否则用户更新 localStorage 后重试，会继续复用旧 client（旧鉴权），导致一直连不上。

    const cfg = resolveConfig() || {};
    const desiredDom = videoRenderDomId || '';

    const desiredKey = JSON.stringify({
      baseUrl: cfg.baseUrl || DEFAULT_BASE,
      token: cfg.token || '',
      botId: cfg.botId || '',
      connectorId: cfg.connectorId || '1024',
      roomMode: cfg.roomMode || 'default',
      debug: !!cfg.debug,
      renderDom: desiredDom,
    });

    const currentDom = client?._clientConfig?.videoConfig?.renderDom || client?._config?.videoConfig?.renderDom || '';
    const currentKey = client?._miniExplorerConfigKey || '';

    if (client && currentDom === desiredDom && currentKey === desiredKey) return client;

    // reset
    try {
      client?.disconnect?.();
    } catch (_) {}
    client = null;
    audioEnabled = false;
    videoEnabled = false;

    client = new RealtimeClient(buildClientConfig({ videoRenderDomId }));
    // attach a stable key so we can detect config changes on next retry
    client._miniExplorerConfigKey = desiredKey;
    bindEvents(client);
    return client;
  };

  return {
    get status() {
      return status;
    },

    async connect({ enableVideo = false } = {}) {
      const cfg = resolveConfig() || {};
      if (!cfg.token) {
        setStatus('error', 'missing_COZE_TOKEN (set localStorage COZE_TOKEN)');
        return false;
      }
      if (!cfg.botId) {
        setStatus('error', 'missing_COZE_BOT_ID (set localStorage COZE_BOT_ID)');
        return false;
      }

      setStatus('connecting');
      try {
        // Explore 模式需要摄像头（video call 抽帧看见画面）；Companion 允许无相机
        const needVideo = !!enableVideo;
        const permission = await RealtimeUtils.checkDevicePermission(needVideo);
        if (!permission?.audio) {
          setStatus('error', 'mic_permission_denied');
          return false;
        }
        if (needVideo && !permission?.video) {
          setStatus('error', 'camera_permission_denied');
          return false;
        }

        const mode = ui?.mode || 'explore';
        const videoRenderDomId = mode === 'companion' ? 'companion-preview' : 'camera-preview';
        const c = ensureClient({ videoRenderDomId: needVideo ? videoRenderDomId : '' });

        await c.connect();
        setStatus('connected');

        // 不自动开麦（由 enableAudio 控制）
        // 但如果需要视频，连接后立刻把视频打开（对齐 playground 的“视频通话”体验）
        if (needVideo) {
          try {
            await c.setVideoEnable(true);
            videoEnabled = true;
          } catch (_) {
            // video enable 失败不阻断音频链路
          }
        }

        return true;
      } catch (e) {
        setStatus('error', e);
        return false;
      }
    },

    async enableAudio() {
      if (!client) return false;
      if (audioEnabled) return true;
      try {
        await client.setAudioEnable(true);
        audioEnabled = true;
        return true;
      } catch (e) {
        setStatus('error', e);
        return false;
      }
    },

    async enableVideo() {
      if (!client) return false;
      if (videoEnabled) return true;
      try {
        await client.setVideoEnable(true);
        videoEnabled = true;
        return true;
      } catch (e) {
        setStatus('error', e);
        return false;
      }
    },

    async disableVideo() {
      if (!client) return;
      if (!videoEnabled) return;
      try {
        await client.setVideoEnable(false);
      } catch (_) {}
      videoEnabled = false;
    },

    async disconnect() {
      if (!client) {
        setStatus('idle');
        return;
      }
      try {
        await client.disconnect();
      } catch (e) {
        setStatus('error', e);
        return;
      }
      audioEnabled = false;
      videoEnabled = false;
      setStatus('idle');
    }
  };
}
