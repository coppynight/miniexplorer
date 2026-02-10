export class ConversationEngine {
  constructor({ app, ui }) {
    this.app = app;
    this.ui = ui;

    this.mode = 'explore';
    this.cameraFacing = 'environment';
  }

  async enterMode({ mode, cameraFacing }) {
    this.mode = mode;
    this.cameraFacing = cameraFacing;
    this.ui.setMode(mode);

    await this.stop();

    this.ui.showPermissionOverlay(true);
    this.ui.setState('NEED_PERMISSION', mode);
  }

  async startAfterUserGesture() {
    this.ui.setState('BOOTING', this.mode);

    // Explore 模式：对齐 Coze playground 的“视频通话”链路（开启摄像头 -> 抽帧给模型）
    const needVideo = this.mode === 'explore';

    const connected = await this.app.realtime.connect({ enableVideo: needVideo });
    if (!connected) {
      this.ui.setErrorHint('连接失败，请重试');
      return;
    }

    const audioReady = await this.app.realtime.enableAudio();
    if (!audioReady) {
      this.ui.setErrorHint('麦克风未开启');
      return;
    }

    // 若连接时没能自动开启视频，这里再补一次（不影响音频可用）
    if (needVideo) {
      try {
        await this.app.realtime.enableVideo();
      } catch (_) {}
    }

    this.ui.showPermissionOverlay(false);
    this.ui.setState('LISTENING', this.mode);
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
