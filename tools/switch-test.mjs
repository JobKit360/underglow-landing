// Headless Chrome check: switch through every demo tab repeatedly and confirm no frame loads/navigations after the first load.
// usage: node switch-test.mjs <url> <outdir>
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
const [url, out] = [process.argv[2], process.argv[3]]; fs.mkdirSync(out, { recursive: true });
const up = await fetch('http://127.0.0.1:47299/json/version').then(() => true, () => false); // reuse a headless Chrome already started on this port
const chrome = up ? { kill() {} } : spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=47299', '--user-data-dir=' + path.resolve(out, 'profile'), 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let list; for (let i = 0; i < 40; i++) { try { list = await (await fetch('http://127.0.0.1:47299/json')).json(); break; } catch { await sleep(250); } }
const page = list.find(t => t.type === 'page'); const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}, events = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); else if (d.method) events.push(d); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url }); await sleep(2500);
await ev(`document.getElementById('heroDemo').scrollIntoView()`); await sleep(10000); // first load + preload of every scene
const shot = async (n) => fs.writeFileSync(out + '/' + n + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
await shot('01-start');
const t0 = events.length;
await ev(`[].forEach.call(document.querySelectorAll('#heroDemo iframe'), (f,i)=>{ f.contentWindow.__mark = 'm'+i; }); 1`);
const nFrames = await ev(`document.querySelectorAll('#heroDemo iframe').length`);
const tabs = await ev(`document.querySelectorAll('#heroDemo .ug-tabs button').length`);
const log = [];
for (let round = 0; round < 3; round++) for (let i = 0; i < tabs; i++) {
  await ev(`document.querySelectorAll('#heroDemo .ug-tabs button')[${i}].click()`); await sleep(250);
  if (round === 0) await shot('mid-' + i); // mid-transition
  await sleep(800);
  if (round === 0) await shot('tab-' + i);
  log.push(JSON.parse(await ev(`JSON.stringify({sel: document.querySelector('#heroDemo [aria-selected=true]').textContent, activePanels: document.querySelectorAll('#heroDemo .ug-pane.act').length, frames: document.querySelectorAll('#heroDemo iframe').length, survivingMarks: [].map.call(document.querySelectorAll('#heroDemo iframe'), f=>f.contentWindow.__mark).join(',')})`)));
}
const after = events.slice(t0).filter(e => /^Page\.(frameNavigated|frameStartedLoading|frameStoppedLoading|navigatedWithinDocument|loadEventFired|domContentEventFired|frameAttached)/.test(e.method));
const res = { framesInHeroDemo: nFrames, tabs, switches: log.length, frameLoadOrNavEventsAfterFirstLoad: after.length, eventsDetail: after.map(e => e.method), log };
fs.writeFileSync(out + '/result.json', JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1));
ws.close(); chrome.kill();
