import SwiftUI

/// Theme tokens mapped from `prototype/styles.css`.
///
/// Keep this file as the single source of truth for colors/spacing/radius/shadows.
enum Theme {
    // MARK: - Colors (prototype/styles.css)

    static let bg = Color(hex: 0xFAFAFA)          // --color-bg
    static let bgWarm = Color(hex: 0xF5F5F5)      // --color-bg-warm
    static let surface = Color(hex: 0xFFFFFF)     // --color-surface

    static let primary = Color(hex: 0x4A90D9)     // --color-primary
    static let primaryLight = Color(hex: 0x6BA3E3)
    static let primaryDark = Color(hex: 0x3A7BC8)

    static let secondary = Color(hex: 0x5BBFBA)   // --color-secondary
    static let secondaryLight = Color(hex: 0x7FCFCB)
    static let secondaryDark = Color(hex: 0x4AADA8)

    static let accent = Color(hex: 0xF5A962)      // --color-accent
    static let accentLight = Color(hex: 0xF7BB7F)
    static let accentDark = Color(hex: 0xE89545)

    static let text = Color(hex: 0x2C3E50)        // --color-text
    static let textSecondary = Color(hex: 0x7F8C9A)

    static let border = Color(hex: 0xE8ECF0)

    // MARK: - Gradients

    static let aiGradient = LinearGradient(
        colors: [primaryLight, secondary, secondaryLight],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let aiGradientSpeaking = LinearGradient(
        colors: [accent, accentLight],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let aiGradientListening = LinearGradient(
        colors: [secondary, secondaryDark],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let aiGradientIdle = LinearGradient(
        colors: [Color(hex: 0xE8ECF0), Color(hex: 0xD0D7DE)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    // MARK: - Spacing

    static let s4: CGFloat = 4
    static let s8: CGFloat = 8
    static let s16: CGFloat = 16
    static let s24: CGFloat = 24
    static let s32: CGFloat = 32
    static let s48: CGFloat = 48

    // MARK: - Radius

    static let r8: CGFloat = 8
    static let r12: CGFloat = 12
    static let r16: CGFloat = 16
    static let r24: CGFloat = 24

    // MARK: - Motion

    static let easeOut = Animation.timingCurve(0.25, 0.46, 0.45, 0.94, duration: 0.25)
    static let spring = Animation.timingCurve(0.34, 1.56, 0.64, 1.0, duration: 0.3)
}

// MARK: - Helpers

extension Color {
    init(hex: UInt32, alpha: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}
