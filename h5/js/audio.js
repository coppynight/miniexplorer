let audioStream = null;
let mediaRecorder = null;
let chunks = [];
let lastAudioBlob = null;
let wavRecorder = null;

function pickMimeType() {
  if (!window.MediaRecorder) return null;
  const candidates = [
    'audio/ogg;codecs=opus'
  ];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch (_) {}
  }
  return '';
}

function createWavRecorder(stream) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AC();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const buffers = [];

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    buffers.push(new Float32Array(input));
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  return {
    audioContext,
    source,
    processor,
    buffers,
    stop() {
      try { processor.disconnect(); } catch (_) {}
      try { source.disconnect(); } catch (_) {}
      try { audioContext.close(); } catch (_) {}
    }
  };
}

function resampleToTarget(data, sourceRate, targetRate) {
  if (sourceRate === targetRate) return data;
  const ratio = sourceRate / targetRate;
  const newLength = Math.round(data.length / ratio);
  const out = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, data.length - 1);
    const t = srcIndex - i0;
    out[i] = data[i0] * (1 - t) + data[i1] * t;
  }
  return out;
}

function encodeWav(buffers, sampleRate) {
  const length = buffers.reduce((acc, b) => acc + b.length, 0);
  const data = new Float32Array(length);
  let offset = 0;
  for (const b of buffers) {
    data.set(b, offset);
    offset += b.length;
  }

  const targetRate = 16000;
  const pcm = resampleToTarget(data, sampleRate, targetRate);

  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);

  function writeString(o, s) {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcm.length * 2, true);

  let idx = 44;
  for (let i = 0; i < pcm.length; i++) {
    let s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(idx, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    idx += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function initAudio() {
  return {
    async ensureStream() {
      if (audioStream) return audioStream;
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia_not_supported');
      }
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      return audioStream;
    },

    get isRecording() {
      return !!mediaRecorder && mediaRecorder.state === 'recording';
    },

    async start() {
      if (this.isRecording) return;
      await this.ensureStream();
      chunks = [];
      lastAudioBlob = null;

      const mimeType = pickMimeType();
      if (mimeType) {
        const options = { mimeType };
        mediaRecorder = new MediaRecorder(audioStream, options);

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        const stopped = new Promise((resolve) => {
          mediaRecorder.onstop = () => resolve();
        });

        mediaRecorder.start();
        return { stopped };
      }

      wavRecorder = createWavRecorder(audioStream);
      return { stopped: Promise.resolve() };
    },

    async stop() {
      if (wavRecorder) return await this.stopWav();
      if (!mediaRecorder) return null;
      if (mediaRecorder.state === 'inactive') return lastAudioBlob;

      const waitStop = new Promise((resolve) => {
        const prev = mediaRecorder.onstop;
        mediaRecorder.onstop = (ev) => {
          try { prev?.(ev); } catch (_) {}
          resolve();
        };
      });

      mediaRecorder.stop();
      await waitStop;

      const type = mediaRecorder.mimeType || (chunks[0] && chunks[0].type) || 'audio/ogg;codecs=opus';
      const blob = new Blob(chunks, { type });
      lastAudioBlob = blob;
      return blob;
    },

    async stopWav() {
      if (!wavRecorder) return null;
      const { audioContext, buffers } = wavRecorder;
      const sampleRate = audioContext.sampleRate || 44100;
      wavRecorder.stop();
      wavRecorder = null;
      const blob = encodeWav(buffers, sampleRate);
      lastAudioBlob = blob;
      return blob;
    },

    getLastAudio() {
      return lastAudioBlob;
    },

    teardown() {
      if (audioStream) {
        audioStream.getTracks().forEach((t) => t.stop());
        audioStream = null;
      }
      if (wavRecorder) {
        try { wavRecorder.stop(); } catch (_) {}
        wavRecorder = null;
      }
      mediaRecorder = null;
      chunks = [];
      lastAudioBlob = null;
    }
  };
}
