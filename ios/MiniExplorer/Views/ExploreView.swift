import SwiftUI

/// Phase 5.1: Explore mode (product-ish scaffold).
///
/// Goals:
/// - Camera preview + capture
/// - Conversation bubbles
/// - Record button drives state machine via AppModel
struct ExploreView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        VStack(spacing: 12) {
            // Camera (top)
            CameraPreviewView(camera: model.camera)
                .frame(height: 260)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(.quaternary))

            // Conversation (middle)
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(model.messages) { msg in
                            ChatBubbleView(message: msg)
                                .id(msg.id)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.top, 6)
                }
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(.quaternary))
                .onChange(of: model.messages.count) { _, _ in
                    if let last = model.messages.last {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }
            .frame(maxHeight: 260)

            // Controls (bottom)
            HStack(spacing: 10) {
                Button {
                    Task { await model.captureAndSendPhoto() }
                } label: {
                    Label("拍照", systemImage: "camera")
                }
                .buttonStyle(.borderedProminent)

                RecordButton(isRecording: model.audio.isRecording) {
                    if model.audio.isRecording {
                        model.stopTalking()
                    } else {
                        model.startTalking()
                    }
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(model.realtime.isConnected ? "connected" : "connecting…")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text("state: \(model.conversation.rawValue)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

#if DEBUG
            // Keep bridge surface visible in debug for evidence.
            BridgeWebView(service: model.realtime)
                .frame(height: 140)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(.quaternary))
#endif

            Spacer(minLength: 0)
        }
        .padding()
        .navigationTitle("探索")
        .onAppear {
            model.applyMode(.explore)
        }
    }
}

#Preview {
    NavigationStack { ExploreView(model: AppModel()) }
}
