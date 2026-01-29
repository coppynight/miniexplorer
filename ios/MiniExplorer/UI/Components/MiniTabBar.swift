import SwiftUI

/// A bottom control bar container matching `control-bar` in `prototype/styles.css`.
/// In the prototype, this contains just the main action button, but is named MiniTabBar in the plan
/// likely to support future tab switching or just as a structural name.
struct MiniTabBar<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(spacing: 0) {
            content
        }
        .padding(.horizontal, Theme.s24)
        .padding(.top, Theme.s24) // padding-top: var(--spacing-xl)
        .padding(.bottom, Theme.s24) // padding-bottom: var(--spacing-lg)
        .background(Theme.surface)
        .cornerRadius(Theme.r24, corners: [.topLeft, .topRight])
        .shadow(color: Color.black.opacity(0.04), radius: 20, x: 0, y: -4) // box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.04)
    }
}

// Helper for corner radius on specific corners
extension View {
    func cornerRadius(_ radius: CGFloat, corners: UIRectCorner) -> some View {
        clipShape(RoundedCorner(radius: radius, corners: corners))
    }
}

struct RoundedCorner: Shape {
    var radius: CGFloat = .infinity
    var corners: UIRectCorner = .allCorners

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: corners,
            cornerRadii: CGSize(width: radius, height: radius)
        )
        return Path(path.cgPath)
    }
}

#Preview {
    ZStack {
        Color.gray.opacity(0.1).ignoresSafeArea()
        VStack {
            Spacer()
            MiniTabBar {
                PrimaryMicButton(state: .idle, action: {})
            }
        }
    }
}
