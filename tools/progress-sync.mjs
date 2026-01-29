import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

// Resolve paths relative to this script (stable no matter where it's invoked from)
const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const clawdRoot = path.resolve(scriptDir, '..', '..');
const statusPath = path.join(clawdRoot, 'canvas', 'miniexplorer-dashboard', 'status.json');
const statePath = path.join(clawdRoot, 'canvas', 'miniexplorer-dashboard', '.sync_state.json');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function parseTs(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

function minutesBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / 60000);
}

function formatMsg(status, { staleMins }) {
  const phase = status?.overall?.label ?? 'Unknown';
  const pct = status?.progress?.percent ?? '?';
  const text = status?.progress?.text ?? '';
  const gen = status?.generatedAt ?? '';

  const tasks = Array.isArray(status?.tasks) ? status.tasks : [];
  const running = tasks.filter(t => t.state === 'running');
  const ok = tasks.filter(t => t.state === 'ok');
  const blocked = tasks.filter(t => t.state === 'blocked' || t.state === 'stalled' || t.state === 'error');

  const lines = [];
  lines.push(`🔄 MiniExplorer 自动进度同步`);
  lines.push(`阶段: ${phase}`);
  lines.push(`进度: ${pct}%`);
  if (text) lines.push(`最新进展: ${text}`);
  if (running.length) {
    lines.push(`进行中: ${running.map(t => `${t.id}`).join(', ')}`);
  }
  if (blocked.length) {
    lines.push(`⚠️ 异常: ${blocked.map(t => `${t.id}:${t.state}`).join(', ')}`);
  }
  lines.push(`更新时间: ${gen}${staleMins != null ? `（已 ${staleMins} 分钟无更新）` : ''}`);

  return lines.join('\n');
}

function main() {
  const raw = fs.readFileSync(statusPath, 'utf8');
  const hash = sha256(raw);
  const status = JSON.parse(raw);

  const now = new Date();
  const genAt = parseTs(status.generatedAt);
  const staleMins = genAt ? minutesBetween(genAt, now) : null;

  let prev = { lastHash: null, lastSentAt: null, lastAlertAt: null };
  if (fs.existsSync(statePath)) {
    try { prev = { ...prev, ...readJson(statePath) }; } catch {}
  }

  const changed = prev.lastHash !== hash;

  // Stalled detection (no update for >= 30 min)
  const stalled = staleMins != null && staleMins >= 30;

  // Determine whether to send an alert (rate-limit to 30 min)
  let shouldAlert = false;
  if (stalled) {
    const lastAlertAt = parseTs(prev.lastAlertAt);
    const alertAge = lastAlertAt ? minutesBetween(lastAlertAt, now) : Infinity;
    if (alertAge >= 30) shouldAlert = true;
  }

  const out = {
    changed,
    stalled,
    staleMins,
    hash,
    statusSummary: {
      phase: status?.overall?.label ?? 'Unknown',
      percent: status?.progress?.percent ?? null,
      text: status?.progress?.text ?? null,
      generatedAt: status?.generatedAt ?? null,
    },
    message: formatMsg(status, { staleMins: stalled ? staleMins : null }),
  };

  // Persist state if we are going to send
  if (changed || shouldAlert) {
    const next = {
      lastHash: changed ? hash : prev.lastHash,
      lastSentAt: changed ? now.toISOString() : prev.lastSentAt,
      lastAlertAt: shouldAlert ? now.toISOString() : prev.lastAlertAt,
    };
    fs.writeFileSync(statePath, JSON.stringify(next, null, 2));
  }

  // Emit machine-readable line
  // ACTION=send when content changed
  // ACTION=alert when stalled and alert rate-limit passed
  if (changed) {
    console.log('ACTION=send');
    console.log(out.message);
    return;
  }

  if (shouldAlert) {
    console.log('ACTION=alert');
    console.log(out.message);
    return;
  }

  console.log('ACTION=none');
}

main();
