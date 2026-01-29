import Foundation
import Combine
import WebKit

/// Phase 2.3: Swift-side service wrapper around the WKWebView bridge.
/// Focus: (1) load local bridge HTML, (2) receive JS events, (3) call JS APIs via evaluateJavaScript.
@MainActor
final class CozeRealtimeService: NSObject, ObservableObject {
    @Published var isConnected: Bool = false
    @Published var lastEvent: String = ""
    @Published var lastEventType: String = ""
    @Published var lastCompletedText: String? = nil

    private(set) var webView: WKWebView?

    // MARK: - WebView lifecycle

    func makeWebView() -> WKWebView {
        if let webView { return webView }

        let config = WKWebViewConfiguration()
        let controller = WKUserContentController()
        controller.add(self, name: "cozeBridge")
        config.userContentController = controller

        let wv = WKWebView(frame: .zero, configuration: config)
        wv.isOpaque = false
        wv.backgroundColor = .clear
        self.webView = wv
        return wv
    }

    func loadBridge() {
        guard let url = Bundle.main.url(forResource: "coze-bridge", withExtension: "html") else {
            lastEvent = "bridge_missing"
            return
        }
        makeWebView().loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
    }

    // MARK: - Public API

    struct ConnectConfig: Codable {
        let baseUrl: String
        let token: String
        let botId: String
    }

    func connect(botId: String) async throws {
        let cfg = ConnectConfig(baseUrl: AppConfig.cozeAPIBase, token: AppConfig.cozeAccessToken, botId: botId)
        _ = try await callJS(function: "connect", arg: cfg)
    }

    func sendAudio(_ data: Data) {
        // Placeholder: base64 for transport (Phase 4 will define real format)
        let b64 = data.base64EncodedString()
        Task { _ = try? await callJS(function: "sendAudio", arg: b64) }
    }

    func sendImage(_ url: URL) {
        Task { _ = try? await callJS(function: "sendImage", arg: url.absoluteString) }
    }

    func completeInput() {
        Task { _ = try? await callJS(function: "complete", arg: EmptyArg()) }
    }

    func disconnect() {
        Task { _ = try? await callJS(function: "disconnect", arg: EmptyArg()) }
    }

    // MARK: - JS invocation

    private struct EmptyArg: Codable {}

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
            if type == "connect" { isConnected = true }
            if type == "disconnect" { isConnected = false }

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
