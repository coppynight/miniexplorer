const DEFAULT_BASE = 'https://api.coze.cn';

function getConfig() {
  // For safety, we do NOT hardcode token into repo.
  // Users can set these in localStorage.
  const baseUrl = localStorage.getItem('COZE_BASE_URL') || DEFAULT_BASE;
  const token = localStorage.getItem('COZE_TOKEN') || '';
  const botId = localStorage.getItem('COZE_BOT_ID') || '7598529675404886059';
  return { baseUrl, token, botId };
}

function requireConfig() {
  const cfg = getConfig();
  if (!cfg.token) throw new Error('missing_COZE_TOKEN (set localStorage COZE_TOKEN)');
  if (!cfg.botId) throw new Error('missing_COZE_BOT_ID (set localStorage COZE_BOT_ID)');
  return cfg;
}

async function uploadFile({ blob, filename, contentType }) {
  const { baseUrl, token } = requireConfig();

  const form = new FormData();
  const file = new File([blob], filename, { type: contentType || blob.type || 'application/octet-stream' });
  form.append('file', file);

  const resp = await fetch(`${baseUrl}/v1/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  });

  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch (_) { json = { raw: text }; }

  if (!resp.ok) {
    throw new Error(`upload_failed_http_${resp.status}: ${text}`);
  }
  if (json.code != null && json.code !== 0) {
    throw new Error(`upload_failed_code_${json.code}: ${json.msg || text}`);
  }
  const fileId = json?.data?.id;
  if (!fileId) throw new Error(`upload_missing_file_id: ${text}`);
  return { fileId, json };
}

function inferAudioFileTypeFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('ogg')) return 'ogg_opus';
  if (m.includes('wav')) return 'wav';
  return null;
}

function buildObjectStringItems({ imageFileId, audioFileId, audioMime, promptText }) {
  const items = [];
  if (imageFileId) items.push({ type: 'image', file_id: imageFileId });
  // v1.2 assumption; may need adjust based on Coze error messages
  if (audioFileId) {
    const audio_file_type = inferAudioFileTypeFromMime(audioMime);
    const audioItem = { type: 'audio', file_id: audioFileId };
    if (audio_file_type) audioItem.audio_file_type = audio_file_type;
    items.push(audioItem);
  }
  if (promptText) items.push({ type: 'text', text: String(promptText) });
  return JSON.stringify(items);
}

async function parseStreamForChatIds(resp) {
  const reader = resp.body?.getReader();
  if (!reader) throw new Error('chat_create_stream_no_reader');

  const decoder = new TextDecoder();
  let buffer = '';
  let chatId = null;
  let conversationId = null;
  let lastJson = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const data = trimmed.replace(/^data:\s*/, '');
      if (data === '[DONE]') break;
      try {
        const json = JSON.parse(data);
        lastJson = json;
        if (json?.code != null && json.code !== 0) {
          throw new Error(`chat_create_code_${json.code}: ${json.msg || data}`);
        }
        const cid = json?.data?.id || json?.data?.chat_id;
        const conv = json?.data?.conversation_id;
        if (cid) chatId = cid;
        if (conv) conversationId = conv;
      } catch (e) {
        // ignore non-JSON chunks
      }
    }
  }

  if (!resp.ok) throw new Error(`chat_create_http_${resp.status}`);
  if (!chatId || !conversationId) throw new Error(`chat_create_missing_ids: ${JSON.stringify(lastJson)}`);
  return { chatId, conversationId, json: lastJson };
}

async function createChat({ imageFileId, audioFileId, audioMime, promptText }) {
  const { baseUrl, token, botId } = requireConfig();

  const content = buildObjectStringItems({ imageFileId, audioFileId, audioMime, promptText });
  const useStream = Boolean(audioFileId);

  const payload = {
    bot_id: botId,
    user_id: 'h5-device',
    additional_messages: [
      {
        role: 'user',
        content_type: 'object_string',
        content
      }
    ],
    auto_save_history: true,
    stream: useStream
  };

  const resp = await fetch(`${baseUrl}/v3/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (useStream) {
    return await parseStreamForChatIds(resp);
  }

  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch (_) { json = { raw: text }; }

  if (!resp.ok) throw new Error(`chat_create_http_${resp.status}: ${text}`);
  if (json.code != null && json.code !== 0) throw new Error(`chat_create_code_${json.code}: ${json.msg || text}`);

  const chatId = json?.data?.id;
  const conversationId = json?.data?.conversation_id;
  if (!chatId || !conversationId) throw new Error(`chat_create_missing_ids: ${text}`);

  return { chatId, conversationId, json };
}

async function pollChatStatus({ conversationId, chatId, tries = 25, intervalMs = 300 }) {
  const { baseUrl, token } = requireConfig();

  for (let i = 0; i < tries; i++) {
    const url = `${baseUrl}/v3/chat/retrieve?conversation_id=${encodeURIComponent(conversationId)}&chat_id=${encodeURIComponent(chatId)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch (_) { json = { raw: text }; }

    if (resp.ok && json?.data?.status) {
      const st = json.data.status;
      if (st === 'completed') return { ok: true, status: st, json };
      if (st === 'failed') return { ok: false, status: st, json };
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return { ok: false, status: 'timeout' };
}

function extractTextFromObjectString(content) {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      const t = parsed.find((x) => x && x.type === 'text' && typeof x.text === 'string');
      return t?.text || null;
    }
    if (parsed && typeof parsed === 'object') {
      if (parsed.msg_type === 'time_capsule_recall') return null;
      if (typeof parsed.text === 'string') return parsed.text;
      if (typeof parsed.wraped_text === 'string') return parsed.wraped_text;
    }
  } catch (_) {}
  return null;
}

async function fetchAssistantReply({ conversationId, chatId }) {
  const { baseUrl, token } = requireConfig();
  const url = `${baseUrl}/v3/chat/message/list?conversation_id=${encodeURIComponent(conversationId)}&chat_id=${encodeURIComponent(chatId)}`;

  const resp = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });

  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch (_) { json = { raw: text }; }

  if (!resp.ok) throw new Error(`message_list_http_${resp.status}: ${text}`);
  if (json.code != null && json.code !== 0) throw new Error(`message_list_code_${json.code}: ${json.msg || text}`);

  const messages = json?.data;
  if (!Array.isArray(messages)) return { text: null, json };

  const assistants = messages.filter((m) => m?.role === 'assistant');
  if (!assistants.length) return { text: null, json };

  for (let i = assistants.length - 1; i >= 0; i--) {
    const assistant = assistants[i];
    if (assistant.content_type === 'object_string') {
      const t = extractTextFromObjectString(assistant.content);
      if (t) return { text: t, json };
      continue; // skip non-text object_string (e.g. time_capsule_recall)
    }
    if (assistant.content) return { text: assistant.content, json };
  }

  return { text: null, json };
}

export function initCoze() {
  return {
    getConfig,

    ensureConfigInteractive() {
      const cfg = getConfig();
      if (cfg.token) return cfg;

      const token = window.prompt('请输入 Coze PAT Token（仅存本机 localStorage）');
      if (token) localStorage.setItem('COZE_TOKEN', token.trim());
      const botId = window.prompt('请输入 bot_id（默认已填探索 bot）', cfg.botId);
      if (botId) localStorage.setItem('COZE_BOT_ID', botId.trim());
      return getConfig();
    },

    async runChat({ imageBlob, audioBlob, promptText = '请根据图片与我的语音回答（如需，先复述你看到的内容）。' }) {
      const cfg = this.ensureConfigInteractive();

      const imageUp = imageBlob
        ? await uploadFile({ blob: imageBlob, filename: 'frame.jpg', contentType: 'image/jpeg' })
        : null;

      const audioType = audioBlob?.type || 'application/octet-stream';
      const audioExt = audioType.includes('ogg') ? 'ogg' : (audioType.includes('wav') ? 'wav' : 'dat');
      const audioUp = audioBlob
        ? await uploadFile({ blob: audioBlob, filename: `audio.${audioExt}`, contentType: audioType })
        : null;

      const { chatId, conversationId } = await createChat({
        imageFileId: imageUp?.fileId,
        audioFileId: audioUp?.fileId,
        audioMime: audioType,
        promptText
      });

      const st = await pollChatStatus({ conversationId, chatId });
      if (!st.ok) {
        throw new Error(`chat_status_${st.status}`);
      }

      const reply = await fetchAssistantReply({ conversationId, chatId });
      return {
        replyText: reply.text,
        conversationId,
        chatId,
        debug: { cfg, imageUp, audioUp, status: st, reply }
      };
    }
  };
}
