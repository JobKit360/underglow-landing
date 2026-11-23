// Builds website/app/ from the REAL app UI (public/): the same stylesheets, scripts and markup the installed app runs,
// so the landing-page demo is the real UI, not a copy drawn by hand. Run again whenever the app's look changes:
//   node website/tools/build-demo-app.mjs
// Only the data is fake: website/app/demo-mock.js stands in for the server (scripted sample projects, bots and agents).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..');
const pub = path.resolve(site, '..', 'public');
const out = path.join(site, 'app');
const SKIP = new Set(['sw.js', 'manifest.webmanifest', 'index.html', 'logo-options.html', 'logo-options-2.html', 'logo-placeholder.svg', 'vendor']);

fs.mkdirSync(out, { recursive: true });
function copy(src, dst, deep) {
  fs.mkdirSync(dst, { recursive: true });
  for (const n of fs.readdirSync(src)) {
    if (SKIP.has(n)) continue;
    const s = path.join(src, n), d = path.join(dst, n);
    if (fs.statSync(s).isDirectory()) { if (deep || n === 'icons' || n === 'logos') copy(s, d, true); continue; }
    fs.copyFileSync(s, d);
  }
}
copy(pub, out);
fs.copyFileSync(path.join(pub, 'index.html'), path.join(out, 'index.html'));
// The pinned-column grid (branch pin-grid, not on this branch's app yet): applied to the demo copy only, so the demo shows it
fs.rmSync(path.join(out, 'pingrid.js'), { force: true }); // the patch creates it
execFileSync('patch', ['-p2', '-F3', '--no-backup-if-mismatch', '-d', out, '-i', path.join(here, 'pin-grid.patch')], { stdio: 'inherit' });
// phone layout: give Home a side margin so cards and the clock are not flush against the screen edges (demo copy only)
{ const hp = path.join(out, 'home.css'); fs.writeFileSync(hp, fs.readFileSync(hp, 'utf8').replace('#s-home.agpage:is(.on, .leave) { padding: 0 0 18px; }', '#s-home.agpage:is(.on, .leave) { padding: 0 14px 18px; scrollbar-gutter: auto; }')); }
// the app lazy-loads its own files by absolute path ('/codemap.css?v=1'); inside the site they live under /app/, so make those relative
const ABS = /(['"`])\/(?=(?:[\w-]+\.(?:css|js|svg|png)\b|logos\/|icons\/|vendor\/))/g;
for (const n of fs.readdirSync(out)) if (/\.js$/.test(n)) fs.writeFileSync(path.join(out, n), fs.readFileSync(path.join(out, n), 'utf8').replace(ABS, '$1').split("import('vendor/").join("import('./vendor/"));
// our own pieces: the fake server + scene scripts, and a stand-in for the Workbox's remote-screen viewer
const src = path.join(here, 'demo-src');
for (const n of fs.readdirSync(src)) {
  if (n === 'rfb.js') { fs.mkdirSync(path.join(out, 'vendor', 'novnc', 'core'), { recursive: true }); fs.copyFileSync(path.join(src, n), path.join(out, 'vendor', 'novnc', 'core', 'rfb.js')); }
  else fs.copyFileSync(path.join(src, n), path.join(out, n));
}

let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
html = html
  .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
  .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, '')
  .replace(/<link rel="(manifest|apple-touch-icon)"[^>]*>\s*/g, '')
  .replace(/<meta name="apple-mobile[^>]*>\s*/g, '')
  .replace(/(href|src)="\/(?!\/)/g, '$1="')
  .replace(/(['"`])\/(?=(?:[\w-]+\.(?:css|js|svg|png)\b|logos\/|icons\/))/g, '$1')
  .replace('<head>', '<head>\n<script src="demo-mock.js?v=' + Date.now().toString(36) + '"></script>\n<link rel="stylesheet" href="fonts/fonts.css">');
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('built', out, fs.readdirSync(out).length, 'files');
