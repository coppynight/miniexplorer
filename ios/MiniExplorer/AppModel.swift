import Foundation
import AVFoundation
import Combine
import UIKit

/// Phase 5: Shared app-level state & services.
///
/// Goals:
/// - Keep a single instance of realtime/audio/camera services.
/// - Provide a single place to coordinate mode switching (Explore vs Companion).
@MainActor
final class AppModel: ObservableObject {
    enum Mode: String, CaseIterable {
        case explore
        case companion
    }

    enum ConversationState: String {
        case idle
        case listening
        case thinking
        case speaking
        case error
    }

    @Published var mode: Mode = .explore
    @Published var conversation: ConversationState = .idle

    /// Prevent rapid toggle / inconsistent UI state when starting/stopping audio.
    @Published var isMicBusy: Bool = false
    @Published var errorMessage: String? = nil
    @Published var messages: [ChatMessage] = [
        ChatMessage(role: .system, text: "欢迎来到探索模式。按住说话，或拍照提问。")
    ]

    // Shared services (do not recreate on tab switches)
    let realtime = CozeRealtimeService()
    let audio = AudioService()
    let camera = CameraService()

    private var connectedBotId: String? = nil

    private var didBoot = false
    private var cancellables = Set<AnyCancellable>()

#if DEBUG
    private var didAutoSmoke = false
#endif

    /// Boot only the non-invasive parts (no camera, no network).
    func bootBasicsIfNeeded() {
        guard !didBoot else { return }
        didBoot = true

#if DEBUG
        // NOTE: Disabled by default for UI-only review videos (no recording).
        // autoSmokeIfNeeded()
#endif

        // Observe realtime events and drive a minimal state machine.
        realtime.$lastEventType
            .sink { [weak self] type in
                guard let self else { return }
                switch type {
                case "completed":
                    if self.audio.isRecording {
                        return
                    }
                    self.conversation = .speaking
                    let reply = self.realtime.lastCompletedText ?? "（收到回复：stub）"
                    self.messages.append(ChatMessage(role: .assistant, text: reply))
                    // Auto settle back to idle.
                    Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 900_000_000)
                        if self.conversation == .speaking { self.conversation = .idle }
                    }
                default:
                    break
                }
            }
            .store(in: &cancellables)

        realtime.$lastErrorMessage
            .compactMap { $0 }
            .sink { [weak self] message in
                self?.reportError("Coze: \(message)")
            }
            .store(in: &cancellables)

        realtime.$isConnected
            .removeDuplicates()
            .sink { [weak self] connected in
                if connected {
                    self?.errorMessage = nil
                }
            }
            .store(in: &cancellables)

// DEBUG auto-connect removed; connectIfNeeded() handles this.
    }

    private func reportError(_ message: String) {
        errorMessage = message
        conversation = .error
        messages.append(ChatMessage(role: .system, text: "⚠️ \(message)"))
    }

    /// Enter a mode (invokes camera setup + realtime connect).
    func enterMode(_ newMode: Mode) {
        mode = newMode

        // Reset conversation UI state when switching modes.
        conversation = .idle
        errorMessage = nil
        realtime.lastErrorMessage = nil

        if !AppConfig.useRealtimeVideo {
            switch newMode {
            case .explore:
                camera.setup(position: .back)
            case .companion:
                camera.setup(position: .front)
            }
        }

        connectIfNeeded()
    }

    private func connectIfNeeded() {
        let botId: String
        switch mode {
        case .explore: botId = AppConfig.explorerBotID
        case .companion: botId = AppConfig.companionBotID
        }

        // Avoid spamming connect calls.
        guard connectedBotId != botId else { return }
        connectedBotId = botId
        NSLog("[ModeSwitch] switching botId -> %@", botId)

        Task {
            do {
                let enableVideo = AppConfig.useRealtimeVideo
                let videoDevice: String? = enableVideo ? (mode == .explore ? "environment" : "user") : nil
                let mirrorVideo: Bool? = enableVideo ? (mode == .explore) : nil
                try await realtime.connect(
                    botId: botId,
                    enableVideo: enableVideo,
                    videoInputDeviceId: videoDevice,
                    mirrorVideo: mirrorVideo
                )
#if DEBUG
                messages.append(ChatMessage(role: .system, text: "已连接 bot: \(botId)"))
#endif
            } catch {
                reportError("连接失败：\(String(describing: error))")
            }
        }
    }

    /// User intent: toggle mic (start/stop). Handles permission + race prevention.
    func toggleTalking() {
        Task { @MainActor in
            guard !isMicBusy else { return }
            isMicBusy = true
            defer { isMicBusy = false }

            if audio.isRecording {
                stopTalking()
                return
            }

            // Permission gate (device-only).
            let ok = await audio.ensureRecordPermission()
            guard ok else {
                reportError("麦克风权限未开启，请在设置中允许 MiniExplorer 使用麦克风")
                return
            }

            startTalking()

            // If startRecording failed (e.g. session category/engine start error), settle to error.
            if !audio.isRecording {
                let reason = audio.lastError ?? "unknown"
                reportError("开始录音失败：\(reason)")
            }
        }
    }

    func startTalking() {
        guard !audio.isRecording else { return }

        conversation = .listening
        messages.append(ChatMessage(role: .user, text: "🎙️（开始说话…）"))

        audio.startRecording { [weak self] data in
            guard let self else { return }
            self.realtime.sendAudio(data)
        }
    }

    func stopTalking() {
        guard audio.isRecording else {
            // If UI thought we're recording but audio didn't start, just normalize state.
            if conversation == .listening { conversation = .idle }
            return
        }
        audio.stopRecording()
        conversation = .thinking
        realtime.completeInput()
        messages.append(ChatMessage(role: .user, text: "✅（结束）"))
    }

    func captureAndSendPhoto() async {
        if AppConfig.useRealtimeVideo {
            return
        }
        let img = await camera.capturePhoto()
        guard let img else {
            reportError("拍照失败")
            return
        }

        let previewData = img.jpegData(compressionQuality: 0.6)
        messages.append(ChatMessage(role: .user, text: "📷 我拍了这个", imageData: previewData))

        let file = await camera.uploadPhoto(img)
        guard let file else {
            reportError("上传失败")
            return
        }
        let label = file.fileName ?? file.id
        messages.append(ChatMessage(role: .system, text: "✅ 图片已上传：\(label)"))

        if !realtime.isConnected {
            let targetBot = connectedBotId ?? (mode == .explore ? AppConfig.explorerBotID : AppConfig.companionBotID)
            let enableVideo = AppConfig.useRealtimeVideo
            let videoDevice: String? = enableVideo ? (mode == .explore ? "environment" : "user") : nil
            let mirrorVideo: Bool? = enableVideo ? (mode == .explore) : nil
            try? await realtime.connect(
                botId: targetBot,
                enableVideo: enableVideo,
                videoInputDeviceId: videoDevice,
                mirrorVideo: mirrorVideo
            )
        }
        realtime.sendImage(file, prompt: "请看看这张图片并回答")

        if AppConfig.useChatImageFallback {
            let targetBot = connectedBotId ?? (mode == .explore ? AppConfig.explorerBotID : AppConfig.companionBotID)
            Task { @MainActor in
                if let reply = await self.analyzeImageWithChat(botId: targetBot, fileId: file.id) {
                    if reply.contains("看不到") || reply.contains("无法看到") || reply.contains("不能看见") {
                        self.reportError("Bot 未开启视觉能力或不支持图片输入")
                    }
                    self.messages.append(ChatMessage(role: .assistant, text: reply))
                }
            }
        }
    }

    func testCozeConnection() async -> String {
        let token = AppConfig.cozeAccessToken.trimmingCharacters(in: .whitespacesAndNewlines)
        if token.isEmpty || token == "YOUR_TOKEN" {
            return "未配置 Coze Access Token"
        }

        guard let url = URL(string: "\(AppConfig.cozeAPIBase)/v1/users/me") else {
            return "无效的 Coze API Base"
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return "请求失败（无响应）"
            }

            if (200...299).contains(http.statusCode) {
                if let decoded = try? JSONDecoder().decode(CozeMeResponse.self, from: data) {
                    if let code = decoded.code, code != 0 {
                        return "❌ Coze 返回错误：\(code) \(decoded.msg ?? "")"
                    }
                    let userId = decoded.data?.id ?? "unknown"
                    return "✅ Coze OK（user_id: \(userId)）"
                }
                return "✅ Coze OK（HTTP \(http.statusCode)）"
            }

            let body = String(data: data, encoding: .utf8) ?? ""
            return "❌ HTTP \(http.statusCode) \(body)"
        } catch {
            return "❌ \(error.localizedDescription)"
        }
    }

    private struct CozeMeResponse: Decodable {
        let code: Int?
        let msg: String?
        let data: CozeUser?
    }

    private struct CozeUser: Decodable {
        let id: String?
        let name: String?
        let nickname: String?
    }

    func analyzeImageWithChat(botId: String, fileId: String, prompt: String = "请描述这张图片") async -> String? {
        let token = AppConfig.cozeAccessToken.trimmingCharacters(in: .whitespacesAndNewlines)
        if token.isEmpty || token == "YOUR_TOKEN" {
            reportError("未配置 Coze Access Token")
            return nil
        }

        guard let url = URL(string: "\(AppConfig.cozeAPIBase)/v3/chat") else {
            reportError("无效的 Coze API Base")
            return nil
        }

        let items: [[String: String]] = [
            ["type": "image", "file_id": fileId],
            ["type": "text", "text": prompt]
        ]

        guard let itemsData = try? JSONSerialization.data(withJSONObject: items),
              let itemsString = String(data: itemsData, encoding: .utf8) else {
            reportError("图片消息序列化失败")
            return nil
        }

        let payload: [String: Any] = [
            "bot_id": botId,
            "user_id": "ios-device",
            "additional_messages": [
                [
                    "role": "user",
                    "content_type": "object_string",
                    "content": itemsString
                ]
            ],
            "auto_save_history": false
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                reportError("Chat 请求失败（无响应）")
                return nil
            }
            guard (200...299).contains(http.statusCode) else {
                let body = String(data: data, encoding: .utf8) ?? ""
                reportError("Chat HTTP \(http.statusCode) \(body)")
                return nil
            }

            let create = try JSONDecoder().decode(CozeChatCreateResponse.self, from: data)
            if let code = create.code, code != 0 {
                reportError("Chat 错误：\(code) \(create.msg ?? "")")
                return nil
            }
            guard let chatId = create.data?.id, let conversationId = create.data?.conversationId else {
                reportError("Chat 返回缺失会话信息")
                return nil
            }

            let statusOk = await pollChatStatus(conversationId: conversationId, chatId: chatId)
            if !statusOk {
                reportError("Chat 超时")
                return nil
            }

            if let reply = await fetchChatReply(conversationId: conversationId, chatId: chatId) {
                return reply
            }

            reportError("Chat 未返回文本")
            return nil
        } catch {
            reportError("Chat 请求失败：\(error.localizedDescription)")
            return nil
        }
    }

    private func pollChatStatus(conversationId: String, chatId: String) async -> Bool {
        guard let url = URL(string: "\(AppConfig.cozeAPIBase)/v3/chat/retrieve?conversation_id=\(conversationId)&chat_id=\(chatId)") else {
            return false
        }

        for _ in 0..<25 {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("Bearer \(AppConfig.cozeAccessToken)", forHTTPHeaderField: "Authorization")

            if let (data, response) = try? await URLSession.shared.data(for: request),
               let http = response as? HTTPURLResponse,
               (200...299).contains(http.statusCode),
               let decoded = try? JSONDecoder().decode(CozeChatRetrieveResponse.self, from: data) {
                if decoded.data?.status == "completed" {
                    return true
                }
                if decoded.data?.status == "failed" {
                    return false
                }
            }

            try? await Task.sleep(nanoseconds: 300_000_000)
        }

        return false
    }

    private func fetchChatReply(conversationId: String, chatId: String) async -> String? {
        guard let url = URL(string: "\(AppConfig.cozeAPIBase)/v3/chat/message/list?conversation_id=\(conversationId)&chat_id=\(chatId)") else {
            return nil
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(AppConfig.cozeAccessToken)", forHTTPHeaderField: "Authorization")

        if let (data, response) = try? await URLSession.shared.data(for: request),
           let http = response as? HTTPURLResponse,
           (200...299).contains(http.statusCode),
           let decoded = try? JSONDecoder().decode(CozeChatMessageListResponse.self, from: data),
           let messages = decoded.data {
            if let assistant = messages.first(where: { $0.role == "assistant" }) {
                if assistant.contentType == "object_string" {
                    if let text = extractTextFromObjectString(assistant.content) {
                        return text
                    }
                }
                return assistant.content
            }
        }

        return nil
    }

    private func extractTextFromObjectString(_ content: String) -> String? {
        guard let data = content.data(using: .utf8),
              let array = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return nil
        }
        if let textItem = array.first(where: { ($0["type"] as? String) == "text" }) {
            return textItem["text"] as? String
        }
        return nil
    }

    private struct CozeChatCreateResponse: Decodable {
        let code: Int?
        let msg: String?
        let data: CozeChatCreateData?
    }

    private struct CozeChatCreateData: Decodable {
        let id: String
        let conversationId: String

        enum CodingKeys: String, CodingKey {
            case id
            case conversationId = "conversation_id"
        }
    }

    private struct CozeChatRetrieveResponse: Decodable {
        let code: Int?
        let msg: String?
        let data: CozeChatRetrieveData?
    }

    private struct CozeChatRetrieveData: Decodable {
        let status: String?
    }

    private struct CozeChatMessageListResponse: Decodable {
        let code: Int?
        let msg: String?
        let data: [CozeChatMessage]?
    }

    private struct CozeChatMessage: Decodable {
        let role: String
        let content: String
        let contentType: String?

        enum CodingKeys: String, CodingKey {
            case role
            case content
            case contentType = "content_type"
        }
    }

#if DEBUG
    func autoSmokeIfNeeded() {
        guard !didAutoSmoke else { return }
        didAutoSmoke = true

        // Runtime evidence generator (main flow demo):
        // 1) Home (Explore) -> record -> stop -> assistant bubble
        // 2) Switch to Companion -> record -> stop -> assistant bubble
        Task { @MainActor in
            // Ensure we start at Explore.
            self.enterMode(.explore)
            self.messages.append(ChatMessage(role: .system, text: "(auto-smoke) Explore flow"))

            try? await Task.sleep(nanoseconds: 800_000_000)
            self.startTalking()
            try? await Task.sleep(nanoseconds: 900_000_000)
            self.stopTalking()

            // Wait a bit for completed event + UI settle.
            try? await Task.sleep(nanoseconds: 1_400_000_000)

            // Switch to Companion.
            self.enterMode(.companion)
            self.messages.append(ChatMessage(role: .system, text: "(auto-smoke) Companion flow"))

            try? await Task.sleep(nanoseconds: 800_000_000)
            self.startTalking()
            try? await Task.sleep(nanoseconds: 900_000_000)
            self.stopTalking()
        }
    }
#endif
}
