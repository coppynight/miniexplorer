import SwiftUI

struct AudioTestView: View {
    @StateObject private var realtime = CozeRealtimeService()
    @StateObject private var audio = AudioService()
    @State private var chunks: Int = 0
    @State private var lastBytes: Int = 0

    var body: some View {
        VStack(spacing: 12) {
            Text("Audio Test")
                .font(.headline)

            Text(audio.isRecording ? "recording" : "not recording")
                .font(.caption)
                .foregroundStyle(.secondary)

            Text("bridge: \(realtime.isConnected ? "connected" : "not connected")")
                .font(.caption2)
                .foregroundStyle(.secondary)

            Text("last event: \(realtime.lastEvent)")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(2)

            Text("chunks: \(chunks) · lastBytes: \(lastBytes)")
                .font(.caption2)
                .foregroundStyle(.secondary)

            BridgeWebView(service: realtime)
                .frame(height: 160)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(.quaternary))

            HStack {
                Button(audio.isRecording ? "Stop" : "Start") {
                    if audio.isRecording {
                        audio.stopRecording()
                        realtime.completeInput()
                    } else {
                        audio.startRecording { data in
                            realtime.sendAudio(data)
                            Task { @MainActor in
                                chunks += 1
                                lastBytes = data.count
                            }
                        }
                    }
                }
                .buttonStyle(.borderedProminent)

                Button("Connect") {
                    Task { try? await realtime.connect(botId: AppConfig.explorerBotID) }
                }
                .buttonStyle(.bordered)

                Button("Play stub") {
                    let data = AudioService.makeSinePCM16(sampleRate: 24000, samples: 24000/2, frequency: 660)
                    audio.playAudio(data)
                }
                .buttonStyle(.bordered)
            }

            if let err = audio.lastError {
                Text(err)
                    .font(.caption2)
                    .foregroundStyle(.red)
            }

            Spacer()
        }
        .padding()
        .task {
#if DEBUG
            // Auto-run once to generate runtime evidence.
            try? await Task.sleep(nanoseconds: 200_000_000)
            try? await realtime.connect(botId: AppConfig.explorerBotID)
            try? await Task.sleep(nanoseconds: 200_000_000)
            audio.startRecording { data in
                realtime.sendAudio(data)
                Task { @MainActor in
                    chunks += 1
                    lastBytes = data.count
                    if chunks == 3 {
                        audio.stopRecording()
                        realtime.completeInput()
                    }
                }
            }
#endif
        }
        .navigationTitle("音频")
    }
}

#Preview {
    NavigationStack { AudioTestView() }
}
