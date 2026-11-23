// Built-in browser: one browser per workspace page, many tabs each, inside Foreman. Nothing is shared between pages: each page has its own tabs,
// its own open / closed state and Browser-or-Android choice, and (desktop shell with pagePartitions) its own cookie jar / storage
// (webview partition persist:foreman-browser-<page>). index.html calls abPage(<page>) when the page on screen changes; screens that are not agents pages
// get their own browser too (pageKey: 's-<tab>'), never the last agents page's.
// Tabs: an AGENT tab per agent that gave a test link (follows that agent's newest link; closes when the agent is removed) and the user's OWN tabs
// (+ button; never touched by agents). Both kinds are kept across reloads / restarts / Ctrl+1/2 in localStorage 'abTabs' (agent tabs come back on their agent's page and close once the server says that agent is gone). Closing an agent closes only its tab, never the browser.
// Opening a link that is already open in any tab goes to that tab and reloads it (no duplicates).
// Engine: the desktop app (webviewTag on in desktop/main.cjs) uses <webview>: real back / forward, page titles, loading state, no framing limits.
// Anywhere else (phone / plain browser) it falls back to <iframe>: same tabs, but back/forward stay disabled (a cross-site frame's history can't be driven).
// Panel: over the open page's work area (desktop), full screen on a phone. Toggle: the browser button top right (or Esc to hide when floating). Hiding keeps every page alive.
// Phone view (phone button, desktop only): the page shows in an iPhone 15 screen, true shape (393 × 852 CSS px viewport, drawn smaller to fit: page zoom on an older shell, the emulation's scale on the newer one). The tab on the phone's left side unfolds it into a foldable (Galaxy Z Fold inner screen, 690 × 829) with a book-opening flip, and folds it back. Desktop app with the newer shell: real mobile emulation
// (main.cjs 'hud-phone-emu': mobile viewport, touch from the mouse, pointer: coarse, phone user agent). Older shell: phone user agent + a
// touch shim (mouse → touch events, drag to scroll). Either way the mouse is a round dot over the page so it's obvious it's touch.
// Dock (dock button, desktop only, on by default): the browser takes a column on the right of the page and the agents' panes shrink beside it,
// so both are in view; drag the handle on its left edge to resize (double-click: default width); in phone view the column just fits the device, no resizing. Undocked it floats over the work area as before.
// Uses index.html globals: agents, esc, PH.
(() => {
  // Electron webview available (desktop app with webviewTag)? Electron defines the element AFTER this script runs, so it is checked
  // again right after load (upgrade): any tab already made as an iframe is rebuilt as a webview at its current address.
  let WV = !!window.customElements?.get('webview');
  const isWv = t => t?.el?.tagName === 'WEBVIEW';
  const upgrade = () => { if (WV || !window.customElements?.get('webview')) return; WV = true; // (whenDefined never fires for it: checked right after load instead)
    for (const t of tabs.values()) if (t.el && !isWv(t)) { t.el.remove(); t.el = null; t.ready = false; t.blocked = false; makeEl(t); if (t.key === cur) t.el.classList.add('on'); }
    tools(); };
  for (const ms of [0, 300, 1500, 5000]) setTimeout(upgrade, ms);
  const tabs = new Map(); // key ('a:<agentId>' | 'u:<n>') → { key, pg, agent, home, url, title, el, btn, back, fwd, loading, fresh }
  let cur = null, open = false, seq = 0, andMode = false; // cur / open / andMode: the page on screen's (other pages' are kept in pgState)
  let slideRaf = 0, closing = false, slideW = 0; // docked open / close slide (show)
  let pg = 'foreman'; const pgState = new Map(); // page → { cur, open, andMode, curUrl }
  // Each page's browser / Android state is also kept in localStorage ('abPages'), so a reload (the HUD auto-refreshes, app restart, Ctrl+1/2) brings
  // every page back as it was left: open or closed, Browser or Android, the tab that was on screen. booted: abPage has applied the saved state once.
  let booted = false;
  try { for (const [k, v] of Object.entries(JSON.parse(localStorage.getItem('abPages') || '{}'))) if (v && typeof v === 'object') pgState.set(k, { cur: null, curUrl: String(v.curUrl || ''), open: !!v.open, andMode: !!v.andMode, v: v.v && typeof v.v === 'object' ? v.v : null }); } catch {}
  const curUrl = () => { const t = tabs.get(cur); return t ? t.url || t.home || '' : ''; };
  const viewNow = () => ({ phone, fold: unfolded, app: appMode, dock: docked, dockW: dockWv }); // this page's view settings (see dockWv)
  const savePgs = () => { if (!booted) return; const o = {}; for (const [k, v] of pgState) o[k] = { open: v.open, andMode: v.andMode, curUrl: v.curUrl || (tabs.get(v.cur)?.url || tabs.get(v.cur)?.home || ''), v: v.v || null };
    o[pg] = { open, andMode, curUrl: curUrl(), v: viewNow() }; try { localStorage.setItem('abPages', JSON.stringify(o)); } catch {} };
  const mine = () => [...tabs.values()].filter(t => t.pg === pg); // this page's tabs
  // the page an agent works on (server summary .side); chats (Foreman 'dobby', 'orch_<page>') carry no side: their page comes from chatPageOf (index.html)
  const agentPg = id => { const a = agents.get(id); return a?.side || (a && typeof chatPageOf === 'function' ? chatPageOf(a) : null) || pg; };
  // Which browser is on screen: every tab of the app has its own (2026-11-16: pages are totally independent, nothing carries over).
  // Agents pages = their page id; any other screen (Booth, screen pages…) gets its own key instead of borrowing the last agents page's browser.
  const pageKey = g => { try { const p = typeof agPageTab === 'function' && typeof tab !== 'undefined' ? agPageTab(tab) : null; if (p) return p.g;
    if (typeof tab === 'string' && tab) return ('s-' + tab.replace(/[^\w-]+/g, '-')).slice(0, 48); } catch {} return g; };
  let phone = (() => { try { return localStorage.getItem('abPhone') === '1'; } catch { return false; } })();
  const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const AND = m => `Mozilla/5.0 (Linux; Android 14; ${m}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36`;
  // r: screen corner radius (CSS px). vt / vb: Safari's own chrome on a real iPhone (status bar + Dynamic Island on top, the bottom address
  // bar + toolbar + home indicator below, toolbar expanded): the page only gets the 393 × 659 between them, so the phone view does the same (iosChrome)
  const IPHONE = { id: 'ip15', w: 393, h: 852, dpr: 3, ua: IOS, platform: 'iPhone', r: 55, vt: 59, vb: 134, ios: true };
  // Home Screen app (the app button beside the phone button): the page as if added to the Home Screen from Safari: no Safari bars, the whole
  // 393 x 852 screen, safe-area insets (top 59, bottom 34), navigator.standalone + (display-mode: standalone) true (desktop/main.cjs hud-phone-emu).
  // The page's apple-mobile-web-app-status-bar-style decides the top: black-translucent = page runs under the status bar; else it starts below a bar.
  let appMode = (() => { try { return localStorage.getItem('abApp') === '1'; } catch { return false; } })();
  const iphoneSet = sbs => { const tl = (sbs || 'default') === 'black-translucent';
    Object.assign(IPHONE, appMode ? { id: 'ip15app', vt: tl ? 0 : 59, vb: 0, safe: { top: tl ? 59 : 0, bottom: 34 }, standalone: true, tl } : { id: 'ip15', vt: 59, vb: 134, safe: null, standalone: false, tl: false }); };
  iphoneSet();
  const FOLD = { id: 'fold', w: 690, h: 829, dpr: 2.625, ua: AND('SM-F946B'), platform: 'Linux armv8l', r: 26 }; // Galaxy Z Fold, unfolded
  let unfolded = (() => { try { return localStorage.getItem('abFold') === '1'; } catch { return false; } })();
  let dev = unfolded ? FOLD : IPHONE, ps = 1; // ps: how much the screen is shrunk to fit (≤ 1); the page still gets the full device viewport
  const mode = () => phone ? dev.id : ''; // what a tab's page should currently be set up as ('' = normal page)
  const pageH = () => dev.h - (dev.vt || 0) - (dev.vb || 0); // the page's viewport height inside the device's own chrome
  const DOT = `html,html *,html *::before,html *::after{cursor:url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><circle cx="13" cy="13" r="10" fill="rgba(120,120,128,.45)" stroke="white" stroke-width="2"/><circle cx="13" cy="13" r="10" fill="none" stroke="rgba(0,0,0,.35)" stroke-width=".8"/></svg>')}") 13 13,pointer!important}html{-webkit-tap-highlight-color:rgba(0,0,0,.1)}::-webkit-scrollbar{display:none!important}`;
  // Older desktop shell only (no real emulation): mouse → touch events, drag scrolls the nearest scroller, letting go while moving keeps it gliding (iOS-like deceleration; a touch stops it without clicking), a drag never clicks
  const SHIM = `(()=>{if(window.__fmPhone)return;window.__fmPhone=1;try{Object.defineProperty(Navigator.prototype,'maxTouchPoints',{get:()=>5,configurable:true})}catch{}if(!('ontouchstart' in window))window.ontouchstart=null;
let d=null,lx=0,ly=0,mv=false,sc=null,kill=false;const T=e=>new Touch({identifier:1,target:d.t,clientX:e.clientX,clientY:e.clientY,pageX:e.pageX,pageY:e.pageY,screenX:e.screenX,screenY:e.screenY,radiusX:11,radiusY:11,force:1});
const F=(ty,t)=>{const l=ty==='touchend'?[]:[t];try{return d.t.dispatchEvent(new TouchEvent(ty,{bubbles:true,cancelable:true,composed:true,touches:l,targetTouches:l,changedTouches:[t]}))}catch{return true}};
const S=el=>{for(;el&&el.nodeType===1&&el!==document.documentElement&&el!==document.body;el=el.parentElement){const s=getComputedStyle(el);if(/(auto|scroll|overlay)/.test(s.overflowY+s.overflowX)&&(el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1))return el}return document.scrollingElement||document.documentElement};
let fl=0,pts=[];const stop=()=>{cancelAnimationFrame(fl);fl=0};const by=(el,x,y)=>{const a=el.scrollLeft,b=el.scrollTop;el.scrollBy({left:x,top:y,behavior:'instant'});return el.scrollLeft!==a||el.scrollTop!==b};
const fling=(el,vx,vy)=>{let p=performance.now(),rx=0,ry=0;const f=n=>{const dt=Math.min(32,n-p);p=n;const k=Math.pow(.998,dt);vx*=k;vy*=k;rx+=vx*dt;ry+=vy*dt;const ix=Math.trunc(rx),iy=Math.trunc(ry);rx-=ix;ry-=iy;if((ix||iy)&&!by(el,ix,iy)||Math.hypot(vx,vy)<.015)return fl=0;fl=requestAnimationFrame(f)};fl=requestAnimationFrame(f)};
addEventListener('mousedown',e=>{if(e.button)return;const st=!!fl;stop();d={t:e.target,st};lx=e.clientX;ly=e.clientY;mv=false;pts=[[performance.now(),e.clientX,e.clientY]];sc=S(e.target);d.ok=F('touchstart',T(e))},true);
addEventListener('mousemove',e=>{if(!d)return;if(!(e.buttons&1)){d=null;return}const dx=e.clientX-lx,dy=e.clientY-ly;if(!dx&&!dy)return;if(!mv&&Math.abs(dx)+Math.abs(dy)<6)return;mv=true;const ok=F('touchmove',T(e));e.preventDefault();getSelection()?.removeAllRanges();if(ok&&d.ok!==false)by(sc,-dx,-dy);lx=e.clientX;ly=e.clientY;const n=performance.now();pts.push([n,lx,ly]);while(pts.length>2&&n-pts[0][0]>250)pts.shift()},true);
addEventListener('mouseup',e=>{if(!d)return;F('touchend',T(e));kill=mv||d.st;if(mv&&d.ok!==false){const n=performance.now(),r=pts.filter(p=>n-p[0]<250),q=r.filter(p=>n-p[0]<100).length>1?r.filter(p=>n-p[0]<100):r.slice(-2),o=q[0],l=q.at(-1),dt=q.length>1?l[0]-o[0]:0;if(dt>8&&n-l[0]<50){const c=v=>Math.max(-8,Math.min(8,v));const vx=c(-(l[1]-o[1])/dt),vy=c(-(l[2]-o[2])/dt);if(Math.hypot(vx,vy)>.15)fling(sc,vx,vy)}}d=null;setTimeout(()=>kill=false,0)},true);
addEventListener('wheel',stop,{capture:true,passive:true});
addEventListener('click',e=>{if(kill){e.preventDefault();e.stopPropagation();kill=false}},true);addEventListener('dragstart',e=>e.preventDefault(),true)})()`;
  const LS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
  let docked = LS('abDock', '1') === '1';
  // View settings are per page too (2026-11-16): phone view, foldable, Home Screen app, docked and the docked width each belong to the
  // page on screen and are kept with its state (pgState / 'abPages' .v). The old app-wide keys (abPhone, abFold, abApp, abDock, abDockW) are
  // only the starting point for a page that has none of its own yet; nothing writes them any more.
  let dockWv = +LS('abDockW', 0) || 0;
  const dock = document.createElement('div'); dock.id = 'abDock'; document.getElementById('pagepane')?.after(dock); // the column the docked browser sits in (pushes the page narrower)
  const dockW = (aH, unf = unfolded) => { // aH: height the phone screen may take; unf: opened foldable
    if (!phone) return dockWv || Math.round(innerWidth * .42);
    const s = d => Math.min(1, (aH || 1e4) / d.h), w1 = Math.max(430, Math.round(IPHONE.w * s(IPHONE)) + 22 + 84); // iPhone: (shrunk) screen + bezel + margins
    return unf ? w1 + Math.round(FOLD.w * s(FOLD) / 2) : w1; // opened: grows left by half the opened phone, so its right half sits where the iPhone was
  };
  const wantW = H => andMode && window.FmAndroid ? window.FmAndroid.dockW(H) : phone ? dockW(lastAH) : dockW(); // Android: as wide as its device needs (android.js)
  const dockMin = () => phone ? 200 : 340, dockMax = () => Math.max(dockMin(), innerWidth - 420);
  const setDockW = w => dock.style.setProperty('--abw', Math.round(Math.min(dockMax(), Math.max(dockMin(), w))) + 'px');
  const emu = () => window.desk?.phoneEmu || window.deskApp?.phoneEmu; // the desktop shell's real emulation (newer shell only)
  const norm = u => { try { const x = new URL(u); return (x.origin + x.pathname).replace(/\/$/, '') + x.search; } catch { return String(u || ''); } };
  const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const panel = document.createElement('div'); panel.id = 'abPanel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Browser'); panel.inert = true;
  panel.innerHTML = `<div class="ab-bar"><div class="ab-tabs" role="tablist"></div><button class="ab-b ab-new" title="New tab (yours: agents never close it)" aria-label="New tab">${svg('M12 5v14M5 12h14')}</button></div>
    <div class="ab-tools">
      <button class="ab-b ab-back" title="Back" aria-label="Back">${svg('M15 5l-7 7 7 7')}</button>
      <button class="ab-b ab-fwd" title="Forward" aria-label="Forward">${svg('M9 5l7 7-7 7')}</button>
      <button class="ab-b ab-reload" title="Reload" aria-label="Reload">${svg('M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5')}</button>
      <button class="ab-b ab-prev" title="Preview site: UnderGlow serves this project's website right here (live reload, works on the client too)" aria-label="Preview site">${svg('M8 5v14l11-7z')}</button>
      <button class="ab-b ab-pstop" title="Stop preview: shuts down the site preview now (it also stops by itself after 20 minutes unused)" aria-label="Stop preview" hidden>${svg('M7 7h10v10H7z')}</button>
      <button class="ab-b ab-home" title="Back to the agent's test link" aria-label="Test link">${svg('M4 11l8-7 8 7M6 9.5V20h12V9.5')}</button>
      <form class="ab-url"><input type="text" spellcheck="false" autocomplete="off" placeholder="Type an address, e.g. localhost:5173" aria-label="Address"></form>
      <button class="ab-b ab-phone" title="Phone view: see the page as on a phone, with touch" aria-label="Phone view" aria-pressed="false">${svg('M8 2.5h8a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zM11 18.5h2')}</button>
      <button class="ab-b ab-app" title="Home Screen app: as if added to the Home Screen from Safari" aria-label="Home Screen app" aria-pressed="false">${svg('M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM12 8v8M8 12h8')}</button>
      <span class="ab-andlbl">Android emulator</span>
      <button class="ab-b ab-dock" title="Dock beside the agents" aria-label="Dock beside the agents" aria-pressed="false">${svg('M4 5h16v14H4zM14 5v14')}</button>
      <button class="ab-b ab-ext" title="Open outside Foreman" aria-label="Open outside Foreman">${svg('M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5')}</button>
      <button class="ab-b ab-min" title="Hide browser (Esc)" aria-label="Hide browser">${svg('M6 15l6-6 6 6')}</button>
    </div><div class="ab-prog"></div>
    <div class="ab-view"><div class="ab-block" hidden><b></b><span>This site won't show inside an embedded page here. It will once the desktop app update is installed (Settings → Update now). Your local test pages work now.</span><button class="ab-out">Open outside Foreman</button></div><button class="ab-side" type="button" title="Unfold (Galaxy Z Fold)" aria-label="Unfold" aria-pressed="false">${svg('M9 7l-4 5 4 5M15 7l4 5-4 5')}</button><div class="ab-flip" aria-hidden="true"><i class="l"><b></b></i><i class="r"></i></div><div class="ab-empty"><div>No tabs open.</div><button class="ab-new2">New tab</button><span>Agents' test links open here too.</span></div></div>`;
  document.body.append(panel);
  const $p = s => panel.querySelector(s), tabBox = $p('.ab-tabs'), view = $p('.ab-view'), urlIn = $p('.ab-url input');
  // Top-right toggle (always there): opens / hides the browser; dot = an agent sent a new link you haven't seen
  const tog = document.createElement('button'); tog.id = 'abTog'; tog.type = 'button'; tog.title = 'Browser'; tog.setAttribute('aria-label', 'Browser'); tog.setAttribute('aria-pressed', 'false');
  tog.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z"/></svg><b class="abn" hidden></b><i hidden></i>';
  // Android emulator toggle (own button, next to the browser's): opens the same panel showing the Android screen; green dot = emulator on
  const andTog = document.createElement('button'); andTog.id = 'andTog'; andTog.type = 'button'; andTog.title = 'Android emulator (runs on the host computer, every screen can use it; installs from here if it is not there yet)'; andTog.setAttribute('aria-label', 'Android emulator'); andTog.setAttribute('aria-pressed', 'false');
  andTog.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10h12v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2zM6.5 8a5.5 5.5 0 0 1 11 0zM8.5 3.5l1.3 2M15.5 3.5l-1.3 2"/></svg><i></i>'; andTog.hidden = !window.FmAndroid;
  const setB = document.getElementById('setBtn'); setB ? setB.before(tog, andTog) : document.querySelector('header .right')?.append(tog, andTog);

  let restoring = false; // while the saved tabs are put back: no partial saves
  const saveOwn = () => { if (restoring) return; try { localStorage.setItem('abTabs', JSON.stringify([...tabs.values()].map(t => ({ url: t.url || t.home, home: t.home || '', title: t.title || '', pg: t.pg, agent: t.agent || undefined })))); } catch {} }; // every tab (yours + agents')
  const label = t => t.agent ? (agents.get(t.agent)?.name || 'Agent') : (t.title || (t.url ? t.url.replace(/^https?:\/\//, '') : 'New tab'));

  function place(keepW) { // keepW: mid-drag, keep the width being dragged
    if (PH.matches) { panel.classList.add('ph'); panel.classList.remove('dk'); document.body.classList.remove('abdock'); panel.style.cssText = ''; devLook(); gripPlace(); return; }
    panel.classList.remove('ph');
    const dk = docked && (open || closing); panel.classList.toggle('dk', docked); if (document.body.classList.contains('abdock') !== dk) { document.body.classList.toggle('abdock', dk); setTimeout(() => dispatchEvent(new Event('resize')), 0); } // the page's own layout re-measures
    if (docked) {
      const hd = document.querySelector('header')?.getBoundingClientRect(), ap = document.querySelector('.screen.on .apanes')?.getBoundingClientRect();
      const top = Math.max(ap && ap.height > 100 ? ap.top : 0, (hd?.bottom || 0) + 8), height = Math.max(300, (ap && ap.height > 100 ? ap.bottom : innerHeight - 12) - top);
      lastAH = height - view.offsetTop - 44; if (!(keepW && parseFloat(dock.style.getPropertyValue('--abw')))) setDockW(wantW(height));
      const d = dock.getBoundingClientRect();
      Object.assign(panel.style, { top: top + 'px', left: d.left + 'px', width: Math.max(300, (slideW || d.width) - 20) + 'px', height: height + 'px' }); // sliding: full width, rides the column's left edge
      gripPlace(); if (phone && !dockHold) phoneFit(); return;
    }
    const box = document.querySelector('.screen.on .apanes') || document.getElementById('pagepane'), r = box?.getBoundingClientRect();
    const hd = document.querySelector('header')?.getBoundingClientRect(), ok = r && r.width > 200;
    const top = Math.max(ok ? r.top : 0, (hd?.bottom || 0) + 8), left = ok ? r.left : 8, right = ok ? r.right : innerWidth - 8;
    Object.assign(panel.style, { top: top + 'px', left: left + 'px', width: Math.max(360, right - left) + 'px', height: Math.max(300, innerHeight - top - 8) + 'px' });
    gripPlace(); if (phone) phoneFit();
  }
  function makeEl(t) {
    const el = document.createElement(WV ? 'webview' : 'iframe'); el.className = 'ab-frame';
    const shown = () => el.classList.add('ld'); setTimeout(shown, 1500); // shown once it has painted (fallback: a slow page still shows after 1.5s)
    if (WV) {
      el.setAttribute('partition', (window.desk || window.deskApp)?.pagePartitions ? 'persist:foreman-browser-' + t.pg : 'persist:foreman-browser'); // own cookie jar per page (older shells: one shared) el.setAttribute('allowpopups', '');
      const st = () => { try { t.back = el.canGoBack(); t.fwd = el.canGoForward(); t.url = el.getURL() || t.url; } catch {} if (t.key === cur) tools(); drawTabs(); saveOwn(); };
      el.addEventListener('did-navigate', () => { st(); if (phone && t.ph && !t.real) try { el.setZoomFactor(ps * .9999); } catch {} }); // page zoom is per site: a new site starts at 100% el.addEventListener('did-navigate-in-page', e => { if (e.isMainFrame) st(); });
      el.addEventListener('page-title-updated', e => { t.title = e.title; drawTabs(); saveOwn(); });
      el.addEventListener('did-start-loading', () => { t.loading = true; if (t.key === cur) tools(); });
      el.addEventListener('did-stop-loading', () => { t.loading = false; st(); });
      el.addEventListener('did-fail-load', e => { if (e.isMainFrame && e.errorCode !== -3) { t.loading = false; t.err = e.errorDescription || 'failed to load'; if (t.key === cur) tools(); } });
      // Touch from the mouse (and its circle cursor) only while the pointer is over the phone screen: Chromium otherwise shows the circle over the whole window
      el.addEventListener('mouseenter', () => { t.hov = true; if (phone && t.real) emu()?.(el.getWebContentsId(), true, dev.w, pageH(), { touchOnly: true }); });
      el.addEventListener('mouseleave', () => { t.hov = false; if (phone && t.real) emu()?.(el.getWebContentsId(), true, dev.w, pageH(), { touchOnly: false }); });
      el.addEventListener('dom-ready', () => { t.err = ''; t.ready = true; shown(); phoneDress(t); el.executeJavaScript(TINT).then(j => { const o = JSON.parse(j); t.tint = o.tint; t.sbs = o.sbs; if (t.key !== cur) return; if (appMode && phone && dev.ios && (o.sbs === 'black-translucent') !== !!dev.tl) { iphoneSet(o.sbs); phoneFit(); } else iosChrome(); }).catch(() => {}); if (t.key === cur && (t.ph || '') !== mode()) phoneSet(t, true); });
    } else {
      el.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen; camera; microphone; geolocation'); el.setAttribute('referrerpolicy', 'no-referrer');
      el.addEventListener('load', () => { t.loading = false; shown(); if (t.key === cur) tools(); });
    }
    el.src = t.url || 'about:blank'; view.append(el); t.el = el; if (t.url) frameCheck(t, t.url);
  }
  // Phone view on one tab. reload: load the page again so it starts as a phone page (sites pick layout / touch on load)
  function phoneSet(t, reloadIt) {
    if (!isWv(t) || !t.ready) return; const was = !!t.ph; t.ph = mode();
    if (!phone && !was) return; // never was a phone page: nothing to undo
    const again = () => { if (reloadIt) reload(t); };
    const fake = () => { t.real = false; try { if (!t.ua0) t.ua0 = t.el.getUserAgent(); t.el.setUserAgent(phone ? dev.ua : t.ua0); t.el.setZoomFactor(phone ? ps * .9999 : 1); } catch {} again(); };
    const real = emu(); if (!real) return fake();
    try { t.el.setZoomFactor(1); } catch {}
    real(t.el.getWebContentsId(), phone, dev.w, pageH(), devOpt(t)).then(ok => { if (!ok) return fake(); t.real = true; again(); }).catch(fake);
  }
  function phoneDress(t) { // after every load: the dot cursor (and the touch shim on an older shell)
    if (!isWv(t) || !phone || !t.ph) return;
    try { t.el.insertCSS(DOT); if (!t.real) { t.el.setZoomFactor(ps * .9999); t.el.executeJavaScript(SHIM).catch(() => {}); } } catch {}
  }
  // The screen keeps the device's true shape: shrunk (ps) to fit the view, never stretched. Then the page is told the new shrink.
  function phoneLayout() {
    const fl = unfolded && !docked; // floating + opened: shifted left by a quarter so its right half sits where the iPhone was (centred)
    const r = view.getBoundingClientRect(), s = Math.min(1, (r.height - 44) / dev.h, fl ? (r.width / 2 - 52) / (dev.w * .75) : (r.width - 104) / dev.w); ps = s > .1 ? Math.round(dev.w * s) / dev.w : 1; // whole-pixel width; the page zoom (ps × .9999) then gives exactly dev.w CSS px
    const st = panel.style; st.setProperty('--pw', dev.w + 'px'); st.setProperty('--phh', pageH() + 'px'); st.setProperty('--psh', dev.h + 'px'); st.setProperty('--ps', ps);
    st.setProperty('--fw', Math.round(dev.w * ps) + 'px'); st.setProperty('--fh', Math.round(dev.h * ps) + 'px'); st.setProperty('--fr', Math.round(dev.r * ps) + 'px');
    st.setProperty('--fx', (fl ? -Math.round(dev.w * ps / 4) : 0) + 'px');
    // the page sits between the device's own chrome (iPhone: Safari's status bar on top, address bar + toolbar below); square corners then
    st.setProperty('--ft', Math.round((dev.vt || 0) * ps) + 'px'); st.setProperty('--fph', Math.round(pageH() * ps) + 'px'); const rr = Math.round(dev.r * ps) + 'px';
    st.setProperty('--fprt', dev.vt ? '0px' : rr); st.setProperty('--fprb', dev.vb ? '0px' : rr); // page corners: square where a bar meets it, the screen's round elsewhere
    panel.classList.toggle('ios', !!dev.ios); panel.classList.toggle('app', !!(dev.ios && dev.standalone)); panel.classList.toggle('tl', !!(dev.ios && dev.tl)); iosChrome();
  }
  // Safari on an iPhone, drawn around the page (phone view, iPhone only): status bar with the time and the Dynamic Island, tinted like Safari
  // tints it (the page's theme-color, else its background), and the bottom address bar (site name) + toolbar + home indicator.
  // Back / forward / reload in it drive the browser's own buttons; the rest is look only.
  var ios = document.createElement('div'); ios.className = 'ab-ios'; // var: phoneLayout can run before this line during start-up (iosChrome then waits) ios.setAttribute('aria-hidden', 'true');
  ios.innerHTML = `<div class="ios-sb"><b class="ios-time">9:41</b><i class="ios-island"></i><span class="ios-ind">${'<svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx=".8"/><rect x="5" y="5.5" width="3" height="6.5" rx=".8"/><rect x="10" y="3" width="3" height="9" rx=".8"/><rect x="15" y="0" width="3" height="12" rx=".8"/></svg>'
    }<svg viewBox="0 0 16 12"><path d="M8 11.6 5.6 9a3.4 3.4 0 0 1 4.8 0zM3.5 6.9a6.4 6.4 0 0 1 9 0l-1.4 1.5a4.4 4.4 0 0 0-6.2 0zM1.4 4.7a9.4 9.4 0 0 1 13.2 0L13.2 6.2a7.4 7.4 0 0 0-10.4 0z"/></svg><svg viewBox="0 0 27 13" class="ios-bat"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke-opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2"/><path d="M25 4.5v4a2 2 0 0 0 0-4z" opacity=".4"/></svg></span></div>
    <div class="ios-tb"><div class="ios-url"><span class="ios-aa"><small>A</small>A</span><span class="ios-host"></span><button type="button" class="ios-btn ios-rl" title="Reload">${svg('M19 12a7 7 0 1 1-2.05-4.95M19 4.5V9h-4.5')}</button></div>
      <div class="ios-row"><button type="button" class="ios-btn ios-bk" title="Back">${svg('M15 4.5 7.5 12l7.5 7.5')}</button><button type="button" class="ios-btn ios-fw" title="Forward">${svg('M9 4.5l7.5 7.5L9 19.5')}</button>
        <i class="ios-btn">${svg('M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1')}</i><i class="ios-btn">${svg('M12 6.5C10 4.6 7 4 4 4.5v14c3-.5 6 .1 8 2 2-1.9 5-2.5 8-2v-14c-3-.5-6 .1-8 2zM12 6.5v14')}</i><i class="ios-btn">${svg('M8 8h12v12H8zM4 16V4h12')}</i></div><i class="ios-home"></i></div><i class="ios-home ios-home2"></i>`;
  view.append(ios);
  ios.querySelector('.ios-bk').onclick = () => $p('.ab-back').click(); ios.querySelector('.ios-fw').onclick = () => $p('.ab-fwd').click(); ios.querySelector('.ios-rl').onclick = () => $p('.ab-reload').click();
  function iosChrome() {
    if (!dev.ios || !ios) return; const t = tabs.get(cur);
    const now = new Date(), h = now.getHours() % 12 || 12; ios.querySelector('.ios-time').textContent = h + ':' + String(now.getMinutes()).padStart(2, '0');
    let host = ''; try { host = new URL(t?.url || t?.home || '').hostname.replace(/^www\./, ''); } catch {} ios.querySelector('.ios-host').textContent = host || 'Search or enter website name';
    ios.querySelector('.ios-host').classList.toggle('ph', !host);
    ios.querySelector('.ios-bk').disabled = !t?.back; ios.querySelector('.ios-fw').disabled = !t?.fwd;
    const c = t?.tint || '#000'; panel.style.setProperty('--iostint', c);
    const m = c.match(/\d+(\.\d+)?/g), lum = m && m.length >= 3 ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 0;
    panel.style.setProperty('--iosfg', lum > .6 ? '#000' : '#fff');
  }
  setInterval(() => { if (phone && open && dev.ios) iosChrome(); }, 15000); // the clock
  // Safari tints the status bar with the page's theme-color (the one whose media matches), else the page's background
  const TINT = `JSON.stringify({sbs:document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content||'',tint:(()=>{for(const m of document.querySelectorAll('meta[name="theme-color"]')){const q=m.getAttribute('media');if(!q||matchMedia(q).matches){const c=document.createElement('i');c.style.color=m.content;document.body.append(c);const v=getComputedStyle(c).color;c.remove();return v}}const b=getComputedStyle(document.body).backgroundColor;return b&&b!=='rgba(0, 0, 0, 0)'?b:getComputedStyle(document.documentElement).backgroundColor})()})`;
  let phT = 0; const phoneFit = () => { phoneLayout(); clearTimeout(phT); phT = setTimeout(() => { const t = tabs.get(cur); if (!phone || !isWv(t) || !t.ph) return;
    if (t.real) emu()?.(t.el.getWebContentsId(), true, dev.w, pageH(), devOpt(t)); else try { t.el.setZoomFactor(ps * .9999); } catch {} }, 150); };
  const devOpt = t => ({ dpr: dev.dpr, ua: dev.ua, platform: dev.platform, scale: ps, touch: !!t?.hov, safe: dev.safe || null, standalone: !!dev.standalone });
  const devLook = phoneLayout;
  // Unfold / fold (the tab on the phone's left side), animated with the Web Animations API (transform / opacity only, so it runs on the
  // compositor). The screen you look at while folded stays where it is: it becomes the opened phone's RIGHT half (the layout places the opened
  // phone so; docked, the column grows to the left by half its width). Opening: the layout switches first (one reflow, the page reloads hidden),
  // then the left half, lying on top of the folded phone, peels off it on the hinge and lands on the left; the page fades in over it.
  // Closing: the left half folds back over onto the right one, which settles into the iPhone in the same spot; the page fades in.
  function sideLook() { const b = $p('.ab-side'); b.classList.toggle('on', unfolded); b.setAttribute('aria-pressed', String(unfolded)); b.title = unfolded ? 'Fold back (iPhone)' : 'Unfold (Galaxy Z Fold)'; b.setAttribute('aria-label', unfolded ? 'Fold' : 'Unfold'); }
  // The flap (left half) turns on one JS clock, and when docked the column's left edge rides with the phone's outer edge on the SAME frame:
  // the edge is worked out from the flap's angle (hinge, half width, the 3200px perspective), not read back a frame late.
  // ref = the width at which --fx is 0 for the current layout; --fx follows the width so the phone's right half keeps its distance from the
  // panel's right edge (it stays in place while the panel grows / shrinks to the left).
  let dockHold = false, lastAH = 0;
  function holdDock(w, ref) { dockHold = true; dock.style.setProperty('--abw', w + 'px'); place(true); panel.style.setProperty('--fx', ((w - ref) / 2) + 'px'); }
  const bez = (x1, y1, x2, y2) => t => { let a = t; // cubic-bezier easing (Newton steps on x, then y)
    for (let i = 0; i < 8; i++) { const x = 3 * (1 - a) * (1 - a) * a * x1 + 3 * (1 - a) * a * a * x2 + a * a * a - t, dx = 3 * (1 - a) * (1 - a) * x1 + 6 * (1 - a) * a * (x2 - x1) + 3 * a * a * (1 - x2); if (Math.abs(x) < 1e-4 || !dx) break; a = Math.min(1, Math.max(0, a - x / dx)); }
    return 3 * (1 - a) * (1 - a) * a * y1 + 3 * (1 - a) * a * a * y2 + a * a * a; };
  function flap(from, to, dur, delay, ease, shFrom, shTo, dk) { // angles in deg (180 = folded over); dk { lo, hi, ref, end } when docked
    const l = fx.querySelector('.l'), r = fx.querySelector('.r'), sh = l.firstChild, right = dock.getBoundingClientRect().right, P = 3200;
    const gap = dk ? (dk.hi - 20 - (Math.round(dev.w * ps) + 22)) / 2 : 0; // panel edge → phone edge once fully open
    return new Promise(res => { const t0 = performance.now(); const f = n => {
      const k = Math.min(1, Math.max(0, (n - t0 - delay) / dur)), e = ease(k), a = from + (to - from) * e, rad = a * Math.PI / 180;
      l.style.transform = `rotateY(${a}deg)`; sh.style.opacity = shFrom + (shTo - shFrom) * e;
      if (dk) { const q = r.getBoundingClientRect(), w = q.width, edge = q.left - w * Math.cos(rad) * P / (P - w * Math.sin(rad));
        holdDock(k >= 1 ? dk.end : Math.max(dk.lo, Math.min(dk.hi, right - edge + gap)), dk.ref); }
      if (k < 1) requestAnimationFrame(f); else { dockHold = false; res(); } };
      requestAnimationFrame(f); });
  }
  let flipping = false;
  const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  function bezel() { const f = tabs.get(cur)?.el?.getBoundingClientRect(); return f && f.width > 20 ? { x: f.left - 11, y: f.top - 11, w: f.width + 22, h: f.height + 22 } : null; }
  const morph = (a, b) => `translate(${a.x - b.x}px, ${a.y - b.y}px) scale(${a.w / b.w}, ${a.h / b.h})`; // b drawn where a is (origin top left)
  async function setFold(v) {
    if (flipping || v === unfolded) return;
    const go = () => { unfolded = v; dev = v ? FOLD : IPHONE; savePgs(); sideLook();
      if (open) place(); else phoneLayout(); setTimeout(() => { const t = tabs.get(cur); if (t && phone) phoneSet(t, true); }, 30); };
    if (!open || !phone || !fx.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return go();
    flipping = true; const l = fx.querySelector('.l'), sh = l.firstChild;
    const rhalf = () => { const q = fx.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top, w: q.width / 2, h: q.height }; }; // the folded phone = the right half
    const end = async () => { panel.classList.remove('flip'); await fx.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease-out', fill: 'forwards' }).finished;
      fx.classList.remove('on', 'whole'); fx.removeAttribute('style'); l.removeAttribute('style'); sh.removeAttribute('style'); fx.getAnimations({ subtree: true }).forEach(a => a.cancel()); flipping = false; };
    try {
      if (v) {
        const from = bezel(), w1 = docked ? dock.getBoundingClientRect().width : 0; go(); panel.classList.add('flip'); fx.classList.add('on'); fx.style.transformOrigin = '50% 0';
        const w2 = docked ? dock.getBoundingClientRect().width : 0; if (docked) holdDock(w1, w2); // back to the old width in this same frame (no snap); it grows with the phone's edge
        await frames();
        const to = rhalf(); // sits where the iPhone was (layout puts it there); only its size settles
        if (from) fx.animate([{ transform: morph(from, to) }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' });
        await flap(180, 0, 700, 140, bez(.45, .05, .2, 1), .7, 0, docked ? { lo: w1, hi: w2, ref: w2, end: w2 } : null); if (docked) dispatchEvent(new Event('resize'));
      } else {
        panel.classList.add('flip'); fx.classList.add('on');
        const w2 = docked ? dock.getBoundingClientRect().width : 0, w1 = docked ? Math.min(dockMax(), Math.max(dockMin(), dockW(lastAH, false))) : 0;
        await flap(0, 180, 560, 0, bez(.55, 0, .55, 1), 0, .7, docked ? { lo: w1, hi: w2, ref: w2, end: w1 } : null); // the column shrinks as the phone's edge folds in
        const q = fx.getBoundingClientRect(), vr = view.getBoundingClientRect(), was = rhalf(); // pin the stand-in where it is, then let the layout change under it
        Object.assign(fx.style, { left: (q.left - vr.left) + 'px', top: (q.top - vr.top) + 'px', width: q.width + 'px', height: q.height + 'px', transformOrigin: '50% 0' });
        go(); fx.classList.add('whole'); if (docked) setTimeout(() => dispatchEvent(new Event('resize')), 0); await frames();
        const now = rhalf(), to = bezel(); // it moved with the panel: draw it where it was, then settle into the iPhone (same spot, slightly wider)
        if (to) await fx.animate([{ transform: morph(was, now) }, { transform: morph(to, now) }], { duration: 220, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' }).finished;
      }
    } catch {}
    await end();
  }
  function dockLook() { const b = $p('.ab-dock'), v = docked; b.classList.toggle('on', v); b.setAttribute('aria-pressed', String(v)); b.title = v ? 'Docked beside the agents: click to float over them' : 'Dock beside the agents'; }
  function setDock(v) {
    docked = v; savePgs(); dockLook();
    if (open) place();
  }
  // Docked (page view only): the handle in the gap left of the browser resizes it. Pointer capture keeps the drag even over a page;
  // the width follows the mouse once per frame; the agents' layout re-measures when you let go. Double-click: default width.
  const grip = document.createElement('div'); grip.id = 'abGrip'; grip.title = 'Drag to resize · double-click: default width'; grip.innerHTML = '<i></i>'; document.body.append(grip);
  function gripPlace() {
    const on = docked && open && !phone && !andMode && !PH.matches; grip.classList.toggle('on', on); if (!on) return;
    const r = panel.getBoundingClientRect(); Object.assign(grip.style, { left: (r.left - 16) + 'px', top: r.top + 'px', height: r.height + 'px' });
  }
  grip.addEventListener('pointerdown', e => {
    if (e.button || !grip.classList.contains('on')) return; e.preventDefault(); grip.setPointerCapture(e.pointerId); document.body.classList.add('abdrag');
    const right = dock.getBoundingClientRect().right, off = e.clientX - dock.getBoundingClientRect().left; let x = e.clientX, raf = 0;
    const mv = ev => { x = ev.clientX; if (!raf) raf = requestAnimationFrame(() => { raf = 0; setDockW(right - (x - off)); place(true); }); };
    const up = () => { cancelAnimationFrame(raf); grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); document.body.classList.remove('abdrag');
      dockWv = Math.round(dock.getBoundingClientRect().width); savePgs(); dispatchEvent(new Event('resize')); };
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  });
  grip.addEventListener('dblclick', () => { dockWv = 0; savePgs(); place(); dispatchEvent(new Event('resize')); });
  function phoneLook() { const v = phone; panel.classList.toggle('phone', v); const b = $p('.ab-phone'); b.classList.toggle('on', v); b.setAttribute('aria-pressed', String(v));
    b.title = v ? 'Phone view on: back to the full-width page' : 'Phone view: see the page as on a phone, with touch'; }
  function setPhone(v) {
    phone = v; savePgs(); phoneLook();
    if (docked && open) place(); // the dock takes the phone's width (or back)
    requestAnimationFrame(() => { const t = tabs.get(cur); if (t) phoneSet(t, true); phoneFit(); });
  }
  function nav(t, url, how) { // how: 'back' | 'fwd' | undefined (plain load): slides the page that way
    if (how) slide(how);
    t.url = url; t.err = ''; t.loading = !!url; frameCheck(t, url);
    if (!t.el) { if (t.key === cur || open) makeEl(t); } else if (isWv(t) && t.ready) { try { t.el.loadURL(url); } catch { t.el.src = url; } } else t.el.src = url;
    if (t.key === cur) tools(); drawTabs(); saveOwn();
  }
  function frameCheck(t, url) {
    if (WV || !/^https?:/i.test(url)) { t.blocked = false; return; }
    t.blocked = false; const ask = url;
    fetch('/api/framecheck?u=' + encodeURIComponent(url), { cache: 'no-store' }).then(r => r.json()).then(j => { if (t.url === ask && !WV && !isWv(t)) { t.blocked = !!j.blocked; if (t.key === cur) tools(); } }).catch(() => {});
  }
  function reload(t) { if (!t?.el) return t && nav(t, t.url || t.home); t.loading = true; if (isWv(t) && t.ready) { try { t.el.reload(); } catch {} } else t.el.src = t.url; tools(); }
  function slide(dir) { view.classList.remove('sl-back', 'sl-fwd'); void view.offsetWidth; view.classList.add(dir === 'back' ? 'sl-back' : 'sl-fwd'); }
  function tools() {
    const t = tabs.get(cur);
    $p('.ab-back').disabled = !isWv(t) || !t.back; $p('.ab-fwd').disabled = !isWv(t) || !t.fwd;
    $p('.ab-back').title = WV ? 'Back (Alt+←)' : 'Back / forward work in the Foreman desktop app'; $p('.ab-fwd').title = WV ? 'Forward (Alt+→)' : 'Back / forward work in the Foreman desktop app';
    $p('.ab-reload').disabled = $p('.ab-ext').disabled = !t || !(t.url || t.home);
    if (t && isWv(t)) t.blocked = false; // webview: never framing-limited
    const bl = $p('.ab-block'); bl.hidden = !t?.blocked; if (t?.blocked) { try { bl.querySelector('b').textContent = new URL(t.url).hostname; } catch {} }
    $p('.ab-home').hidden = !t?.agent; panel.classList.toggle('loading', !!t?.loading); panel.classList.toggle('and', andMode);
    if (document.activeElement !== urlIn) urlIn.value = t ? (t.url || '') : '';
    iosChrome();
  }
  function drawTabs() {
    const keys = new Set(tabs.keys());
    tabBox.querySelectorAll('.ab-tab').forEach(b => { if (!keys.has(b.dataset.k)) b.remove(); });
    for (const t of tabs.values()) {
      if (t.pg !== pg) { if (t.btn) t.btn.hidden = true; continue; } // another page's tab
      if (t.btn) t.btn.hidden = false;
      if (!t.btn) { t.btn = document.createElement('div'); t.btn.className = 'ab-tab new'; t.btn.dataset.k = t.key; t.btn.setAttribute('role', 'tab');
        t.btn.innerHTML = '<i class="ab-ic"></i><span class="ab-tn"></span><button class="ab-x" title="Close tab" aria-label="Close tab">×</button>';
        t.btn.onclick = e => { if (e.target.closest('.ab-x')) return close(t.key); select(t.key); }; tabBox.append(t.btn); requestAnimationFrame(() => requestAnimationFrame(() => t.btn?.classList.remove('new'))); }
      const n = label(t), sp = t.btn.querySelector('.ab-tn'); if (sp.textContent !== n) sp.textContent = n;
      t.btn.title = (t.agent ? `${n} (agent's tab: follows its newest test link, closes with the agent)` : `${n} (your tab)`) + (t.url ? '\n' + t.url : '');
      t.btn.classList.toggle('on', t.key === cur); t.btn.classList.toggle('agent', !!t.agent); t.btn.classList.toggle('fresh', !!t.fresh); t.btn.setAttribute('aria-selected', String(t.key === cur));
    }
    const m = mine(); $p('.ab-empty').hidden = m.length > 0;
    const fresh = m.some(t => t.fresh), n = m.length;
    tog.querySelector('i').hidden = !fresh || open; const nb = tog.querySelector('.abn'); nb.hidden = !n; nb.textContent = n;
  }
  function select(key) {
    const prev = cur; cur = key; const t = tabs.get(key);
    if (t && !t.el && t.url) makeEl(t); // an empty new tab gets its page on the first address (no about:blank entry in its history)
    for (const [k, x] of tabs) if (x.el) { x.el.classList.toggle('on', k === key); x.el.classList.toggle('was', k === prev && k !== key && x.pg === pg); }
    if (t) t.fresh = false;
    if (t && isWv(t) && t.ready && (t.ph || '') !== mode()) requestAnimationFrame(() => phoneSet(t, true)); // tabs catch up with the phone view when shown
    tools(); drawTabs(); t?.btn?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); andSync(); savePgs();
  }
  // Android (android.js) shares this panel (same dock / size) but has its own top-bar button: the panel shows either your web tabs or the Android screen.
  // closing: while sliding out, the Android screen keeps playing until it's gone
  const andSync = () => { window.FmAndroid?.active((open || closing) && andMode); tog.classList.toggle('on', open && !andMode); tog.setAttribute('aria-pressed', String(open && !andMode)); andTog.classList.toggle('on', open && andMode); andTog.setAttribute('aria-pressed', String(open && andMode)); };
  function setMode(v) { if (!window.FmAndroid) v = false; if (v === andMode) return; andMode = v; panel.classList.toggle('and', v); panel.setAttribute('aria-label', v ? 'Android emulator' : 'Browser'); window.FmAndroid?.el.classList.toggle('on', v); tools(); andSync(); savePgs(); if (open) andResize(); }
  // The docked column eases to the width the browser / the Android device wants (switching between them, or phone ↔ tablet ↔ TV);
  // the agents' layout re-measures once at the end.
  let andRaf = 0, pageSnap = 0; // pageSnap: until then (right after a page switch) width changes snap instead of easing
  function andResize() {
    cancelAnimationFrame(andRaf); if (slideRaf) return; // opening / closing: the slide already heads for the right width
    if (!open || !docked || PH.matches || matchMedia('(prefers-reduced-motion: reduce)').matches || performance.now() < pageSnap || window.FmAndroid?.settling) return place(); // just switched page: the column is already the right width, no easing
    const from = dock.getBoundingClientRect().width, H = panel.getBoundingClientRect().height || innerHeight - 120;
    const to = Math.min(dockMax(), Math.max(dockMin(), wantW(H))); if (Math.abs(to - from) < 2) return place();
    window.panesLiveUntil = performance.now() + 520 + 60; // the agents re-flow mid-animation as the width crosses a threshold (index.html paneRO)
    const t0 = performance.now(), d = 520, ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const f = n => { const k = Math.min(1, (n - t0) / d); dock.style.setProperty('--abw', (from + (to - from) * ease(k)) + 'px'); place(true);
      if (k < 1) andRaf = requestAnimationFrame(f); else { andRaf = 0; place(); dispatchEvent(new Event('resize')); } };
    andRaf = requestAnimationFrame(f);
  }
  function openAndroid() { if (!window.FmAndroid) return; setMode(true); show(true); }
  // Opening / closing docked: the column eases open (or shut) and the panel slides in from the right at its full width with the column's left
  // edge, like a drawer (its content never re-lays out mid-slide); the agents beside it narrow / widen with it and re-flow once at the end.
  // Before, the column snapped to its full width in one frame (very visible with a wide Android tablet / TV column) while the panel only faded.
  function dockSlide(from, to, done) {
    cancelAnimationFrame(slideRaf); cancelAnimationFrame(andRaf); andRaf = 0;
    window.panesLiveUntil = performance.now() + 420 + 60; // the agents re-flow mid-slide as the width crosses a threshold (index.html paneRO)
    const t0 = performance.now(), d = 420, ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const f = n => { const k = Math.min(1, (n - t0) / d); dock.style.setProperty('--abw', Math.max(1, from + (to - from) * ease(k)) + 'px'); place(true);
      if (k < 1) slideRaf = requestAnimationFrame(f); else { slideRaf = 0; done(); } };
    slideRaf = requestAnimationFrame(f);
  }
  function show(v, restoring) {
    if (v === open) { if (v) place(); return; }
    const anim = docked && !PH.matches && !restoring && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fromW = closing ? dock.getBoundingClientRect().width : 1; // reopened while closing: carries on from where it is
    if (slideRaf) { cancelAnimationFrame(slideRaf); slideRaf = 0; }
    closing = false; slideW = 0; panel.classList.remove('closing');
    if (restoring) { panel.classList.add('snap'); requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.remove('snap'))); } // no fade / slide-in
    open = v;
    if (v) {
      place();
      if (anim) { const to = dock.getBoundingClientRect().width; slideW = to; dock.style.setProperty('--abw', fromW + 'px'); place(true); // same frame: nothing painted at full width
        dockSlide(fromW, to, () => { slideW = 0; place(); dispatchEvent(new Event('resize')); }); }
      const m = mine(); if (!cur && m.length) select(m.at(-1).key); else if (cur) select(cur);
    }
    else if (anim && document.body.classList.contains('abdock')) { const w = dock.getBoundingClientRect().width; closing = true; slideW = w; panel.classList.add('closing'); // stays solid while it slides out
      dockSlide(w, 1, () => { closing = false; slideW = 0; panel.classList.remove('closing'); place(); andSync(); dispatchEvent(new Event('resize')); }); }
    panel.inert = !v; if (!v && !closing) place(); panel.classList.toggle('show', v); document.body.classList.toggle('abopen', v); drawTabs(); andSync(); savePgs();
    if (v && !restoring && !mine().length && !andMode) setTimeout(() => newTab(), 0);
  }
  // A page's view settings put in place at once (page switch): a page never seen before starts from the app-wide defaults (DEFV).
  const DEFV = viewNow();
  function applyView(v) {
    v = { ...DEFV, ...(v || {}) };
    const was = mode() + appMode;
    phone = !!v.phone; unfolded = !!v.fold; dev = unfolded ? FOLD : IPHONE; appMode = !!v.app; docked = !!v.dock; dockWv = +v.dockW || 0;
    iphoneSet(tabs.get(cur)?.sbs); phoneLook(); sideLook(); appLook(); dockLook();
    if (open) place();
    if (mode() + appMode !== was) requestAnimationFrame(() => { const t = tabs.get(cur); if (t) phoneSet(t, true); if (phone) phoneFit(); });
  }
  // The page on screen changed: park this page's browser (tabs stay alive, hidden) and bring up that page's, as it was left.
  function setPage(g) {
    g = pageKey(g); g = /^[\w-]{1,48}$/.test(g || '') ? g : 'foreman'; if (g === pg && booted) return;
    if (booted) pgState.set(pg, { cur, open, andMode, curUrl: curUrl(), v: viewNow() }); // first call (page load): nothing to park yet, the saved state is applied below
    booted = true; pageSnap = performance.now() + 600;
    panel.classList.add('snap'); requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.remove('snap'))); // the page's panel is just there as it was left: no fades
    const nx = pgState.get(g) || { cur: null, open: false, andMode: false };
    for (const x of tabs.values()) x.el?.classList.remove('on', 'was');
    pg = g; cur = tabs.get(nx.cur)?.pg === g ? nx.cur : null;
    applyView(nx.v); // that page's own phone / fold / app / dock settings, no animation
    if (!cur && nx.curUrl) cur = mine().find(t => (t.url || t.home) === nx.curUrl)?.key || null; // after a reload: the tab that was on screen
    if (open && !nx.open) show(false, true); // page switch: no slide
    setMode(nx.andMode);
    if (nx.open) { if (open) { const m = mine(); if (!cur && m.length) cur = m.at(-1).key; if (cur) select(cur); else { tools(); drawTabs(); } place(); } else show(true, true); }
    tools(); drawTabs(); andSync(); savePgs();
  }
  function add(t) { t.pg ??= pg; tabs.set(t.key, t); return t; }
  function newTab(url = '', title = '', quiet, tpg) {
    const t = add({ key: 'u:' + (++seq), pg: tpg || pg, agent: null, home: url, url, title });
    if (!quiet) { setMode(false); select(t.key); show(true); if (!url) setTimeout(() => { urlIn.focus(); urlIn.select(); }, 60); }
    saveOwn(); drawTabs(); return t;
  }
  function close(key) {
    const t = tabs.get(key); if (!t) return;
    t.el?.remove(); t.btn?.classList.add('gone'); setTimeout(() => t.btn?.remove(), 180); tabs.delete(key);
    if (cur === key) { cur = null; const m = mine(); if (m.length) select(m.at(-1).key); else tools(); }
    for (const st of pgState.values()) if (st.cur === key) st.cur = null;
    saveOwn(); drawTabs(); andSync();
  }
  // An agent's test link (Open test page / Test): already open anywhere → that tab, reloaded; else this agent's tab goes there (made if needed)
  // Only within the agent's own page's browser; an agent of another page gets its tab there (dot on it), the browser on screen is left alone.
  function openLink(id, url) {
    const apg = agentPg(id);
    if (apg !== pg) { let t = tabs.get('a:' + id); if (!t) t = add({ key: 'a:' + id, pg: apg, agent: id, home: url, url }); else { t.home = url; nav(t, url); } t.fresh = true; drawTabs(); saveOwn(); return; }
    setMode(false);
    const same = mine().find(t => norm(t.url) === norm(url) || norm(t.home) === norm(url));
    if (same) { select(same.key); show(true); reload(same); return; }
    let t = tabs.get('a:' + id);
    if (!t) t = add({ key: 'a:' + id, pg: apg, agent: id, home: url, url: '' });
    t.home = url; if (!t.el) { t.url = url; t.loading = true; select(t.key); show(true); } else { select(t.key); show(true); nav(t, url); }
    saveOwn();
  }
  function sync(id, url) { // the agent handed over a new link: its tab follows (dot on the tab / toggle if you weren't looking)
    const t = tabs.get('a:' + id); if (!t || !url || norm(url) === norm(t.home)) return;
    t.home = url; nav(t, url); if (!open || cur !== t.key) t.fresh = true; drawTabs(); saveOwn();
  }
  const dropAgent = id => close('a:' + id);
  // Test buttons on panes / tiles (and any a[data-ab]) open here; Ctrl/Shift/middle click still opens outside
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a.ptest, a.ttest, a[data-ab]'); if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    const id = a.closest('[data-id]')?.dataset.id || a.closest('.apane')?.id?.replace(/^p-/, '') || a.dataset.ab; if (!id || !agents.get(id)) return;
    e.preventDefault(); e.stopPropagation(); openLink(id, a.href);
  }, true);
  tog.onclick = () => { if (open && !andMode) return show(false); const was = open; setMode(false); show(true); if (was && !mine().length) newTab(); };
  andTog.onclick = () => { if (open && andMode) return show(false); openAndroid(); };
  $p('.ab-min').onclick = () => show(false);
  $p('.ab-new').onclick = $p('.ab-new2').onclick = () => newTab();
  if (window.FmAndroid) window.FmAndroid.onSize = () => { if (andMode) andResize(); };
  if (window.FmAndroid) window.FmAndroid.onState = s => { andTog.classList.toggle('live', ['running', 'booting', 'starting'].includes(s.phase)); $p('.ab-andlbl').textContent = 'Android emulator · ' + ({ running: 'on', booting: 'starting up', starting: 'starting', stopping: 'turning off', installing: 'setting up', error: 'problem', stopped: 'off', none: s.installed ? 'off' : 'not set up' }[s.phase] || '') + (s.lastApp ? ' · last app ' + s.lastApp.pkg : ''); };
  // Preview site: the host serves the project's website itself (preview.mjs) at /preview/<id>/ on the same address as the app, so host and client both open it.
  const prevBtn = $p('.ab-prev'), toast = (m, bad) => { let e = $p('.ab-toast'); if (!e) { e = document.createElement('div'); e.className = 'ab-toast'; view.append(e); } e.textContent = m; e.classList.toggle('bad', !!bad); e.classList.add('on'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('on'), bad ? 6000 : 2200); };
  prevBtn.onclick = async () => {
    if (prevBtn.classList.contains('busy')) return; prevBtn.classList.add('busy'); toast('Starting the preview…');
    try {
      const r = await fetch('/api/preview/start', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Foreman': '1' }, body: JSON.stringify({ page: pg }) }), j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not start the preview.');
      const abs = location.origin + j.url, same = mine().find(t => (t.url || '').includes('/preview/' + j.id + '/'));
      if (same) { setMode(false); select(same.key); show(true); nav(same, abs); } else newTab(abs, 'Preview', false);
      toast(j.mode === 'dev' ? 'Dev server running' : 'Previewing your site');
    } catch (e) { toast(e.message, true); } finally { prevBtn.classList.remove('busy'); }
  };
  // Stop preview: visible while the current tab shows a /preview/<id>/ page.
  const pstop = $p('.ab-pstop'), pvId = u => (/\/preview\/([a-z0-9-]{1,40})\//.exec(u || '') || [])[1];
  const pstopSync = () => { const t = tabs.get(cur); pstop.hidden = !pvId(t && t.url); };
  setInterval(pstopSync, 1000);
  pstop.onclick = async () => {
    const t = tabs.get(cur), id = pvId(t && t.url); if (!id) return;
    try { await fetch('/api/preview/stop', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Foreman': '1' }, body: JSON.stringify({ id, page: pg }) }); toast('Preview stopped'); } catch { toast('Could not stop the preview', true); }
    pstop.hidden = true;
  };
  $p('.ab-back').onclick = () => { const t = tabs.get(cur); if (isWv(t) && t.el.canGoBack()) { slide('back'); t.el.goBack(); } };
  $p('.ab-fwd').onclick = () => { const t = tabs.get(cur); if (isWv(t) && t.el.canGoForward()) { slide('fwd'); t.el.goForward(); } };
  $p('.ab-phone').onclick = () => setPhone(!phone);
  function appLook() { const b = $p('.ab-app'); b.classList.toggle('on', appMode); b.setAttribute('aria-pressed', String(appMode)); b.title = appMode ? 'Home Screen app on: back to Safari' : 'Home Screen app: as if added to the Home Screen from Safari'; }
  $p('.ab-app').onclick = () => { appMode = !appMode; savePgs(); appLook(); iphoneSet(tabs.get(cur)?.sbs);
    phoneLayout(); requestAnimationFrame(() => { const t = tabs.get(cur); if (t) phoneSet(t, true); phoneFit(); }); }; // loads again: a Home Screen app starts fresh
  appLook();
  const fx = $p('.ab-flip');
  $p('.ab-side').onclick = () => setFold(!unfolded);
  $p('.ab-dock').onclick = () => setDock(!docked);
  $p('.ab-reload').onclick = () => reload(tabs.get(cur));
  $p('.ab-home').onclick = () => { const t = tabs.get(cur); if (t?.home) nav(t, t.home, 'back'); };
  $p('.ab-out').onclick = () => $p('.ab-ext').click();
  $p('.ab-ext').onclick = () => { const t = tabs.get(cur); if (t?.url || t?.home) window.open(t.url || t.home, '_blank', 'noopener'); };
  $p('.ab-url').onsubmit = e => { e.preventDefault(); let u = urlIn.value.trim(); if (!u) return;
    if (!/^[a-z]+:\/\//i.test(u)) u = /^(localhost|127\.|\d+\.\d+\.\d+\.\d+|\[)/i.test(u) ? 'http://' + u : /\s/.test(u) || !/\./.test(u) ? 'https://www.google.com/search?q=' + encodeURIComponent(u) : 'https://' + u;
    const t = tabs.get(cur) || newTab('', '', true); if (!cur) select(t.key); nav(t, u); urlIn.blur(); };
  view.addEventListener('animationend', () => view.classList.remove('sl-back', 'sl-fwd'));
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && open && !docked && !e.defaultPrevented && !document.body.classList.contains('fbopen') && document.activeElement !== urlIn) show(false);
    if (open && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); $p(e.key === 'ArrowLeft' ? '.ab-back' : '.ab-fwd').click(); }
  });
  addEventListener('resize', () => { if (open || closing) place(!!(slideRaf || andRaf)); if (phone) phoneFit(); }); // mid-slide: keep the animating width (a full-width place() here flashed the column open for a frame)
  new MutationObserver(() => open && place()).observe(document.body, { attributes: true, attributeFilter: ['data-tab'] });
  setInterval(() => { // agents removed (Close) take only their own tab; names follow renames
    if (window.fmAgentsIn) for (const t of [...tabs.values()]) if (t.agent && !agents.get(t.agent)) close(t.key); // only once the server's agent list is in (restored agent tabs wait for it)
    if (tabs.size) drawTabs();
  }, 1000);
  restoring = true; try { for (const o of JSON.parse(localStorage.getItem('abTabs') || '[]')) { if (!o?.url) continue; const tpg = typeof o.pg === 'string' ? o.pg : 'foreman';
    if (typeof o.agent === 'string' && o.agent) { if (!tabs.has('a:' + o.agent)) add({ key: 'a:' + o.agent, pg: tpg, agent: o.agent, home: String(o.home || o.url), url: String(o.url), title: String(o.title || '') }); }
    else newTab(o.url, o.title, true, tpg); } } catch {} restoring = false; // every tab comes back, each on its page (loaded when first shown)
  if (window.FmAndroid) view.append(window.FmAndroid.el);
  if (phone) { panel.classList.add('phone'); $p('.ab-phone').classList.add('on'); $p('.ab-phone').setAttribute('aria-pressed', 'true'); }
  sideLook();
  devLook(); setDock(docked);
  tools(); drawTabs();
  window.abOpen = openLink; window.abSync = sync; window.abDrop = dropAgent; window.abShow = show; window.abAndroid = openAndroid; window.abPage = setPage;
})();
