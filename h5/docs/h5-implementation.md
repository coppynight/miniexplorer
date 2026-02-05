# MiniExplorer H5 研发计划（v1.2）

> 更新：2026-02-05（按 Kai 确认：先跑通**一个模式**；链路本质是 **Chat API (/v3/chat)**；说话时截取当前帧图片发送；收到回复后语音播报；**优先 iPhone**）

## 0. 目标（只做一个模式：探索）
探索模式闭环：
1) 后置摄像头预览（iPhone Safari）
2) 按住说话：开始录音
3) 录音开始瞬间（或按下瞬间）截取当前帧图片
4) 录音结束：将「音频 + 图片」发到 Coze（走 chat 链路）
5) 展示 AI 回复文本
6) 使用 TTS 播报 AI 回复（Web Speech API 优先，必要时后续切 Coze TTS）

## 1. 技术选型与约束（iPhone 优先）
- 技术栈：Vanilla JS + CSS（当前仓库结构保持不变）
- 运行环境：iPhone Safari 优先
- 安全上下文：必须在 `https://` 或 `http://localhost` 下运行（否则相机/麦克风可能不可用）

### 音频策略（iPhone Safari 兼容优先）
- 首选：`MediaRecorder`（如可用）
  - 需要在 iPhone 上探测支持的 mimeType（可能是 `audio/mp4` / `audio/aac` / `audio/webm` 之一）
- 兜底（若 MediaRecorder 不可用或不稳定）：后续再加 WebAudio 录 PCM/WAV（不作为 v1.1 必选）

### TTS 策略
- v1.1：优先使用 `speechSynthesis`（Web Speech API）
- 若 iOS 对 Web Speech 支持不稳定：后续切换为「服务端/Coze 返回音频」方案（不阻塞 v1.1 的文字闭环）

## 2. 项目结构（落地位置）
当前代码目录：`/Users/xiaokai/clawd/miniexplorer-h5/`

```
miniexplorer-h5/
├── index.html
├── css/style.css
├── js/
│   ├── main.js
│   ├── camera.js
│   ├── audio.js
│   ├── coze.js
│   └── ui.js
└── docs/
    └── h5-implementation.md
```

## 3. Phase 拆解（按依赖顺序推进）

### Phase 1：可运行骨架（已完成）
- [x] index.html + 基础 UI
- [x] main.js 初始化流程

验收：本地起 server 打开页面无报错，能看到按钮与状态栏。

### Phase 2：相机预览 + 截帧
- [ ] 后置摄像头预览（优先 environment）
- [ ] 权限拒绝/无设备提示
- [ ] `captureFrame()`：从 video 截取当前帧 -> Blob/DataURL（建议 Blob）

验收：iPhone Safari 能看到后置预览；点击（或按住说话时）能成功截一张图（可先在页面 debug 显示）。

### Phase 3：按住说话录音（iPhone 兼容）
- [ ] `press-and-hold`：按下开始、松开结束（touch + mouse 兼容）
- [ ] 录音状态 UI（按钮态 + status 文案）
- [ ] 输出音频 Blob（格式根据 iPhone 支持探测）

验收：iPhone 上按住录音、松开停止；能拿到一个非空音频 Blob。

### Phase 4：Chat 链路（Coze /v3/chat）
> 目标是“音频 + 图片”进入同一个 chat 请求（additional_messages）并拿到 assistant 回复。

- [ ] COZE-0：配置注入（先硬编码到 `coze.js`，后续做配置页）
  - baseURL（默认 `https://api.coze.cn`）
  - token（PAT）
  - botId（探索 bot）
- [ ] COZE-1：Files API 上传（image/audio） -> `file_id`
  - `POST /v1/files/upload`（multipart/form-data; field=`file`）
  - 返回 `data.id` 作为 `file_id`
- [ ] COZE-2：创建 chat（`POST /v3/chat`）
  - 复刻 iOS 结构：`additional_messages[].content_type = object_string`
  - v1.2 假设音频 item 结构为：`{ "type": "audio", "file_id": "..." }`
  - 图片 item：`{ "type": "image", "file_id": "..." }`
  - 同时附带文本 prompt：`{ "type": "text", "text": "..." }`
- [ ] COZE-3：轮询状态 + 拉取回复
  - `POST /v3/chat/retrieve?conversation_id=...&chat_id=...` 直到 completed/failed
  - `GET /v3/chat/message/list?...` 抽取 role=assistant 的 content（支持 object_string 提取 text）

验收：一次按住说话 -> 截帧 + 录音 -> 上传两个文件 -> /v3/chat 返回 assistant 文本；页面展示并进入 Phase 5 播报。

### Phase 5：播报与体验收敛
- [ ] AI 回复后自动 TTS 播报（speechSynthesis）
- [ ] 失败提示（网络/权限/上传失败/WS 断开）
- [ ] 交互细节：首次引导“点击启动相机/麦克风”（避免权限弹窗打断按住流程）

验收：iPhone 上一次完整闭环：预览 -> 按住说话（自动截帧）-> 收到回复 -> 自动播报。

## 4. iOS 代码已确认的接口（H5 直接复刻）
- Coze Base：`https://api.coze.cn`
- Files Upload：`POST /v1/files/upload`，`Authorization: Bearer <token>`，form field=`file`
- Chat Create：`POST /v3/chat`（payload 结构见 iOS AppModel.analyzeImageWithChat）
- Chat Retrieve：`POST /v3/chat/retrieve?conversation_id=...&chat_id=...`
- Message List：`GET /v3/chat/message/list?conversation_id=...&chat_id=...`

## 5. v1.2 不确定项（需要用真实 API 响应来校准）
- **音频 object_string item 的确切格式**：v1.2 先按 `{type:"audio", file_id:"..."}` 实现；若 API 返回错误，再根据错误信息快速修正。
- iPhone Safari 的录音编码：优先 `MediaRecorder` + 动态选择支持的 mimeType；必要时再加 WebAudio PCM/WAV 兜底。
