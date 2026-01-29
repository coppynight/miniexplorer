MiniExplorer progress sync runner.

Steps:
1) Run `node miniexplorer/tools/progress-sync.mjs` from `/Users/xiaokai/clawd`.
2) If output starts with `ACTION=send`, send the remaining text to Telegram chatId 8380552044.
3) If output starts with `ACTION=alert`, send the remaining text to Telegram chatId 8380552044, and include a short line asking if any worker is blocked.
4) If `ACTION=none`, do nothing.

Notes:
- Never send to name "Kai"; use chatId.
- Cronome: cron job should only spawn a runner session.
