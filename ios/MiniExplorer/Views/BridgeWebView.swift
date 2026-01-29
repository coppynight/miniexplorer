import SwiftUI
import WebKit

/// A thin SwiftUI wrapper that hosts the WKWebView from CozeRealtimeService.
struct BridgeWebView: UIViewRepresentable {
    @ObservedObject var service: CozeRealtimeService

    func makeUIView(context: Context) -> WKWebView {
        let wv = service.makeWebView()
        service.loadBridge()
        return wv
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        // no-op
    }
}
