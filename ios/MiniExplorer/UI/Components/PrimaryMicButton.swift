import SwiftUI

struct PrimaryMicButton: View {
    enum State {
        case idle
        case listening
        case speaking
        case ending
    }

    let state: State
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme.s8) {
                Image(systemName: iconName)
                    .font(.system(size: 22, weight: .semibold))
                
                Text(label)
                    .font(.system(size: 18, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Theme.s24) // Match padding: var(--spacing-lg) var(--spacing-xl) which is 24 32 roughly
            .background(backgroundColor)
            .foregroundColor(.white)
            .cornerRadius(100) // radius-full
            .shadow(color: shadowColor, radius: 16, x: 0, y: 8) // approximating shadows
            .scaleEffect(state == .listening ? 1.02 : 1.0)
            .animation(state == .listening ? Animation.easeInOut(duration: 1.0).repeatForever(autoreverses: true) : .default, value: state)
        }
        .buttonStyle(ScaleButtonStyle())
    }

    private var iconName: String {
        switch state {
        case .idle: return "mic.fill"
        case .listening: return "music.note"
        case .speaking: return "bubble.right.fill"
        case .ending: return "hand.wave.fill"
        }
    }

    private var label: String {
        switch state {
        case .idle: return "开始对话" // Or "Start Chat"
        case .listening: return "听着呢..."
        case .speaking: return "请稍等"
        case .ending: return "结束对话"
        }
    }

    private var backgroundColor: Color {
        switch state {
        case .idle: return Theme.primary
        case .listening: return Theme.secondary
        case .speaking: return Theme.accent
        case .ending: return Theme.textSecondary
        }
    }

    private var shadowColor: Color {
        switch state {
        case .idle: return Theme.primary.opacity(0.4)
        case .listening: return Theme.secondary.opacity(0.4)
        case .speaking: return Theme.accent.opacity(0.4)
        case .ending: return Color.black.opacity(0.1)
        }
    }
}

struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.2), value: configuration.isPressed)
    }
}

#Preview {
    VStack {
        PrimaryMicButton(state: .idle, action: {})
        PrimaryMicButton(state: .listening, action: {})
        PrimaryMicButton(state: .speaking, action: {})
        PrimaryMicButton(state: .ending, action: {})
    }
    .padding()
    .background(Theme.bg)
}
