import AVFoundation
import Combine
import SwiftUI

/// Phase 3.1: Minimal camera manager.
///
/// Notes:
/// - On Simulator: AVCaptureDevice is unavailable; we provide a stub preview and stub photo.
/// - On Device: sets up AVCaptureSession with a video preview + still photo capture.
@MainActor
final class CameraService: NSObject, ObservableObject {
    @Published var isConfigured: Bool = false
    @Published var lastError: String? = nil

    private let session = AVCaptureSession()

    /// Expose the capture session for preview rendering.
    /// We keep the underlying session `private` to control mutation.
    var captureSession: AVCaptureSession { session }
    private let photoOutput = AVCapturePhotoOutput()

    private var captureContinuation: CheckedContinuation<UIImage?, Never>?

    func setup(position: AVCaptureDevice.Position) {
#if targetEnvironment(simulator)
        // Simulator stub
        isConfigured = true
        lastError = nil
        NSLog("[CameraService] setup simulator stub")
#else
        session.beginConfiguration()
        session.sessionPreset = .photo

        // Reset existing inputs
        for input in session.inputs {
            session.removeInput(input)
        }

        do {
            guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position) else {
                throw NSError(domain: "CameraService", code: 1, userInfo: [NSLocalizedDescriptionKey: "No camera device for position \(position)"])
            }
            let input = try AVCaptureDeviceInput(device: device)
            if session.canAddInput(input) { session.addInput(input) }

            if session.canAddOutput(photoOutput) { session.addOutput(photoOutput) }

            session.commitConfiguration()
            session.startRunning()

            isConfigured = true
            lastError = nil
            NSLog("[CameraService] setup ok position=%@", String(describing: position))
        } catch {
            session.commitConfiguration()
            isConfigured = false
            lastError = String(describing: error)
            NSLog("[CameraService] setup error: %@", String(describing: error))
        }
#endif
    }

    func capturePhoto() async -> UIImage? {
#if targetEnvironment(simulator)
        // Produce a tiny placeholder image so UI flow can be validated.
        NSLog("[CameraService] capturePhoto simulator stub")
        return Self.makePlaceholderImage(text: "SIM PHOTO")
#else
        guard isConfigured else {
            lastError = "capturePhoto called before setup"
            return nil
        }

        return await withCheckedContinuation { cont in
            self.captureContinuation = cont
            let settings = AVCapturePhotoSettings()
            self.photoOutput.capturePhoto(with: settings, delegate: self)
        }
#endif
    }

    /// Phase 3.2: Upload stub (evidence-chain friendly).
    ///
    /// For now we persist the image to a temp directory and return a file:// URL.
    /// This is reproducible on Simulator and Device and doesn't require network.
    func uploadPhoto(_ image: UIImage) async -> URL? {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("MiniExplorerUploads", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let name = "photo-\(Int(Date().timeIntervalSince1970)).jpg"
            let url = dir.appendingPathComponent(name)

            guard let data = image.jpegData(compressionQuality: 0.85) else {
                lastError = "jpeg encode failed"
                return nil
            }
            try data.write(to: url, options: .atomic)
            lastError = nil
            NSLog("[CameraService] uploadPhoto -> %@", url.absoluteString)
            return url
        } catch {
            lastError = String(describing: error)
            NSLog("[CameraService] uploadPhoto error: %@", String(describing: error))
            return nil
        }
    }

    // MARK: - Simulator helpers

    static func makePlaceholderImage(text: String) -> UIImage? {
        let size = CGSize(width: 640, height: 480)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            UIColor.black.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))

            let paragraph = NSMutableParagraphStyle()
            paragraph.alignment = .center
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 48, weight: .bold),
                .foregroundColor: UIColor.white,
                .paragraphStyle: paragraph
            ]
            let rect = CGRect(x: 0, y: size.height/2 - 30, width: size.width, height: 60)
            NSString(string: text).draw(in: rect, withAttributes: attrs)
        }
    }
}

#if !targetEnvironment(simulator)
extension CameraService: AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        if let error {
            lastError = String(describing: error)
            captureContinuation?.resume(returning: nil)
            captureContinuation = nil
            return
        }

        guard let data = photo.fileDataRepresentation(), let image = UIImage(data: data) else {
            lastError = "Failed to decode photo data"
            captureContinuation?.resume(returning: nil)
            captureContinuation = nil
            return
        }

        lastError = nil
        captureContinuation?.resume(returning: image)
        captureContinuation = nil
    }
}
#endif
