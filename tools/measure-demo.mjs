// Measures how fast the framed app demos show content while scrolling quickly.
// Usage: node tools/measure-demo.mjs http://127.0.0.1:8475/ [--slow]   (needs Chrome; --slow = 10 Mbit/s, 40 ms latency, 4x slower CPU)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:8475/';
const slow = process.argv.includes('--slow');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const port = 9300 + Math.floor(Math.random() * 500);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugm-'));
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--window-size=1360,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs; for (let i = 0; i < 50; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.find((t) => t.type === 'page')) break; } catch {} await sleep(200); }
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = new Map();
ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && wait.has(j.id)) { wait.get(j.id)(j.result); wait.delete(j.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: false });
await send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false });
if (slow) { await send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 1.25e6, uploadThroughput: 1.25e6 }); await send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
// before any page script runs: record when each demo iframe gets its "on" class (= content visible) and sample empty frames
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { if (top !== window) return; window.__m = { t0: performance.now(), on: {}, empty: 0, samples: 0, frames: 0 };
  const stamp = () => { document.querySelectorAll('.ug-app.on').forEach((f) => { if (!f.__s) { f.__s = 1; __m.on[Object.keys(__m.on).length] = Math.round(performance.now()); } }); };
  addEventListener('DOMContentLoaded', () => { new MutationObserver(stamp).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true }); });
  window.__sample = () => { const vh = innerHeight; document.querySelectorAll('.ug-stage').forEach((s) => { const r = s.getBoundingClientRect(); const vis = Math.min(r.bottom, vh) - Math.max(r.top, 0); if (vis > r.height * 0.25) { __m.samples++; const act = s.querySelector('.ug-pane.act .ug-app, .ug-pane:not(.ug-pane) .ug-app') || s.querySelector('.ug-app'); const tabbed = !!s.parentNode.querySelector('.ug-tabs'); const shown = tabbed ? !!s.querySelector('.ug-pane.act .ug-app.on') : !!s.querySelector('.ug-app.on'); if (!shown) __m.empty++; } }); }; })();` });
const t0 = Date.now();
await send('Page.navigate', { url });
await sleep(2500); // user lands on the page, starts scrolling right away
await ev(`new Promise((res) => { const H = document.documentElement.scrollHeight; let y = 0; const iv = setInterval(() => { y += 300; scrollTo(0, y); __sample(); if (y > H) { clearInterval(iv); res(); } }, 80); const sv = setInterval(__sample, 40); setTimeout(() => clearInterval(sv), 60000); })`);
await sleep(1500); await ev('__sample()');
await ev(`new Promise((r) => { const t = setInterval(() => { if (document.querySelectorAll('.ug-app.on').length >= 12) { clearInterval(t); r(); } }, 300); setTimeout(r, 120000); })`);
const m = await ev('JSON.stringify(__m)'); const r = JSON.parse(m);
const times = Object.values(r.on).sort((a, b) => a - b);
console.log(JSON.stringify({ url, slow, framesShown: times.length, totalFramesInPage: await ev('document.querySelectorAll(".ug-pane, .row .ug").length'), framesTotal: await ev(`document.querySelectorAll(".ug-app").length`), firstFrameMs: times[0], lastFrameMs: times[times.length - 1], medianMs: times[Math.floor(times.length / 2)], emptyFrameSamplesWhileScrolling: `${r.empty} of ${r.samples}`, bytesNote: 'see Network tab' }, null, 1));
ws.close(); proc.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
process.exit(0);
