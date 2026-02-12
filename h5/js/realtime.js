import { RealtimeClient, EventNames, RealtimeUtils } from 'https://esm.sh/@coze/realtime-api@1.3.2';

// Core realtime flow is ported from the stable POC runtime:
// /poc/coze-realtime-poc.html (speech-time frame upload + image[]/text bundle send).

const DEFAULT_BASE = 'https://api.coze.cn';

const STATUS_LABELS = {
  idle: 'Realtime: 未连接',
  connecting: 'Realtime: 连接中…',
  connected: 'Realtime: 已连接',
  error: 'Realtime: 连接失败'
};

const SPEECH_FRAME_INTERVAL_MS = 1000;
const SPEECH_FLUSH_DELAY_MS = 320;
const SPEECH_MAX_FRAMES = 12;
const SPEECH_UPLOAD_SETTLE_TIMEOUT_MS = 1600;
const SPEECH_BUNDLE_MAX_RETRY = 1;
const SPEECH_BUNDLE_RETRY_DELAY_MS = 450;

function formatError(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  return err?.message || String(err);
}

function objectKeysSafe(value) {
  return value && typeof value === 'object' ? Object.keys(value) : [];
}

function extractEventType(event) {
  if (typeof event === 'string') return event;
  return event?.event_type ||
    event?.type ||
    event?.event?.type ||
    event?.data?.type ||
    event?.data?.event_type ||
    '';
}

function normalizeEventArgs(arg1, arg2, fallbackEventName = '') {
  const eventName = typeof arg1 === 'string' ? arg1 : (extractEventType(arg1) || fallbackEventName);
  const event = arg2 !== undefined ? arg2 : arg1;
  return { eventName, event };
}

function extractRoleFromEvent(event) {
  return event?.data?.role ||
    event?.data?.message?.role ||
    event?.role ||
    event?.message?.role ||
    '';
}

function coerceStringFromUnknown(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    const parts = value.map((v) => coerceStringFromUnknown(v)).filter(Boolean);
    return parts.join('');
  }
  if (typeof value === 'object') {
    const keys = ['text', 'delta', 'transcript', 'content', 'value', 'sentence', 'utterance', 'asr_text'];
    for (const key of keys) {
      if (typeof value[key] === 'string' && value[key].trim()) {
        if (looksLikeJsonString(value[key])) continue;
        return value[key].trim();
      }
    }
  }
  return '';
}

function extractTextFromObjectString(content) {
  if (typeof content !== 'string') return '';
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      const textItem = parsed.find((item) => item && item.type === 'text' && typeof item.text === 'string');
      return textItem?.text || '';
    }
    if (parsed && typeof parsed === 'object') {
      const msgType = String(parsed.msg_type || '');
      if (msgType === 'time_capsule_recall' || msgType === 'generate_answer_finish') return '';
      if (typeof parsed.text === 'string' && parsed.text.trim()) return parsed.text.trim();
      if (typeof parsed.wraped_text === 'string' && parsed.wraped_text.trim()) return parsed.wraped_text.trim();
      if (typeof parsed.content === 'string' && parsed.content.trim()) return parsed.content.trim();
    }
  } catch (_) {}
  return '';
}

function looksLikeJsonString(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return (text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'));
}

function shouldHideStructuredText(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (looksLikeJsonString(text)) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes('generate_answer_finish') ||
    lower.includes('time_capsule_recall') ||
    lower.includes('msg_type') ||
    lower.includes('from_module') ||
    lower.includes('from_unit') ||
    lower.includes('findata') ||
    lower.includes('\\"msg_type\\"')
  );
}

function sanitizeAssistantDisplayText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (shouldHideStructuredText(text)) return '';
  return text;
}

function extractTextFromEvent(event) {
  const candidates = [
    event?.data?.delta,
    event?.delta,
    event?.data?.transcript,
    event?.data?.text,
    event?.data?.message?.delta,
    event?.data?.message?.text,
    event?.data?.message?.content,
    event?.data?.content,
    event?.text
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      const fromObjectString = extractTextFromObjectString(candidate);
      if (fromObjectString) return fromObjectString;
      if (looksLikeJsonString(candidate)) continue;
      return candidate.trim();
    }
    const value = coerceStringFromUnknown(candidate);
    if (value) return value;
  }
  return '';
}

function extractUserTranscriptFromEvent(event) {
  const data = event?.data || {};
  const candidates = [
    data.transcript,
    data.delta,
    data.text,
    data.content,
    data.result,
    data.audio_transcript,
    data.value,
    data.message?.transcript,
    data.message?.text,
    data.message?.delta,
    data.message?.content,
    event?.delta,
    event?.text,
    event?.transcript
  ];
  for (const candidate of candidates) {
    const transcript = coerceStringFromUnknown(candidate);
    if (transcript) return transcript;
  }
  return '';
}

function mergeTranscriptText(previous, next) {
  const prev = String(previous || '').trim();
  const nextText = String(next || '').trim();
  if (!prev) return nextText;
  if (!nextText) return prev;
  if (nextText.includes(prev)) return nextText;
  if (prev.includes(nextText)) return prev;
  if (nextText.length >= prev.length) return nextText;
  if (prev.length <= 120 && nextText.length <= 40) return `${prev}${nextText}`;
  return prev;
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
  connectorId: localStorage.getItem('COZE_CONNECTOR_ID') || '1024',
  roomMode: localStorage.getItem('COZE_ROOM_MODE') || 'default',
  debug: localStorage.getItem('COZE_DEBUG') === '1'
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getVideoElementFromRenderDom(renderDomId) {
  if (!renderDomId) return null;
  const dom = document.getElementById(renderDomId);
  if (!dom) return null;
  if (dom instanceof HTMLVideoElement) return dom;
  const videos = Array.from(dom.querySelectorAll?.('video') || []);
  if (!videos.length) return null;
  const readyVideo = videos.find((video) => video.videoWidth > 0 && video.videoHeight > 0);
  if (readyVideo) return readyVideo;
  const fallbackVideo = videos.find((video) => video.dataset?.fallbackPreview === '1');
  return fallbackVideo || videos[0];
}

async function waitForRenderableVideo(renderDomId, timeoutMs = 2000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const video = getVideoElementFromRenderDom(renderDomId);
    if (video && video.videoWidth > 0 && video.videoHeight > 0) return video;
    await sleep(80);
  }
  return null;
}

function captureFrameBlob(videoEl) {
  const width = videoEl.videoWidth;
  const height = videoEl.videoHeight;
  if (!width || !height) throw new Error('video_not_ready');

  const canvas = document.getElementById('photo-canvas') || document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_context_unavailable');
  ctx.drawImage(videoEl, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('frame_to_blob_failed'));
    }, 'image/jpeg', 0.9);
  });
}

export function initRealtime({ ui, getConfig } = {}) {
  const resolveConfig = getConfig || defaultGetConfig;
  let client = null;
  let status = 'idle';
  let lastError = '';
  let audioEnabled = false;
  let videoEnabled = false;
  let cameraPermissionGranted = true;
  let autoVisionEnabled = localStorage.getItem('H5_AUTO_VISION') !== '0';
  let fallbackPreviewStream = null;

  let speechModeActive = false;
  let speechFrameTimer = null;
  let speechFrameInFlight = false;
  let speechUploadedFrameIds = [];
  let speechFlushTimer = null;
  let speechBundleRetryTimer = null;
  let speechBundleInFlight = false;
  let assistantStartedAfterSpeech = false;
  let assistantChatInProgress = false;
  let currentUserSpeechText = '';
  let latestCompletedUserSpeechText = '';
  let speechBundleRetryCount = 0;
  let hasDirectAudioTranscriptBinding = false;
  let hasDirectConversationMessageBinding = false;

  const setStatus = (next, err) => {
    status = next;
    lastError = next === 'error' ? formatError(err) : '';
    const label = STATUS_LABELS[next] || STATUS_LABELS.idle;
    ui?.setRealtimeStatus?.(label, next, formatError(err));
  };

  const ensureConfigInteractive = () => {
    let cfg = resolveConfig() || {};
    const canPrompt = typeof window !== 'undefined' && typeof window.prompt === 'function';
    if (!canPrompt) return cfg;

    if (!cfg.token) {
      const tokenInput = window.prompt(
        '请输入 Coze PAT Token（仅保存到当前浏览器 localStorage）',
        localStorage.getItem('COZE_TOKEN') || ''
      );
      if (tokenInput && tokenInput.trim()) {
        localStorage.setItem('COZE_TOKEN', tokenInput.trim());
      }
      cfg = resolveConfig() || {};
    }

    if (!cfg.botId) {
      const defaultBotId = localStorage.getItem('COZE_BOT_ID') || '7598529675404886059';
      const botIdInput = window.prompt('请输入 Coze Bot ID', defaultBotId);
      if (botIdInput && botIdInput.trim()) {
        localStorage.setItem('COZE_BOT_ID', botIdInput.trim());
      }
      cfg = resolveConfig() || {};
    }
    return cfg;
  };

  const logLocal = (name, detail = {}) => {
    ui?.addEvent?.({ side: 'client', name: `mini.${name}`, detail });
  };

  const clearSpeechBundleRetryTimer = () => {
    if (speechBundleRetryTimer) {
      clearTimeout(speechBundleRetryTimer);
      speechBundleRetryTimer = null;
    }
  };

  const stopSpeechFrameLoop = () => {
    speechModeActive = false;
    if (speechFrameTimer) {
      clearInterval(speechFrameTimer);
      speechFrameTimer = null;
    }
  };

  const resetSpeechCaptureState = () => {
    stopSpeechFrameLoop();
    if (speechFlushTimer) {
      clearTimeout(speechFlushTimer);
      speechFlushTimer = null;
    }
    clearSpeechBundleRetryTimer();
    speechUploadedFrameIds = [];
    speechFrameInFlight = false;
    speechBundleInFlight = false;
    assistantStartedAfterSpeech = false;
    assistantChatInProgress = false;
    currentUserSpeechText = '';
    latestCompletedUserSpeechText = '';
    speechBundleRetryCount = 0;
  };

  const hasPendingSpeechVisualData = () => {
    return speechUploadedFrameIds.length > 0 || speechFrameInFlight;
  };

  const getSpeechBundleDelay = (reason) => {
    const value = String(reason || '').toLowerCase();
    if (value.includes('user_text_completed') || value.includes('audio_transcript_completed')) {
      return 80;
    }
    if (value.includes('speech_stopped')) {
      return 280;
    }
    return SPEECH_FLUSH_DELAY_MS;
  };

  const getAccessConfig = () => {
    const cfg = resolveConfig() || {};
    const baseURL = cfg.baseUrl || DEFAULT_BASE;
    const accessToken = cfg.token || '';
    if (!accessToken) throw new Error('missing_COZE_TOKEN');
    return { baseURL, accessToken };
  };

  const getCurrentVideoRenderDomId = () => {
    const mode = ui?.mode || 'explore';
    return mode === 'companion' ? 'companion-preview' : 'camera-preview';
  };

  const getPreferredFacingMode = () => {
    const mode = ui?.mode || 'explore';
    return mode === 'companion' ? 'user' : 'environment';
  };

  const stopFallbackPreview = () => {
    if (fallbackPreviewStream) {
      fallbackPreviewStream.getTracks().forEach((track) => {
        try { track.stop(); } catch (_) {}
      });
      fallbackPreviewStream = null;
    }
    const fallbackVideos = Array.from(document.querySelectorAll('video[data-fallback-preview="1"]'));
    for (const fallbackVideo of fallbackVideos) {
      try { fallbackVideo.pause?.(); } catch (_) {}
      try { fallbackVideo.srcObject = null; } catch (_) {}
      if (!fallbackVideo.id) fallbackVideo.remove();
      else fallbackVideo.removeAttribute('data-fallback-preview');
    }
  };

  const ensureVisiblePreview = async ({ renderDomId, facingMode }) => {
    const sdkVideo = await waitForRenderableVideo(renderDomId, 1400);
    if (sdkVideo) {
      stopFallbackPreview();
      return { video: sdkVideo, source: 'sdk' };
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('getUserMedia_not_supported');
    }

    stopFallbackPreview();
    fallbackPreviewStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    const host = document.getElementById(renderDomId);
    if (!host) throw new Error(`render_dom_not_found:${renderDomId}`);

    let previewVideo = null;
    if (host instanceof HTMLVideoElement) {
      previewVideo = host;
      previewVideo.setAttribute('data-fallback-preview', '1');
    } else {
      previewVideo = host.querySelector('video[data-fallback-preview="1"]');
      if (!previewVideo) {
        previewVideo = document.createElement('video');
        previewVideo.autoplay = true;
        previewVideo.muted = true;
        previewVideo.playsInline = true;
        previewVideo.setAttribute('data-fallback-preview', '1');
        host.appendChild(previewVideo);
      }
    }

    previewVideo.autoplay = true;
    previewVideo.muted = true;
    previewVideo.playsInline = true;
    previewVideo.srcObject = fallbackPreviewStream;
    await previewVideo.play().catch(() => {});

    const ready = await waitForRenderableVideo(renderDomId, 2000);
    if (!ready) throw new Error('fallback_preview_not_ready');
    return { video: ready, source: 'fallback' };
  };

  const uploadImageToCoze = async ({ imageBlob }) => {
    const { baseURL, accessToken } = getAccessConfig();
    const form = new FormData();
    form.append('file', imageBlob, `frame_${Date.now()}.jpg`);

    const response = await fetch(`${baseURL}/v1/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: form
    });

    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch (_) { json = { raw: text }; }

    if (!response.ok) throw new Error(`upload_http_${response.status}: ${text}`);
    if (json.code != null && json.code !== 0) throw new Error(`upload_code_${json.code}: ${json.msg || text}`);
    const fileId = json?.data?.id;
    if (!fileId) throw new Error(`upload_missing_file_id: ${text}`);
    return fileId;
  };

  const sendObjectStringItems = async (items) => {
    if (!client || typeof client.sendMessage !== 'function') {
      throw new Error('send_message_not_supported');
    }
    if (!Array.isArray(items) || !items.length) {
      throw new Error('empty_message_items');
    }
    const message = {
      id: `msg_${Date.now()}`,
      event_type: 'conversation.message.create',
      data: {
        role: 'user',
        content_type: 'object_string',
        content: JSON.stringify(items)
      }
    };
    await client.sendMessage(message);
  };

  const captureAndUploadCurrentFrame = async (reason = 'speech_loop') => {
    if (!videoEnabled) throw new Error('video_not_enabled');
    const renderDomId = getCurrentVideoRenderDomId();
    let video = await waitForRenderableVideo(renderDomId, 1600);
    if (!video) {
      const preview = await ensureVisiblePreview({
        renderDomId,
        facingMode: getPreferredFacingMode()
      });
      video = preview?.video || null;
      logLocal('preview_ready', {
        source: preview?.source || 'unknown',
        reason,
        renderDomId
      });
    }
    if (!video) throw new Error('video_render_not_ready');
    const blob = await captureFrameBlob(video);
    const fileId = await uploadImageToCoze({ imageBlob: blob });
    return {
      fileId,
      reason,
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
      size: blob.size
    };
  };

  const captureSpeechFrame = async () => {
    if (!speechModeActive || !videoEnabled) return;
    if (speechFrameInFlight) return;
    speechFrameInFlight = true;
    try {
      const frame = await captureAndUploadCurrentFrame('speech_loop');
      speechUploadedFrameIds.push(frame.fileId);
      if (speechUploadedFrameIds.length > SPEECH_MAX_FRAMES) {
        speechUploadedFrameIds.shift();
      }
      logLocal('speech_frame_uploaded', {
        fileId: frame.fileId,
        width: frame.width,
        height: frame.height,
        size: frame.size,
        reason: frame.reason,
        frameBufferSize: speechUploadedFrameIds.length
      });
    } catch (error) {
      logLocal('speech_frame_upload_error', { error: String(error?.message || error) });
    } finally {
      speechFrameInFlight = false;
    }
  };

  const startSpeechFrameLoop = () => {
    if (!autoVisionEnabled || !videoEnabled) return;
    if (speechModeActive) return;
    resetSpeechCaptureState();
    speechModeActive = true;
    void captureSpeechFrame();
    speechFrameTimer = setInterval(() => {
      void captureSpeechFrame();
    }, SPEECH_FRAME_INTERVAL_MS);
    logLocal('speech_frame_loop_started', { intervalMs: SPEECH_FRAME_INTERVAL_MS });
  };

  const scheduleSpeechBundleSend = (reason) => {
    if (!autoVisionEnabled) return;
    clearSpeechBundleRetryTimer();
    if (speechFlushTimer) clearTimeout(speechFlushTimer);
    const delay = getSpeechBundleDelay(reason);
    logLocal('speech_bundle_schedule', { reason, delayMs: delay });
    speechFlushTimer = setTimeout(() => {
      speechFlushTimer = null;
      void sendSpeechBundleToAgent(reason);
    }, delay);
  };

  const onUserSpeechStarted = (source = 'event') => {
    assistantStartedAfterSpeech = false;
    assistantChatInProgress = false;
    currentUserSpeechText = '';
    latestCompletedUserSpeechText = '';
    speechBundleRetryCount = 0;
    clearSpeechBundleRetryTimer();
    ui?.setState?.('RECORDING');
    if (autoVisionEnabled) startSpeechFrameLoop();
    logLocal('speech_started', { source });
  };

  const onUserSpeechStopped = (source = 'event') => {
    stopSpeechFrameLoop();
    ui?.setState?.('LISTENING');
    if (autoVisionEnabled) {
      scheduleSpeechBundleSend(`speech_stopped_${source}`);
    }
    logLocal('speech_stopped', { source });
  };

  const onAgentSpeechStarted = (source = 'event') => {
    assistantStartedAfterSpeech = true;
    ui?.setState?.('SPEAKING');
    logLocal('assistant_speech_started', { source });
  };

  const onAgentSpeechStopped = (source = 'event') => {
    assistantStartedAfterSpeech = false;
    if (!speechModeActive) ui?.setState?.('LISTENING');
    logLocal('assistant_speech_stopped', { source });
  };

  const sendSpeechBundleToAgent = async (reason = 'speech_stopped') => {
    if (!autoVisionEnabled || !client || !videoEnabled) return;
    if (speechBundleInFlight) return;

    const settleStartedAt = Date.now();
    while (speechFrameInFlight && Date.now() - settleStartedAt < SPEECH_UPLOAD_SETTLE_TIMEOUT_MS) {
      await sleep(80);
    }

    let frameFileIds = speechUploadedFrameIds.slice();
    speechUploadedFrameIds = [];
    if (!frameFileIds.length) {
      try {
        const fallbackFrame = await captureAndUploadCurrentFrame('speech_finalize_fallback');
        frameFileIds.push(fallbackFrame.fileId);
        logLocal('speech_frame_uploaded', {
          fileId: fallbackFrame.fileId,
          reason: fallbackFrame.reason,
          width: fallbackFrame.width,
          height: fallbackFrame.height,
          size: fallbackFrame.size,
          frameBufferSize: frameFileIds.length
        });
      } catch (error) {
        logLocal('speech_bundle_skip', {
          reason,
          because: 'no_frame_file_id',
          error: String(error?.message || error)
        });
      }
    }
    if (!frameFileIds.length) return;

    const userText = (latestCompletedUserSpeechText || currentUserSpeechText || '').trim();
    if (!userText) {
      if (speechBundleRetryCount < SPEECH_BUNDLE_MAX_RETRY) {
        speechBundleRetryCount += 1;
        speechUploadedFrameIds = frameFileIds.slice(-SPEECH_MAX_FRAMES);
        logLocal('speech_bundle_retry', {
          reason,
          retryCount: speechBundleRetryCount,
          maxRetry: SPEECH_BUNDLE_MAX_RETRY,
          frameCount: speechUploadedFrameIds.length,
          delayMs: SPEECH_BUNDLE_RETRY_DELAY_MS
        });
        clearSpeechBundleRetryTimer();
        speechBundleRetryTimer = setTimeout(() => {
          speechBundleRetryTimer = null;
          void sendSpeechBundleToAgent(`${reason}_retry_${speechBundleRetryCount}`);
        }, SPEECH_BUNDLE_RETRY_DELAY_MS);
        return;
      }
      logLocal('speech_bundle_fallback', {
        reason,
        frameCount: frameFileIds.length,
        because: 'missing_user_text_after_retry'
      });
    } else {
      speechBundleRetryCount = 0;
      clearSpeechBundleRetryTimer();
    }

    if ((assistantStartedAfterSpeech || assistantChatInProgress) && typeof client.interrupt === 'function') {
      try {
        await client.interrupt();
        assistantStartedAfterSpeech = false;
        assistantChatInProgress = false;
        logLocal('assistant_interrupt_before_bundle', {
          reason,
          frameCount: frameFileIds.length,
          hasUserText: !!userText
        });
      } catch (error) {
        logLocal('speech_bundle_skip', {
          reason,
          because: 'assistant_interrupt_failed',
          error: String(error?.message || error)
        });
        return;
      }
    }

    speechBundleInFlight = true;
    try {
      const items = frameFileIds.map((id) => ({ type: 'image', file_id: id }));
      if (userText) items.push({ type: 'text', text: userText });
      await sendObjectStringItems(items);
      logLocal('speech_bundle_sent', {
        reason,
        frameCount: frameFileIds.length,
        mode: userText ? 'image+text' : 'image_only',
        userTextPreview: userText.slice(0, 120)
      });
    } catch (error) {
      speechUploadedFrameIds = frameFileIds.slice(-SPEECH_MAX_FRAMES);
      logLocal('speech_bundle_error', {
        reason,
        frameCount: frameFileIds.length,
        error: String(error?.message || error)
      });
    } finally {
      speechBundleRetryCount = 0;
      speechBundleInFlight = false;
      assistantStartedAfterSpeech = false;
    }
  };

  const handleUserTranscriptEvent = (event, eventType, source = 'unknown') => {
    const typeName = String(eventType || '').toLowerCase();
    const transcript = extractUserTranscriptFromEvent(event);
    if (!transcript) {
      logLocal('user_transcript_empty', {
        source,
        eventType,
        keys: objectKeysSafe(event),
        dataKeys: objectKeysSafe(event?.data)
      });
      return false;
    }

    currentUserSpeechText = mergeTranscriptText(currentUserSpeechText, transcript);
    if (typeName.includes('completed')) {
      latestCompletedUserSpeechText = currentUserSpeechText;
    }

    logLocal('user_transcript', {
      source,
      eventType,
      state: typeName.includes('completed') ? 'completed' : 'delta',
      textPreview: currentUserSpeechText.slice(0, 150)
    });

    if (typeName.includes('completed') && !speechModeActive && autoVisionEnabled && hasPendingSpeechVisualData()) {
      scheduleSpeechBundleSend('audio_transcript_completed');
    }
    return true;
  };

  const handleConversationMessageEvent = (event, eventType, source = 'unknown') => {
    const role = extractRoleFromEvent(event);
    const guessedRole = (!role && !assistantStartedAfterSpeech && (speechModeActive || hasPendingSpeechVisualData()))
      ? 'user'
      : '';
    const resolvedRole = role || guessedRole;
    const text = extractTextFromEvent(event);
    const typeName = String(eventType || '').toLowerCase();
    const isCompleted = typeName.includes('completed');

    if (resolvedRole === 'user') {
      if (!text) return false;
      currentUserSpeechText = mergeTranscriptText(currentUserSpeechText, text);
      if (isCompleted) {
        latestCompletedUserSpeechText = currentUserSpeechText;
      }
      logLocal('user_text', {
        source,
        eventType,
        state: isCompleted ? 'completed' : 'delta',
        textPreview: currentUserSpeechText.slice(0, 150)
      });
      if (isCompleted && !speechModeActive && autoVisionEnabled && hasPendingSpeechVisualData()) {
        scheduleSpeechBundleSend('user_text_completed');
      }
      return true;
    }

    const displayText = sanitizeAssistantDisplayText(text);
    if (!displayText) {
      logLocal('assistant_text_skip', {
        source,
        eventType,
        reason: 'structured_or_debug_text'
      });
      return false;
    }
    ui?.setReplyText?.(displayText);
    logLocal('assistant_text', {
      source,
      eventType,
      textPreview: displayText.slice(0, 180)
    });
    return true;
  };

  const handleServerEvent = (event, eventType, source = 'all_server') => {
    const type = eventType || extractEventType(event) || 'unknown';
    const typeName = String(type || '').toLowerCase();

    if (typeName.includes('audio.user.speech_started')) onUserSpeechStarted(source);
    if (typeName.includes('audio.user.speech_stopped')) onUserSpeechStopped(source);
    if (typeName.includes('audio.agent.speech_started')) onAgentSpeechStarted(source);
    if (typeName.includes('audio.agent.speech_stopped')) onAgentSpeechStopped(source);

    if (typeName.includes('conversation.chat.created') || typeName.includes('conversation.chat.in_progress')) {
      assistantChatInProgress = true;
      if (!assistantStartedAfterSpeech) ui?.setState?.('THINKING');
      logLocal('assistant_chat_state', { state: 'in_progress', source, type });
    }
    if (typeName.includes('conversation.chat.completed') || typeName.includes('conversation.chat.failed')) {
      assistantChatInProgress = false;
      if (!speechModeActive && !assistantStartedAfterSpeech) ui?.setState?.('LISTENING');
      logLocal('assistant_chat_state', { state: 'completed', source, type });
    }

    const isTextDelta = typeName.includes('conversation.message.delta') || typeName.includes('conversation.message.completed');
    const isAudioTranscript = typeName.includes('conversation.audio_transcript.delta') || typeName.includes('conversation.audio_transcript.completed');

    if (isAudioTranscript && !hasDirectAudioTranscriptBinding) {
      handleUserTranscriptEvent(event, type, source);
    }
    if (isTextDelta && !hasDirectConversationMessageBinding) {
      handleConversationMessageEvent(event, type, source);
    }
  };

  const bindEventNamesByPattern = ({ label, patterns, handler }) => {
    if (!client || !EventNames || typeof handler !== 'function') return [];
    const eventValues = Object.values(EventNames).filter((value) => typeof value === 'string');
    const lowerPatterns = patterns.map((pattern) => String(pattern).toLowerCase());
    const matched = [...new Set(eventValues.filter((name) => {
      const lowerName = String(name).toLowerCase();
      return lowerPatterns.some((pattern) => lowerName.includes(pattern));
    }))];

    logLocal('event_bind_scan', { label, patterns, matched });
    for (const eventName of matched) {
      client.on(eventName, (arg1, arg2) => {
        const { eventName: dispatchedEventName, event } = normalizeEventArgs(arg1, arg2, eventName);
        const resolvedType = dispatchedEventName || extractEventType(event) || eventName;
        handler(event, resolvedType, label);
      });
    }
    return matched;
  };

  const bindEvents = (c) => {
    if (!c?.on) return;

    if (EventNames?.ALL_CLIENT) {
      c.on(EventNames.ALL_CLIENT, (arg1, arg2) => {
        const { eventName, event } = normalizeEventArgs(arg1, arg2, 'unknown');
        const name = eventName || extractEventType(event) || 'unknown';
        ui?.addEvent?.({ side: 'client', name, detail: (typeof event === 'string' ? '' : event) });
      });
    }

    if (EventNames?.ALL_SERVER) {
      c.on(EventNames.ALL_SERVER, (arg1, arg2) => {
        const { eventName, event } = normalizeEventArgs(arg1, arg2, 'unknown');
        const name = eventName || extractEventType(event) || 'unknown';
        ui?.addEvent?.({ side: 'server', name, detail: (typeof event === 'string' ? '' : event) });
        handleServerEvent(event, name, 'all_server');
      });
    }

    if (EventNames?.CONNECTED) {
      c.on(EventNames.CONNECTED, () => setStatus('connected'));
    }
    if (EventNames?.DISCONNECTED) {
      c.on(EventNames.DISCONNECTED, () => setStatus('idle'));
    }
    if (EventNames?.ERROR) {
      c.on(EventNames.ERROR, (arg1, arg2) => {
        const { event } = normalizeEventArgs(arg1, arg2, EventNames.ERROR || 'client.error');
        setStatus('error', event);
      });
    }

    if (EventNames?.AUDIO_USER_SPEECH_STARTED) {
      c.on(EventNames.AUDIO_USER_SPEECH_STARTED, () => onUserSpeechStarted('event_name'));
    }
    if (EventNames?.AUDIO_USER_SPEECH_STOPPED) {
      c.on(EventNames.AUDIO_USER_SPEECH_STOPPED, () => onUserSpeechStopped('event_name'));
    }
    if (EventNames?.AUDIO_AGENT_SPEECH_STARTED) {
      c.on(EventNames.AUDIO_AGENT_SPEECH_STARTED, () => onAgentSpeechStarted('event_name'));
    }
    if (EventNames?.AUDIO_AGENT_SPEECH_STOPPED) {
      c.on(EventNames.AUDIO_AGENT_SPEECH_STOPPED, () => onAgentSpeechStopped('event_name'));
    }

    const directAudioTranscriptBindings = bindEventNamesByPattern({
      label: 'direct_audio_transcript',
      patterns: [
        'conversation.audio_transcript.delta',
        'conversation.audio_transcript.completed',
        'audio_transcript.delta',
        'audio_transcript.completed'
      ],
      handler: (event, eventName, source) => {
        handleUserTranscriptEvent(event, eventName, source);
      }
    });
    hasDirectAudioTranscriptBinding = directAudioTranscriptBindings.length > 0;

    const directConversationMessageBindings = bindEventNamesByPattern({
      label: 'direct_conversation_message',
      patterns: [
        'conversation.message.delta',
        'conversation.message.completed'
      ],
      handler: (event, eventName, source) => {
        handleConversationMessageEvent(event, eventName, source);
      }
    });
    hasDirectConversationMessageBinding = directConversationMessageBindings.length > 0;
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
    const cfg = resolveConfig() || {};
    const desiredDom = videoRenderDomId || '';
    const desiredKey = JSON.stringify({
      baseUrl: cfg.baseUrl || DEFAULT_BASE,
      token: cfg.token || '',
      botId: cfg.botId || '',
      connectorId: cfg.connectorId || '1024',
      roomMode: cfg.roomMode || 'default',
      debug: !!cfg.debug,
      renderDom: desiredDom
    });

    const currentDom = client?._clientConfig?.videoConfig?.renderDom || client?._config?.videoConfig?.renderDom || '';
    const currentKey = client?._miniExplorerConfigKey || '';
    if (client && currentDom === desiredDom && currentKey === desiredKey) return client;

    try {
      client?.disconnect?.();
    } catch (_) {}
    client = null;
    audioEnabled = false;
    videoEnabled = false;
    stopFallbackPreview();
    resetSpeechCaptureState();

    client = new RealtimeClient(buildClientConfig({ videoRenderDomId }));
    client._miniExplorerConfigKey = desiredKey;
    bindEvents(client);
    return client;
  };

  return {
    get status() {
      return status;
    },
    get lastError() {
      return lastError;
    },
    get isVideoAvailable() {
      return cameraPermissionGranted;
    },

    async connect({ enableVideo = false } = {}) {
      let cfg = ensureConfigInteractive();
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
        stopFallbackPreview();
        const needVideo = !!enableVideo;
        const permission = await RealtimeUtils.checkDevicePermission(needVideo);
        if (!permission?.audio) {
          setStatus('error', 'mic_permission_denied');
          return false;
        }
        let useVideo = needVideo;
        if (needVideo && !permission?.video) {
          useVideo = false;
          cameraPermissionGranted = false;
          autoVisionEnabled = false;
          ui?.setCameraHint?.('相机未授权，先用语音模式。开启相机后可恢复看图回答。');
          logLocal('camera_permission_optional_fallback', { needVideo, audio: !!permission?.audio, video: !!permission?.video });
        } else {
          cameraPermissionGranted = true;
          autoVisionEnabled = localStorage.getItem('H5_AUTO_VISION') !== '0';
        }

        const mode = ui?.mode || 'explore';
        const videoRenderDomId = mode === 'companion' ? 'companion-preview' : 'camera-preview';
        const facingMode = mode === 'companion' ? 'user' : 'environment';
        const currentClient = ensureClient({ videoRenderDomId: useVideo ? videoRenderDomId : '' });

        await currentClient.connect();
        setStatus('connected');

        if (useVideo) {
          let sdkVideoEnabled = true;
          try {
            await currentClient.setVideoEnable(true);
          } catch (error) {
            sdkVideoEnabled = false;
            logLocal('sdk_video_enable_error', { phase: 'connect', error: String(error?.message || error) });
          }
          try {
            const preview = await ensureVisiblePreview({ renderDomId: videoRenderDomId, facingMode });
            videoEnabled = true;
            logLocal('preview_ready', {
              phase: 'connect',
              source: preview.source,
              renderDomId: videoRenderDomId,
              sdkVideoEnabled
            });
          } catch (error) {
            videoEnabled = false;
            ui?.setCameraHint?.('视频预览启动失败，可继续语音对话');
            logLocal('preview_error', { phase: 'connect', error: String(error?.message || error) });
          }
        } else {
          stopFallbackPreview();
          videoEnabled = false;
        }

        return true;
      } catch (error) {
        setStatus('error', error);
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
      } catch (error) {
        setStatus('error', error);
        return false;
      }
    },

    async enableVideo() {
      if (!client) return false;
      if (!cameraPermissionGranted) return false;
      if (videoEnabled) return true;
      try {
        const renderDomId = getCurrentVideoRenderDomId();
        const facingMode = getPreferredFacingMode();
        let sdkVideoEnabled = true;
        await client.setVideoEnable(true);
        try {
          const preview = await ensureVisiblePreview({ renderDomId, facingMode });
          logLocal('preview_ready', {
            phase: 'enable_video',
            source: preview.source,
            renderDomId,
            sdkVideoEnabled
          });
        } catch (error) {
          videoEnabled = false;
          setStatus('error', error);
          logLocal('preview_error', { phase: 'enable_video', error: String(error?.message || error) });
          return false;
        }
        videoEnabled = true;
        return true;
      } catch (error) {
        logLocal('sdk_video_enable_error', { phase: 'enable_video', error: String(error?.message || error) });
        setStatus('error', error);
        return false;
      }
    },

    async disableVideo() {
      stopFallbackPreview();
      if (!client) {
        videoEnabled = false;
        resetSpeechCaptureState();
        return;
      }
      if (!videoEnabled) return;
      try {
        await client.setVideoEnable(false);
      } catch (_) {}
      videoEnabled = false;
      resetSpeechCaptureState();
    },

    async disconnect() {
      stopFallbackPreview();
      if (!client) {
        setStatus('idle');
        return;
      }
      try {
        await client.disconnect();
      } catch (error) {
        setStatus('error', error);
        return;
      }
      audioEnabled = false;
      videoEnabled = false;
      cameraPermissionGranted = true;
      resetSpeechCaptureState();
      setStatus('idle');
    },

    setAutoVisionEnabled(enabled) {
      autoVisionEnabled = !!enabled;
      localStorage.setItem('H5_AUTO_VISION', autoVisionEnabled ? '1' : '0');
      if (!autoVisionEnabled) resetSpeechCaptureState();
      logLocal('auto_vision', { enabled: autoVisionEnabled });
      return autoVisionEnabled;
    }
  };
}
