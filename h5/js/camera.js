let stream = null;
let videoEl = null;
let lastFrameBlob = null;

function getVideoEl() {
  if (!videoEl) {
    videoEl = document.getElementById('camera-preview');
  }
  return videoEl;
}

function pickVideoConstraints() {
  // iPhone Safari: facingMode environment generally works.
  return {
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };
}

export async function initCamera() {
  const el = getVideoEl();
  if (!el) throw new Error('camera-preview element not found');

  // We defer permission prompts until user gesture, but we can also warm up here.
  return {
    async start() {
      if (stream) return stream;
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia_not_supported');
      }
      stream = await navigator.mediaDevices.getUserMedia(pickVideoConstraints());
      el.srcObject = stream;
      await el.play?.().catch(() => {});
      return stream;
    },

    stop() {
      if (!stream) return;
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      lastFrameBlob = null;
      try { el.srcObject = null; } catch (_) {}
    },

    async captureFrame({ quality = 0.82 } = {}) {
      const video = getVideoEl();
      if (!video) throw new Error('camera-preview element not found');
      if (!stream) {
        // Try to start implicitly.
        await this.start();
      }

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) throw new Error('video_not_ready');

      const canvas = document.getElementById('photo-canvas') || document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, w, h);

      const blob = await new Promise((resolve) => {
        canvas.toBlob(
          (b) => resolve(b),
          'image/jpeg',
          quality
        );
      });

      if (!blob) throw new Error('capture_failed');
      lastFrameBlob = blob;
      return blob;
    },

    getLastFrame() {
      return lastFrameBlob;
    }
  };
}
