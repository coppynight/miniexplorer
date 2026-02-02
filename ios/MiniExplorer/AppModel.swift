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

    /// Prevent rapid toggle / inconsistent UI state when starting/stopping audio.
    @Published var isMicBusy: Bool = false
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

    /// Enter a mode (invokes camera setup + realtime connect).
    func enterMode(_ newMode: Mode) {
        mode = newMode

        // Reset conversation UI state when switching modes.
        conversation = .idle

        switch newMode {
        case .explore:
            camera.setup(position: .back)
        case .companion:
            camera.setup(position: .front)
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
                try await realtime.connect(botId: botId)
                messages.append(ChatMessage(role: .system, text: "已连接 bot: \(botId)"))
            } catch {
                conversation = .error
                messages.append(ChatMessage(role: .system, text: "连接失败：\(String(describing: error))"))
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
                conversation = .error
                messages.append(ChatMessage(role: .system, text: "麦克风权限未开启，请在设置中允许 MiniExplorer 使用麦克风"))
                return
            }

            startTalking()

            // If startRecording failed (e.g. session category/engine start error), settle to error.
            if !audio.isRecording {
                conversation = .error
                let reason = audio.lastError ?? "unknown"
                messages.append(ChatMessage(role: .system, text: "开始录音失败：\(reason)"))
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
