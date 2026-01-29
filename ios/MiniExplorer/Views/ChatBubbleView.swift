import SwiftUI

struct ChatBubbleView: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.role != .user { Spacer(minLength: 24) }

            Text(message.text)
                .font(.callout)
                .foregroundStyle(message.role == .user ? .white : .primary)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(message.role == .user ? Color.accentColor : Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .frame(maxWidth: 280, alignment: message.role == .user ? .trailing : .leading)

            if message.role == .user { Spacer(minLength: 24) }
        }
        .frame(maxWidth: .infinity)
    }
}

#Preview {
    VStack(spacing: 12) {
        ChatBubbleView(message: ChatMessage(role: .system, text: "系统消息"))
        ChatBubbleView(message: ChatMessage(role: .assistant, text: "我来帮你分析一下…"))
        ChatBubbleView(message: ChatMessage(role: .user, text: "这是什么？"))
    }
    .padding()
}
