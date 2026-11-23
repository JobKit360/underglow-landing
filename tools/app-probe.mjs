// Opens one demo scene directly at a phone size and reports anything wider than the screen. usage: node app-probe.mjs <url> <profiledir> <out.png> [width]
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); const PORT = 47296;
const W = +process.argv[5] || 390;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + process.argv[3], 'about:blank'], { stdio: 'ignore' });
let list; for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: W, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: process.argv[2] }); await sleep(7000);
console.log(await ev(`JSON.stringify({vw:innerWidth, sw:document.documentElement.scrollWidth, bw:document.body.scrollWidth, wide:[].filter.call(document.querySelectorAll('body *'),e=>{const b=e.getBoundingClientRect();return b.width>0&&(b.right>innerWidth+1||b.left<-1)}).slice(0,12).map(e=>e.tagName+'#'+e.id+'.'+(typeof e.className==='string'?e.className:'')+' '+Math.round(e.getBoundingClientRect().left)+'..'+Math.round(e.getBoundingClientRect().right))})`));
const c = (await send('Page.captureScreenshot', { format: 'png' })).result.data; fs.writeFileSync(process.argv[4], Buffer.from(c, 'base64'));
chrome.kill();
