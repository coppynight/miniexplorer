# Mode Switching — Explore / Companion

## Goal
Ensure a single shared realtime service can switch botId safely when the user changes modes, without crashes or deadlocks.

## Strategy
- **Single service instance**: AppModel owns a single `CozeRealtimeService`.
- **Mode change entry**: `enterMode(_:)` updates camera position and calls `connectIfNeeded()`.
- **BotId selection**:
  - Explore → `AppConfig.explorerBotID`
  - Companion → `AppConfig.companionBotID`
- **Debounce**: `connectedBotId` prevents duplicate connect calls on rapid tab toggles.
- **Observability**: log line on switch: `NSLog("[ModeSwitch] switching botId -> <botId>")`.
- **Failure handling**: on connect error, set conversation to `.error` and append a system message.

## Notes
- Current implementation reuses the WebView bridge session; we avoid forced disconnect to keep UI responsive.
- If needed later, we can add explicit disconnect/reconnect and retry backoff.
