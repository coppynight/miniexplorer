import Foundation
import Combine
import WebKit

/// Phase 2.3: Swift-side service wrapper around the WKWebView bridge.
/// Focus: (1) load local bridge HTML, (2) receive JS events, (3) call JS APIs via evaluateJavaScript.
@MainActor
final class CozeRealtimeService: NSObject, ObservableObject, WKUIDelegate {
    @Published var isConnected: Bool = false
    @Published var lastEvent: String = ""
    @Published var lastEventType: String = ""
    @Published var lastCompletedText: String? = nil
    @Published var lastErrorMessage: String? = nil
    @Published var isBridgeReady: Bool = false

    private(set) var webView: WKWebView?
    private var didLoadBridge: Bool = false

    // MARK: - WebView lifecycle

    func makeWebView() -> WKWebView {
        if let webView { return webView }

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        if #available(iOS 15.0, *) {
            config.defaultWebpagePreferences.allowsContentJavaScript = true
        }

        let controller = WKUserContentController()
        controller.add(self, name: "cozeBridge")
        config.userContentController = controller

        let wv = WKWebView(frame: .zero, configuration: config)
        wv.uiDelegate = self
        wv.isOpaque = false
        wv.backgroundColor = .clear
        self.webView = wv
        return wv
    }

    func loadBridge() {
        guard !didLoadBridge else { return }
        guard let url = Bundle.main.url(forResource: "coze-bridge", withExtension: "html") else {
            lastEvent = "bridge_missing"
            return
        }
        didLoadBridge = true
        makeWebView().loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
    }

    // MARK: - Public API

    struct ConnectConfig: Codable {
        let baseUrl: String
        let token: String
        let botId: String
        let voiceId: String?
        let connectorId: String?
        let debug: Bool?
        let enableVideo: Bool?
        let videoInputDeviceId: String?
    }

    func connect(botId: String, enableVideo: Bool = false, videoInputDeviceId: String? = nil) async throws {
        _ = makeWebView()
        loadBridge()
        let ready = await waitForBridgeReady()
        if !ready {
            throw NSError(domain: "CozeBridge", code: 1, userInfo: [NSLocalizedDescriptionKey: "Bridge not ready"])
        }

        let cfg = ConnectConfig(
            baseUrl: AppConfig.cozeAPIBase,
            token: AppConfig.cozeAccessToken,
            botId: botId,
            voiceId: normalizedVoiceId(),
            connectorId: AppConfig.cozeConnectorId,
            debug: true,
            enableVideo: enableVideo,
            videoInputDeviceId: videoInputDeviceId
        )
        _ = try await callJS(function: "connect", arg: cfg)
        let connected = await waitForConnected()
        if !connected {
            throw NSError(domain: "CozeBridge", code: 2, userInfo: [NSLocalizedDescriptionKey: "Realtime connect timeout"])
        }
    }

    func sendAudio(_ data: Data) {
        // Placeholder: base64 for transport (Phase 4 will define real format)
        let b64 = data.base64EncodedString()
        Task { _ = try? await callJS(function: "sendAudio", arg: b64) }
    }

    struct SendImagePayload: Codable {
        let fileId: String
        let fileUrl: String?
        let prompt: String?
    }

    func sendImage(_ file: UploadedFile, prompt: String? = nil) {
        let payload = SendImagePayload(fileId: file.id, fileUrl: nil, prompt: prompt)
        Task { _ = try? await callJS(function: "sendImage", arg: payload) }
    }

    func completeInput() {
        Task { _ = try? await callJS(function: "complete", arg: EmptyArg()) }
    }

    func disconnect() {
        Task { _ = try? await callJS(function: "disconnect", arg: EmptyArg()) }
    }

    // MARK: - JS invocation

    private struct EmptyArg: Codable {}

    private func normalizedVoiceId() -> String? {
        let raw = AppConfig.cozeVoiceId.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty || raw == "YOUR_VOICE_ID" { return nil }
        return raw
    }

    private func waitForBridgeReady(timeoutMs: Int = 4000) async -> Bool {
        if isBridgeReady { return true }
        let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000.0)
        while Date() < deadline {
            if isBridgeReady { return true }
            try? await Task.sleep(nanoseconds: 150_000_000)
        }
        return isBridgeReady
    }

    private func waitForConnected(timeoutMs: Int = 5000) async -> Bool {
        if isConnected { return true }
        let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000.0)
        while Date() < deadline {
            if isConnected { return true }
            try? await Task.sleep(nanoseconds: 150_000_000)
        }
        return isConnected
    }

    private func callJS<T: Encodable>(function: String, arg: T) async throws -> Any? {
        guard let wv = webView else {
            lastEvent = "js_call_no_webview"
            return nil
        }

        let encoder = JSONEncoder()
        let jsonData = try encoder.encode(arg)
        let json = String(data: jsonData, encoding: .utf8) ?? "{}"

        // Ensure the bridge exists before calling.
        let script = "(function(){ if(!window.MiniExplorerBridge || !window.MiniExplorerBridge['\(function)']){ return {ok:false, error:'missing_bridge'}; } return window.MiniExplorerBridge['\(function)'](\(json)); })();"

        lastEvent = "swift->js:\(function)"

        return try await withCheckedThrowingContinuation { cont in
            wv.evaluateJavaScript(script) { result, error in
                if let error {
                    cont.resume(throwing: error)
                } else {
                    cont.resume(returning: result)
                }
            }
        }
    }
}

// MARK: - JS -> Swift

extension CozeRealtimeService: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "cozeBridge" else { return }
        lastEvent = "js:\(message.body)"

        if let dict = message.body as? [String: Any], let type = dict["type"] as? String {
            lastEventType = type
            if type == "connect" {
                isConnected = true
                lastErrorMessage = nil
            }
            if type == "disconnect" { isConnected = false }
            if type == "loaded" || type == "ready" { isBridgeReady = true }

            if type == "error" {
                if let payload = dict["payload"] as? [String: Any] {
                    let message = payload["message"] as? String ?? "error"
                    let detail = payload["detail"] as? String
                    if let detail, !detail.isEmpty {
                        lastErrorMessage = "\(message): \(detail)"
                    } else {
                        lastErrorMessage = message
                    }
                } else if let payload = dict["payload"] {
                    lastErrorMessage = String(describing: payload)
                } else {
                    lastErrorMessage = "unknown_error"
                }
            }

            if type == "completed" {
                if let payload = dict["payload"] as? [String: Any], let text = payload["text"] as? String {
                    lastCompletedText = text
                } else {
                    lastCompletedText = nil
                }
            }
        }

        NSLog("[CozeBridge] %@", String(describing: message.body))
    }
}

@available(iOS 15.0, *)
extension CozeRealtimeService {
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        decisionHandler(.grant)
    }
}
