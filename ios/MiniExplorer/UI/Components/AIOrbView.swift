import SwiftUI

/// AI orb avatar component (Home big orb / Explore floating orb).
struct AIOrbView: View {
    enum Size {
        case large
        case small

        var diameter: CGFloat {
            switch self {
            case .large: return 140
            case .small: return 72
            }
        }

        var faceFont: Font {
            switch self {
            case .large: return .system(size: 56)
            case .small: return .system(size: 28)
            }
        }

        var glowDiameter: CGFloat {
            switch self {
            case .large: return 200
            case .small: return 120
            }
        }

        var glowBlur: CGFloat {
            switch self {
            case .large: return 60
            case .small: return 36
            }
        }
    }

    let size: Size
    let face: String
    let state: AppModel.ConversationState

    @State private var floatY: CGFloat = 0

    var body: some View {
        ZStack {
            Circle()
                .fill(orbGradient)
                .frame(width: size.glowDiameter, height: size.glowDiameter)
                .blur(radius: size.glowBlur)
                .opacity(0.30)

            Circle()
                .fill(orbGradient)
                .frame(width: size.diameter, height: size.diameter)
                .overlay(
                    Circle()
                        .fill(
                            RadialGradient(colors: [Color.white.opacity(0.7), .clear], center: .topLeading, startRadius: 0, endRadius: size.diameter * 0.4)
                        )
                        .frame(width: size.diameter * 0.6, height: size.diameter * 0.6)
                        .offset(x: -size.diameter * 0.12, y: -size.diameter * 0.12)
                )
                .overlay(
                    Text(face)
                        .font(size.faceFont)
                        .shadow(color: .black.opacity(0.12), radius: 4, x: 0, y: 2)
                )
                .shadow(color: .black.opacity(0.10), radius: 24, x: 0, y: 16)
                .shadow(color: glowShadowColor.opacity(0.25), radius: 32)
                .offset(y: floatY)
                .scaleEffect(state == .speaking ? 1.05 : 1.0)
                .animation(state == .speaking ? Animation.easeInOut(duration: 0.5).repeatForever(autoreverses: true) : .default, value: state)
                .onAppear {
                    withAnimation(.easeInOut(duration: 4).repeatForever(autoreverses: true)) {
                        floatY = -6
                    }
                }
        }
        .accessibilityLabel("AI Orb")
    }

    private var orbGradient: LinearGradient {
        switch state {
        case .idle: return Theme.aiGradient
        case .listening: return Theme.aiGradientListening
        case .thinking: return Theme.aiGradient
        case .speaking: return Theme.aiGradientSpeaking
        case .error: return Theme.aiGradientIdle
        }
    }

    private var glowShadowColor: Color {
        switch state {
        case .speaking: return Theme.accent
        case .listening: return Theme.secondary
        default: return Theme.primary
        }
    }
}

#Preview {
    VStack(spacing: 24) {
        AIOrbView(size: .large, face: "😊", state: .idle)
        AIOrbView(size: .small, face: "😊", state: .speaking)
    }
    .padding()
    .background(Theme.bg)
}
