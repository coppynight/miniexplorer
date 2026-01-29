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

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(layer)
        context.coordinator.layer = layer
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.layer?.frame = uiView.bounds
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var layer: AVCaptureVideoPreviewLayer?
    }
}
#endif
