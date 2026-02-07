let stream = null;
let activeVideoEl = null;
let lastFrameBlob = null;

export async function initCamera() {
  // Return instance
  return {
    async start({ facingMode = 'environment', elementId = 'camera-preview' } = {}) {
      // 1. Stop existing if any
      this.stop();

      // 2. Find new element
      const el = document.getElementById(elementId);
      if (!el) throw new Error(`Video element #${elementId} not found`);
      activeVideoEl = el;

      // 3. Get stream
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia_not_supported');
      }

      const constraints = {
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        el.srcObject = stream;
        await el.play?.().catch(() => {}); // Autoplay might fail, ignore
        return stream;
      } catch (e) {
        console.error('Camera start failed', e);
        throw e;
      }
    },

    stop() {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
      lastFrameBlob = null;
      if (activeVideoEl) {
        try { activeVideoEl.srcObject = null; } catch (_) {}
        activeVideoEl = null;
      }
    },

    async captureFrame({ quality = 0.82 } = {}) {
      if (!activeVideoEl || !stream) {
        // Try to recover? Or just fail.
        throw new Error('camera_not_active');
      }
      const video = activeVideoEl;

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) throw new Error('video_not_ready');

      // Use the global hidden canvas
      const canvas = document.getElementById('photo-canvas') || document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      
      const ctx = canvas.getContext('2d');
      // Mirror if front camera? usually preview is mirrored but capture shouldn't be?
      // For simplicity, raw capture.
      ctx.drawImage(video, 0, 0, w, h);

      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
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
