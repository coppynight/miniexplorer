# Device Checklist — MiniExplorer

- **Date**: 2026-02-02
- **Purpose**: Real-device verification checklist for camera/mic/speaker.

## Permissions
- [ ] First launch prompts for Camera and Microphone appear.
- [ ] User can grant permissions and app continues without crash.
- [ ] Denying permissions shows a clear in-app message.

## Camera
- [ ] Explore mode shows **back camera** preview.
- [ ] Companion mode shows **front camera** preview.
- [ ] Capture photo returns a valid image (non-empty).

## Microphone / Recording
- [ ] Long-press mic button starts recording (haptic + UI state).
- [ ] Recording chunks are sent to realtime service (log visible).
- [ ] Releasing mic stops recording and triggers completion.

## Speaker / Playback
- [ ] Audio response plays through speaker.
- [ ] `isPlaying` state toggles correctly.

## Connectivity
- [ ] Switching Explore/Companion reconnects to correct botId.
- [ ] Network drop shows error state and retries/reconnects.

## Stability
- [ ] Background → foreground does not break session.
- [ ] Rapid mode switching does not crash or deadlock.
