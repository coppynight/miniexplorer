import SwiftUI

/// Phase 5.2: Companion mode (product-ish scaffold).
///
/// Goals:
/// - Front camera small preview
/// - Chat bubbles UI (same engine as Explore)
/// - Record button drives AppModel actions
struct CompanionView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                // Front preview (small)
                CameraPreviewView(camera: model.camera)
                    .frame(width: 140, height: 200)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(.quaternary))

                VStack(alignment: .leading, spacing: 8) {
                    Text("陪伴")
                        .font(.headline)

                    Text(model.realtime.isConnected ? "connected" : "connecting…")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    Text("state: \(model.conversation.rawValue)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    if let err = model.audio.lastError {
                        Text(err)
                            .font(.caption2)
                            .foregroundStyle(.red)
                            .lineLimit(2)
                    }

                    Spacer(minLength: 0)
                }

                Spacer()
            }

            // Chat
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
            .frame(maxHeight: 320)

            // Controls
            HStack(spacing: 10) {
                RecordButton(isRecording: model.audio.isRecording) {
                    if model.audio.isRecording {
                        model.stopTalking()
                    } else {
                        model.startTalking()
                    }
                }

                Spacer()

                Button {
                    model.messages.append(ChatMessage(role: .system, text: "(debug) mode=companion"))
                } label: {
                    Image(systemName: "ellipsis.bubble")
                }
                .buttonStyle(.borderless)
                .foregroundStyle(.secondary)
            }

#if DEBUG
            BridgeWebView(service: model.realtime)
                .frame(height: 140)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(.quaternary))
#endif

            Spacer(minLength: 0)
        }
        .padding()
        .navigationTitle("陪伴")
        .onAppear {
            model.applyMode(.companion)
        }
    }
}

#Preview {
    NavigationStack {
        CompanionView(model: AppModel())
    }
}
