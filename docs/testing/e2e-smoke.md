# MiniExplorer — E2E 冒烟（Phase 6.1）

## 目标
在不依赖真实 Coze 接通（可用 stub）的前提下，跑通一次 UI 状态流：
Listening → Thinking → Speaking → Idle，并在消息列表中看到 assistant 气泡。

## 证据
- Simulator 截图：`outputs/screenshots/mini-explorer-P6.1-smoke-20260129-124835.png`
- Build：`xcodebuild (iphonesimulator, CODE_SIGNING_ALLOWED=NO) => BUILD SUCCEEDED`

## 步骤（手动）
1. 运行 app，进入 Explore
2. 点击录音按钮开始（Listening）
3. 再点击停止（Thinking）
4. 等待 stub completed（Speaking），看到 assistant 气泡
5. 回到 Idle
