//
//  AppConfig.swift
//  MiniExplorer
//
//  Configuration for Claude API integration
//

import Foundation

/// Application configuration containing API credentials and settings.
///
/// Note: This project uses Coze for realtime multimodal; keep values as placeholders for now.
enum AppConfig {

    // MARK: - Coze API

    static let cozeAPIBase = "https://api.coze.cn"
    static let cozeAccessToken = "YOUR_TOKEN" // TODO: load from Keychain / secure storage
    static let cozeConnectorId = "YOUR_CONNECTOR_ID" // Required for Realtime SDK
    static let cozeVoiceId = "" // Optional (TTS voice). Leave empty if not using.
    static let useWebViewMicOnly = true // Avoid native mic conflicts; WebView handles mic via Realtime SDK.
    static let useChatImageFallback = true // Use Chat API to parse images if realtime doesn't respond.

    // 探索模式 Bot
    static let explorerBotID = "YOUR_EXPLORER_BOT_ID"
    // 陪伴模式 Bot
    static let companionBotID = "YOUR_COMPANION_BOT_ID"

    // MARK: - Audio params (placeholder; Phase 4 will align implementation)

    static let audioSampleRate: Double = 24000
    static let audioChannels: Int = 1
    static let audioBitDepth: Int = 16

    // MARK: - App Settings

    static let maxRecordingDuration: TimeInterval = 60.0
}
