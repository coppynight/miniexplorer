# MiniExplorer H5 研发计划（v1.3）

> 更新：2026-02-06（UI 重构 + 陪伴模式追加）
> 目标：复刻 iOS 逻辑的同时，UI/UX 必须严格还原 `prototype` 的高保真设计；新增陪伴模式。

## 0. 目标（两个模式 + 高保真 UI）
1) **探索模式（Explore）**：后置镜头 + 按住说话 + 拍照发 Coze + 语音播报（已调通 v1.2，需换肤）。
2) **陪伴模式（Companion）**：**新增**。前置镜头 + 纯语音对话（无需截帧，只发音频） + 3D/拟人化形象动画。
3) **UI/交互还原**：参考 `tmp/miniexplorer-gh/prototype` 的视觉规范（CSS 变量、动画、布局）。

## 1. 技术栈与约束（不变）
- Vanilla JS + CSS（无框架）。
- 优先 iPhone Safari（MediaRecorder）。
- 链路：`/v1/files/upload` (audio/image) -> `/v3/chat` (object_string) -> 轮询 -> 播报。

## 2. Phase 拆解（UI 优先，功能追加）

### Phase 1-4（已完成 v1.2 核心链路）
- [x] Camera/Audio/Coze 基础类库。
- [x] 探索模式核心闭环（拍照+录音+对话）。
- [x] Stream: false 修复。

### Phase 5：UI 重构（Visual Overhaul）
> 目标：将现有“黑底白字调试风”重构为 `prototype` 的“小探探”风格。

- [ ] **Global CSS**：引入 `prototype/styles.css` 的变量体系（Nunito 字体、圆角、阴影、渐变）。
- [ ] **Home 首页**：实现 `index.html` 的引导页（Avatar 动效 + 两个模式入口卡片）。
- [ ] **Explore UI 换肤**：
  - 移除旧的调试 log 面板，改为浮层提示。
  - 底部控制栏：`main-btn` 样式还原（idle/listening/speaking 状态切换）。
  - 中间取景框：`camera-viewfinder` 四角样式。
  - AI 指示器：`ai-indicator`（表情包动效：😊/😮/🥰）。
- [ ] **交互微调**：点击“开始对话”进入全屏 -> 按住说话交互适配新按钮。

### Phase 6：陪伴模式（Companion Mode）
> 目标：纯语音聊天，前置摄像头画中画（可选），强调 Avatar 交互。

- [ ] **页面结构**：复用 `prototype/companion.html` 布局。
- [ ] **模式切换**：从 Home 点击进入陪伴模式（此时调用 `camera.setup(front)`）。
- [ ] **业务逻辑**：
  - 仅录音（不截图，或者仅作为可选）。
  - 视觉核心是 `companion-sphere` 的呼吸/说话动画（CSS 动画）。
  - Coze 链路：只发 audio item，不发 image item。

### Phase 7：工程收尾
- [ ] 代码整理：将 CSS/JS 模块化（`ui-home.js`, `ui-explore.js`, `ui-companion.js`）。
- [ ] 敏感配置：确保 localStorage 逻辑健壮，避免每次刷新丢失。
- [ ] 最终真机验收。
