import Foundation

struct UploadedFile: Codable {
    let id: String
    let bytes: Int?
    let createdAt: Int?
    let fileName: String?

    enum CodingKeys: String, CodingKey {
        case id
        case bytes
        case createdAt = "created_at"
        case fileName = "file_name"
    }
}
