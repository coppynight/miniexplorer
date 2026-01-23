# MiniDiscovery API & Data Specification (MVP)

## 1. 概述
本文档定义了 MiniDiscovery 项目的后端接口与数据结构。
**技术栈**: Python (FastAPI) + MongoDB (推荐，Schema Flexible) 或 MySQL。
**Base URL**: `/api/v1`

---

## 2. 数据模型 (Data Schema)

### 2.1 Device (设备表)
用于管理设备信息。
```json
{
  "_id": "ObjectId",
  "device_id": "String (Unique, e.g., 'dev_001')",
  "status": "String (online/offline)",
  "created_at": "Timestamp",
  "last_active": "Timestamp"
}
```

### 2.2 Binding (绑定关系表)
关联家长（微信用户）与设备。
```json
{
  "_id": "ObjectId",
  "user_id": "String (WeChat OpenID)",
  "device_id": "String (Ref -> Device.device_id)",
  "role": "String (admin/viewer)",
  "created_at": "Timestamp"
}
```

### 2.3 Interaction (交互记录表)
核心表，存储每一次“拍照-对话”。
```json
{
  "_id": "ObjectId",
  "device_id": "String",
  "session_id": "String (UUID, 一次完整对话的唯一标识)",
  "timestamp": "Timestamp",
  "media": {
    "image_url": "String (OSS URL)",
    "audio_upload_url": "String (OSS URL, 孩子的音频)",
    "audio_reply_url": "String (OSS URL, AI的TTS音频)"
  },
  "content": {
    "child_text": "String (ASR 结果)",
    "ai_text": "String (Coze 输出)",
    "topic_tags": ["List<String>", "e.g. 动物, 提问"]
  },
  "metadata": {
    "latency_ms": "Integer (端到端耗时)"
  }
}
```

### 2.4 DailyStory (每日故事表)
存储每天生成的汇总故事。
```json
{
  "_id": "ObjectId",
  "device_id": "String",
  "date": "String (YYYY-MM-DD)",
  "story_content": "String (Markdown)",
  "highlight_images": ["List<String> (URLs)"],
  "created_at": "Timestamp"
}
```

---

## 3. 接口定义 (API Endpoints)

### 3.1 设备端接口 (Device API)

#### 3.1.1 上传交互数据 (核心)
设备端拍摄照片并录音后，调用此接口。
*   **POST** `/device/interact`
*   **Request (Multipart/Form-Data)**:
    *   `device_id`: String
    *   `image`: File (image/jpeg)
    *   `audio`: File (audio/wav or pcm)
*   **Response**:
    ```json
    {
      "code": 0,
      "data": {
        "reply_audio_url": "https://oss.../reply.mp3",
        "reply_text": "这是一只小猫...",
        "session_id": "uuid..."
      }
    }
    ```
*   **逻辑**:
    1.  保存 Image/Audio 到临时目录或 OSS。
    2.  调用 ASR 服务 -> `child_text`。
    3.  调用 Coze Explorer Bot (Image + Text) -> `ai_text`。
    4.  调用 TTS 服务 (ai_text) -> `reply_audio_url`。
    5.  异步写入 `Interaction` 数据库。
    6.  返回音频 URL 给设备播放。

#### 3.1.2 心跳 (可选)
*   **POST** `/device/heartbeat`
*   **Body**: `{"device_id": "..."}`
*   **Response**: `{"status": "ok"}`

---

### 3.2 家长端接口 (Parent API)

#### 3.2.1 绑定设备
*   **POST** `/parent/bind`
*   **Body**:
    ```json
    {
      "user_id": "wx_openid_...",
      "device_id": "dev_input_by_user"
    }
    ```
*   **Response**:
    *   Success: `{"code": 0, "msg": "绑定成功"}`
    *   Fail: `{"code": 404, "msg": "设备不存在"}`

#### 3.2.2 获取时间轴 (Timeline)
*   **GET** `/parent/timeline`
*   **Query**: `user_id=...&date=2023-10-27&page=1`
*   **Response**:
    ```json
    {
      "code": 0,
      "data": {
        "list": [
          {
            "id": "interaction_id",
            "time": "10:30",
            "image": "url",
            "q_text": "这是什么？",
            "a_text": "这是..."
          }
        ]
      }
    }
    ```

#### 3.2.3 获取每日故事
*   **GET** `/parent/story`
*   **Query**: `user_id=...&date=YYYY-MM-DD`
*   **Response**: `{"content": "今天宝宝探索了..."}`

#### 3.2.4 触发生成故事 (手动/调试用)
*   **POST** `/parent/story/generate`
*   **Body**: `{"device_id": "...", "date": "..."}`
*   **Response**: `{"task_id": "..."}`

---

## 4. 开发计划 (Action Plan)

### Step 1: 基础设施搭建 (Server)
*   初始化 FastAPI 项目结构。
*   编写 `requirements.txt` (fastapi, uvicorn, pymongo, volcengine, cos-python-sdk-v5 等)。
*   封装 `CozeClient`, `VolcASRClient`, `VolcTTSClient` 类。

### Step 2: 核心链路联调 (Android -> Server)
*   实现 `/device/interact` 接口（Mock 模式：先不接真实 AI，直接返回固定音频）。
*   Android 端实现“长按录音 -> 上传 -> 播放返回音频”的闭环。

### Step 3: AI 能力接入
*   替换 Mock，接入真实的 Coze Bot 和 ASR/TTS。
*   调试延迟，优化流式处理逻辑。

### Step 4: 家长端功能
*   实现绑定接口与数据库存储。
*   实现时间轴 API。
*   开发小程序简单页面。
