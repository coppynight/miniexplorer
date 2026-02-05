let audioStream = null;
let mediaRecorder = null;
let chunks = [];
let lastAudioBlob = null;

function pickMimeType() {
  if (!window.MediaRecorder) return null;
  const candidates = [
    'audio/mp4',
    'audio/aac',
    'audio/webm;codecs=opus',
    'audio/webm',
    ''
  ];
  for (const type of candidates) {
    if (!type) return '';
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch (_) {}
  }
  return '';
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
      const options = mimeType ? { mimeType } : undefined;
      mediaRecorder = new MediaRecorder(audioStream, options);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      const stopped = new Promise((resolve) => {
        mediaRecorder.onstop = () => resolve();
      });

      mediaRecorder.start();
      return { stopped };
    },

    async stop() {
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

      const type = mediaRecorder.mimeType || (chunks[0] && chunks[0].type) || 'audio/webm';
      const blob = new Blob(chunks, { type });
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
      mediaRecorder = null;
      chunks = [];
      lastAudioBlob = null;
    }
  };
}
