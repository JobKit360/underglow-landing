// Android emulator view (browser.js shows it in its panel when the robot button in the top bar is on). The emulator runs on the Foreman HOST (android.mjs);
// this only plays its screen and sends input, so it works the same in the desktop app, a plain browser and on a phone.
//   /android/ws: JSON status ({t:'st'|'meta'|'note'|'streamErr'}) + binary H.264 packets ([flag: 1 config / 2 key / 0 delta] + Annex B data),
//   decoded with WebCodecs onto a canvas. Input: mouse / touch → touch events, wheel → scroll, keys → text or Android key codes (TV: arrows = D-pad, Enter = select, Backspace / Esc = Back; a remote under the TV screen),
//   paste → device clipboard + paste, right click → Back. Drop an .apk on the screen (or Install app) to install and open it.
//   Connected only while the tab is on screen (browser.js calls FmAndroid.active); the host stops streaming 15 s after the last viewer.
//   Device modes (phone / tablet / TV): the screen morphs to the new shape (eased, live-retargeted while the docked column animates to the width
//   FmAndroid.dockW asks for), blurred until the first frame of the new shape arrives. Questions use an in-panel popup (ask), not confirm().
(() => {
  const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const el = document.createElement('div'); el.className = 'ab-frame ab-and ld';
  el.innerHTML = `<div class="and-stage"><canvas tabindex="0" aria-label="Android screen"></canvas>
      <div class="and-card" hidden><b class="and-t"></b><span class="and-s"></span><div class="and-pb" hidden><i></i></div><div class="and-acts"></div></div><div class="and-drop">Drop the .apk to install it</div>
      <div class="and-remote" hidden role="group" aria-label="TV remote"><div class="rm-body">
        <i class="rm-dot"></i>
        <div class="rm-pad">
          <button class="rm-k rm-up" data-k="19" title="Up (arrow key)" aria-label="Up">${svg('M7 14l5-5 5 5')}</button>
          <button class="rm-k rm-dn" data-k="20" title="Down (arrow key)" aria-label="Down">${svg('M7 10l5 5 5-5')}</button>
          <button class="rm-k rm-lt" data-k="21" title="Left (arrow key)" aria-label="Left">${svg('M14 7l-5 5 5 5')}</button>
          <button class="rm-k rm-rt" data-k="22" title="Right (arrow key)" aria-label="Right">${svg('M10 7l5 5-5 5')}</button>
          <button class="rm-k rm-ok" data-k="23" title="Select (Enter)" aria-label="Select"></button>
        </div>
        <div class="rm-row">
          <button class="rm-k rm-sm" data-k="4" title="Back (Backspace)" aria-label="Back">${svg('M9 6.5L4.5 11 9 15.5M5 11h9.5a4.5 4.5 0 0 1 0 9H12')}</button>
          <button class="rm-k rm-sm" data-k="3" title="Home" aria-label="Home">${svg('M4.5 11L12 4.5l7.5 6.5M7 9.5V19h10V9.5')}</button>
        </div>
      </div></div>
      <div class="and-pop" hidden role="alertdialog" aria-modal="true"><div class="and-pop-box"><i class="and-pop-ic"></i><b></b><span></span><div class="and-pop-acts"><button class="and-pop-no">Cancel</button><button class="and-pop-ok">OK</button></div></div></div></div>
    <div class="and-bar">
      <button class="ab-b and-back" title="Back (right click on the screen)" aria-label="Back">${svg('M15 5l-7 7 7 7')}</button>
      <button class="ab-b and-home" title="Home" aria-label="Home"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/></svg></button>
      <button class="ab-b and-apps" title="Recent apps" aria-label="Recent apps"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg></button>
      <span class="and-modes" role="group" aria-label="Device">
        <button class="ab-b and-m" data-m="phone" title="Phone" aria-label="Phone" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/></svg></button>
        <button class="ab-b and-m" data-m="tablet" title="Tablet" aria-label="Tablet" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M18 11.5v1"/></svg></button>
        <button class="ab-b and-m" data-m="tv" title="TV (Android TV; the first switch downloads it, about 1 GB)" aria-label="TV" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="12.5" rx="1.5"/><path d="M8 20.5h8M12 17v3.5"/></svg></button>
      </span>
      <span class="and-note"></span>
      <button class="ab-b and-rot" title="Rotate" aria-label="Rotate">${svg('M4 12a8 8 0 0 1 13.66-5.66L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.66 5.66L4 15.5M4 20v-4.5h4.5')}</button>
      <button class="ab-b and-re" title="Open the last installed app again" aria-label="Reopen app">${svg('M5 4l14 8-14 8z')}</button>
      <button class="ab-b and-inst" title="Install an app (.apk) and open it" aria-label="Install app">${svg('M12 4v11M7 10l5 5 5-5M5 20h14')}</button>
      <button class="ab-b and-pow" title="Turn the emulator off" aria-label="Turn off">${svg('M12 3v8M7.05 6.05a7 7 0 1 0 9.9 0')}</button>
      <input type="file" accept=".apk,application/vnd.android.package-archive" hidden>
    </div>`;
  const $ = s => el.querySelector(s), cv = $('canvas'), ctx = cv.getContext('2d'), stage = $('.and-stage'), card = $('.and-card');
  const MODE_SIZE = { phone: [720, 1600], tablet: [1600, 1000], tv: [1600, 900] }; // stream size per mode (shape before the first frame)
  let frames = 0, cfgs = 0, decErr = '';
  // Coming back to a page: its emulator's last frame shows at once (no 'Connecting' card) and the screen / docked column take their shape without
  // morphing, until the live stream's first frame (settle). snaps: page → copy of its last frame.
  let settle = 0, ghost = false, gw = 0, gh = 0; const snaps = new Map(); const settling = () => performance.now() < settle;
  let pendMode = null, swapT = 0, cw = 0, ch = 0, tw = null;
  let ws = null, wsKey = 'foreman', on = false, st = {}, vw = 0, vh = 0, dec = null, codec = '', pendCfg = null, needKey = true, ts = 0, retry = 0, noteT = 0;
  const send = m => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); };
  const q = () => '?ws=' + encodeURIComponent(wsKey); // each workspace page has its own emulator (android.mjs)
  const note = (s, ms = 5000) => { $('.and-note').textContent = s || ''; clearTimeout(noteT); if (s && ms) noteT = setTimeout(() => { $('.and-note').textContent = ''; }, ms); };
  // the add-on switch (server /api/addons): html.no-android = off on the host. Turning it on also starts the download when it is not installed yet.
  const addonOff = () => document.documentElement.classList.contains('no-android');
  const addonOn = () => fetch('/api/addons', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Foreman': '1' }, body: JSON.stringify({ android: true }) }).then(r => r.json()).then(j => { if (j.error) throw new Error(j.error); document.documentElement.classList.remove('no-android'); if (!j.android?.installed) status({ ...st, phase: 'installing', installed: false, step: 'Starting the download', pct: 0 }); else status(st); return j; });
  const api = (a, body, headers) => fetch('/api/android/' + a + q(), { method: 'POST', body, headers }).then(r => r.json()).then(j => { if (j.error) throw new Error(j.error); if (j.phase) status(j); return j; });

  // ---------- status card (setup / start / errors) ----------
  function status(s) {
    st = s; if (!vw) checkShape(); const ph = s.phase; let t = '', sub = '', acts = [], pb = null;
    // Optional add-on (addons.mjs): not installed = the install offer, right here. It installs on the host; every screen (client too) sees the progress.
    if (!s.installed && ph !== 'installing') { t = 'Install the Android emulator?'; sub = (ph === 'error' ? s.msg + '\n\n' : '') + 'A virtual Android phone your agents can install and test apps on. It runs on your host computer; this screen and your other computers just show it, nothing is installed on them.\n\nDownloads about 2 GB once (about 5 GB on disk) and takes a few minutes. Needs virtualization switched on.'; acts = [['Install Android emulator', () => addonOn().then(() => api('status').catch(() => {}))]]; }
    else if (addonOff() && ph !== 'installing') { t = 'Android emulator is off'; sub = 'It is installed but switched off (Settings → Add-ons). Turn it on to run and test Android apps here.'; acts = [['Turn on', () => addonOn()]]; }
    else if (ph === 'installing') { t = 'Setting up Android'; sub = [s.step, s.msg].filter(Boolean).join(' · '); pb = s.pct; }
    else if (ph === 'stopped' || ph === 'none') { t = 'Emulator is off'; sub = s.msg && s.msg !== 'Android is set up' ? s.msg : 'Start it to run and test Android apps here. Each page has its own emulator; it turns itself off after 20 minutes unused.'; acts = [['Start emulator', () => api('start')]]; }
    else if (ph === 'stopping') { t = 'Turning the emulator off'; sub = 'Saving where it is, so your apps and data are there next time.'; pb = -1; }
    else if (ph === 'starting' || ph === 'booting') { t = ph === 'starting' ? 'Starting the emulator' : 'Android is starting up'; sub = ph === 'starting' && s.msg && s.msg !== 'Starting the emulator' ? s.msg : 'First start takes a minute or two, later ones a few seconds.'; pb = -1; }
    else if (ph === 'error') { t = 'Android hit a problem'; sub = s.msg; acts = [['Try again', () => api(s.installed ? 'start' : 'setup')]]; }
    const showCard = ph !== 'running' || (!vw && !ghost);
    card.hidden = !showCard;
    if (ph === 'running' && !vw) { t = 'Connecting to the screen'; sub = ''; acts = []; pb = -1; }
    $('.and-t').textContent = t; $('.and-s').textContent = sub;
    const bar = $('.and-pb'); bar.hidden = pb == null; bar.classList.toggle('ind', pb === -1); if (pb >= 0) bar.firstChild.style.width = pb + '%';
    const box = $('.and-acts'); box.replaceChildren(...acts.map(([n, f]) => { const b = document.createElement('button'); b.textContent = n; b.onclick = () => { b.disabled = true; f().catch(e => note(e.message, 8000)).finally(() => { b.disabled = false; }); }; return b; }));
    const live = ph === 'running'; for (const b of el.querySelectorAll('.and-back,.and-home,.and-apps,.and-rot')) b.disabled = !live || !vw;
    const busy = s.switching || ['installing', 'starting', 'booting', 'stopping'].includes(ph), md = s.mode || 'phone';
    for (const b of el.querySelectorAll('.and-m')) { const on = b.dataset.m === md; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.disabled = !s.installed || (busy && !on); }
    el.classList.toggle('tv', md === 'tv'); el.classList.toggle('tablet', md === 'tablet'); $('.and-rot').hidden = md === 'tv'; $('.and-apps').hidden = md === 'tv'; const rmWas = $('.and-remote').hidden; $('.and-remote').hidden = md !== 'tv'; if (rmWas !== $('.and-remote').hidden) fit();
    for (const b of el.querySelectorAll('.and-remote button')) b.disabled = !live || !vw;
    $('.and-back').title = md === 'tv' ? 'Back (Backspace or Esc, or right click on the screen)' : 'Back (right click on the screen)';
    $('.and-m[data-m=tv]').title = s.tvReady ? 'TV (Android TV: arrow keys move, Enter selects, Backspace goes back)' : 'TV (Android TV; the first switch downloads it, about 1 GB)';
    $('.and-re').disabled = !live || !s.lastApp; $('.and-re').title = s.lastApp ? `Open ${s.lastApp.pkg} again` : 'Open the last installed app again';
    $('.and-inst').disabled = !s.installed; $('.and-pow').disabled = !s.installed || ph === 'installing' || ph === 'stopping';
    $('.and-pow').title = live || ph === 'booting' ? 'Turn the emulator off' : 'Turn the emulator on'; $('.and-pow').classList.toggle('off', !(live || ph === 'booting' || ph === 'starting'));
    window.FmAndroid?.onState?.(s);
  }

  // ---------- video ----------
  function codecOf(b) { // avc1.PPCCLL from the SPS (NAL type 7) in an Annex B config packet
    for (let i = 0; i + 4 < b.length; i++) if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1 && (b[i + 3] & 0x1f) === 7) return 'avc1.' + [b[i + 4], b[i + 5], b[i + 6]].map(x => x.toString(16).padStart(2, '0')).join('');
    return 'avc1.42e01f';
  }
  function makeDec(c) {
    try { dec?.close(); } catch {}
    codec = c; needKey = true;
    dec = new VideoDecoder({ output: f => { if (cv.width !== f.displayWidth || cv.height !== f.displayHeight) { cv.width = f.displayWidth; cv.height = f.displayHeight; } ctx.drawImage(f, 0, 0); f.close(); frames++; settle = 0; ghost = false; if (stage.classList.contains('swap') && !pendMode) swapDone(); if (!card.hidden && st.phase === 'running') status(st); },
      error: e => { decErr = String(e?.message || e); console.warn('android decoder:', e); dec = null; needKey = true; send({ t: 'keyframe' }); } });
    dec.configure({ codec: c, optimizeForLatency: true });
  }
  function packet(ab) {
    const u = new Uint8Array(ab), flag = u[0], data = u.subarray(1);
    if (flag === 1) { cfgs++; pendCfg = data.slice(); makeDec(codecOf(data)); return; } // new stream setup (start, reset, new size): fresh decoder
    if (!dec || dec.state !== 'configured') return;
    if (needKey && flag !== 2) return;
    if (flag === 0 && dec.decodeQueueSize > 8) { needKey = true; send({ t: 'keyframe' }); return; } // falling behind: skip to the next key frame
    let d = data; if (flag === 2 && pendCfg) { d = new Uint8Array(pendCfg.length + data.length); d.set(pendCfg); d.set(data, pendCfg.length); pendCfg = null; }
    if (flag === 2) needKey = false;
    try { dec.decode(new EncodedVideoChunk({ type: flag === 2 ? 'key' : 'delta', timestamp: ts += 16667, data: d })); } catch (e) { needKey = true; send({ t: 'keyframe' }); }
  }
  const aspect = () => pendMode ? MODE_SIZE[pendMode] : vw ? [vw, vh] : ghost && gw ? [gw, gh] : MODE_SIZE[st.mode] || MODE_SIZE.phone;
  // TV: the screen sits at the top and the top half of a remote (D-pad, OK, Back, Home) peeks up from the bottom edge
  const RM_H = 292; // visible height of the remote at full size
  const remoteH = H => $('.and-remote').hidden ? 0 : Math.round(Math.max(150, Math.min(RM_H, H * .42)));
  function placeRemote(H, rh) { if (!rh) return; const r = $('.and-remote'); r.style.top = (H - rh) + 'px'; r.style.setProperty('--rs', (rh / RM_H).toFixed(3)); }
  function target() { // canvas: largest box with the device's shape that fits the stage (above the remote in TV mode)
    const [w, h] = aspect(), r = stage.getBoundingClientRect(), pad = 16, rh = remoteH(r.height), s = Math.min((r.width - pad * 2) / w, (r.height - rh - pad * 2) / h);
    placeRemote(r.height, rh);
    return s > 0 ? [Math.floor(w * s), Math.floor(h * s)] : null;
  }
  const setSz = (w, h) => { cw = w; ch = h; cv.style.width = w + 'px'; cv.style.height = h + 'px'; };
  const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  function fit(anim) { // anim: morph from the current shape; the end point follows the stage live (the dock may be animating too)
    const t = target(); if (!t) return;
    if (anim === true && cw && !matchMedia('(prefers-reduced-motion: reduce)').matches) { tw = { fw: cw, fh: ch, t0: performance.now(), d: 560 }; requestAnimationFrame(step); }
    else if (!tw) setSz(...t);
  }
  function step(n) {
    if (!tw) return; const k = Math.min(1, (n - tw.t0) / tw.d), e = ease(Math.max(0, k)), t = target() || [cw, ch];
    setSz(Math.round(tw.fw + (t[0] - tw.fw) * e), Math.round(tw.fh + (t[1] - tw.fh) * e));
    if (k < 1) requestAnimationFrame(step); else tw = null;
  }
  new ResizeObserver(() => fit()).observe(stage);
  let shownR = 0; // shape (w/h) the screen and the docked column were last sized for
  function reshape(anim = true) { const [w, h] = aspect(); shownR = w / h; fit(anim && !settling()); window.FmAndroid?.onSize?.(); } // new device shape: screen morphs, docked column follows
  function checkShape() { const [w, h] = aspect(); if (Math.abs(w / h - shownR) > .01) reshape(!!shownR && !!cw); else fit(); }
  function swapDone() { clearTimeout(swapT); stage.classList.remove('swap'); }
  // ---------- popup on the emulator (instead of confirm) ----------
  function ask(title, text, ok = 'OK', icon = '') {
    const p = $('.and-pop'); p.querySelector('b').textContent = title; p.querySelector('span').textContent = text; p.querySelector('.and-pop-ok').textContent = ok;
    p.querySelector('.and-pop-ic').className = 'and-pop-ic ' + icon; p.classList.toggle('danger', icon === 'pow'); p.hidden = false; requestAnimationFrame(() => p.classList.add('in'));
    setTimeout(() => p.querySelector('.and-pop-ok').focus(), 60);
    return new Promise(res => {
      const done = v => { p.classList.remove('in'); p.removeEventListener('keydown', key); setTimeout(() => { p.hidden = true; }, 180); res(v); cv.focus({ preventScroll: true }); };
      const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } };
      p.addEventListener('keydown', key);
      p.querySelector('.and-pop-ok').onclick = () => done(true); p.querySelector('.and-pop-no').onclick = () => done(false);
      p.onclick = e => { if (e.target === p) done(false); };
    });
  }

  // ---------- connection ----------
  function connect() {
    if (ws || !on) return;
    if (!window.VideoDecoder) { status({ ...st, phase: 'error', msg: "This browser can't play the Android screen (no WebCodecs). Use the Foreman app or a current Chrome / Safari / Edge." }); return; }
    const sock = ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/android/ws' + q()); ws.binaryType = 'arraybuffer';
    ws.onmessage = e => {
      if (ws !== sock) return; // left over from another page's emulator
      if (typeof e.data !== 'string') return packet(e.data);
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'st') status(m);
      else if (m.t === 'meta') { const f0 = frames; setTimeout(() => { if (frames === f0 && ws) send({ t: 'keyframe' }); }, 1200); vw = m.w; vh = m.h; needKey = true; if (pendMode && (vw > vh) === (MODE_SIZE[pendMode][0] > MODE_SIZE[pendMode][1])) pendMode = null; checkShape(); status(st); }
      else if (m.t === 'note') note(m.msg, m.ms);
      else if (m.t === 'streamErr') { vw = 0; note(m.msg, 10000); status(st); }
    };
    ws.onopen = () => { retry = 0; };
    ws.onclose = () => { if (ws !== sock) return; ws = null; vw = 0; try { dec?.close(); } catch {} dec = null; if (on) { status({ ...st }); setTimeout(connect, Math.min(8000, 1000 * ++retry)); } };
  }
  function setWs(k) { // the page on screen changed: show that page's emulator
    k = /^[\w-]{1,48}$/.test(k || '') ? k : 'foreman'; if (k === wsKey) return;
    if (vw && cv.width) { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); snaps.set(wsKey, { c, vw, vh, mode: st.mode }); } // the page left: keep its last frame
    wsKey = k; vw = 0; try { dec?.close(); } catch {} dec = null; ctx.clearRect(0, 0, cv.width, cv.height); note('');
    settle = performance.now() + 6000; const sn = snaps.get(k); ghost = !!sn; if (sn) { gw = sn.vw; gh = sn.vh; }
    if (sn) { cv.width = sn.c.width; cv.height = sn.c.height; ctx.drawImage(sn.c, 0, 0); }
    if (ws) { const old = ws; ws = null; old.close(); }
    if (sn) { status({ phase: 'running', installed: true, mode: sn.mode }); shownR = 0; checkShape(); } else { status({ phase: 'none', installed: true }); $('.and-acts').replaceChildren(); card.hidden = false; $('.and-t').textContent = 'Android emulator'; $('.and-s').textContent = 'Connecting…'; }
    if (on) connect(); else fetch('/api/android/status' + q()).then(r => r.json()).then(j => { if (k === wsKey && !ws && j.phase) status(j); }).catch(() => {}); // keeps the top-bar dot right
  }
  function active(v) { if (v === on) return; on = v; if (v) { connect(); fit(); setTimeout(grab, 50); } else if (ws) { ws.close(); ws = null; } }

  // ---------- input ----------
  const at = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * vw, y: (e.clientY - r.top) / r.height * vh }; };
  const down = new Map();
  const pid = e => e.pointerType === 'mouse' ? 0 : 10 + (e.pointerId % 1000);
  cv.addEventListener('pointerdown', e => { if (!vw || (e.pointerType === 'mouse' && e.button !== 0)) return; e.preventDefault(); cv.focus({ preventScroll: true }); cv.setPointerCapture(e.pointerId); down.set(e.pointerId, 1); send({ t: 'touch', a: 0, id: pid(e), ...at(e) }); });
  cv.addEventListener('pointermove', e => { if (!down.has(e.pointerId)) return; for (const ce of e.getCoalescedEvents?.() || [e]) send({ t: 'touch', a: 2, id: pid(e), ...at(ce) }); });
  const up = e => { if (!down.delete(e.pointerId)) return; send({ t: 'touch', a: 1, id: pid(e), ...at(e) }); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', e => { e.preventDefault(); if (vw) send({ t: 'key', code: 4 }); }); // right click = Back (like scrcpy)
  cv.addEventListener('wheel', e => { if (!vw) return; e.preventDefault(); const k = e.deltaMode === 1 ? 1 / 3 : 1 / 100, c = v => Math.max(-16, Math.min(16, v));
    send({ t: 'scroll', ...at(e), h: c(-e.deltaX * k), v: c(-e.deltaY * k) }); }, { passive: false });
  const KEYS = { Enter: 66, Backspace: 67, Delete: 112, Tab: 61, Escape: 111, ArrowUp: 19, ArrowDown: 20, ArrowLeft: 21, ArrowRight: 22, Home: 122, End: 123, PageUp: 92, PageDown: 93, Insert: 124 };
  const TV_KEYS = { Enter: 23, NumpadEnter: 23, Backspace: 4, Escape: 4, BrowserBack: 4 }; // TV remote: Enter = D-pad centre (select), Backspace / Esc = Back
  const keyOf = e => (st.mode === 'tv' && TV_KEYS[e.key]) || KEYS[e.key];
  const meta = e => (e.shiftKey ? 1 : 0) | (e.altKey ? 2 : 0) | (e.ctrlKey ? 0x1000 : 0);
  cv.addEventListener('keydown', e => {
    if (!vw) return;
    if ((e.ctrlKey || e.metaKey) && /^[vV]$/.test(e.key)) return; // paste event below
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); send({ t: 'text', s: e.key }); return; }
    if (e.ctrlKey && /^[a-zA-Z]$/.test(e.key)) { e.preventDefault(); send({ t: 'key', code: 29 + e.key.toLowerCase().charCodeAt(0) - 97, meta: meta(e) }); return; } // Ctrl+A/C/X/Z… → KEYCODE_A..Z with Ctrl, full press
    const code = keyOf(e); if (code == null) return; e.preventDefault(); send({ t: 'key', a: 0, code, meta: meta(e) }); if (!e.repeat) flash(code);
  });
  cv.addEventListener('keyup', e => { const code = keyOf(e); if (code != null && vw) { e.preventDefault(); send({ t: 'key', a: 1, code, meta: meta(e) }); } });
  // Keyboard always lands on the screen: the bar's buttons don't take focus from it, clicking anywhere on the Android panel focuses it,
  // and opening the panel focuses it unless you are typing somewhere else.
  const typing = a => !!a && a !== document.body && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
  const grab = () => { if (on && el.isConnected && !typing(document.activeElement) && $('.and-pop').hidden) cv.focus({ preventScroll: true }); };
  $('.and-bar').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
  el.addEventListener('pointerdown', e => { if (!e.target.closest('button, input, .and-pop, .and-card')) grab(); });
  $('.and-remote').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
  for (const b of el.querySelectorAll('.and-remote button')) b.onclick = () => { if (!vw) return; send({ t: 'key', code: +b.dataset.k }); flash(+b.dataset.k); grab(); };
  function flash(code) { const b = $(`.and-remote [data-k="${code}"]`); if (!b || $('.and-remote').hidden) return; b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); clearTimeout(b.hitT); b.hitT = setTimeout(() => b.classList.remove('hit'), 400); } // keyboard presses light the remote up too
  cv.addEventListener('paste', e => { const s = e.clipboardData?.getData('text'); if (s) { e.preventDefault(); send({ t: 'paste', s }); } });
  $('.and-back').onclick = () => send({ t: 'key', code: 4 });
  $('.and-home').onclick = () => send({ t: 'key', code: 3 });
  $('.and-apps').onclick = () => send({ t: 'key', code: 187 });
  $('.and-rot').onclick = () => send({ t: 'rotate' });
  const NAME = { phone: 'phone', tablet: 'tablet', tv: 'TV' };
  for (const b of el.querySelectorAll('.and-m')) b.onclick = async () => { if (b.classList.contains('on') || b.disabled) return; const m = b.dataset.m;
    const restart = (m === 'tv') !== (st.mode === 'tv') && ['running', 'booting', 'starting'].includes(st.phase);
    if (m === 'tv' && !st.tvReady && !await ask('Switch to TV?', 'The first time downloads Android TV (about 1 GB), then the emulator restarts as a TV. Your phone and tablet apps stay where they are.', 'Download and switch', 'tv')) return;
    else if (st.tvReady && restart && !await ask(m === 'tv' ? 'Switch to TV?' : 'Switch to ' + NAME[m] + '?', (m === 'tv' ? 'The emulator restarts as an Android TV.' : 'The emulator restarts as a ' + NAME[m] + '.') + ' Everyone watching sees the switch; it takes about a minute.', 'Switch', m)) return;
    pendMode = m; if (st.phase === 'running') { stage.classList.add('swap'); clearTimeout(swapT); swapT = setTimeout(() => { pendMode = null; swapDone(); fit(true); }, restart ? 240000 : 8000); }
    reshape(); note('Switching to ' + NAME[m] + '…', 0);
    fetch('/api/android/mode' + q(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: m }) }).then(r => r.json()).then(j => { if (j.error) throw new Error(j.error); status(j); note(''); })
      .catch(e => { pendMode = null; swapDone(); reshape(); note(e.message, 8000); }); };
  $('.and-re').onclick = () => api('relaunch').catch(e => note(e.message, 8000));
  $('.and-pow').onclick = async () => { const live = ['running', 'booting', 'starting'].includes(st.phase); if (live && !await ask('Turn the emulator off?', 'Everyone watching this page’s emulator loses it. Starting it again takes a few seconds.', 'Turn off', 'pow')) return; api(live ? 'stop' : 'start').catch(e => note(e.message, 8000)); };

  // ---------- install an .apk (button or drop) ----------
  const fileIn = $('input[type=file]');
  $('.and-inst').onclick = () => fileIn.click();
  fileIn.onchange = () => { const f = fileIn.files?.[0]; fileIn.value = ''; if (f) install(f); };
  function install(f) {
    if (!/\.apk$/i.test(f.name)) return note('That is not an .apk file', 6000);
    note(`Uploading ${f.name}…`, 0);
    api('install', f, { 'Content-Type': 'application/vnd.android.package-archive', 'X-File-Name': f.name }).then(j => note(`Installed and opened ${j.pkg}`), e => note('Install failed: ' + e.message, 12000));
  }
  let dragN = 0;
  stage.addEventListener('dragenter', e => { if ([...e.dataTransfer?.types || []].includes('Files')) { e.preventDefault(); dragN++; stage.classList.add('drag'); } });
  stage.addEventListener('dragover', e => { if (stage.classList.contains('drag')) e.preventDefault(); });
  stage.addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; stage.classList.remove('drag'); } });
  stage.addEventListener('drop', e => { e.preventDefault(); dragN = 0; stage.classList.remove('drag'); const f = e.dataTransfer?.files?.[0]; if (f) install(f); });

  status({ phase: 'none', installed: true }); $('.and-acts').replaceChildren();
  card.hidden = false; $('.and-t').textContent = 'Android emulator'; $('.and-s').textContent = 'Connecting…';
  // width the docked column should get for this device, given the panel height H: the screen at full height (+ stage padding and the panel's gap), never narrower than the bar needs
  const dockW = H => { const [w, h] = aspect(), sh = H - 44 - 47 - 32 - remoteH(H - 44 - 47); return Math.max(470, Math.min(Math.round(innerWidth * .6), Math.round(sh * w / h) + 32 + 20)); }; // ≤ 60% of the window: the agents keep room
  window.FmAndroid = { el, active, setWs, get ws() { return wsKey; }, dockW, get settling() { return settling(); }, get state() { return st; }, get debug() { return { vw, vh, pendMode, dec: dec?.state || null, frames, cfgs, decErr, swap: stage.classList.contains('swap') }; } };
})();
