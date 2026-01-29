import SwiftUI

/// Phase 5.3: Record button component.
///
/// - Tap toggles (for now) to keep demo simple.
/// - Later can be upgraded to a true press-and-hold gesture.
struct RecordButton: View {
    let isRecording: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Circle()
                    .fill(isRecording ? Color.red : Color.gray)
                    .frame(width: 12, height: 12)
                Text(isRecording ? "松开结束" : "按住说话")
                    .font(.callout)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(.thinMaterial)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isRecording ? "Stop Recording" : "Start Recording")
    }
}

#Preview {
    VStack(spacing: 16) {
        RecordButton(isRecording: false) {}
        RecordButton(isRecording: true) {}
    }
    .padding()
}
