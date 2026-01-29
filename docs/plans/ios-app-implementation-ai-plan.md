# MiniExplorer iOS — AI Coding Execution Plan (Task Breakdown + Acceptance Criteria)

> 目标：把 `docs/plans/ios-app-implementation.md` 的“实现计划”补齐为 **适合 AI Coding 执行** 的计划：
> - 任务拆解到可一次性实现/验证的粒度
> - 每个任务包含：目标、输入/输出、步骤要点、验收标准（可运行的命令/可观察结果）
> - 明确“禁止/注意事项”（避免 AI 误操作：签名、真机、交互阻塞等）

## 全局约定（AI 执行规则）

### 证据链验收（强制）
> 每个任务完成后，必须给出 **Evidence Chain**，不接受仅口头/自述“已完成”。

**Evidence Chain 最少包含 3 类证据：**
1) **产出文件证据**：`ls -la <path>` 或 `git diff`（证明文件存在/被修改）
2) **关键内容证据**：`grep`/`sed` 定位关键行（证明内容符合目标）
3) **行为证据**：可重复的命令 + 期望输出（例如 `xcodebuild ...` -> `BUILD SUCCEEDED`）

推荐再加：4) **回归证据**：重复执行/额外 smoke test（证明稳定）。


### 目录约定
- Repo root: `miniexplorer/`
- iOS 工程：`miniexplorer/ios/MiniExplorer.xcodeproj`
- App 源码：`miniexplorer/ios/MiniExplorer/`

### 构建/验证约定（重要）
- 验收要求：**模拟器（iphonesimulator）+ 真机架构（iphoneos/arm64）都要编译通过**。
- 为了让“纯编译”在任何环境可复现（不被 provisioning profile 卡住），两条命令都默认 **禁用签名**：`CODE_SIGNING_ALLOWED=NO`。

推荐构建命令（Phase 1+ 后续都沿用）：
```bash
cd ios

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

- 若出现签名报错：说明 `CODE_SIGNING_ALLOWED=NO` 没生效，或被其它 build setting 覆盖。
- 若出现 `Multiple commands produce ... Info.plist`：说明 Info.plist 配置重复（见 Phase 1 的经验）。

### 交互阻塞约定（Claude Code / TUI）
- 工具可能会卡在 trust/proceed 提示。建议使用 watchdog 策略：
  - 15s 轮询输出
  - **白名单自动处理**：workspace trust + xcodebuild proceed
  - 非白名单提示必须上报人工决策

### 关键经验（来自今天的实际踩坑）
> 注：我尝试用 memory_search 拉“今天记忆”但因 embeddings 配额 429 失败；以下为本 session 中实际发生并验证过的经验总结。
- `xcodebuild` 真机构建会因 provisioning profile 失败，优先用模拟器+禁签名。
- 工程曾出现 `Info.plist` 产物冲突：Copy Bundle Resources 与 ProcessInfoPlistFile 同时产出。
- 当前可行解法：**启用生成 Info.plist（GENERATE_INFOPLIST_FILE=YES）并用 INFOPLIST_KEY_* 注入权限文案**；将旧的 `MiniExplorer/Info.plist` 改名为 `Info.plist.disabled` 避免冲突。
- 当前系统里可能没有 `rg`（ripgrep），脚本/命令需兼容（用 `grep`/`awk`）。

---

## Phase 0 — 原型与评审（可选，但强烈建议）

### P0.1 HTML 原型落地/可运行
- **目标**：可以本地打开原型页面，演示探索/陪伴两种模式基本交互。
- **输入**：`docs/plans/2025-01-25-ui-prototype-design.md`
- **输出**：`prototype/` 目录（若已存在则更新）
- **验收标准**：
  - `open prototype/index.html` 可正常打开
  - Explore/Companion 页面切换正常
  - 按钮/状态至少有 1 个可见反馈（例如录音态动画占位）

### P0.2 UI 评审 checklist 记录
- **目标**：把评审结论写入文档（可追溯）。
- **输出**：`docs/reviews/ui-review.md`（新建）
- **验收标准**：
  - 包含：日期、问题列表、结论、改动 TODO

### P0.3 技术风险评审记录
- **目标**：列出 Coze JS SDK/WKWebView/实时音频等风险与备选。
- **输出**：`docs/reviews/tech-review.md`（新建）
- **验收标准**：
  - 至少 5 条风险 + 对应应对方案

---

## Phase 1 — 项目初始化（已完成，但补齐为可验收任务）

> 状态：**DONE**（模拟器构建通过）。本 phase 的任务用来约束后续 AI 不回归。

### P1.1 工程命名一致性（MiniExplorer）
- **目标**：Xcode target / scheme / SwiftUI App / Tests 命名一致为 MiniExplorer。
- **输出**：
  - `MiniExplorerApp.swift` 存在
  - `MiniExplorerTests`/`MiniExplorerUITests` 命名正确
- **验收标准**：
  - `xcodebuild -list -project ios/MiniExplorer.xcodeproj` 输出 schemes/targets 均为 MiniExplorer*

### P1.2 权限文案（相机/麦克风）
- **目标**：Info.plist 中具备相机/麦克风权限文案。
- **实现要求**（二选一，推荐 A）：
  - A. 使用 `INFOPLIST_KEY_NSCameraUsageDescription` / `INFOPLIST_KEY_NSMicrophoneUsageDescription`
  - B. 使用实际 `Info.plist` 文件
- **验收标准**：
  - 模拟器构建后，app bundle 的 Info.plist 包含上述 key（可以用 `plutil -p` 检查 DerivedData 产物）

### P1.3 AppConfig 占位文件
- **目标**：提供 bot/token 配置入口（先占位）。
- **输出**：`ios/MiniExplorer/Config/AppConfig.swift`
- **验收标准**：
  - `AppConfig` 可被编译引用（构建通过）

### P1.4 构建验证（模拟器）
- **目标**：在无需签名/无需真机 profile 下完成 build。
- **验收标准**：
  - 执行“全局约定”中的 xcodebuild 命令得到 `BUILD SUCCEEDED`

### P1.5 防回归：Info.plist 产物冲突
- **目标**：杜绝 `Multiple commands produce ... Info.plist`。
- **验收标准**：
  - 连续两次 clean build 均不出现该错误

---

## Phase 2 — 统一实时对话服务（WKWebView + Coze JS SDK Bridge）

### P2.1 资源目录与桥接文件落地
- **目标**：在工程内加入 `coze-bridge.html` 与 `coze-bridge.js`，可被 WKWebView 加载。
- **输出**：
  - `ios/MiniExplorer/Resources/coze-bridge.html`
  - `ios/MiniExplorer/Resources/coze-bridge.js`
- **验收标准**：
  - App 启动后可加载本地 html（日志打印“bridge loaded”）
  - 模拟器 build 通过

### P2.2 JS Bridge API 规范（与 Swift 对齐）
- **目标**：定义 JS 侧的稳定接口：connect/sendAudio/sendImage/complete/disconnect + event callbacks。
- **输出**：
  - `docs/specs/coze-bridge-api.md`
  - JS 中实现对应函数（可先 stub）
- **验收标准**：
  - Swift 能通过 `WKScriptMessageHandler` 收到至少 1 个事件（如 `ready`）

### P2.3 Swift 层 CozeRealtimeService 封装（可测试）
- **目标**：Swift 侧提供统一 service，对 UI 暴露连接/发送/状态。
- **输出**：`ios/MiniExplorer/Services/CozeRealtimeService.swift`
- **验收标准**：
  - `connect(botId:)` 能让 `isConnected` 变为 true（可以先 mock，不强制真实连通）
  - 具备 error 状态与错误日志

### P2.4 Bot 切换策略（Explore/Companion 共享服务）
- **目标**：同一个 service 支持切换 botId（模式切换时重连/复用策略明确）。
- **输出**：`docs/specs/mode-switching.md`
- **验收标准**：
  - UI 切换模式时 service 的 botId 变化可观测（日志）
  - 不发生崩溃/死锁

---

## Phase 3 — 相机服务（AVFoundation）

### P3.1 CameraService 最小可用：预览 + 拍照
- **目标**：支持指定前/后摄像头预览 + capturePhoto。
- **输出**：`ios/MiniExplorer/Services/CameraService.swift`
- **验收标准**：
  - 在 ExploreView 显示后置摄像头预览（模拟器可用占位/静态画面，真机可验证）
  - capturePhoto 返回非空（真机）或返回 stub（模拟器）但流程可跑通

### P3.2 图片上传（先 stub，再接入 Coze）
- **目标**：`uploadPhoto` 返回一个 URL（可先本地 file:// 或 mock http）。
- **输出**：`uploadPhoto(_:) async -> URL?`
- **验收标准**：
  - Explore 模式一次对话能拿到“图片 URL”并传给 realtime service（日志可见）

---

## Phase 4 — 音频服务（录音 + 播放 + 分片回调）

### P4.1 AudioService 最小可用：录音回调
- **目标**：长按录音时持续输出音频 chunk（PCM/或编码后）。
- **输出**：`ios/MiniExplorer/Services/AudioService.swift`
- **验收标准**：
  - `startRecording(onAudio:)` 每 100–300ms 至少回调一次 data（或固定帧）
  - `stopRecording()` 后不再回调

### P4.2 播放能力
- **目标**：可播放 AI 返回的音频（先用本地 sample data stub）。
- **验收标准**：
  - playAudio 调用后 `isPlaying` 状态变化正确

### P4.3 与 CozeRealtimeService 串联
- **目标**：录音 chunk 直接送入 realtime service（sendAudio）。
- **验收标准**：
  - 日志可见 sendAudio 被调用，且 complete 后收到 completed/audio 事件（可先 mock）

---

## Phase 5 — UI 实现（Explore/Companion + Components）

### P5.1 ExploreView（探索模式）
- **目标**：全屏预览 + 录音按钮 + 状态提示 + 回复气泡。
- **输出**：`ios/MiniExplorer/Views/ExploreView.swift`
- **验收标准**：
  - UI 可启动、无布局崩溃
  - 长按录音按钮触发 AudioService start/stop

### P5.2 CompanionView（陪伴模式）
- **目标**：前置小预览 + 可爱形象 + 对话展示。
- **输出**：`ios/MiniExplorer/Views/CompanionView.swift`
- **验收标准**：
  - 切换 Tab 时摄像头 position 切换（或模拟器下至少状态切换）

### P5.3 组件：AvatarView / RecordButton
- **目标**：把交互与动画封装成可复用组件。
- **验收标准**：
  - RecordButton 最小点击区域满足 60pt（用 frame 验证）

### P5.4 主界面 TabView 接线
- **目标**：Explore/Companion 可切换，Service 共享。
- **验收标准**：
  - Tab 切换时不会重复创建服务导致多连接（用日志/对象 id 验证）

---

## Phase 6 — 集成测试（端到端）

### P6.1 E2E 冒烟：模拟器跑通一次“录音->完成->回复”
- **目标**：即便 Coze 未真正接通，也能用 mock 走完 UI 状态流。
- **输出**：
  - `ios/MiniExplorer/Mocks/`（mock realtime service）
  - 或 `#if DEBUG` 下的 stub
- **验收标准**：
  - Explore/Companion 两模式都能完成一次完整状态流（Listening->Thinking->Speaking->Idle）

### P6.2 真机验证清单（人工）
- **目标**：列出真机才能验证的项（相机、麦克风权限、拍照、音频）。
- **输出**：`docs/testing/device-checklist.md`
- **验收标准**：
  - 列表包含：权限弹窗、拍照、录音、扬声器播放

---

## Backlog / Known Issues（已知问题与后续清理）

1. `IDERunDestination: Supported platforms for the buildables in the current scheme is empty.`
   - 当前：build 可成功。
   - 触发影响：如果 Xcode Run destinations 选择异常，需要进一步修 scheme/target supported platforms。

2. `ios/MiniExplorer/Info.plist.disabled` 仍可能被 Copy Resources。
   - 当前：不会再导致 Info.plist 冲突，但会被打进 bundle（无害但不优雅）。
   - 后续任务：将其从资源列表移除或删除该文件。

---

## 建议的执行顺序（AI Coding 友好）
1. Phase 2：先把桥接打通（本地 html loaded + ready 事件）
2. Phase 4：音频服务最小闭环（mock realtime）
3. Phase 3：相机服务最小闭环（mock upload）
4. Phase 5：UI 把状态流串起来
5. Phase 6：E2E 冒烟 + 真机 checklist
