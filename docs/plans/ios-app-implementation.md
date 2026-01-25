# MiniExplorer iOS App 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建 iOS 儿童 AI 探索伙伴应用，探索模式和陪伴模式共用统一的实时语音+图片架构

**Architecture:** 统一实时对话服务，两种模式仅摄像头和 Bot 不同

**Tech Stack:** Swift/SwiftUI, WKWebView + Coze JS SDK, AVFoundation

---

## 统一架构

```
┌─────────────────────────────────────────────────────────────┐
│                      MiniExplorer iOS                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐              ┌─────────────┐               │
│  │  探索模式    │              │  陪伴模式    │               │
│  │ 后置摄像头   │              │ 前置摄像头   │               │
│  │ Explorer Bot │              │ Companion Bot│               │
│  └──────┬──────┘              └──────┬──────┘               │
│         │                            │                      │
│         └──────────┬─────────────────┘                      │
│                    ▼                                        │
│         ┌─────────────────────┐                             │
│         │ 统一实时对话服务      │                             │
│         │ CozeRealtimeService │                             │
│         │ - 实时音频流         │                             │
│         │ - 图片上传          │                             │
│         │ - WebSocket 管理    │                             │
│         └──────────┬──────────┘                             │
│                    │                                        │
│         ┌──────────▼──────────┐                             │
│         │ WKWebView + JS SDK  │                             │
│         └──────────┬──────────┘                             │
└────────────────────┼────────────────────────────────────────┘
                     ▼
              Coze WebSocket API
```

## 模式对比

| 项目 | 探索模式 | 陪伴模式 |
|------|---------|---------|
| 摄像头 | 后置 | 前置 |
| Bot ID | Explorer Bot | Companion Bot |
| 图片 | 每次对话附带 | 每次对话附带 |
| UI | 相机全屏预览 | 可爱形象 + 小预览 |

---

## Phase 0: 设计与评审

### Task 0.1: UI 原型设计（HTML）

**目标:** 使用 HTML/CSS 制作可交互原型，验证视觉和交互设计

**产出文件:**
- `prototype/index.html` - 原型入口
- `prototype/explore.html` - 探索模式原型
- `prototype/companion.html` - 陪伴模式原型
- `prototype/assets/` - 图片资源

**儿童 UI 设计原则:**
- 大按钮（最小 60pt 点击区域）
- 高对比度、明亮色彩
- 圆角设计、无尖锐边缘
- 无文字依赖（图标为主）
- 即时视觉反馈（动画）
- 简单手势（点击、长按）

**原型内容:**
1. 探索模式界面
   - 全屏相机预览区
   - 底部大录音按钮
   - 录音状态动画
   - AI 回复气泡样式

2. 陪伴模式界面
   - 可爱形象（居中）
   - 小型前置相机预览（角落）
   - 状态动画（听/说）
   - 对话气泡

3. 模式切换 Tab
   - 图标设计
   - 选中状态

**完成标准:** 原型可在浏览器中预览，模拟真实交互流程

---

### Task 0.2: UI 设计评审

**评审清单:**

| 评审项 | 检查点 |
|--------|--------|
| 儿童友好度 | 按钮够大？颜色合适？无文字依赖？ |
| 交互清晰度 | 孩子能理解如何操作吗？ |
| 视觉一致性 | 两个模式风格统一吗？ |
| 反馈明确性 | 录音/播放状态够明显吗？ |
| 安全性 | 无误触退出风险？ |

**评审方式:**
- 截图/录屏展示
- 收集反馈
- 迭代修改

**通过标准:** 评审意见已处理，设计稿确认

---

### Task 0.3: 技术方案评审

**评审内容:**

1. **架构合理性**
   - 统一实时对话服务设计
   - WKWebView + JS SDK 桥接方案
   - 音频流处理方案

2. **Coze API 验证**
   - WebSocket 多模态支持确认
   - 图片上传方式（file_url vs file_id）
   - 音频格式兼容性

3. **技术风险**
   - JS SDK 在 WKWebView 中的兼容性
   - 实时音频延迟
   - 内存占用

4. **备选方案**
   - 如果 JS SDK 不可用，备选方案是什么？

**评审方式:**
- 文档评审
- 关键技术点 POC 验证

**通过标准:** 技术风险已识别并有应对方案

---

## Phase 1: 项目初始化（手工完成）

### Task 1.1: 创建 Xcode 项目

**执行者:** 用户手工完成

**操作步骤:**
1. 打开 Xcode
2. File → New → Project
3. 选择 iOS → App
4. 配置:
   - Product Name: `MiniExplorer`
   - Interface: `SwiftUI`
   - Language: `Swift`
   - 取消勾选 Include Tests
5. 保存到 `miniexplorer/ios/` 目录

**完成后通知 Claude 继续**

---

### Task 1.2: 配置权限

**File:** `ios/MiniExplorer/Info.plist`

添加:
```xml
<key>NSCameraUsageDescription</key>
<string>小探探需要使用相机来看看你发现了什么</string>
<key>NSMicrophoneUsageDescription</key>
<string>小探探需要听听你说的话</string>
```

---

### Task 1.3: 创建配置文件

**File:** `ios/MiniExplorer/Config/AppConfig.swift`

```swift
import Foundation

enum AppConfig {
    static let cozeAPIBase = "https://api.coze.cn"
    static let cozeAccessToken = "YOUR_TOKEN"

    // 探索模式 Bot
    static let explorerBotID = "YOUR_EXPLORER_BOT_ID"
    // 陪伴模式 Bot
    static let companionBotID = "YOUR_COMPANION_BOT_ID"

    // 音频参数
    static let audioSampleRate: Double = 24000
    static let audioChannels: Int = 1
    static let audioBitDepth: Int = 16
}
```

---

## Phase 2: 统一实时对话服务

### Task 2.1: JS Bridge HTML

**File:** `ios/MiniExplorer/Resources/coze-bridge.html`

```html
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
<script type="module">
import { WebsocketsChat } from 'https://unpkg.com/@coze/api@latest/dist/index.esm.js';
window.CozeWebsocketsChat = WebsocketsChat;
</script>
<script src="coze-bridge.js"></script>
</body>
</html>
```

---

### Task 2.2: JS Bridge 逻辑

**File:** `ios/MiniExplorer/Resources/coze-bridge.js`

核心功能:
- `connect(config)` - 建立 WebSocket 连接
- `sendAudio(base64)` - 发送音频数据
- `sendImage(url)` - 发送图片消息
- `complete()` - 结束输入，等待回复
- `disconnect()` - 断开连接

事件回调:
- `audio` - 收到音频数据
- `completed` - 对话完成
- `error` - 错误

---

### Task 2.3: Swift 服务封装

**File:** `ios/MiniExplorer/Services/CozeRealtimeService.swift`

```swift
@MainActor
class CozeRealtimeService: NSObject, ObservableObject {
    @Published var isConnected = false
    @Published var isSpeaking = false

    func connect(botId: String) async throws
    func sendAudio(_ data: Data)
    func sendImage(_ url: URL)
    func completeInput()
    func disconnect()
}
```

---

## Phase 3: 相机服务

### Task 3.1: 统一相机管理

**File:** `ios/MiniExplorer/Services/CameraService.swift`

```swift
@MainActor
class CameraService: NSObject, ObservableObject {
    @Published var previewLayer: AVCaptureVideoPreviewLayer?

    func setup(position: AVCaptureDevice.Position)
    func capturePhoto() async -> UIImage?
    func uploadPhoto(_ image: UIImage) async -> URL?
}
```

---

## Phase 4: 音频服务

### Task 4.1: 实时音频管理

**File:** `ios/MiniExplorer/Services/AudioService.swift`

```swift
@MainActor
class AudioService: ObservableObject {
    @Published var isRecording = false
    @Published var isPlaying = false

    func startRecording(onAudio: @escaping (Data) -> Void)
    func stopRecording()
    func playAudio(_ data: Data)
}
```

---

## Phase 5: UI 实现

### Task 5.1: 探索模式视图

**File:** `ios/MiniExplorer/Views/ExploreView.swift`

按照 HTML 原型实现:
- 全屏相机预览
- 底部录音按钮
- 状态动画
- AI 回复气泡

---

### Task 5.2: 陪伴模式视图

**File:** `ios/MiniExplorer/Views/CompanionView.swift`

按照 HTML 原型实现:
- 可爱形象居中
- 小型前置相机预览
- 状态动画
- 对话展示

---

### Task 5.3: 可爱形象组件

**File:** `ios/MiniExplorer/Views/Components/AvatarView.swift`

- 卡通形象
- 听/说状态动画
- 呼吸动画

---

### Task 5.4: 录音按钮组件

**File:** `ios/MiniExplorer/Views/Components/RecordButton.swift`

- 大圆形按钮
- 长按录音
- 状态颜色变化
- 波纹动画

---

### Task 5.5: 主界面

**File:** `ios/MiniExplorer/App/ContentView.swift`

```swift
TabView {
    ExploreView()
        .tabItem { Label("探索", systemImage: "camera.fill") }
    CompanionView()
        .tabItem { Label("陪伴", systemImage: "face.smiling.fill") }
}
```

---

## Phase 6: 集成测试

### Task 6.1: 端到端测试

**测试用例:**

| 场景 | 步骤 | 预期结果 |
|------|------|---------|
| 探索模式基本流程 | 拍照 → 说话 → 松开 | AI 语音回复 |
| 陪伴模式基本流程 | 说话 → 松开 | AI 语音回复 |
| 模式切换 | 点击 Tab 切换 | 界面正确切换，相机切换 |
| 网络异常 | 断网后操作 | 友好提示 |

---

## 附录 A: Coze Bot 配置

### Explorer Bot (探索模式)
- 模型: 支持视觉的模型
- Prompt: 启发式探索引导（参考原有设计）

### Companion Bot (陪伴模式)
- 模型: 支持视觉的模型
- Prompt: 陪伴聊天、观察表情、情景互动

---

## 附录 B: 里程碑

| 阶段 | 产出 | 检查点 |
|------|------|--------|
| Phase 0 | HTML 原型 | UI 评审通过 |
| Phase 0 | 技术方案 | 技术评审通过 |
| Phase 1 | Xcode 项目 | 项目可运行 |
| Phase 2-4 | 核心服务 | 服务可单独测试 |
| Phase 5 | UI 实现 | 界面与原型一致 |
| Phase 6 | 集成测试 | 端到端流程通过 |
