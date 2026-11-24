// Checks every page at phone width (375px): sideways overflow, console errors, broken internal links/anchors, headings, images without alt.
// Usage: node tools/check-pages.mjs http://127.0.0.1:8475   (needs Chrome). Saves phone screenshots next to the temp folder path it prints.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = (process.argv[2] || 'http://127.0.0.1:8475').replace(/\/$/, '');
const pages = ['index.html', 'account.html?mode=signup', 'account.html?mode=signin', 'terms.html', 'privacy.html', 'credits.html'];
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const port = 9300 + Math.floor(Math.random() * 500), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-'));
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs; for (let i = 0; i < 50; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.find((t) => t.type === 'page')) break; } catch {} await sleep(200); }
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = new Map(), logs = [];
ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && wait.has(j.id)) { wait.get(j.id)(j.result); wait.delete(j.id); } else if (j.method === 'Runtime.exceptionThrown') logs.push(j.params.exceptionDetails.text + ' ' + (j.params.exceptionDetails.exception?.description || '')); else if (j.method === 'Log.entryAdded' && j.params.entry.level === 'error') logs.push(j.params.entry.text + ' ' + (j.params.entry.url || '')); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
await send('Page.enable'); await send('Log.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
for (const p of pages) {
  logs.length = 0; await send('Page.navigate', { url: `${base}/${p}` }); await sleep(3500);
  const r = JSON.parse(await ev(`(async () => { const w = document.documentElement.clientWidth; const wide = [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > w + 1 && !e.closest('.ug, .hero-bg, .glow, .final, .shotwrap, .band'); }).slice(0, 5).map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right));
    const links = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')); const bad = [];
    for (const h of new Set(links)) { if (h.startsWith('#')) { if (h.length > 1 && !document.querySelector(h)) bad.push(h + ' (no such section)'); } else if (!/^https?:|^mailto:/.test(h)) { const u = h.split('#')[0]; const x = await fetch(u, { method: 'HEAD' }).catch(() => null); if (!x || !x.ok) bad.push(h + ' (' + (x && x.status) + ')'); const a = h.split('#')[1]; } }
    return JSON.stringify({ scrollW: document.documentElement.scrollWidth, clientW: w, wide, badLinks: bad, h1: document.querySelectorAll('h1').length, headings: [...document.querySelectorAll('h1,h2,h3')].map((h) => h.tagName[1]).join(''), imgNoAlt: document.querySelectorAll('img:not([alt])').length, title: document.title, desc: !!document.querySelector('meta[name=description]') }); })()`));
  const shot = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(dir, p.replace(/[^\w]/g, '_') + '.png'), Buffer.from(shot.data, 'base64'));
  console.log(p, JSON.stringify({ overflowPx: r.scrollW - r.clientW, wide: r.wide, badLinks: r.badLinks, h1: r.h1, imgNoAlt: r.imgNoAlt, title: r.title.slice(0, 50), desc: r.desc, consoleErrors: logs.slice(0, 3) }));
}
console.log('screens:', dir);
ws.close(); proc.kill(); process.exit(0);
