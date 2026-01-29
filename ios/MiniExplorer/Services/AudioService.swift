import AVFoundation
import Combine

/// Phase 4: Audio capture + playback.
///
/// Evidence-chain friendly approach:
/// - Simulator: emit synthetic PCM chunks on a timer.
/// - Device: capture mic via AVAudioEngine input tap.
@MainActor
final class AudioService: ObservableObject {
    @Published var isRecording: Bool = false
    @Published var isPlaying: Bool = false
    @Published var lastError: String? = nil

    /// Request mic permission (device only). Simulator always returns true.
    func ensureRecordPermission() async -> Bool {
#if targetEnvironment(simulator)
        return true
#else
        let session = AVAudioSession.sharedInstance()
        switch session.recordPermission {
        case .granted:
            return true
        case .denied:
            lastError = "Microphone permission denied"
            return false
        case .undetermined:
            return await withCheckedContinuation { cont in
                session.requestRecordPermission { granted in
                    Task { @MainActor in
                        if !granted {
                            self.lastError = "Microphone permission denied"
                        }
                        cont.resume(returning: granted)
                    }
                }
            }
        @unknown default:
            return false
        }
#endif
    }

    private var onAudio: ((Data) -> Void)?

#if targetEnvironment(simulator)
    private var timer: Timer?
#else
    private let engine = AVAudioEngine()
    private var inputFormat: AVAudioFormat?
    private var sessionActive = false

    private let playerNode = AVAudioPlayerNode()
#endif

    func startRecording(onAudio: @escaping (Data) -> Void) {
        self.onAudio = onAudio
        lastError = nil

#if targetEnvironment(simulator)
        isRecording = true
        NSLog("[AudioService] startRecording simulator stub")

        // Emit 200ms of fake 16-bit mono PCM @ 24kHz each tick.
        let sampleRate = 24_000
        let secondsPerTick: Double = 0.2
        let samples = Int(Double(sampleRate) * secondsPerTick)
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: secondsPerTick, repeats: true) { [weak self] _ in
            guard let self else { return }
            let data = Self.makeSinePCM16(sampleRate: sampleRate, samples: samples, frequency: 440)
            NSLog("[AudioService] onAudio chunk=%d", data.count)
            // Timer closure is treated as Sendable; hop back to MainActor explicitly.
            Task { @MainActor in
                self.onAudio?(data)
            }
        }
#else
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)
            sessionActive = true

            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            inputFormat = format

            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                guard let self else { return }
                let data = Self.pcmData(from: buffer)
                self.onAudio?(data)
            }

            if !engine.attachedNodes.contains(playerNode) {
                engine.attach(playerNode)
                engine.connect(playerNode, to: engine.mainMixerNode, format: nil)
            }

            try engine.start()
            isRecording = true
            NSLog("[AudioService] startRecording device")
        } catch {
            lastError = String(describing: error)
            NSLog("[AudioService] startRecording error: %@", String(describing: error))
            isRecording = false
        }
#endif
    }

    func stopRecording() {
#if targetEnvironment(simulator)
        timer?.invalidate()
        timer = nil
        NSLog("[AudioService] stopRecording simulator")
#else
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        if sessionActive {
            try? AVAudioSession.sharedInstance().setActive(false)
            sessionActive = false
        }
        NSLog("[AudioService] stopRecording device")
#endif
        isRecording = false
    }

    func playAudio(_ data: Data) {
#if targetEnvironment(simulator)
        // Just toggle state briefly (no real audio output required for evidence chain).
        isPlaying = true
        NSLog("[AudioService] playAudio simulator bytes=%d", data.count)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.isPlaying = false }
#else
        // Minimal device playback: schedule PCM buffer if possible.
        // Phase 4.2 will refine format conversions.
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default)
            try session.setActive(true)

            if !engine.isRunning {
                try engine.start()
            }

            let fmt = inputFormat ?? engine.mainMixerNode.outputFormat(forBus: 0)
            guard let buffer = Self.bufferFromPCM16(data: data, format: fmt) else {
                lastError = "Failed to build buffer"
                return
            }

            isPlaying = true
            playerNode.play()
            playerNode.scheduleBuffer(buffer, at: nil, options: []) { [weak self] in
                DispatchQueue.main.async { self?.isPlaying = false }
            }
            NSLog("[AudioService] playAudio device bytes=%d", data.count)
        } catch {
            lastError = String(describing: error)
            NSLog("[AudioService] playAudio error: %@", String(describing: error))
        }
#endif
    }

    // MARK: - Helpers

    nonisolated static func makeSinePCM16(sampleRate: Int, samples: Int, frequency: Double) -> Data {
        var out = Data(count: samples * 2)
        out.withUnsafeMutableBytes { (ptr: UnsafeMutableRawBufferPointer) in
            let i16 = ptr.bindMemory(to: Int16.self)
            for i in 0..<samples {
                let t = Double(i) / Double(sampleRate)
                let v = sin(2.0 * .pi * frequency * t)
                i16[i] = Int16(max(-1.0, min(1.0, v)) * Double(Int16.max))
            }
        }
        return out
    }

#if !targetEnvironment(simulator)
    static func pcmData(from buffer: AVAudioPCMBuffer) -> Data {
        // Best-effort: handle float32 PCM.
        guard let channel = buffer.floatChannelData?[0] else { return Data() }
        let frames = Int(buffer.frameLength)
        var out = Data(count: frames * 2)
        out.withUnsafeMutableBytes { (ptr: UnsafeMutableRawBufferPointer) in
            let i16 = ptr.bindMemory(to: Int16.self)
            for i in 0..<frames {
                let v = max(-1.0, min(1.0, channel[i]))
                i16[i] = Int16(v * Float(Int16.max))
            }
        }
        return out
    }

    static func bufferFromPCM16(data: Data, format: AVAudioFormat) -> AVAudioPCMBuffer? {
        let bytesPerFrame = 2
        let frames = data.count / bytesPerFrame
        guard let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)) else { return nil }
        buf.frameLength = AVAudioFrameCount(frames)

        // Fill float channel data
        guard let channel = buf.floatChannelData?[0] else { return nil }
        data.withUnsafeBytes { (ptr: UnsafeRawBufferPointer) in
            let i16 = ptr.bindMemory(to: Int16.self)
            for i in 0..<frames {
                channel[i] = Float(i16[i]) / Float(Int16.max)
            }
        }
        return buf
    }
#endif
}
