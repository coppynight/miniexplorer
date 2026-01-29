import SwiftUI

struct ActionCard: View {
    let title: String
    let systemImage: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme.s16) {
                ZStack {
                    RoundedRectangle(cornerRadius: Theme.r12, style: .continuous)
                        .fill(tint.opacity(0.12))
                        .frame(width: 48, height: 48)
                    Image(systemName: systemImage)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(tint)
                }

                Text(title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Theme.text)

                Spacer()
            }
            .padding(Theme.s16)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.r16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.r16, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.04), radius: 12, x: 0, y: 6)
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    VStack(spacing: 16) {
        ActionCard(title: "看看这是什么", systemImage: "magnifyingglass", tint: Theme.primary) {}
        ActionCard(title: "和我聊聊天", systemImage: "message", tint: Theme.secondary) {}
    }
    .padding()
    .background(Theme.bg)
}
