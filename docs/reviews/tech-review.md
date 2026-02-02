# Tech Risk Review — MiniExplorer

- **Date**: 2026-02-02
- **Scope**: Coze JS SDK / WKWebView / Realtime Audio

## Risks & Mitigations
1. **WKWebView 与 Coze JS SDK 兼容性**
   - 风险：WebView 版本差异导致 SDK 初始化失败或事件不触发。
   - 缓解：封装 bridge 层 + ready 事件探测 + 失败重试与降级提示。

2. **实时音频延迟/抖动**
   - 风险：音频分片过大导致延迟，过小导致 CPU/网络压力。
   - 缓解：固定 100–300ms chunk，动态调整阈值；增加缓冲与节流。

3. **回声/音频路由问题**
   - 风险：扬声器与麦克风串扰，导致回声与识别错误。
   - 缓解：启用 AVAudioSession 的 voiceChat 模式；必要时加入回声消除策略。

4. **权限/隐私弹窗阻塞**
   - 风险：摄像头/麦克风权限未授权导致流程卡死。
   - 缓解：在关键路径前预请求权限；未授权给出引导与降级 UI。

5. **网络不稳定/断线恢复**
   - 风险：移动网络波动导致 websocket 断线或音频丢包。
   - 缓解：断线重连 + 指示状态；发送失败时缓存并重试。

6. **前后台切换导致会话中断**
   - 风险：切后台后音频/连接被系统暂停，回前台状态异常。
   - 缓解：监听 App lifecycle，前台恢复时重建连接并刷新 UI 状态。

7. **资源加载路径错误（本地 html/js）**
   - 风险：bundle 路径不正确导致 bridge 无法加载。
   - 缓解：统一 Resource 目录结构 + 启动日志验证“bridge loaded”。

## Notes
- 建议在 Phase 2 前先做 WKWebView 最小化 PoC，确认 JS → Swift 通道可用。
