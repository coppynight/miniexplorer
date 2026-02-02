import Foundation
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

    /// Phase 3.2: Upload photo to Coze Files API.
    ///
    /// Returns a Coze file_id for realtime image messages.
    func uploadPhoto(_ image: UIImage) async -> UploadedFile? {
        guard let data = image.jpegData(compressionQuality: 0.85) else {
            lastError = "jpeg encode failed"
            return nil
        }

        let token = AppConfig.cozeAccessToken
        if token.isEmpty || token == "YOUR_TOKEN" {
            lastError = "missing Coze access token"
            return nil
        }

        guard let url = URL(string: "\(AppConfig.cozeAPIBase)/v1/files/upload") else {
            lastError = "invalid Coze base URL"
            return nil
        }

        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        body.appendString("--\(boundary)\r\n")
        body.appendString("Content-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\r\n")
        body.appendString("Content-Type: image/jpeg\r\n\r\n")
        body.append(data)
        body.appendString("\r\n--\(boundary)--\r\n")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        do {
            let (respData, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                lastError = "upload failed (no response)"
                return nil
            }
            guard (200...299).contains(http.statusCode) else {
                lastError = "upload failed (status \(http.statusCode))"
                return nil
            }

            let decoded = try JSONDecoder().decode(FileUploadResponse.self, from: respData)
            if let code = decoded.code, code != 0 {
                lastError = decoded.msg ?? "upload failed (code \(code))"
                return nil
            }
            guard let file = decoded.data else {
                lastError = "upload failed (empty data)"
                return nil
            }

            lastError = nil
            NSLog("[CameraService] uploadPhoto file_id=%@", file.id)
            return file
        } catch let error as URLError where error.code == .cancelled {
            lastError = "upload cancelled"
            NSLog("[CameraService] uploadPhoto cancelled")
            return nil
        } catch {
            lastError = String(describing: error)
            NSLog("[CameraService] uploadPhoto error: %@", String(describing: error))
            return nil
        }
    }

    private struct FileUploadResponse: Decodable {
        let code: Int?
        let msg: String?
        let data: UploadedFile?
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

private extension Data {
    mutating func appendString(_ string: String) {
        if let data = string.data(using: .utf8) {
            append(data)
        }
    }
}
