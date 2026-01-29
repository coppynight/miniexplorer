# MiniExplorer Realtime Events（临时规范）

> 目的：把 Swift <-> JS 事件名与 payload 先固定下来，后续替换为真实 Coze SDK 时不改上层 UI。

## JS -> Swift (postMessage)
Channel: `window.webkit.messageHandlers.cozeBridge.postMessage({ type, payload })`

### loaded
- type: `loaded`
- payload: `{ ts: number }`

### connect
- type: `connect`
- payload: `{ ok: true, config }`

### disconnect
- type: `disconnect`
- payload: `{ ok: true }`

### completed
- type: `completed`
- payload: `{ ok: true, text?: string }`

## Swift -> JS (evaluateJavaScript)
Namespace: `window.MiniExplorerBridge`

- `connect({ baseUrl, token, botId })`
- `sendAudio(base64)`
- `sendImage(urlString)`
- `complete({})`
- `disconnect({})`
