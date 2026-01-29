import SwiftUI
import AVFoundation

/// Phase 3.1: Preview UI.
/// - Simulator: renders a stub view.
/// - Device: renders AVCaptureVideoPreviewLayer.
struct CameraPreviewView: View {
    @ObservedObject var camera: CameraService

    var body: some View {
#if targetEnvironment(simulator)
        ZStack {
            LinearGradient(colors: [.purple, .blue], startPoint: .topLeading, endPoint: .bottomTrailing)
            VStack(spacing: 6) {
                Text("Simulator Camera")
                    .font(.headline)
                Text("Preview is stubbed")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(12)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
#else
        CameraPreviewRepresentable(session: camera.captureSession)
#endif
    }
}

#if !targetEnvironment(simulator)
private struct CameraPreviewRepresentable: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewUIView {
        let view = PreviewUIView()
        view.videoPreviewLayer.session = session
        view.videoPreviewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: PreviewUIView, context: Context) {
        // Session might change, though usually static in this app.
        if uiView.videoPreviewLayer.session != session {
            uiView.videoPreviewLayer.session = session
        }
    }
}

/// A UIKit view that manages the layer layout automatically.
/// This prevents "black screen" issues where the layer frame doesn't update.
private class PreviewUIView: UIView {
    override class var layerClass: AnyClass {
        AVCaptureVideoPreviewLayer.self
    }
    
    var videoPreviewLayer: AVCaptureVideoPreviewLayer {
        return layer as! AVCaptureVideoPreviewLayer
    }
}
#endif
