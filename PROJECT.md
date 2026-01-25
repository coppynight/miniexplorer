# MiniExplorer - 儿童 AI 探索伙伴

## 项目概述

一款面向 3-6 岁儿童的 AI 探索伙伴 iOS 应用，通过**实时语音 + 图像**交互，用**启发式对话**陪伴孩子认识世界。

## 产品定位

- **目标用户**: 3-6 岁儿童，家长为决策者
- **核心价值**: 激发好奇心，启发式引导，陪伴成长

## 功能模块

### 探索模式
- **交互方式**: 后置摄像头拍摄 + 实时语音对话
- **使用场景**: 孩子看到新事物，拍照问"这是什么"
- **AI 行为**: 识别物体，用启发式问题引导观察和思考

### 陪伴模式
- **交互方式**: 前置摄像头 + 实时语音对话
- **使用场景**: 聊天、讲故事、情景扮演、陪玩
- **AI 行为**: 观察孩子表情，温暖陪伴，互动游戏

## 技术架构

```
┌─────────────────────────────────────────────────────┐
│                 MiniExplorer iOS App                 │
├─────────────────────────────────────────────────────┤
│  探索模式 (后置相机)      陪伴模式 (前置相机)         │
│         │                       │                   │
│         └───────────┬───────────┘                   │
│                     ▼                               │
│          统一实时对话服务                             │
│          CozeRealtimeService                        │
│          - 实时音频流                                │
│          - 图片上传                                  │
│          - WebSocket 连接                           │
├─────────────────────────────────────────────────────┤
│          WKWebView + Coze JS SDK                    │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
               Coze WebSocket API
```

### 技术栈

| 组件 | 技术选型 |
|------|---------|
| 平台 | iOS 16+ |
| UI | SwiftUI |
| 相机 | AVFoundation |
| AI 服务 | Coze WebSocket API |
| JS 桥接 | WKWebView + Coze JS SDK |

### 核心服务

- **CozeRealtimeService**: 统一实时对话，支持音频流 + 图片
- **CameraService**: 相机管理，支持前/后置切换
- **AudioStreamManager**: 实时音频采集和播放

## 项目结构

```
miniexplorer/
├── README.md                 # 项目说明
├── PROJECT.md               # 产品方案（本文件）
├── docs/
│   ├── plans/               # 实现计划
│   │   └── ios-app-implementation.md
│   ├── research/            # 技术调研
│   │   └── realtime-voice-research.md
│   └── archive/             # 历史文档存档
└── ios/                     # iOS 项目代码（待创建）
```

## Coze Bot 配置

### Explorer Bot (探索模式)
- 支持图像理解
- 启发式对话 Prompt
- 儿童友好语言风格

### Companion Bot (陪伴模式)
- 支持图像理解（观察表情）
- 陪伴聊天 Prompt
- 情景互动能力

## 开发阶段

### MVP 功能
1. 探索模式：拍照 + 语音 → AI 启发式回应
2. 陪伴模式：实时语音聊天 + 表情感知
3. 统一的实时对话架构

### 后续迭代
- 陪玩互动：识别玩具，引导情景扮演
- 家长端：探索记录、每日故事
- 多角色：可选陪伴形象

## 参考资源

- [Coze 开放平台](https://www.coze.cn/open)
- [Coze JS SDK](https://github.com/coze-dev/coze-js)
- 技术调研: `docs/research/realtime-voice-research.md`
