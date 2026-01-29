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
  connect(config: { baseUrl: string; token: string; botId: string }): { ok: boolean };
  sendAudio(base64: string): void;
  sendImage(url: string): void;
  complete(): void;
  disconnect(): void;
}
```

## Acceptance (Evidence Chain)
1) File exists: `docs/specs/coze-bridge-api.md`
2) iOS build succeeds: `xcodebuild ... CODE_SIGNING_ALLOWED=NO clean build` → `BUILD SUCCEEDED`
3) Runtime evidence (manual): running app prints `[CozeBridge]` log with `{type:"ready"...}`
