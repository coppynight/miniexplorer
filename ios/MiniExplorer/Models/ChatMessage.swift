import Foundation

struct ChatMessage: Identifiable, Equatable {
    enum Role: String {
        case user
        case assistant
        case system
    }

    let id: UUID
    let role: Role
    let text: String
    let imageData: Data?
    let createdAt: Date

    init(role: Role, text: String = "", imageData: Data? = nil, createdAt: Date = Date(), id: UUID = UUID()) {
        self.role = role
        self.text = text
        self.imageData = imageData
        self.createdAt = createdAt
        self.id = id
    }

    static func == (lhs: ChatMessage, rhs: ChatMessage) -> Bool {
        lhs.id == rhs.id
    }
}
