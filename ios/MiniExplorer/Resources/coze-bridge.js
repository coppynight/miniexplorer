// Phase 2.1/2.2: Minimal JS bridge surface.
// Later we will replace stub implementations with Coze JS SDK + websocket logic.

(function(){
  function post(type, payload){
    try {
      window.webkit?.messageHandlers?.cozeBridge?.postMessage({ type, payload });
    } catch (e) {}
  }

  window.MiniExplorerBridge = {
    connect(config){
      post('connect', { ok: true, config });
      return { ok: true };
    },
    sendAudio(base64){
      post('sendAudio', { bytes: base64?.length ?? 0 });
    },
    sendImage(url){
      post('sendImage', { url: String(url || '') });
    },
    complete(){
      post('complete', { ok: true });
      // stub a response event
      setTimeout(() => post('completed', { ok: true, stub: true, text: '（stub）我看到了，也听到了。接下来我会根据你的图片/语音给建议。' }), 300);
    },
    disconnect(){
      post('disconnect', { ok: true });
    }
  };

  post('loaded', { ts: Date.now() });
})();
