import Foundation
import AVFoundation
import Combine

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

    func bootIfNeeded() {
        guard !didBoot else { return }
        didBoot = true

        // Default to explore mode.
        applyMode(.explore)
        connectIfNeeded()

#if DEBUG
        autoSmokeIfNeeded()
#endif

        // Observe realtime events and drive a minimal state machine.
        realtime.$lastEventType
            .sink { [weak self] type in
                guard let self else { return }
                switch type {
                case "completed":
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

// DEBUG auto-connect removed; connectIfNeeded() handles this.
    }

    func applyMode(_ newMode: Mode) {
        mode = newMode
        switch newMode {
        case .explore:
            camera.setup(position: .back)
        case .companion:
            camera.setup(position: .front)
        }
        connectIfNeeded()
    }

    func connectIfNeeded() {
        let botId: String
        switch mode {
        case .explore: botId = AppConfig.explorerBotID
        case .companion: botId = AppConfig.companionBotID
        }

        // Avoid spamming connect calls.
        guard connectedBotId != botId else { return }
        connectedBotId = botId

        Task {
            do {
                try await realtime.connect(botId: botId)
                messages.append(ChatMessage(role: .system, text: "已连接 bot: \(botId)"))
            } catch {
                conversation = .error
                messages.append(ChatMessage(role: .system, text: "连接失败：\(String(describing: error))"))
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
        guard audio.isRecording else { return }
        audio.stopRecording()
        conversation = .thinking
        realtime.completeInput()
        messages.append(ChatMessage(role: .user, text: "✅（结束）"))
    }

    func captureAndSendPhoto() async {
        let img = await camera.capturePhoto()
        guard let img else {
            messages.append(ChatMessage(role: .system, text: "拍照失败"))
            return
        }
        let url = await camera.uploadPhoto(img)
        guard let url else {
            messages.append(ChatMessage(role: .system, text: "上传失败"))
            return
        }
        messages.append(ChatMessage(role: .user, text: "📷 已上传图片：\(url.lastPathComponent)"))
        realtime.sendImage(url)
    }

#if DEBUG
    func autoSmokeIfNeeded() {
        guard !didAutoSmoke else { return }
        guard mode == .explore else { return }
        didAutoSmoke = true

        // Simple runtime evidence generator:
        // listening -> thinking -> completed -> assistant bubble
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 600_000_000)
            self.startTalking()
            try? await Task.sleep(nanoseconds: 700_000_000)
            self.stopTalking()
        }
    }
#endif
}
