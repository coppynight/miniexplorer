import SwiftUI

/// Phase 7: Companion mode (UI matching prototype/companion.html).
struct CompanionView: View {
    @ObservedObject var model: AppModel
    @State private var suppressTap: Bool = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            // 1. Warm Background
            Theme.bgWarm.ignoresSafeArea()
            
            // Subtle gradient overlay
            LinearGradient(
                colors: [Theme.secondary.opacity(0.05), Theme.primary.opacity(0.05), Theme.bgWarm],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            // 2. Main Content (Orb + Status/Message)
            VStack(spacing: Theme.s32) {
                Spacer()
                
                AIOrbView(size: .large, face: orbFace, state: model.conversation)
                    .shadow(color: Theme.primary.opacity(0.15), radius: 40, x: 0, y: 20)
                
                VStack(spacing: Theme.s8) {
                    Text(statusText)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.textSecondary)
                    
                    // Show last message (tail) if available
                    if let lastMsg = model.messages.last, !lastMsg.text.isEmpty {
                        Text(lastMsg.text)
                            .font(.system(size: 18, weight: .medium))
                            .foregroundStyle(Theme.text)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                            .lineLimit(4)
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                            .id(lastMsg.id)
                            .animation(.easeOut, value: lastMsg.id)
                    }
                }
                
                Spacer()
                Spacer() // Push up a bit
            }
            .padding(.bottom, 120)

            // 3. PIP Camera (Front)
            VStack {
                HStack {
                    Spacer()
                    CameraPreviewView(camera: model.camera)
                        .frame(width: 80, height: 110)
                        .background(Color.black)
                        .cornerRadius(Theme.r12)
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.r12)
                                .stroke(Theme.surface, lineWidth: 2)
                        )
                        .shadow(color: .black.opacity(0.1), radius: 10, x: 0, y: 5)
                        .padding(.trailing, Theme.s24)
                        .padding(.top, 60) // Extra spacing from top
                }
                Spacer()
            }

            // 4. Top Navigation
            VStack {
                HStack {
                    Button(action: { dismiss() }) {
                        Circle()
                            .fill(Theme.surface.opacity(0.9))
                            .frame(width: 44, height: 44)
                            .overlay(
                                Image(systemName: "chevron.left")
                                    .font(.system(size: 20, weight: .bold))
                                    .foregroundColor(Theme.text)
                            )
                            .shadow(color: .black.opacity(0.05), radius: 4, x: 0, y: 2)
                    }
                    Spacer()
                    
                    #if DEBUG
                    HStack(spacing: 8) {
                        Text(model.realtime.isConnected ? "🟢" : "🔴")
                        Text(model.conversation.rawValue)
                    }
                    .font(.caption2)
                    .padding(6)
                    .background(.thinMaterial)
                    .cornerRadius(8)
                    #endif
                }
                .padding(.horizontal, Theme.s24)
                
                Spacer()
            }
            .safeAreaInset(edge: .top, content: { Color.clear.frame(height: 10) })

            // 5. Bottom Control Bar
            VStack {
                Spacer()
                MiniTabBar {
                    PrimaryMicButton(state: buttonState, action: {
                        if !suppressTap {
                            handleMicAction()
                        }
                    })
                        .disabled(model.isMicBusy)
                        .onLongPressGesture(minimumDuration: 0.15, maximumDistance: 24, pressing: { isPressing in
                            if isPressing {
                                suppressTap = true
                                handleMicAction()
                            } else if model.audio.isRecording {
                                handleMicAction()
                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                                    suppressTap = false
                                }
                            }
                        }, perform: {})
                }
            }
            .ignoresSafeArea(.container, edges: .bottom)

            // 6. Bridge (Debug only)
            #if DEBUG
            VStack {
                BridgeWebView(service: model.realtime)
                    .frame(width: 1, height: 1)
                    .opacity(0.01)
            }
            #endif
        }
        .navigationBarHidden(true)
        .onAppear {
            // Camera/connect is initialized when entering from Home.
        }
    }
    
    // MARK: - Helpers
    
    private var buttonState: PrimaryMicButton.State {
        switch model.conversation {
        case .idle: return .idle
        case .listening: return .listening
        case .thinking: return .listening
        case .speaking: return .speaking
        case .error: return .idle
        }
    }
    
    private var statusText: String {
        switch model.conversation {
        case .idle: return "你好呀！"
        case .listening: return "我在认真听"
        case .thinking: return "让我想想..."
        case .speaking: return "Speaking..."
        case .error: return "出错了"
        }
    }

    private var orbFace: String {
        switch model.conversation {
        case .listening: return "😮"
        case .speaking: return "🥰"
        default: return "😊"
        }
    }
    
    private func handleMicAction() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        
        model.toggleTalking()
    }
}

#Preview {
    CompanionView(model: AppModel())
}
