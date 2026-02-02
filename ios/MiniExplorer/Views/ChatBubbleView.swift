import SwiftUI
import UIKit

struct ChatBubbleView: View {
    let message: ChatMessage

    private var isUser: Bool { message.role == .user }
    private var hasText: Bool { !message.text.isEmpty }
    private var hasImage: Bool { message.imageData != nil }

    var body: some View {
        HStack {
            if !isUser { Spacer(minLength: 24) }

            bubbleContent
                .padding(.horizontal, hasImage && !hasText ? 0 : 12)
                .padding(.vertical, hasImage && !hasText ? 0 : 10)
                .background(isUser ? Color.accentColor : Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .frame(maxWidth: 280, alignment: isUser ? .trailing : .leading)

            if isUser { Spacer(minLength: 24) }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var bubbleContent: some View {
        VStack(alignment: isUser ? .trailing : .leading, spacing: hasImage && hasText ? 6 : 0) {
            if let data = message.imageData, let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 220, maxHeight: 220)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }

            if hasText {
                Text(message.text)
                    .font(.callout)
                    .foregroundStyle(isUser ? .white : .primary)
            }
        }
    }
}

#Preview {
    let sampleImage = UIImage(systemName: "camera")?.withTintColor(.white, renderingMode: .alwaysOriginal)
    let sampleData = sampleImage?.pngData()

    return VStack(spacing: 12) {
        ChatBubbleView(message: ChatMessage(role: .system, text: "系统消息"))
        ChatBubbleView(message: ChatMessage(role: .assistant, text: "我来帮你分析一下…"))
        ChatBubbleView(message: ChatMessage(role: .user, text: "这是什么？"))
        ChatBubbleView(message: ChatMessage(role: .user, text: "", imageData: sampleData))
        ChatBubbleView(message: ChatMessage(role: .assistant, text: "看起来像一个相机", imageData: sampleData))
    }
    .padding()
}
