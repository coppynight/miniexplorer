# Coze Bridge API (JS ↔ Swift)

> Phase 2.2

## Goals
- Define a stable contract between Swift (`CozeRealtimeService`) and the JS bridge running inside WKWebView.
- Enable incremental development: JS can be stubbed while Swift/UI proceeds.

## Transport
- **JS → Swift**: `window.webkit.messageHandlers.cozeBridge.postMessage({ type, payload })`
- **Swift → JS**: `WKWebView.evaluateJavaScript(...)` calling `window.MiniExplorerBridge.*`

## Message schema (JS → Swift)
```ts
type BridgeMessage = {
  type: string;      // e.g. 'ready', 'connect', 'audio', 'completed', 'error'
  payload?: any;     // JSON-serializable
}
```

### Required events
- `ready`
  - payload: `{ ts: number, version: string }`
- `loaded`
  - payload: `{ ts: number }`
- `error`
  - payload: `{ message: string, detail?: any }`

### Realtime events (future)
- `audio`
  - payload: `{ base64: string }` OR `{ bytes: number, chunkIndex?: number }`
- `completed`
  - payload: `{ ok: true }`

## JS API (Swift → JS)
JS must expose `window.MiniExplorerBridge`.

```ts
interface MiniExplorerBridge {
  connect(config: {
    baseUrl: string;
    token: string;
    botId: string;
    voiceId?: string;
    connectorId?: string;
    debug?: boolean;
    enableVideo?: boolean;
    videoInputDeviceId?: string;
    mirrorVideo?: boolean; // apply horizontal flip to local video preview
  }): { ok: boolean };
  sendAudio(base64: string): void;
  sendImage(payload: { fileId?: string; fileUrl?: string } | string): void;
  complete(): void;
  disconnect(): void;
}
```

**Notes (Realtime SDK):**
- Current JS bridge uses `@coze/realtime-api` in the WKWebView.
- `sendAudio(base64)` does **not** upload raw PCM yet; it simply ensures the WebView mic is unmuted via `setAudioEnable(true)`.
- `sendImage` expects a `fileId` from Coze Files API (`/v1/files/upload`). If only `fileUrl` is provided, it sends an `image` object with `file_url`.
- Native audio streaming → Coze will be wired later when the realtime SDK exposes a raw-audio ingest path.

## Acceptance (Evidence Chain)
1) File exists: `docs/specs/coze-bridge-api.md`
2) iOS build succeeds: `xcodebuild ... CODE_SIGNING_ALLOWED=NO clean build` → `BUILD SUCCEEDED`
3) Runtime evidence (manual): running app prints `[CozeBridge]` log with `{type:"ready"...}`
