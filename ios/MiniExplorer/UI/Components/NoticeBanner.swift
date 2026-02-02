import SwiftUI

struct NoticeBanner: View {
    enum Style {
        case error
        case info
    }

    let text: String
    var style: Style = .error
    var onDismiss: (() -> Void)? = nil

    private var background: Color {
        switch style {
        case .error: return Color.red.opacity(0.9)
        case .info: return Theme.primary.opacity(0.9)
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: Theme.s8) {
            Text(text)
                .font(.caption)
                .foregroundColor(.white)
                .multilineTextAlignment(.leading)
                .lineLimit(3)

            Spacer(minLength: 8)

            if let onDismiss {
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.caption.bold())
                        .foregroundColor(.white)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, Theme.s12)
        .padding(.vertical, Theme.s8)
        .background(background)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .shadow(color: .black.opacity(0.15), radius: 8, x: 0, y: 4)
    }
}

private extension Theme {
    static let s12: CGFloat = 12
}
