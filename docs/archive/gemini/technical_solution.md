# 儿童无屏 AI 探索伙伴 - 技术实施方案

## 1. 总体架构设计

本方案旨在实现一款低延迟、高互动的儿童无屏 AI 硬件。核心逻辑依托 **Coze 智能体平台** 与 **豆包大模型**，外围辅以语音服务（ASR/TTS）和物联网（IoT）接入服务。

### 1.1 系统组成
系统主要包含四个部分：
1.  **终端设备（Device）**：负责采集图像与语音，播放音频反馈。
2.  **业务网关（Backend Server）**：负责设备连接、鉴权、流媒体转发、持久化存储。
3.  **智能体服务（Coze/Doubao）**：负责多模态理解（视觉+文本）、对话逻辑生成、每日故事生成。
4.  **家长端（Parent App/MiniProgram）**：展示探索记录、控制设备设置、接收日报。

### 1.2 架构图
```mermaid
graph TD
    subgraph Device [智能硬件终端]
        Camera[摄像头]
        Mic[麦克风]
        Spk[扬声器]
        IoT_Client[MQTT/HTTP 客户端]
    end

    subgraph Cloud_Service [业务后端服务]
        Gateway[API Gateway / MQTT Broker]
        BizLogic[业务逻辑服务]
        DB[(数据库 MySQL/Mongo)]
        OSS[对象存储 OSS]
    end

    subgraph AI_Platform [Coze / 豆包生态]
        ASR[语音转文字 (Volcengine/Doubao)]
        TTS[文字转语音 (Volcengine/Doubao)]
        CozeBot[Coze 智能体 (Explorer)]
        CozeStory[Coze 智能体 (Storyteller)]
    end

    subgraph Parent_App [家长端小程序]
        Timeline[探索时间轴]
        Report[每日故事]
        Control[权限控制]
    end

    %% Data Flow
    Mic -->|录音| IoT_Client
    Camera -->|拍照| IoT_Client
    IoT_Client -->|上传音视频/图片| Gateway
    Gateway -->|存文件| OSS
    Gateway -->|音频流| ASR
    ASR -->|文本| BizLogic
    OSS -->|图片URL| BizLogic
    
    BizLogic -->|用户输入+图片| CozeBot
    CozeBot -->|识别 & 回应文本| BizLogic
    BizLogic -->|记录日志| DB
    BizLogic -->|回应文本| TTS
    TTS -->|音频文件| Gateway
    Gateway -->|下发播放| IoT_Client
    IoT_Client -->|播放| Spk

    %% Async Tasks
    DB -->|每日数据聚合| CozeStory
    CozeStory -->|生成故事| DB
    DB -->|同步| Timeline
    DB -->|推送| Report
```

---

## 2. 核心技术选型

### 2.1 大模型与智能体 (AI Core)
按照需求，全面采用 **Coze 平台** + **豆包大模型**。

*   **Coze Space**: 创建一个专属的空间用于管理两个核心 Bot。
*   **Model**:
    *   **Doubao-Vision-Pro**: 用于图像理解（物体识别、场景分析）。
    *   **Doubao-Pro-32k/128k**: 用于对话逻辑、上下文记忆和故事生成。

#### 智能体 1：探索伙伴 (Explorer Agent)
*   **输入**: 图片 URL, 孩子语音转换后的文本。
*   **技能/Plugins**:
    *   `ImageUnderstanding`: 调用视觉模型描述图片内容（识别物体、场景、颜色、状态）。
    *   `KnowledgeBase`: 预置适龄的百科知识（可选，依托大模型自身知识库通常足够）。
    *   `Memory`: 记忆孩子的昵称、最近的兴趣点（短期记忆）。
*   **Prompt/人设**:
    *   风格：拟人化、热情、好奇、语言简练（适合TTS朗读）。
    *   逻辑：遵循产品文档的 `识别 -> 简述 -> 启发提问` 流程。
*   **输出**: 回应文本（用于TTS），元数据（识别到的标签，用于App分类）。

#### 智能体 2：故事讲述者 (Storyteller Agent)
*   **触发机制**: 定时任务（如每晚 20:00）。
*   **输入**: 当天所有的交互记录（时间、图片描述、孩子的问题、AI的回答）。
*   **Prompt/人设**:
    *   以“孩子是主角”的第三人称叙事。
    *   串联当天的碎片探索，形成一个完整的小故事。
*   **输出**: 约 300-500 字的故事文本。

### 2.2 语音交互 (Voice Interaction)
鉴于 Coze 目前主要处理文本/多模态，为了保证**低延迟**和**高质量音色**，建议在业务层独立接入语音服务：
*   **ASR (语音转文字)**: 推荐 **火山引擎 (Volcengine) ASR**，支持流式识别，响应快。
*   **TTS (文字转语音)**: 推荐 **火山引擎 (Volcengine) TTS**。
    *   *关键点*: 选择适合儿童的音色（如“奶萌音”、“卡通角色音”）。
    *   *优化*: 开启流式合成，缩短首字播放延迟。

### 2.3 硬件通信协议
*   **MQTT (Message Queuing Telemetry Transport)**:
    *   适用于弱网环境（户外移动）。
    *   省电（保持长连接心跳）。
    *   用于指令下发（如“开始录音”、“播放结束”、“远程关机”）。
*   **HTTP/Upload**:
    *   用于大文件传输（上传照片、长录音文件）。

---

## 3. 详细业务流程 (Life Cycle)

### 3.1 核心交互流程 (The "Explorer" Loop)
1.  **唤醒与采集**:
    *   孩子按下按键，设备拍照并开始录音。
    *   松开按键，设备结束录音。
2.  **上传与预处理**:
    *   设备将照片上传至 OSS，获取 `image_url`。
    *   设备将音频流传给后端 ASR 服务，获取 `child_text`。
3.  **智能体推理 (Coze)**:
    *   后端调用 Coze API (`POST /v3/chat`)。
    *   Payload: `{ "image": image_url, "video": null, "text": child_text }`。
    *   Coze Agent 执行：
        *   分析图片 -> "这是一只橘猫在睡觉"。
        *   结合 `child_text` ("这是什么？")。
        *   生成回应 -> "这是一只正在睡懒觉的橘猫哦。你看它的胡须在动吗？这是它在做梦呢。你猜它梦到了什么？"。
4.  **反馈生成**:
    *   后端收到 Coze 文本回应。
    *   调用 TTS 生成 MP3 音频。
    *   将音频 URL 下发给设备。
    *   设备下载并播放。

### 3.2 数据沉淀 (The "Memory" Loop)
*   每一次交互（RequestID）生成的图片、Q&A 对，存入 MySQL/MongoDB。
*   字段包含：`timestamp`, `image_url`, `child_text`, `ai_text`, `topic_tag` (由 Coze 分析返回)。

### 3.3 每日总结 (The "Story" Loop)
*   **Trigger**: 定时任务触发。
*   **Action**: 查询 `user_id` 当日所有记录。
*   **Coze Call**: 调用 Storyteller Agent，输入记录列表。
*   **Result**: 获得 Markdown 格式故事，保存至数据库，通过 App 推送告知家长。

---

## 4. 关键指标与风险控制

### 4.1 延迟 (Latency)
儿童互动的耐心有限，目标端到端延迟 < 3秒 (Wifi环境)。
*   **优化策略**:
    *   照片压缩后上传（降低上传时间）。
    *   ASR 流式识别（说话结束即出结果）。
    *   **Coze 流式输出 (Streaming)**: 后端可以在收到 Coze 的首句文本时，立即请求 TTS，实现“边想边说”。

### 4.2 成本 (Cost)
*   **Doubao/Coze**: 按 Token 计费，相对低廉。
*   **ASR/TTS**: 语音服务是主要持续成本，需预估每日交互次数。
*   **OSS**: 图片存储成本，建议定期归档或清理非收藏图片。

### 4.3 安全与合规
*   **内容过滤**: 在 Coze 中配置敏感词过滤插件，确保 AI 不输出不适宜儿童的内容。
*   **隐私**: 所有的图像和语音数据需遵循 GDPR/国内个人信息保护法，家长有权一键删除。

---

## 5. 阶段性实施策略 (已更新)

根据最新的决策（Android 验证 -> ESP32 量产；体验优先），实施路线图如下：

### 5.1 第一阶段：Android 原型验证 (Current)
*   **硬件载体**: 闲置 Android 手机。
*   **交互模拟**:
    *   **按键**: 使用 `音量键` 或 `屏幕大按钮` 模拟物理 PTT (Push-to-Talk) 按键。
    *   **无屏**: App 运行在全屏模式，界面仅显示调试日志或黑色背景，强迫不依赖视觉反馈。
*   **通信协议**:
    *   直接使用 HTTP/WebSocket，暂不引入 MQTT（除非为了提前验证协议）。
    *   利用 Android 原生 AudioRecord/MediaPlayer 处理音频。
*   **优势**: 开发速度快，算力充足（可在本地做 VAD 语音活动检测），方便调试 ASR/TTS 效果。

### 5.3 技术栈决策 (Finalized)
*   **后端框架**: Python (FastAPI)
    *   利用其异步特性 (`async def`) 处理 I/O 密集型任务（如 OpenAI/Coze 接口调用、OSS 上传）。
    *   易于集成 Volcengine SDK。
*   **设备绑定策略 (MVP)**:
    *   **设备端**: 无论是 Android 还是 ESP32，持有固定或生成的唯一 `device_id`。
    *   **家长端**: 登录后，提供一个输入框手动输入 `device_id` 进行绑定。
    *   *优势*: 方便内测分发，无需开发复杂的扫码配对流程，支持多家庭并行测试。

---

## 6. 资源准备清单 (即刻行动)

为了启动开发，需要您准备以下平台的 API Key：

1.  **Coze (扣子) 国内版**:
    *   账号与 Space。
    *   创建两个 Bot 的壳子（Explorer, Storyteller）。
    *   获取 `Personal Access Token` 和 `Bot ID`。
2.  **火山引擎 (Volcengine)**:
    *   开通 **语音技术 (语音识别 & 语音合成)** 服务。
    *   获取 `Access Key` (AK) 和 `Secret Key` (SK)。
    *   *注：为了追求极致体验，我们将使用流式接口。*
