# 儿童无屏 AI 探索伙伴 - 技术实施方案（Coze + 豆包）

## 1. 目标与原则
- **交付目标**：完成 MVP 闭环（拍照/录音 → 启发式回应 → 记录 → 每日探索故事/家长端）。  
- **优先技术栈**：大模型与智能体全面采用 **Coze 平台 + 豆包模型**，语音层优先火山引擎（与豆包生态一致）。  
- **体验约束**：端到端延迟 < 3s（WiFi 环境），语音播报清晰亲和；回应遵循“微知识点 + 启发式问题 + 收束”。  
- **安全合规**：默认最小化采集，家长端可控（上传/保存/删除），输出内容走安全过滤。
- **网络策略**：MVP 以 WiFi 为主，预留 eSIM 手表形态 4G 接入，流量由用户自行激活与承担。

## 2. 架构总览
```mermaid
graph TD
    subgraph Device [无屏硬件]
        Cam[摄像头]
        Mic[麦克风]
        Btn[物理按键/长按录音]
        Spk[扬声器]
        IoT[MQTT/HTTP Client]
    end

    subgraph Cloud [业务后端]
        GW[API Gateway + MQTT Broker]
        Auth[设备/用户鉴权]
        Media[对象存储访问层]
        ASR[ASR Proxy (Volcengine)]
        TTS[TTS Proxy (Volcengine)]
        Orchestrator[对话编排/追问判定]
        StoryJob[定时任务/Story 生成]
        DB[(DB: Postgres/Mongo)]
        OSS[OSS/S3]
    end

    subgraph AI [Coze + 豆包]
        Explorer[Coze Bot: 探索伙伴\nDoubao-Vision-Pro]
        Storyteller[Coze Bot: 每日故事\nDoubao-Pro]
        Guard[内容安全策略/过滤]
    end

    subgraph Parent [家长端（微信小程序）]
        Timeline[探索时间线]
        Story[每日探索故事推送]
        Control[权限与偏好设置/小程序消息]
    end

    Mic -->|音频| IoT
    Cam -->|图片| IoT
    Btn -->|触发| IoT
    IoT -->|上传图片/音频| GW
    GW --> Auth
    GW --> OSS
    GW --> ASR
    ASR --> Orchestrator
    OSS --> Orchestrator
    Orchestrator --> Explorer
    Explorer --> Orchestrator
    Orchestrator --> TTS
    TTS --> GW
    GW --> IoT --> Spk

    DB --> StoryJob --> Storyteller --> DB
    DB --> Timeline
    DB --> Story
    Control --> Auth
```

## 3. 模块设计
### 3.1 设备侧（MVP）
- SoC：可运行轻量 Linux/Android，MVP 走 WiFi；预留 eSIM 手表形态 4G 接入（用户自备/激活流量）。  
- 采集：长按拍照 + 录音，录音结束即上传；图片本地压缩。  
- 协议：MQTT 保持长连（指令/状态），HTTP 上传媒体；OTA 预留。  
- 播放：接收音频 URL，下载缓存后播放；失败或弱网时播放友好提示音。  
- 存储：不做本地持久化，仅保留播放所需的短期缓存，定期清理。

### 3.2 云端网关与业务服务
- **Gateway/Broker**：统一鉴权（设备 token + 用户 token），限流，记录指标。  
- **Media 服务**：生成临时上传 URL，统一存储至 OSS/S3，返回 CDN URL。  
- **ASR/TTS Proxy**：封装火山引擎 API，支持流式；抽象成内部 gRPC/HTTP 接口，便于后续替换。  
- **传输安全**：全链路 HTTPS，当前不做额外加密/落盘加密，后续按合规要求补齐。  
- **Orchestrator**：核心编排，职责：
  1) 聚合 `image_url + 语音文本`，调用 Coze Explorer。  
  2) 根据产品追问条件决定是否继续（兴趣信号/why类提问/家长偏好开关）。  
  3) 对 Coze 输出做儿童安全过滤与长度控制，再转 TTS。  
  4) 生成结构化 `ExplorationEvent` 写入 DB。  
- **StoryJob**：定时拉取当日事件，汇总后调用 Coze Storyteller，写回 DB/推送家长端。  
- **Content Guard**：结合 Coze/豆包内容安全接口 + 本地敏感词表，对输出和上传媒体做过滤/拦截。

### 3.3 智能体设计（Coze）
- **Explorer Bot**（主交互）  
  - 模型：Doubao-Vision-Pro（图像+文本）。  
  - 输入：图片 URL、转写文本、孩子昵称/角色、主题偏好/追问开关。  
  - Prompt 重点：  
    * 按 Top5 主题给出“名称/用途/1个小知识 + 1个启发式问题 + 可选30秒内小任务”。  
    * 只在触发条件时追加 1 个追问，且必须明确收束。  
    * 口吻：简短、节奏慢，避免概念堆砌；适合 TTS。  
  - 输出：回应文本、结构化标签（主题、物体/角色标签、是否触发追问、家长安全分级）。
- **Storyteller Bot**（每日故事）  
  - 模型：Doubao-Pro（32k/128k）。  
  - 输入：当日事件列表（时间、图片描述、孩子提问、AI回应、标签）。  
  - 产出：300–500 字故事 + 3 个亲子提问 + 1 个共同行动建议。  
- **内容安全**：在 Coze 中启用安全策略（儿童/家庭友好），并在编排层再次校验。

### 3.4 语音服务
- **ASR**：火山引擎流式识别，返回文本 + 置信度；低置信度时让设备复述确认。  
- **TTS**：火山引擎流式合成，选择儿童友好音色；探索 IP 声线需确认授权后再定制。  
- **延迟优化**：并行上传图片与 ASR；Coze 输出流式转 TTS（收到首句即播）。

### 3.5 家长端（微信小程序）
- 展示：探索时间线（图片/音频回放/AI回应）、每日故事、亲子提问。  
- 控制：上传/保存开关、静音时段、使用时长、敏感过滤强度、一键导出/删除数据。  
- 推送：微信小程序消息推送每日故事/异常行为。  
- 账号：微信登录/绑定设备，优先使用 openid/unionid 做账号关系。

## 4. 核心流程
1. **采集与上传**：设备长按 → 拍照/录音 → 图片压缩上传 OSS → 音频流送 ASR；若检测无网/弱网，直接播报友好提示，终止本次上行。  
2. **理解与生成**：Orchestrator 收到 `image_url + text` → 调 Coze Explorer → 返回短回应 + 启发式问题（含追问标记）。  
3. **安全与播报**：输出经内容安全与长度裁剪 → 调 TTS → 返回音频 URL → 设备播放。  
4. **事件沉淀**：保存 `user_id/device_id/image_url/text/ai_text/topic_tag/followup_flag/safety_level`。  
5. **每日故事**：定时任务汇总当日事件 → 调 Coze Storyteller → 写入故事表 → 推送家长端。  
6. **家长控制**：家长端设置变更同步至设备/网关（MQTT 下发）；禁用上传时只保留实时对话，不存档。

## 5. 数据与模型策略
- **主题路由**：由 Coze 通过视觉/文本自分类到 Top5；置信度低时返回澄清句模板“你拍的是 X 还是 Y？”。  
- **追问条件实现**：Orchestrator 根据历史事件判断“重复拍摄/why类提问/家长偏好”后，在调用 Coze 时添加 `allow_followup=true/false`，并在输出侧强制最多 1 个追问。  
- **短期记忆**：为每个用户维护最近 N 条标签/昵称，随请求注入，提高连续性。  
- **输出控制**：限制 40–60 中文字符/句；不使用复杂术语，优先比喻。  
- **内容过滤**：图片指纹+文本安全；对 ASR 结果低置信度时要求孩子重复。  
- **数据压缩**：图片上传前压缩至 <500KB；音频采样 16k mono，必要时做 VAD 去静音。

## 6. 存储与数据模型（建议）
- **DB**：Postgres（结构化事件/家长设置）；Mongo 亦可。核心表：  
  - `users`、`devices`、`bindings`。  
  - `exploration_events`（image_url, audio_url, child_text, ai_text, topic_tag, followup_flag, safety_level, created_at）。  
  - `stories`（date, user_id, story_md, qa_suggestions）。  
  - `preferences`（safety_mode, followup_level, quiet_hours, upload_policy）。  
- **对象存储**：OSS/S3，默认完整保留；支持导出/分享渲染为图片，水印可选（默认关闭/家长可开）。  
- **索引/检索**：按 user_id + date 建索引；后续可用向量索引做兴趣聚类。  
- **分享产物**：预生成分享图（含封面、标题、可选水印），避免实时渲染卡顿。

## 7. 性能、监控与成本
- **性能目标**：采集→ASR 800ms；Coze 800–1200ms；TTS 首包 <600ms；下载播放 <400ms。  
- **优化**：HTTP/2 + CDN；并行 ASR 与图片上传；流式生成；设备端缓存最近 N 段音频以复播。  
- **监控**：埋点延迟分布、ASR 置信度、Coze token 消耗、TTS 成功率、敏感拦截次数。  
- **成本**：豆包按 token；语音与存储为主成本项，需按日交互量估算 QPS 与预算。

## 8. 迭代里程碑（建议）
- **MVP（2–3 周）**：设备上传→Coze Explorer→TTS 播报；事件落库；家长端时间线+每日故事。  
- **V1（+2 周）**：追问策略完善、家长控制面板、敏感拦截全链路、微信小程序消息推送打通、eSIM/4G 接入方案落地。  
- **V1.1（+1 周）**：IP 声线/皮肤、兴趣聚类标签、弱网/掉线恢复优化、分享图/水印体验。

## 9. 待确认/需要讨论
1) **eSIM 方案**：手表 eSIM 运营商/套餐选择、是否锁网、激活流程（线下/在线）。  
2) **WiFi 配网体验**：BLE 配网 vs SoftAP；是否需要家长端扫码快速配网。  
3) **小程序消息策略**：哪些事件触达（每日故事、异常）、频次与模板数量。  
4) **分享与水印**：默认是否加水印；需不需要自动遮挡孩子昵称/头像。  
5) **账号关系**：是否需要手机号绑定/家长实名，还是完全依赖微信 openid/unionid。
