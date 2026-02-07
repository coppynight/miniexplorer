export function speak(text) {
  if (text == null) return;
  if (!('speechSynthesis' in window)) return;

  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = 'zh-CN';
    u.rate = 1.0;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  } catch (_) {}
}
