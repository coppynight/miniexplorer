import SwiftUI

/// Phase 7: Explore mode (UI matching prototype/explore.html).
struct ExploreView: View {
    @ObservedObject var model: AppModel
    @Environment(\.dismiss) private var dismiss

    @State private var pendingPhotoCapture: Task<Void, Never>? = nil

    var body: some View {
        ZStack {
            // 1. Full-screen camera
            Color.black.ignoresSafeArea()
            
            CameraPreviewView(camera: model.camera)
                .ignoresSafeArea()
            
            // Viewfinder overlay
            VStack {
                Spacer()
                RoundedRectangle(cornerRadius: 24)
                    .stroke(Color.white.opacity(0.2), lineWidth: 1)
                    .frame(width: 280, height: 280)
                    .overlay(
                        CornersBorder(radius: 24, length: 24)
                            .stroke(Color.white.opacity(0.8), lineWidth: 4)
                    )
                Spacer()
                Spacer() // Push up slightly
            }

            // 2. AI Indicator (Floating Orb)
            VStack {
                Spacer()
                
                VStack(spacing: Theme.s16) {
                    AIOrbView(size: .small, face: orbFace, state: model.conversation)
                        .shadow(radius: 10)
                    
                    Text(statusText)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white.opacity(0.9))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(.ultraThinMaterial)
                        .background(Color.black.opacity(0.2))
                        .clipShape(Capsule())
                }
                .padding(.bottom, 140) // Position above control bar
            }

            // 3. Top Navigation
            VStack {
                HStack {
                    Button(action: { dismiss() }) {
                        Circle()
                            .fill(.ultraThinMaterial)
                            .frame(width: 44, height: 44)
                            .overlay(
                                Image(systemName: "chevron.left")
                                    .font(.system(size: 20, weight: .bold))
                                    .foregroundColor(Theme.text)
                            )
                            .shadow(color: .black.opacity(0.1), radius: 4, x: 0, y: 2)
                    }
                    Spacer()
                    
                    #if DEBUG
                    // Debug info
                    HStack(spacing: 8) {
                        Text(model.realtime.isConnected ? "🟢" : "🔴")
                        Text(model.conversation.rawValue)
                            .font(.caption2)
                            .foregroundStyle(.white)
                    }
                    .padding(6)
                    .background(.black.opacity(0.5))
                    .cornerRadius(8)
                    #endif
                }
                .padding(.horizontal, Theme.s24)
                
                Spacer()
            }
            .safeAreaInset(edge: .top, content: { Color.clear.frame(height: 10) })

            // 4. Bottom Control Bar
            VStack {
                Spacer()
                MiniTabBar {
                    PrimaryMicButton(state: buttonState, action: handleMicAction)
                        .disabled(model.isMicBusy)
                }
            }
            .ignoresSafeArea(.container, edges: .bottom)
            
            // 5. Bridge (Debug only - keep alive)
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
        .onDisappear {
            // Cancel any delayed capture when leaving Explore.
            pendingPhotoCapture?.cancel()
            pendingPhotoCapture = nil
        }
    }
    
    // MARK: - Helpers
    
    private var buttonState: PrimaryMicButton.State {
        switch model.conversation {
        case .idle: return .idle
        case .listening: return .listening
        case .thinking: return .listening
        case .speaking: return .speaking
        case .error: return .idle // Retry?
        }
    }
    
    private var statusText: String {
        switch model.conversation {
        case .idle: return "对准想看的东西"
        case .listening: return "我在听..."
        case .thinking: return "思考中..."
        case .speaking: return "小探探在说话"
        case .error: return "好像有点问题"
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

        if model.audio.isRecording {
            // Stop: cancel any pending delayed capture.
            pendingPhotoCapture?.cancel()
            pendingPhotoCapture = nil

            model.toggleTalking()
        } else {
            // Start
            model.toggleTalking()

            // Auto-capture photo shortly after start, but cancel if user stops quickly or navigates away.
            pendingPhotoCapture?.cancel()
            pendingPhotoCapture = Task {
                try? await Task.sleep(nanoseconds: 500_000_000) // let focus settle
                guard !Task.isCancelled else { return }
                guard model.mode == .explore else { return }
                guard model.audio.isRecording else { return }
                await model.captureAndSendPhoto()
            }
        }
    }
}

// Corner border shape for viewfinder
struct CornersBorder: Shape {
    let radius: CGFloat
    let length: CGFloat

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let r = radius
        let l = length
        
        // Top Left
        path.move(to: CGPoint(x: rect.minX, y: rect.minY + l))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
        path.addArc(center: CGPoint(x: rect.minX + r, y: rect.minY + r), radius: r, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        path.addLine(to: CGPoint(x: rect.minX + l, y: rect.minY))

        // Top Right
        path.move(to: CGPoint(x: rect.maxX - l, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
        path.addArc(center: CGPoint(x: rect.maxX - r, y: rect.minY + r), radius: r, startAngle: .degrees(270), endAngle: .degrees(360), clockwise: false)
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + l))

        // Bottom Right
        path.move(to: CGPoint(x: rect.maxX, y: rect.maxY - l))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
        path.addArc(center: CGPoint(x: rect.maxX - r, y: rect.maxY - r), radius: r, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        path.addLine(to: CGPoint(x: rect.maxX - l, y: rect.maxY))

        // Bottom Left
        path.move(to: CGPoint(x: rect.minX + l, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
        path.addArc(center: CGPoint(x: rect.minX + r, y: rect.maxY - r), radius: r, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY - l))

        return path
    }
}

#Preview {
    ExploreView(model: AppModel())
}
