// Headless Chrome check of the landing page at many widths: screenshots of the phone scene (hero tab + feature row) and a horizontal-overflow report.
// usage: node phone-check.mjs <url> <outdir> <prefix>
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
const [url, out, pre] = [process.argv[2], process.argv[3], process.argv[4] || 'x']; fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PORT = 47298;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.resolve(out, 'profile-' + pre), 'about:blank'], { stdio: 'ignore' });
let list; for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable');
const sizes = [['desktop', 1920, 1080], ['laptop', 1366, 768], ['tablet', 820, 1100], ['p430', 430, 900], ['p390', 390, 844], ['p360', 360, 740]];
const res = [];
for (const [n, w, h] of sizes) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await send('Page.navigate', { url }); await sleep(2500);
  await ev(`document.getElementById('heroDemo').scrollIntoView({block:'center',behavior:'instant'})`); await sleep(6000);
  await ev(`[].find.call(document.querySelectorAll('#heroDemo .ug-tabs button'), b=>/Phone/.test(b.textContent)).click()`); await sleep(2500);
  const shotEl = async (sel, name) => { const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const b=e.getBoundingClientRect(); return {x:b.x+scrollX,y:b.y+scrollY,w:b.width,h:b.height}})()`); if (!r) return; const c = (await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 10), width: Math.min(r.w + 20, w), height: r.h + 20, scale: 1 } })).result.data; fs.writeFileSync(`${out}/${pre}-${n}-${name}.png`, Buffer.from(c, 'base64')); };
  await shotEl('#heroDemo', 'hero-phone');
  await ev(`document.documentElement.style.scrollBehavior='auto'; document.querySelector('[data-demo=phone]').scrollIntoView({block:'center',behavior:'instant'})`); await sleep(5000);
  await shotEl('[data-demo=phone]', 'row-phone');
  const m = JSON.parse(await ev(`JSON.stringify({doc: document.documentElement.scrollWidth, vw: innerWidth, wide: [].filter.call(document.querySelectorAll('body *'), e=>{const b=e.getBoundingClientRect(); return b.width>0&&b.right>innerWidth+1&&!e.closest('.ug-tabs')&&getComputedStyle(e).position!=='fixed'}).slice(0,8).map(e=>e.tagName+'.'+e.className+' r='+Math.round(e.getBoundingClientRect().right)),
    heroPhone: (()=>{const v=document.querySelector('#heroDemo .ug-pane.phone .ug-view'),s=document.querySelector('#heroDemo .ug-stage'); if(!v) return null; const a=v.getBoundingClientRect(),b=s.getBoundingClientRect(); return {phone:[a.left,a.right,a.width,a.height].map(Math.round), stage:[b.left,b.right,b.width,b.height].map(Math.round)}})(),
    rowPhone: (()=>{const v=document.querySelector('[data-demo=phone] .ug-view'),s=document.querySelector('[data-demo=phone] .ug-stage'); if(!v) return null; const a=v.getBoundingClientRect(),b=s.getBoundingClientRect(); return {phone:[a.left,a.right,a.width,a.height].map(Math.round), stage:[b.left,b.right,b.width,b.height].map(Math.round)}})()})`));
  res.push({ n, w, ...m });
  if (n === 'p390' || n === 'desktop') { await ev('scrollTo(0,0)'); await sleep(500); const c = (await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).result.data; fs.writeFileSync(`${out}/${pre}-${n}-fullpage.png`, Buffer.from(c, 'base64')); }
}
console.log(JSON.stringify(res)); ws.close(); chrome.kill();
