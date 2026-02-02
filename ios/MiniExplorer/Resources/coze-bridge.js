// Phase 2.1/2.2: Coze Realtime JS bridge (frontend only).

(function(){
  const SDK_WAIT_MS = 8000;
  let client = null;
  let audioEnabled = false;

  function post(type, payload){
    try {
      window.webkit?.messageHandlers?.cozeBridge?.postMessage({ type, payload });
    } catch (e) {}
  }

  function sleep(ms){
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForSDK(){
    if (window.MiniExplorerCoze) return window.MiniExplorerCoze;
    const start = Date.now();
    while (Date.now() - start < SDK_WAIT_MS) {
      if (window.MiniExplorerCoze) return window.MiniExplorerCoze;
      await sleep(100);
    }
    throw new Error('sdk_timeout');
  }

  function extractText(event){
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

  function bindEvents(EventNames){
    if (EventNames?.CONNECTED) {
      client.on(EventNames.CONNECTED, (event) => post('connect', { ok: true, event }));
    }
    if (EventNames?.DISCONNECTED) {
      client.on(EventNames.DISCONNECTED, (event) => post('disconnect', { ok: true, event }));
    }
    if (EventNames?.ERROR) {
      client.on(EventNames.ERROR, (event) => post('error', { message: 'realtime_error', detail: event }));
    }
    if (EventNames?.ALL_SERVER) {
      client.on(EventNames.ALL_SERVER, (event) => {
        post('server_event', { event });
        const rawType = event?.event_type || event?.type;
        const eventType = typeof rawType === 'string' ? rawType.replace(/^server\./, '') : rawType;

        if (eventType === 'error') {
          const detail = event?.data?.msg || event?.data?.message || event?.data || event;
          post('error', { message: 'server_error', detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
          return;
        }

        if (eventType === 'conversation.audio.delta' || eventType === 'conversation.audio.completed') {
          post('audio', { event });
        }

        if (eventType === 'conversation.message.completed') {
          const role = event?.data?.role || event?.message?.role;
          if (role && role !== 'assistant') {
            return;
          }
          const text = extractText(event);
          if (text) post('completed', { ok: true, text, role: role || 'assistant' });
        }
      });
    }
  }

  async function connect(config){
    try {
      const sdk = await waitForSDK();
      const { RealtimeClient, EventNames, RealtimeUtils } = sdk;

      if (!config?.token || !config?.botId) {
        post('error', { message: 'missing_config', detail: config || null });
        return { ok: false, error: 'missing_config' };
      }

      try {
        const permission = await RealtimeUtils.checkDevicePermission();
        if (!permission?.audio) {
          post('error', { message: 'mic_permission_denied' });
          return { ok: false, error: 'mic_permission_denied' };
        }
      } catch (e) {
        post('error', { message: 'mic_permission_error', detail: String(e) });
        return { ok: false, error: 'mic_permission_error' };
      }

      const clientConfig = {
        baseURL: config.baseUrl || 'https://api.coze.cn',
        accessToken: config.token,
        botId: config.botId,
        voiceId: config.voiceId || undefined,
        allowPersonalAccessTokenInBrowser: true,
        audioMutedDefault: true,
        debug: !!config.debug,
        ...(config.connectorId ? { connectorId: config.connectorId } : {})
      };

      client = new RealtimeClient(clientConfig);
      bindEvents(EventNames);
      await client.connect();
      return { ok: true };
    } catch (e) {
      post('error', { message: 'connect_failed', detail: String(e) });
      return { ok: false, error: 'connect_failed' };
    }
  }

  function ensureConnected(){
    if (!client) {
      post('error', { message: 'not_connected' });
      return false;
    }
    return true;
  }

  async function sendAudio(base64){
    if (!ensureConnected()) return;
    if (!audioEnabled) {
      try {
        await client.setAudioEnable(true);
        audioEnabled = true;
        post('audio_enabled', { ok: true });
      } catch (e) {
        post('error', { message: 'audio_enable_failed', detail: String(e) });
      }
    }
    post('sendAudio', { bytes: base64 ? base64.length : 0, note: 'Realtime SDK uses WebView mic; base64 ignored' });
  }

  async function sendImage(payload){
    if (!ensureConnected()) return;

    let fileId = null;
    let fileUrl = null;
    if (typeof payload === 'string') {
      fileUrl = payload;
    } else if (payload && typeof payload === 'object') {
      fileId = payload.fileId || payload.file_id || payload.id || null;
      fileUrl = payload.fileUrl || payload.file_url || payload.url || null;
    }

    if (!fileId && !fileUrl) {
      post('error', { message: 'missing_image_payload', detail: payload || null });
      return;
    }

    const imageItem = fileId ? { type: 'image', file_id: fileId } : { type: 'image', file_url: fileUrl };
    const message = {
      id: `msg_${Date.now()}`,
      event_type: 'conversation.message.create',
      data: {
        role: 'user',
        content_type: 'object_string',
        content: JSON.stringify([imageItem])
      }
    };

    try {
      await client.sendMessage(message);
      post('sendImage', { fileId, fileUrl, mode: fileId ? 'file_id' : 'file_url' });
    } catch (e) {
      post('error', { message: 'send_image_failed', detail: String(e) });
    }
  }

  async function complete(){
    if (!ensureConnected()) return;
    try {
      await client.setAudioEnable(false);
      audioEnabled = false;
      post('input_complete', { ok: true });
    } catch (e) {
      post('error', { message: 'audio_disable_failed', detail: String(e) });
    }
  }

  async function disconnect(){
    if (!client) {
      post('disconnect', { ok: true });
      return;
    }
    try {
      await client.disconnect();
      post('disconnect', { ok: true });
    } catch (e) {
      post('error', { message: 'disconnect_failed', detail: String(e) });
    } finally {
      client = null;
      audioEnabled = false;
    }
  }

  window.MiniExplorerBridge = {
    connect,
    sendAudio,
    sendImage,
    complete,
    disconnect
  };

  post('loaded', { ts: Date.now() });
})();
