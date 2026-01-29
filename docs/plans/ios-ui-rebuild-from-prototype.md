# MiniExplorer iOS — UI 重建计划（按 prototype/ HTML 原型还原）

> 目的：把当前“工程验证/调试风格”的 UI 全面替换为项目内 `prototype/` 已实现并确认的儿童友好 UI（配色/阴影/圆角/动画/布局/文案），做到“看起来就是原型”。

## 0. 分工与插单策略（强制）

### 0.1 角色分工
- **PM / Orchestrator（主会话 Alfred）**
  - 负责：拆里程碑、定义验收、排优先级、处理插单，决定是否打断 runner
  - 不负责：写代码/跑长命令
- **dev-runner（持续开发执行者）**
  - 负责：连续写代码、跑 build、产出录屏/截图证据、更新 status.json
  - 通知策略：仅 milestone 或 blocker 时发消息，其余只更新 status.json
- **watchdog/sync（瘦身）**
  - 负责：定时读取 status.json；有变化才推送；超时才告警
  - 不负责：写代码
  - 阻塞检查：只负责触发 debug-runner
- **debug-runner（按需）**
  - 负责：被 watchdog 触发后做阻塞排查（ps/xcodebuild/simctl/logs），写回 status.json notes 并发一条摘要

### 0.2 插单策略
- 默认：**你随时提问不算暂停开发**（dev-runner 继续跑）。
- 只有你明确说“立刻停/转向/优先这个”才会打断 dev-runner。

---

## 1. 执行规则（与此前阶段一致）

### 1.1 证据链验收（强制）
每个任务完成后必须提供 Evidence Chain（至少三类证据）：
1) **产出文件证据**：`git diff --stat` / `ls -la <path>`
2) **关键内容证据**：`grep`/`sed` 定位关键 token/组件/配置
3) **行为证据**：`xcodebuild ...` 输出 `BUILD SUCCEEDED`

推荐额外：
4) **运行证据**：Simulator 录屏/截图（输出到 `outputs/`，但不提交 git）

### 1.2 构建/验证命令（统一）
> 验收时要求：**Simulator + iPhoneOS(arm64) 都能编译通过**。
> 
> - Simulator：正常走模拟器 SDK
> - iPhoneOS(arm64)：用 `iphoneos` SDK 做真机架构编译；为了让“纯编译”在任何环境可复现，默认 **禁用签名**（否则会被 provisioning profile 阻塞）。

```bash
cd /Users/xiaokai/clawd/miniexplorer/ios

# 1) Simulator build
xcodebuild -project MiniExplorer.xcodeproj \
  -scheme MiniExplorer \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  CODE_SIGNING_ALLOWED=NO \
  clean build

# 2) iPhoneOS arm64 compile (no signing)
xcodebuild -project MiniExplorer.xcodeproj \
  -scheme MiniExplorer \
  -configuration Debug \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO \
  clean build
```

### 1.3 版本控制约定
- 每完成一个里程碑（M1/M1.5/M2/M3/M4）做一次 commit。
- `outputs/`（录屏/截图）仅作证据，不提交到 GitHub（已在 .gitignore）。

---

## 2. 设计来源（Single Source of Design）
- `prototype/`（已实现的 HTML 原型，包含可直接对照的布局/动效/配色）
  - `prototype/index.html`
  - `prototype/explore.html`
  - `prototype/companion.html`
  - `prototype/styles.css`（最关键：颜色/阴影/圆角/动效 token）
- `docs/plans/2025-01-25-ui-prototype-design.md`（设计说明与原则）

关键要点摘要（以 prototype/styles.css 为准）：
- 视觉 token：
  - 背景：`--color-bg: #FAFAFA` / `--color-bg-warm: #F5F5F5`
  - 主色：`--color-primary: #4A90D9`
  - 次色：`--color-secondary: #5BBFBA`
  - 强调：`--color-accent: #F5A962`
  - 圆角：`--radius-*`
  - 阴影：`--shadow-*` 与 `--shadow-glow-*`
  - 动画：`--duration-*` 与 `--ease-*`
- Home：中心 AI 球 + 两张入口卡片（看看这是什么 / 和我聊聊天）
- Explore：后摄（全屏/接近全屏）+ 悬浮 AI 球 + 底部大按钮
- Companion：暖背景 + 居中大 AI 球 + 右上角前摄小预览 + 底部大按钮
- Haptic：开始/结束/切换 tab/拍照/AI 说话（真机验证）

---

## 3. 总体里程碑（任务拆解 + 验收）

> 交付顺序：M1（tokens+组件）→ M1.5（Home）→ M2（Explore）→ M3（Companion）→ M4（动效/触觉收尾）。

### M1 — 设计 Token 与基础组件（Theme + UI Kit）
目标：把 `prototype/styles.css` 中的 token 迁移成 SwiftUI Theme，并提供可复用组件。

**输出文件（新增）**
- `ios/MiniExplorer/UI/Theme.swift`
- `ios/MiniExplorer/UI/Components/AIOrbView.swift`
- `ios/MiniExplorer/UI/Components/PrimaryMicButton.swift`
- `ios/MiniExplorer/UI/Components/MiniTabBar.swift`
- （可选替换）`ChatBubbleView.swift` 仅换肤，不改消息逻辑

**实现要点**
- Theme 中显式保留 CSS token 名（注释标注来源：`prototype/styles.css`）
- 录音按钮 hit area ≥ 60pt
- AIOrb 支持状态：idle/listening/thinking/speaking（颜色/光晕/scale）

**验收（Evidence Chain）**
- 文件：`ls -la ios/MiniExplorer/UI/Theme.swift` 等
- 关键 token：`grep -n "colorPrimary" Theme.swift`（或等价）
- 构建：xcodebuild 命令 => `BUILD SUCCEEDED`

---

### M1.5 — Home 首页还原（prototype/index.html）
目标：先把“首页颜值”拉起来（app 第一印象），并提供进入 Explore/Companion 的入口。

**输出文件（新增/改造）**
- `ios/MiniExplorer/Views/HomeView.swift`
- `ContentView.swift`：Home 作为默认入口（无 Tab）

**验收**
- 录屏：展示 Home → 点击“看看这是什么”进入 Explore；返回/再进 Companion
- 截图：Home（对照 prototype 的卡片/球体/阴影/字体）

---

### M2 — Explore UI 还原（prototype/explore.html）
目标：Explore 界面视觉/布局/文案与原型一致。

**页面结构（目标）**
- 后摄预览全屏/近全屏（底部留 safe area 控件区）
- 悬浮 AI 小球（带 glow）
- 底部：PrimaryMicButton

**验收**
- 录屏：Explore 主流程
- 构建：`BUILD SUCCEEDED`

---

### M3 — Companion UI 还原（prototype/companion.html）
目标：Companion 整体更温暖，以“AI 形象为主”。

**页面结构（目标）**
- 背景：暖色/渐变
- 中央：大 AI 球（呼吸动画）
- 右上角：前摄小预览
- 底部：PrimaryMicButton

**验收**
- 录屏：首页→陪伴→主流程

---

### M4 — 动画与触觉统一（收尾）
- 按钮脉冲（Listening）
- AI 呼吸（Idle）/ 说话发光（Speaking）
- Haptic（真机）：开始/结束/拍照/AI 说话

**验收**
- Simulator：动效可见
- 真机：触觉按 `docs/testing/device-checklist.md`

