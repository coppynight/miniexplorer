# 儿童无屏 AI 探索伙伴 - 最终技术方案

> 本文档整合 Gemini、GPT、Opus 三份技术方案的优点，形成 MVP 阶段的最终实施方案。

---

## 1. 项目目标与原则

### 1.1 交付目标
完成 MVP 闭环：**拍照/录音 → 启发式回应 → 记录 → 每日探索故事 → 家长端查看**

### 1.2 核心原则
- **体验优先**：端到端延迟 < 3s（WiFi 环境）
- **安全合规**：最小化采集，家长可控，输出内容过滤
- **快速验证**：MVP 用 Android 手机模拟硬件，降低开发成本
- **简洁实现**：避免过度设计，聚焦核心功能

### 1.3 技术栈决策

| 模块 | 技术选型 | 理由 |
|------|----------|------|
| 后端 | **Python + FastAPI** | 异步 IO 密集，易集成火山 SDK，开发快 |
| 数据库 | **PostgreSQL** | 稳定可靠，JSON 支持好 |
| 缓存 | **Redis** | 会话状态、限流 |
| 对象存储 | **阿里云 OSS** | 图片、音频文件 |
| AI 核心 | **Coze + 豆包** | 按需求指定 |
| 语音服务 | **火山引擎 ASR/TTS** | 与豆包同生态，儿童音色丰富 |
| 孩子端 MVP | **Android APP** | 用手机模拟无屏设备，快速验证 |
| 家长端 | **微信小程序** | 降低使用门槛 |

---

## 2. 系统架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            客户端层                                      │
├─────────────────────────────┬───────────────────────────────────────────┤
│   孩子端 APP (Android MVP)   │         家长端小程序 (微信)                │
│  - 音量键/屏幕按钮模拟 PTT    │    - 探索时间线                           │
│  - 拍照 + 语音输入            │    - 每日探索故事                         │
│  - 黑屏模式（无视觉依赖）     │    - 亲子对话建议                         │
│  - 语音播放                   │    - 设置与控制                           │
└─────────────────────────────┴───────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            业务服务层 (FastAPI)                          │
├───────────────┬───────────────┬───────────────┬─────────────────────────┤
│   用户服务     │   探索服务     │   内容服务     │      家长服务            │
│ - 微信登录    │ - 会话管理     │ - 故事生成     │  - 时间线查询            │
│ - 设备绑定    │ - 事件记录     │ - 建议生成     │  - 控制设置              │
│              │ - ASR/TTS 编排 │               │  - 数据导出/删除         │
└───────────────┴───────────────┴───────────────┴─────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            AI 能力层                                     │
├─────────────────────────────┬───────────────────────────────────────────┤
│        Coze 智能体平台        │           火山引擎语音服务                 │
│  - Explorer Bot（实时对话）   │    - ASR 语音识别（流式）                  │
│  - Storyteller Bot（每日故事）│    - TTS 语音合成（儿童音色）              │
│  - 豆包视觉模型（图像理解）    │                                           │
└─────────────────────────────┴───────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            数据层                                        │
├───────────────┬───────────────┬───────────────┬─────────────────────────┤
│  PostgreSQL   │    Redis      │   阿里云 OSS   │    定时任务              │
│ - 用户数据    │ - 会话缓存    │ - 图片存储    │  - 故事生成 (21:00)      │
│ - 探索记录    │ - 限流计数    │ - 音频存储    │  - 数据清理              │
│ - 配置数据    │              │               │                         │
└───────────────┴───────────────┴───────────────┴─────────────────────────┘
```

### 2.2 MVP 部署架构

```
┌─────────────────────────────────────────┐
│          阿里云 ECS (单台起步)            │
│  ┌─────────────────────────────────┐   │
│  │     Docker Compose 部署          │   │
│  │  - FastAPI 服务                  │   │
│  │  - PostgreSQL                    │   │
│  │  - Redis                         │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│          云服务（SaaS）                  │
│  - Coze 智能体平台                       │
│  - 火山引擎语音服务                      │
│  - 阿里云 OSS                           │
└─────────────────────────────────────────┘
```

---

## 3. 核心业务流程

### 3.1 孩子端探索流程

```
1. 唤醒与采集
   └─ 孩子按下按键 → 拍照 + 开始录音 → 松开按键 → 结束录音

2. 上传与预处理（并行）
   ├─ 图片压缩上传 OSS → 获取 image_url
   └─ 音频流送 ASR → 获取 child_text

3. 智能体推理
   └─ 后端调用 Coze Explorer Bot
      输入: image_url + child_text + 会话上下文
      输出: 回应文本 + 主题标签

4. 反馈生成
   └─ 回应文本 → 内容安全过滤 → TTS 合成 → 音频 URL → 设备播放

5. 数据沉淀
   └─ 保存探索事件（时间、图片、Q&A、标签）
```

### 3.2 每日故事生成流程

```
1. 定时触发 (每晚 21:00)
2. 查询当日所有探索事件
3. 调用 Coze Storyteller Bot
4. 生成故事 + 亲子建议
5. 保存故事 → 推送家长端
```

### 3.3 延迟优化策略

| 环节 | 目标耗时 | 优化手段 |
|------|---------|---------|
| 图片上传 | < 500ms | 本地压缩至 < 500KB |
| ASR 识别 | < 800ms | 流式识别 |
| Coze 推理 | < 1200ms | 流式输出 |
| TTS 合成 | < 600ms | 流式合成，首包即播 |
| 音频下载 | < 400ms | CDN 加速 |
| **总计** | **< 3s** | 并行 + 流式 |

---

## 4. Coze 智能体设计

### 4.1 Explorer Bot（探索伙伴）

#### 基础配置

```yaml
名称: 小探探
模型: Doubao-Vision-Pro（图像+文本）
温度: 0.7
最大 tokens: 300
```

#### System Prompt

```
# 角色定义
你是"小探探"，一个温暖、有趣的探索伙伴，专门陪伴3-6岁的中国小朋友认识世界。

# 核心原则
1. 【启发优先】不直接给答案，用问题引导孩子观察和思考
2. 【简短表达】每次回复控制在50字以内，用短句，语速慢
3. 【具体生动】用孩子熟悉的事物做比喻（如：像你的小手一样大）
4. 【正向鼓励】赞赏努力和观察，不说"你真聪明"

# 回复结构（必须包含）
1. 确认感：复述孩子看到/问的内容（1句）
2. 微知识：一个简单有趣的小知识（1-2句）
3. 启发问题：一个开放式问题（1句）
4. 收束语：鼓励+下次线索（1句）

# 主题路由
根据图片/问题，归类到以下主题并调整回复风格：
- 家庭物品：强调用途和安全
- 身体健康：强调好习惯
- 天气自然：强调观察
- 动植物：强调特征和生命
- 社会角色：强调关联和体验

# 追问规则
仅在以下情况追问（否则自然收束）：
- 孩子主动问"为什么/怎么/还有呢"
- 孩子回答了你的问题
- 收到标记 [CONTINUE_SIGNAL]

# 安全规则
- 不讨论暴力、恐怖、不适合儿童的内容
- 遇到敏感图片，温和转移："这个我们下次再聊，你今天还看到什么有趣的东西啦？"
- 不提供医疗建议，引导找大人

# 输出格式
直接输出语音文本，不要有表情符号、markdown格式。
用口语化表达，可以有"呀、呢、哦"等语气词。
```

#### 输入变量

| 变量名 | 类型 | 说明 |
|--------|------|------|
| child_name | string | 孩子昵称 |
| child_age | int | 孩子年龄 |
| image_url | string | 拍照图片 URL |
| user_input | string | 孩子语音转文字 |
| session_context | string | 本轮会话上下文 |
| allow_followup | boolean | 是否允许追问 |

#### 输出格式

```json
{
  "reply_text": "回应文本，用于 TTS",
  "topic": "主题分类",
  "keywords": ["关键词1", "关键词2"],
  "should_continue": false
}
```

### 4.2 Storyteller Bot（每日故事）

#### 基础配置

```yaml
名称: 故事讲述者
模型: Doubao-Pro-32k
温度: 0.8
最大 tokens: 800
```

#### System Prompt

```
你是一位温暖的故事讲述者，专门为家长记录孩子的探索旅程。

# 输入数据
孩子昵称：{{child_name}}
年龄：{{age}}岁
今日探索记录：
{{events_summary}}

# 任务
根据孩子今天的探索记录，生成：
1. 一篇 150-200 字的温馨探索故事
2. 3 个家长可以问孩子的开放式问题
3. 1 个 5 分钟内可完成的亲子小任务

# 写作要求
- 故事以第三人称叙述，孩子是主角
- 突出孩子的好奇心和观察力
- 语气温馨、充满爱意
- 避免说教，强调探索的乐趣

# 输出格式（JSON）
{
  "story": "故事内容",
  "questions": ["问题1", "问题2", "问题3"],
  "task": "亲子任务描述"
}
```

---

## 5. API 接口设计

### 5.1 接口总览

| 模块 | 接口 | 方法 | 说明 |
|------|------|------|------|
| 认证 | `/api/v1/auth/wechat-login` | POST | 微信登录 |
| 认证 | `/api/v1/auth/bind-device` | POST | 绑定设备（手动输入 device_id） |
| 探索 | `/api/v1/explore/interact` | POST | 孩子端核心交互 |
| 探索 | `/api/v1/explore/events` | GET | 查询探索事件 |
| 家长 | `/api/v1/parent/timeline` | GET | 获取时间线 |
| 家长 | `/api/v1/parent/story` | GET | 获取每日故事 |
| 家长 | `/api/v1/parent/settings` | PUT | 更新设置 |
| 系统 | `/api/v1/upload` | POST | 文件上传 |

### 5.2 核心接口详情

#### 5.2.1 孩子端交互接口

**POST /api/v1/explore/interact**

```python
# 请求
class ExploreRequest(BaseModel):
    device_id: str              # 设备 ID
    session_id: str | None      # 会话 ID（续聊时传入）
    image_url: str | None       # 图片 OSS 地址
    audio_url: str | None       # 语音 OSS 地址
    continue_signal: bool = False  # 是否继续追问

# 响应
class ExploreResponse(BaseModel):
    session_id: str             # 会话 ID
    event_id: str               # 探索事件 ID
    reply_text: str             # AI 回复文本
    reply_audio_url: str        # 回复语音 URL
    topic: str                  # 识别的主题
    should_continue: bool       # 是否等待追问
```

#### 5.2.2 文件上传接口

**POST /api/v1/upload**

```python
# 请求 (multipart/form-data)
# - file: 文件
# - type: "image" | "audio"
# - device_id: 设备 ID

# 响应
class UploadResponse(BaseModel):
    url: str      # OSS 访问地址
    key: str      # OSS key
```

#### 5.2.3 家长时间线接口

**GET /api/v1/parent/timeline**

```python
# 请求参数
# - child_id: 孩子 ID
# - date: YYYY-MM-DD（默认今天）
# - page, page_size

# 响应
class TimelineResponse(BaseModel):
    date: str
    summary: dict  # {total_events, top_topics, keywords}
    events: list   # 探索事件列表
```

#### 5.2.4 每日故事接口

**GET /api/v1/parent/story**

```python
# 请求参数
# - child_id: 孩子 ID
# - date: YYYY-MM-DD（默认今天）

# 响应
class StoryResponse(BaseModel):
    id: str
    date: str
    story: str           # 探索故事文本
    questions: list      # 亲子问题建议
    task: str            # 亲子任务
    event_count: int     # 当日事件数
```

### 5.3 错误码定义

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1001 | 参数错误 |
| 1002 | 认证失败 |
| 1003 | 权限不足 |
| 2001 | 文件上传失败 |
| 2002 | 文件格式不支持 |
| 3001 | AI 服务调用失败 |
| 3002 | 语音服务调用失败 |
| 4001 | 内容安全拦截 |
| 5001 | 服务内部错误 |

---

## 6. 数据库设计

### 6.1 ER 图

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   parents   │──1:N──│  children   │──1:N──│   events    │
└─────────────┘       └─────────────┘       └─────────────┘
                            │                     │
                           1:1                   N:1
                            │                     │
                            ▼                     ▼
                     ┌─────────────┐       ┌─────────────┐
                     │  settings   │       │  sessions   │
                     └─────────────┘       └─────────────┘

┌─────────────┐
│   stories   │
└─────────────┘
```

### 6.2 表结构

#### 6.2.1 家长表 (parents)

```sql
CREATE TABLE parents (
    id              VARCHAR(36) PRIMARY KEY,
    wechat_openid   VARCHAR(64) UNIQUE NOT NULL,
    wechat_unionid  VARCHAR(64),
    nickname        VARCHAR(50),
    avatar_url      VARCHAR(500),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_parents_openid ON parents(wechat_openid);
```

#### 6.2.2 孩子表 (children)

```sql
CREATE TABLE children (
    id              VARCHAR(36) PRIMARY KEY,
    parent_id       VARCHAR(36) NOT NULL REFERENCES parents(id),
    nickname        VARCHAR(50) NOT NULL,
    birth_date      DATE,
    gender          VARCHAR(10),  -- male/female/unknown
    device_id       VARCHAR(64),  -- 绑定的设备 ID
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active       BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_children_parent ON children(parent_id);
CREATE INDEX idx_children_device ON children(device_id);
```

#### 6.2.3 孩子设置表 (child_settings)

```sql
CREATE TABLE child_settings (
    id                      VARCHAR(36) PRIMARY KEY,
    child_id                VARCHAR(36) UNIQUE NOT NULL REFERENCES children(id),
    photo_upload_enabled    BOOLEAN DEFAULT TRUE,
    audio_save_enabled      BOOLEAN DEFAULT TRUE,
    quiet_hours_start       TIME,
    quiet_hours_end         TIME,
    daily_limit_minutes     INT DEFAULT 60,
    content_filter_level    VARCHAR(20) DEFAULT 'standard',  -- strict/standard
    more_questions_mode     BOOLEAN DEFAULT FALSE,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 6.2.4 会话表 (sessions)

```sql
CREATE TABLE sessions (
    id              VARCHAR(36) PRIMARY KEY,
    child_id        VARCHAR(36) NOT NULL REFERENCES children(id),
    started_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at        TIMESTAMP,
    event_count     INT DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'active',  -- active/closed
    context         JSONB  -- 会话上下文
);

CREATE INDEX idx_sessions_child ON sessions(child_id);
CREATE INDEX idx_sessions_status ON sessions(status);
```

#### 6.2.5 探索事件表 (explore_events)

```sql
CREATE TABLE explore_events (
    id                  VARCHAR(36) PRIMARY KEY,
    child_id            VARCHAR(36) NOT NULL REFERENCES children(id),
    session_id          VARCHAR(36) REFERENCES sessions(id),

    -- 孩子输入
    image_url           VARCHAR(500),
    image_oss_key       VARCHAR(200),
    child_audio_url     VARCHAR(500),
    child_text          TEXT,

    -- AI 响应
    ai_reply_text       TEXT NOT NULL,
    ai_reply_audio_url  VARCHAR(500),

    -- 元数据
    topic               VARCHAR(50),
    keywords            TEXT[],
    coze_conversation_id VARCHAR(100),

    -- 时间与状态
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_ms         INT,
    is_deleted          BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_events_child ON explore_events(child_id);
CREATE INDEX idx_events_created ON explore_events(created_at);
CREATE INDEX idx_events_child_date ON explore_events(child_id, created_at);
```

#### 6.2.6 每日故事表 (daily_stories)

```sql
CREATE TABLE daily_stories (
    id              VARCHAR(36) PRIMARY KEY,
    child_id        VARCHAR(36) NOT NULL REFERENCES children(id),
    story_date      DATE NOT NULL,

    story_text      TEXT NOT NULL,
    questions       JSONB NOT NULL,     -- ["问题1", "问题2", "问题3"]
    task            TEXT NOT NULL,

    event_count     INT DEFAULT 0,
    top_topics      TEXT[],

    is_pushed       BOOLEAN DEFAULT FALSE,
    pushed_at       TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(child_id, story_date)
);

CREATE INDEX idx_stories_child ON daily_stories(child_id);
CREATE INDEX idx_stories_date ON daily_stories(story_date);
```

---

## 7. 语音服务方案

### 7.1 火山引擎 ASR（语音识别）

```yaml
服务: 火山引擎一句话识别
模型: 通用中文模型
采样率: 16000 Hz
音频格式: WAV / MP3
最大时长: 60 秒
模式: 流式识别（降低延迟）
```

#### 儿童语音优化

```python
# 常见童言童语映射
CHILD_SPEECH_MAP = {
    "这个什个": "这是什么",
    "为什么呀为什么": "为什么",
    "它它它": "它",
}

# 低置信度处理
if confidence < 0.6:
    return "你可以再说一遍吗？"
```

### 7.2 火山引擎 TTS（语音合成）

```yaml
服务: 火山引擎语音合成
输出格式: MP3
采样率: 24000 Hz
语速: 0.85（略慢，适合儿童）
模式: 流式合成（首包即播）
```

#### 推荐音色

| 音色 ID | 名称 | 特点 |
|--------|------|------|
| zh_female_qingxin | 清新女声 | 年轻活泼（默认） |
| zh_female_wenrou | 温柔女声 | 温暖亲切 |
| zh_male_yangguang | 阳光男声 | 正能量 |

---

## 8. 孩子端 APP 方案（Android MVP）

### 8.1 核心设计

MVP 阶段使用 Android 手机模拟无屏硬件：

```
┌─────────────────────────────────────────┐
│          孩子端 APP（黑屏模式）           │
│                                         │
│     交互方式：                           │
│     - 音量键 或 屏幕大按钮 = PTT 按键     │
│     - 短按 = 拍照                        │
│     - 长按 = 录音                        │
│                                         │
│     状态指示（微弱光效）：                │
│     🟢 就绪  🔴 录音中  🔵 处理中         │
│                                         │
└─────────────────────────────────────────┘
```

### 8.2 技术选型

```yaml
语言: Kotlin
最低 SDK: Android 8.0 (API 26)
音频录制: AudioRecord
音频播放: MediaPlayer / ExoPlayer
相机: CameraX
网络: Retrofit + OkHttp
```

### 8.3 核心流程

```kotlin
// 主交互控制器
class ExploreController {

    // 短按：拍照并提问
    fun onShortPress() {
        val photo = camera.takePicture()
        playPrompt("你想问什么？")
        startRecording()
    }

    // 长按结束：发送请求
    fun onLongPressEnd() {
        val audio = stopRecording()
        sendExploreRequest(photo, audio)
    }

    // 发送请求并播放回复
    suspend fun sendExploreRequest(photo: File?, audio: File) {
        // 1. 并行上传
        val (imageUrl, audioUrl) = coroutineScope {
            val img = async { photo?.let { api.upload(it, "image") } }
            val aud = async { api.upload(audio, "audio") }
            img.await() to aud.await()
        }

        // 2. 调用探索接口
        val response = api.explore(imageUrl, audioUrl)

        // 3. 播放 AI 回复
        playAudio(response.replyAudioUrl)
    }
}
```

---

## 9. 家长端小程序方案

### 9.1 页面结构

```
pages/
├── index/              # 首页（时间线）
├── story/              # 每日故事
├── child/
│   ├── bindDevice/     # 绑定设备
│   └── settings/       # 孩子设置
├── event/
│   └── detail/         # 探索事件详情（可回放）
└── profile/
    └── index/          # 我的
```

### 9.2 核心页面

#### 首页（时间线）

```
┌─────────────────────────────────────┐
│  [孩子头像] 小明的探索               │
│  2024-01-15                         │
├─────────────────────────────────────┤
│  ┌─────────────────────────────────┐│
│  │ 📖 今日探索故事 [查看>]          ││
│  │ 小明今天发现了3个有趣的东西...   ││
│  └─────────────────────────────────┘│
├─────────────────────────────────────┤
│  今日摘要: 探索5次 | 动植物、家庭物品 │
├─────────────────────────────────────┤
│  14:30  [图片] [播放]               │
│  "妈妈，这个花是什么？"              │
│  主题: 动植物                        │
│─────────────────────────────────────│
│  11:20  [图片] [播放]               │
│  "为什么要刷牙？"                   │
│  主题: 身体健康                      │
└─────────────────────────────────────┘
```

#### 每日故事页

```
┌─────────────────────────────────────┐
│  📖 小明的探索故事                   │
│  2024年1月15日                       │
├─────────────────────────────────────┤
│  今天小明变成了一个小小探险家...      │
│  [故事正文，150-200字]               │
├─────────────────────────────────────┤
│  💬 和孩子聊聊                       │
│  1. 你今天看到的花是什么颜色的？      │
│  2. 你觉得小蜜蜂为什么喜欢花？        │
│  3. 明天你想去哪里探索？             │
├─────────────────────────────────────┤
│  🎯 亲子小任务                       │
│  一起去阳台看看还有什么花在开放       │
├─────────────────────────────────────┤
│  [分享给家人]                        │
└─────────────────────────────────────┘
```

### 9.3 设备绑定流程（MVP 简化版）

```
1. 家长微信登录小程序
2. 点击"绑定设备"
3. 手动输入 device_id（设备端显示）
4. 绑定成功
```

---

## 10. 内容安全方案

### 10.1 多层防护

```
┌─────────────────────────────────────────────────────────┐
│  第1层：输入过滤                                         │
│  - 图片：阿里云内容安全 API                              │
│  - 语音/文字：敏感词库过滤                               │
├─────────────────────────────────────────────────────────┤
│  第2层：Prompt 约束                                      │
│  - System Prompt 明确禁止内容                           │
│  - 遇到敏感内容温和转移                                  │
├─────────────────────────────────────────────────────────┤
│  第3层：输出审核                                         │
│  - AI 回复过敏感词库                                     │
│  - 异常内容告警                                          │
├─────────────────────────────────────────────────────────┤
│  第4层：家长监督                                         │
│  - 所有对话可回放                                        │
│  - 异常内容推送家长                                      │
└─────────────────────────────────────────────────────────┘
```

### 10.2 敏感词库（示例）

```python
SENSITIVE_WORDS = [
    # 儿童不宜
    "死", "杀", "血", "鬼", "恐怖",
    # 不良引导
    "打人", "偷", "骗",
    # 隐私安全
    "地址", "电话", "密码",
]
```

---

## 11. 成本估算（1000 DAU）

| 服务 | 单价 | 日用量估算 | 月成本 |
|------|------|-----------|--------|
| 豆包 API (Coze) | ¥0.008/千tokens | 50万 tokens/天 | ¥120 |
| 火山 ASR | ¥0.006/15秒 | 5000次/天 | ¥900 |
| 火山 TTS | ¥0.002/千字符 | 100万字符/天 | ¥60 |
| 阿里云 OSS | ¥0.12/GB | 10GB/天 | ¥36 |
| 阿里云 ECS | ¥300/月 | 1台 | ¥300 |
| 内容安全 | ¥0.0025/张 | 5000张/天 | ¥375 |
| **月度总计** | | | **≈ ¥1,800** |

---

## 12. 资源准备清单

### 12.1 平台账号与 API Key

| 平台 | 所需资源 |
|------|---------|
| **Coze (扣子)** | 账号、Space、两个 Bot（Explorer, Storyteller）、Personal Access Token、Bot ID |
| **火山引擎** | 开通语音技术服务、Access Key (AK)、Secret Key (SK) |
| **阿里云** | OSS Bucket、内容安全服务、ECS 实例 |
| **微信开放平台** | 小程序 AppID、AppSecret |

### 12.2 环境变量配置

```bash
# 数据库
DB_HOST=localhost
DB_PORT=5432
DB_NAME=minidiscovery
DB_USER=postgres
DB_PASSWORD=xxx

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# 阿里云 OSS
OSS_ACCESS_KEY_ID=xxx
OSS_ACCESS_KEY_SECRET=xxx
OSS_BUCKET=minidiscovery
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com

# Coze
COZE_API_KEY=xxx
COZE_EXPLORER_BOT_ID=xxx
COZE_STORYTELLER_BOT_ID=xxx

# 火山引擎
VOLC_ACCESS_KEY=xxx
VOLC_SECRET_KEY=xxx
VOLC_APP_ID=xxx

# 内容安全
ALIYUN_GREEN_ACCESS_KEY=xxx
ALIYUN_GREEN_SECRET=xxx

# 微信
WECHAT_APP_ID=xxx
WECHAT_APP_SECRET=xxx
```

---

## 13. MVP 开发任务

### Phase 1: 基础设施
- [ ] 搭建 FastAPI 项目结构
- [ ] 配置 PostgreSQL + Redis
- [ ] 配置阿里云 OSS
- [ ] 接入 Coze 平台，创建两个 Bot
- [ ] 接入火山引擎语音服务

### Phase 2: 核心功能
- [ ] 实现探索交互接口（/explore/interact）
- [ ] 实现文件上传接口
- [ ] 实现微信登录 + 设备绑定
- [ ] 孩子端 Android APP 开发
- [ ] 家长端小程序开发（时间线、设置）

### Phase 3: 故事生成
- [ ] 实现每日故事生成定时任务
- [ ] 故事页面展示
- [ ] 微信模板消息推送

### Phase 4: 安全与优化
- [ ] 接入内容安全审核
- [ ] 延迟优化（流式处理）
- [ ] 测试与 Bug 修复

---

## 14. 待后续迭代

以下功能 MVP 暂不实现：

- [ ] 多角色切换（当前仅"小探探"）
- [ ] 离线支持
- [ ] 多孩子管理
- [ ] 数据统计分析
- [ ] eSIM/4G 接入
- [ ] 定制硬件（ESP32）
- [ ] IP 声线定制
