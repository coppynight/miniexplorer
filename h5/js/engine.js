export class ConversationEngine {
  constructor({ app, ui }) {
    this.app = app;
    this.ui = ui;

    this.mode = 'explore';
    this.cameraFacing = 'environment';
    this.starting = false;
    this.userGestureGranted = false;
  }

  friendlyStartError(reason) {
    const msg = String(reason || '');
    if (msg.includes('missing_COZE_TOKEN')) return '缺少 COZE_TOKEN，请先输入后再试';
    if (msg.includes('missing_COZE_BOT_ID')) return '缺少 COZE_BOT_ID，请先输入后再试';
    if (msg.includes('mic_permission_denied')) return '需要麦克风权限，允许后再点开始';
    if (msg.includes('camera_permission_denied')) return '相机未授权，先用语音模式或开启相机后重试';
    return '连接失败，请重试';
  }

  async enterMode({ mode, cameraFacing }) {
    this.mode = mode;
    this.cameraFacing = cameraFacing;
    this.ui.setMode(mode);

    await this.stop();

    if (!this.userGestureGranted) {
      this.ui.showPermissionOverlay(true);
      this.ui.setState('NEED_PERMISSION', mode);
      return;
    }

    this.ui.showPermissionOverlay(false);
    await this.startAfterUserGesture({ skipPermissionCheck: true, autoStart: true });
  }

  async startAfterUserGesture({ skipPermissionCheck = false, autoStart = false } = {}) {
    if (this.starting) return;
    this.starting = true;
    this.ui.setState('BOOTING', this.mode);

    try {
      // Explore 模式优先尝试视频；若相机未授权会在 realtime 内自动降级到纯语音。
      const needVideo = this.mode === 'explore';

      const connected = await this.app.realtime.connect({ enableVideo: needVideo, skipPermissionCheck });
      if (!connected) {
        this.ui.setErrorHint(this.friendlyStartError(this.app.realtime.lastError));
        if (autoStart) this.ui.showPermissionOverlay(true);
        return;
      }

      const audioReady = await this.app.realtime.enableAudio();
      if (!audioReady) {
        this.ui.setErrorHint(this.friendlyStartError(this.app.realtime.lastError));
        if (autoStart) this.ui.showPermissionOverlay(true);
        return;
      }

      // 若连接时没开上视频，这里再补一次；失败不阻断主链路。
      if (needVideo && this.app.realtime.isVideoAvailable !== false) {
        try {
          await this.app.realtime.enableVideo();
        } catch (_) {}
      }

      this.userGestureGranted = true;
      this.ui.showPermissionOverlay(false);
      this.ui.setState('LISTENING', this.mode);
    } finally {
      this.starting = false;
    }
  }

  async stop() {
    try {
      await this.app.realtime.disableVideo?.();
    } catch (_) {}
    try {
      await this.app.realtime.disconnect();
    } catch (_) {}
  }
}
