// Workbox (server: workbox.mjs, GET/POST /api/workbox*, WebSocket /workbox/vnc): a small Linux box on the host PC where bots and agents build,
// run and test. Three things live here:
//  1. Settings → Add-ons → Workbox (mount): status with an animated box, the set-up steps, memory, every workspace with its live desktop, and the
//     switches (on/off, memory limit, idle shutdown). Plain words only; anything that needs admin rights or a restart is its own button and asks first.
//  2. Desktop viewer (view): noVNC (public/vendor/novnc, MPL-2.0) on the host's /workbox/vnc socket, so it works the same on the client PC.
//     Small views stream at low quality and are look-only; Expand opens the screen full size, sharp, and you can use it.
//  3. A bot's Desktop tab (botPanel), drawn by bots.js when the Workbox is on.
(() => {
  if (!document.getElementById('wbxCss')) { const l = document.createElement('link'); l.id = 'wbxCss'; l.rel = 'stylesheet'; l.href = 'workbox.css?v=1'; document.head.appendChild(l); }
  const H = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const api = (p, body) => fetch('/api/workbox' + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Foreman': '1' }, body: JSON.stringify(body) } : { cache: 'no-store' })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Something went wrong.'); return j; });
  const GB = n => (n / 1024 ** 3).toFixed(n >= 10 * 1024 ** 3 ? 0 : 1);
  let st = null, lastLoad = 0; const subs = new Set(), watchers = new Set(); // subs: an open Settings panel (polls every 3 s); watchers: bots.js (only told)
  let sig = ''; // on/off + which screens are open: bots.js redraws a Desktop tab when it changes (event fm-workbox)
  const load = () => api('').then(j => { st = j; const s2 = (j.settings?.enabled ? 1 : 0) + j.state + (j.state === 'setting-up' ? (j.setup?.step || '') + (j.setup?.pct || 0) + (j.setup?.sub || '') + (j.setup?.repair || '') : '') + (j.setup?.error ? 'e' : '') + (j.workspaces || []).filter(w => w.desktop).map(w => w.key).join(); if (s2 !== sig) { sig = s2; dispatchEvent(new CustomEvent('fm-workbox')); } lastLoad = Date.now(); [...subs, ...watchers].forEach(f => { try { f(st); } catch {} }); return j; }).catch(() => st);
  const poll = () => { const fast = (subs.size || !!document.querySelector('.wbx-bot')) && document.visibilityState === 'visible'; /* Settings panel or a bot's Desktop tab on screen */ if (Date.now() - lastLoad > (st?.state === 'setting-up' || st?.state === 'starting' ? 1500 : fast ? 3000 : 30000)) load(); };
  setInterval(poll, 1000); load();

  // ---------- the box drawing (animated by state) ----------
  const BOX = `<svg viewBox="0 0 64 64" class="wbx-cube" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path class="wbx-top" d="M32 8 54 20 32 32 10 20Z"/><path d="M10 20v24l22 12V32M54 20v24L32 56"/></g><g class="wbx-lights"><circle cx="20" cy="38" r="2.2"/><circle cx="20" cy="45" r="2.2"/></g></svg>`;
  const TEXT = {
    unsupported: ['Not available here', 'The Workbox needs a Windows PC.'],
    'no-virt': ['Virtualization is switched off', 'The Workbox runs a small Linux computer inside Windows. For that, a setting called virtualization (Intel VT-x or AMD-V/SVM) has to be on in your PC\'s BIOS. It is switched on by hand while the PC starts; UnderGlow can\'t do it for you.'],
    'no-wsl': ['Windows needs its Linux feature', 'The Workbox uses the Linux support built into Windows (WSL). Turning it on asks for administrator permission, and your PC then needs a restart. UnderGlow never restarts your PC by itself.'],
    'old-wsl': ['Windows\' Linux feature needs an update', 'Your PC has an older version of Windows\' Linux support. Updating it asks for administrator permission.'],
    'not-set-up': ['Add the Workbox', 'A private Linux box where your bots and agents build, run and test apps, so nothing opens or installs on this PC. Downloads about 1 GB (3 to 4 GB on disk) and takes 10 to 20 minutes. Uses Windows\' Linux support (WSL2) and needs virtualization switched on. No admin rights needed and no restart.'],
    'not-finished': ['Finish setting up', 'The box exists but its tools are not installed yet. Pick up where it stopped.'],
    'setting-up': ['Setting up your Workbox', 'You can keep working while this runs.'],
    off: ['Workbox is off', 'Bots and agents work on this PC as usual. Turn it on and they build and test inside the box instead.'],
    starting: ['Starting the box…', 'A few seconds.'],
    stopping: ['Stopping the box…', ''],
    on: ['Workbox is on', 'Bots and agents build and test inside it. Each one has its own space, ports and screen.'],
  };

  // ---------- desktop viewer ----------
  // noVNC reads WebSocket.OPEN etc. when it loads; some wrappers (browser extensions, test tools) drop those constants, and then it never sends a byte.
  const wsConsts = () => { for (const [k, v] of [['CONNECTING', 0], ['OPEN', 1], ['CLOSING', 2], ['CLOSED', 3]]) if (WebSocket[k] !== v) try { Object.defineProperty(WebSocket, k, { value: v, configurable: true }); } catch {} };
  let RFBmod = null; const rfbLoad = () => RFBmod ||= (wsConsts(), import('./vendor/novnc/core/rfb.js').then(m => m.default));
  const wsUrl = key => (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/workbox/vnc?key=' + encodeURIComponent(key);
  // el: an empty box; opts.quality 'low' (look-only, light) | 'high' (sharp, you can use it). Returns { close }.
  function view(el, key, opts = {}) {
    const high = opts.quality === 'high'; let rfb = null, closed = false, tries = 0;
    el.classList.add('wbx-scr'); el.innerHTML = '<div class="wbx-scr-in"></div><div class="wbx-wait"><span class="wbx-spin"></span><span>Connecting to the screen…</span></div>';
    const inner = el.querySelector('.wbx-scr-in'), wait = el.querySelector('.wbx-wait');
    const connect = () => rfbLoad().then(RFB => { if (closed) return;
      rfb = new RFB(inner, wsUrl(key), { shared: true });
      rfb.scaleViewport = true; rfb.resizeSession = false; rfb.background = 'transparent'; rfb.showDotCursor = !high;
      rfb.qualityLevel = high ? 9 : opts.quality === 'mid' ? 5 : 2; rfb.compressionLevel = high ? 1 : 8; rfb.viewOnly = !high && !opts.interactive;
      rfb.addEventListener('connect', () => { tries = 0; wait.hidden = true; el.classList.add('live'); });
      rfb.addEventListener('disconnect', () => { el.classList.remove('live'); rfb = null; if (closed) return; wait.hidden = false; wait.lastElementChild.textContent = 'Screen closed. Reconnecting…'; if (++tries < 6) setTimeout(() => !closed && el.isConnected && connect(), 1500 * tries); else wait.lastElementChild.textContent = 'The screen is not on.'; });
    }).catch(() => { wait.lastElementChild.textContent = 'The viewer did not load.'; });
    connect();
    const gone = setInterval(() => { if (!el.isConnected) close(); }, 1500);
    function close() { closed = true; clearInterval(gone); try { rfb?.disconnect(); } catch {} rfb = null; }
    return { close, focus: () => rfb?.focus?.() };
  }
  // Expand: the screen grows from its card to the whole window (same motion as the bot browser's full screen), at full quality.
  function expand(fromEl, key, name) {
    const r0 = fromEl.getBoundingClientRect(), ov = document.createElement('div'); ov.className = 'wbx-full'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', name + ' desktop');
    ov.innerHTML = `<div class="wbx-fbar"><b>${H(name)}</b><span class="wbx-chip">Live · you can use it</span><span class="wbx-fsp"></span><button type="button" class="wbx-nb" title="Close full screen (Esc)" aria-label="Close full screen"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 2.5V6H2.5M10 2.5V6h3.5M13.5 10H10v3.5M2.5 10H6v3.5"/></svg></button></div><div class="wbx-fscr"></div>`;
    document.body.append(ov);
    const a = ov.animate([{ top: r0.top + 'px', left: r0.left + 'px', width: r0.width + 'px', height: r0.height + 'px', borderRadius: '10px' }, { top: '0px', left: '0px', width: '100vw', height: '100vh', borderRadius: '0px' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    const v = view(ov.querySelector('.wbx-fscr'), key, { quality: 'high' }); a.onfinish = () => v.focus();
    const close = () => { removeEventListener('keydown', esc, true); v.close(); const r1 = fromEl.isConnected ? fromEl.getBoundingClientRect() : null;
      if (!r1 || matchMedia('(prefers-reduced-motion: reduce)').matches) return ov.remove();
      ov.animate([{ top: '0px', left: '0px', width: '100vw', height: '100vh', borderRadius: '0px', opacity: 1 }, { top: r1.top + 'px', left: r1.left + 'px', width: r1.width + 'px', height: r1.height + 'px', borderRadius: '10px', opacity: .6 }], { duration: 220, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => ov.remove(); };
    const esc = e => { if (e.key === 'Escape' && e.shiftKey === false) { e.preventDefault(); e.stopPropagation(); close(); } };
    addEventListener('keydown', esc, true); ov.querySelector('.wbx-nb').onclick = close;
  }
  const EXP = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>';

  // A plain yes / not now box (asked before anything big: downloads, admin prompts, removing).
  const confirmAsk = (title, text, yes, danger) => new Promise(res => {
    const d = document.createElement('div'); d.className = 'wbx-confirm'; d.innerHTML = `<div class="wbx-cdlg" role="alertdialog" aria-modal="true"><b>${H(title)}</b><p>${H(text)}</p><div><button type="button" class="wbx-btn" data-n>Not now</button><button type="button" class="wbx-btn ${danger ? 'wbx-red' : 'wbx-pri'}" data-y>${H(yes)}</button></div></div>`;
    document.body.append(d); const done = v => { d.remove(); res(v); };
    d.querySelector('[data-n]').onclick = () => done(false); d.querySelector('[data-y]').onclick = () => done(true); d.onmousedown = e => { if (e.target === d) done(false); }; d.querySelector('[data-y]').focus();
  });

  // ---------- Settings → Add-ons: both optional, nothing installed until picked here or in the installer ----------
  // Android emulator card (server /api/addons; android.mjs downloads, the top-bar robot button shows progress) + the Workbox panel below it.
  const ROBOT = `<svg viewBox="0 0 64 64" class="wbx-cube" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="16" y="24" width="32" height="26" rx="6"/><path d="M24 24c0-6 4-10 8-10s8 4 8 10M22 13l4 5M42 13l-4 5M12 30v12M52 30v12"/></g><g class="wbx-lights"><circle cx="26" cy="36" r="2.2"/><circle cx="38" cy="36" r="2.2"/></g></svg>`;
  function mountAddons(el) {
    el.innerHTML = `<div class="wbx"><p class="sa-dim">Optional extras. Nothing here is installed or switched on until you pick it (here or in the installer), and each one says what it needs first.</p>
      <h2>Android emulator</h2><div class="wbx-hero wbx-and"><div class="wbx-art">${ROBOT}</div><div class="wbx-ht"><b></b><span></span><div class="wbx-acts"></div><div class="wbx-msg" hidden></div></div></div>
      <h2>Workbox</h2><div class="wbx-box"></div></div>`;
    const hero = el.querySelector('.wbx-and'), wb = mount(el.querySelector('.wbx-box'));
    let a = null, busy = false;
    const msg = (t, bad) => { const m = hero.querySelector('.wbx-msg'); m.hidden = !t; m.textContent = t || ''; m.classList.toggle('bad', !!bad); };
    const draw = () => { if (!a) return; const x = a.android, sz = `Downloads ${x.download} (${x.disk} on disk). ${x.needs}`;
      hero.dataset.s = x.on ? 'on' : 'off';
      hero.querySelector('b').textContent = x.on ? (x.installed ? 'Android emulator is on' : 'Android emulator is downloading') : x.installed ? 'Android emulator is off' : 'Add the Android emulator';
      hero.querySelector('.wbx-ht > span').textContent = x.on ? (x.installed ? 'A virtual Android phone your agents install and test apps on. Open it with the robot button in the top bar.' : 'The download runs in the background; the robot button in the top bar shows progress. ' + sz)
        : x.installed ? 'Hidden from the top bar and from agents. Its download is kept, so turning it back on is instant.' : 'A virtual Android phone your agents can install and test apps on, shown inside UnderGlow. ' + sz;
      hero.querySelector('.wbx-acts').innerHTML = `<button type="button" class="wbx-btn${x.on ? '' : ' wbx-pri'}" data-and="${x.on ? 'off' : 'on'}"${busy ? ' disabled' : ''}>${x.on ? 'Turn off' : x.installed ? 'Turn on' : 'Set up Android emulator'}</button>`; };
    const load = () => fetch('/api/addons', { cache: 'no-store' }).then(r => r.json()).then(j => { a = j; draw(); }).catch(() => {});
    hero.addEventListener('click', async e => { const b = e.target.closest('[data-and]'); if (!b || !a) return; const on = b.dataset.and === 'on', x = a.android;
      if (on && !x.installed && !await confirmAsk('Set up the Android emulator?', `It downloads ${x.download} from Google in the background (${x.disk} on disk). ${x.needs} You can turn it off again any time.`, 'Set up')) return;
      busy = true; draw();
      try { const r = await fetch('/api/addons', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Foreman': '1' }, body: JSON.stringify({ android: on }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Not changed.'); a = j;
        document.documentElement.classList.toggle('no-android', !on); msg(on ? 'Android is on. The robot button is in the top bar.' : 'Android is off.'); }
      catch (x2) { msg(x2.message, true); } finally { busy = false; draw(); } });
    let t = 0;
    return { open() { wb.open(); load(); clearInterval(t); t = setInterval(load, 5000); }, close() { wb.close(); clearInterval(t); } };
  }

  // ---------- Settings → Add-ons → Workbox ----------
  function mount(el) {
    el.innerHTML = `<div class="wbx">
      <div class="wbx-hero"><div class="wbx-art">${BOX}</div><div class="wbx-ht"><b></b><span></span><div class="wbx-acts"></div><div class="wbx-msg" hidden></div></div></div>
      <p class="sa-dim wbx-note">Uses Windows' built-in Linux feature; you'll see it as Vmmem in Task Manager while it runs. It stops when UnderGlow quits.</p>
      <ol class="wbx-steps" hidden></ol>
      <div class="wbx-mem" hidden><div class="wbx-mh"><b>Memory</b><span></span></div><div class="wbx-bar"><i></i></div></div>
      <div class="wbx-sp" hidden><h2>Workspaces</h2><p class="sa-dim">Every bot and agent that used the Workbox has its own space: its own Linux user and folder, its own ports and, when it needs one, its own screen.</p><div class="wbx-grid"></div></div>
      <div class="wbx-set" hidden><h2>Settings</h2>
        <label class="sg-row"><span><b>Use the Workbox</b><span class="sa-dim">On: bots and agents build, run and test inside the box. Off: they work on this PC as before, and the box stays switched off.</span></span><input type="checkbox" class="sg-sw" data-k="enabled"></label>
        <label class="sg-row"><span><b>Memory limit</b><span class="sa-dim">The most memory the box may use, all workspaces together. Each workspace also has its own smaller limit.</span></span><select class="wbx-sel" data-k="memoryGB"></select></label>
        <label class="sg-row"><span><b>Shut down when idle</b><span class="sa-dim">When nothing has run and nobody is watching a screen for this long, the box switches off to free memory. It starts again by itself when needed.</span></span><select class="wbx-sel" data-k="idleMin">${[[5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [0, 'Never']].map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
        <label class="sg-row"><span><b>Screen size</b><span class="sa-dim">The size of each bot's Linux screen. Bigger is sharper when expanded, smaller is lighter to stream.</span></span><select class="wbx-sel" data-k="screen"></select></label>
        <div class="sg-row"><span><b>Ports for workspaces</b><span class="sa-dim">Each bot or agent gets its own block of ports from this range for the apps it runs. Ports already used on this computer, and UnderGlow's own, are always skipped. Change it only if it clashes with something else you run.</span></span><span class="wbx-ports"><input class="wbx-num" data-k="portFirst" type="number" min="1024" max="65535" aria-label="First port"> to <input class="wbx-num" data-k="portLast" type="number" min="1024" max="65535" aria-label="Last port"></span></div>
        <div class="sg-row wbx-danger"><span><b>Remove the Workbox</b><span class="sa-dim">Deletes the box and everything inside it (the workspaces and their copies of your projects). Your real project folders on this PC are not touched.</span></span><button type="button" class="wbx-btn wbx-red" data-a="remove">Remove…</button></div>
      </div></div>`;
    const q = s => el.querySelector(s), views = new Map(); let shown = false, msgT = 0;
    const msg = (t, bad) => { const m = q('.wbx-msg'); m.hidden = !t; m.textContent = t || ''; m.classList.toggle('bad', !!bad); clearTimeout(msgT); if (t && !bad) msgT = setTimeout(() => { m.hidden = true; }, 8000); };
    const act = (label, a, primary) => `<button type="button" class="wbx-btn${primary ? ' wbx-pri' : ''}" data-a="${a}">${label}</button>`;
    const confirmBox = confirmAsk;
    async function doAct(a) {
      try {
        if (a === 'setup') { if (!await confirmBox('Set up the Workbox?', 'It downloads about 1 GB (Ubuntu Linux, 3 to 4 GB on disk) and installs its tools inside the box. That takes 10 to 20 minutes; you can keep working. Nothing is installed on Windows itself and no admin rights are needed.', 'Set up')) return; await api('/setup', {}); load(); }
        else if (a === 'start') { msg('Starting…'); await api('/start', {}).then(j => { st = j; draw(); }); msg(''); }
        else if (a === 'stop') { await api('/stop', {}).then(j => { st = j; draw(); }); }
        else if (a === 'wsl' || a === 'wslupdate') {
          const upd = a === 'wslupdate';
          if (!await confirmBox(upd ? 'Update Linux support?' : 'Turn on Linux support?', upd ? 'Windows will ask for administrator permission. It takes a minute or two. No restart needed.' : 'Windows will ask for administrator permission, then installs its Linux support. Your PC needs a restart afterwards; UnderGlow will NOT restart it. Restart when it suits you, then come back here.', upd ? 'Update' : 'Turn on')) return;
          msg('Waiting for Windows… (look for the permission prompt)');
          const r = await api('/enable-wsl', { confirm: true, kind: upd ? 'update' : 'install' });
          msg(r.ok ? (r.restart ? 'Done. Restart your PC when it suits you, then open this page again to set up the Workbox.' : 'Updated. You can set up the Workbox now.') : r.error, !r.ok); load();
        }
        else if (a === 'remove') { if (!await confirmBox('Remove the Workbox?', 'The box and everything inside it are deleted. Your project folders on this PC stay as they are. You can set it up again later.', 'Remove', true)) return; await api('/remove', { confirm: true }).then(j => { st = j; draw(); }); msg('The Workbox was removed.'); }
      } catch (e) { msg(e.message, true); }
    }
    el.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && el.contains(b)) doAct(b.dataset.a); });
    el.querySelectorAll('[data-k]').forEach(i => i.onchange = () => { const k = i.dataset.k, v = i.type === 'checkbox' ? i.checked : k === 'screen' ? i.value : +i.value;
      api('/settings', { [k]: v }).then(() => load()).then(() => { if (k === 'enabled' && v && st?.state === 'off') doAct('start'); }).catch(x => msg(x.message, true)); });
    function draw() {
      if (!st) return; const s = st.state, [t, p] = TEXT[s] || ['Workbox', ''];
      const hero = q('.wbx-hero'); hero.dataset.s = s;
      q('.wbx-ht b').textContent = t;
      q('.wbx-ht > span').textContent = s === 'on' && st.settings.idleMin ? p + ` It switches off by itself after ${st.settings.idleMin >= 60 ? '1 hour' : st.settings.idleMin + ' minutes'} with nothing to do.` : s === 'setting-up' && st.setup?.error ? 'It stopped. ' + st.setup.error : p;
      const acts = s === 'no-wsl' ? act('Turn on Linux support…', 'wsl', true) : s === 'old-wsl' ? act('Update Linux support…', 'wslupdate', true)
        : s === 'not-set-up' ? act('Set up Workbox', 'setup', true) : s === 'not-finished' ? act('Finish setting up', 'setup', true)
        : s === 'off' ? act('Turn on', 'start', true) : s === 'on' ? act('Turn off', 'stop') : '';
      const failed = st.setup && !st.setup.busy && st.setup.error;
      q('.wbx-acts').innerHTML = failed && ['not-set-up', 'not-finished', 'off'].includes(s) ? act('Try again', 'setup', true) : acts;
      if (failed && !q('.wbx-msg').textContent) { msg('Set up stopped. ' + st.setup.error, true); const m = q('.wbx-msg'); if (st.setup.details) m.insertAdjacentHTML('beforeend', detailsHtml(st.setup.details)); }
      if (st.error && s !== 'setting-up' && !failed) msg(st.error, true);
      // set-up steps
      const ol = q('.wbx-steps'), showSteps = !!st.setup && (st.setup.busy || st.setup.error);
      ol.hidden = !showSteps;
      if (showSteps) ol.innerHTML = st.setup.steps.map(x => `<li class="${x.state}"><i>${x.state === 'done' ? '✓' : x.state === 'failed' ? '!' : ''}</i><span>${H(x.text)}${x.state === 'doing' && (x.id === 'download' || x.id === 'tools') ? ` <em>${st.setup.pct || 0}%</em><span class="wbx-bar"><i style="width:${st.setup.pct || 0}%"></i></span>${x.id === 'tools' && st.setup.sub ? `<small class="wbx-sub">${H(subText(st.setup))}</small>` : ''}` : ''}</span></li>`).join('');
      // memory
      const mm = q('.wbx-mem'); mm.hidden = !(s === 'on' && st.memory);
      if (st.memory) { const pct = Math.min(100, st.memory.used / st.memory.cap * 100); q('.wbx-mh span').textContent = `${GB(st.memory.used)} of ${GB(st.memory.cap)} GB in use`; const bar = q('.wbx-mem .wbx-bar i'); bar.style.width = pct.toFixed(1) + '%'; mm.classList.toggle('hot', pct > 80); }
      // workspaces
      const sp = q('.wbx-sp'), ws = st.workspaces || []; sp.hidden = !ws.length || !['on', 'off', 'starting', 'stopping'].includes(s);
      const grid = q('.wbx-grid'), keys = ws.map(w => w.key + (w.desktop && s === 'on' ? '+d' : '')).join('|');
      if (grid.dataset.k !== keys) {
        grid.dataset.k = keys; for (const v of views.values()) v.close(); views.clear();
        grid.innerHTML = ws.map(w => `<div class="wbx-card" data-key="${H(w.key)}"><div class="wbx-cscr">${w.desktop && s === 'on' ? '' : `<div class="wbx-none"><span>${w.desktop ? 'Screen is off while the box is off' : 'No screen open'}<span class="wbx-hint">Nothing open yet; your agent opens things here.</span></span>${s === 'on' ? `<button type="button" class="wbx-btn" data-d="open">Open screen</button>` : ''}</div>`}</div>
          <div class="wbx-cf"><span class="wbx-kind">${w.kind === 'bot' ? 'Bot' : 'Agent'}</span><b title="${H(w.user)}">${H(w.name)}</b><span class="wbx-fsp"></span>${w.desktop && s === 'on' ? `<button type="button" class="wbx-nb" data-d="expand" title="Expand: full screen, sharp, and you can use it" aria-label="Expand">${EXP}</button>` : ''}
          <button type="button" class="wbx-nb wbx-more" data-d="forget" title="Remove this workspace" aria-label="Remove this workspace"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></div>
          <div class="wbx-cd">Ports ${w.ports[0]}–${w.ports[1]}<span class="wbx-mm"></span></div></div>`).join('');
        grid.querySelectorAll('.wbx-card').forEach(c => { const w = ws.find(x => x.key === c.dataset.key); if (w.desktop && s === 'on' && shown) views.set(w.key, view(c.querySelector('.wbx-cscr'), w.key, { quality: 'low' })); });
      }
      grid.querySelectorAll('.wbx-card').forEach(c => { const w = ws.find(x => x.key === c.dataset.key); if (!w) return; c.querySelector('.wbx-mm').textContent = w.mem ? ` · ${(w.mem / 1024 ** 2).toFixed(0)} MB` : ''; c.classList.toggle('watched', w.watching > 1); });
      // settings
      const set = q('.wbx-set'); set.hidden = !['on', 'off', 'starting', 'stopping', 'not-finished'].includes(s);
      const L = st.limits || {}, fill = (sel, vals, label) => { const k = vals.join(); if (sel && vals.length && sel.dataset.v !== k) { sel.dataset.v = k; sel.innerHTML = vals.map(v => '<option value="' + v + '">' + label(v) + '</option>').join(''); } };
      fill(el.querySelector('[data-k="memoryGB"]'), L.memChoices || [], n => n + ' GB'); fill(el.querySelector('[data-k="screen"]'), L.screens || [], v => v.replace('x', ' × '));
      el.querySelectorAll('[data-k]').forEach(i => { if (document.activeElement === i) return; const v = st.settings[i.dataset.k]; if (i.type === 'checkbox') i.checked = !!v; else i.value = String(v); });
      q('[data-a="remove"]').closest('.sg-row').hidden = !['on', 'off', 'not-finished'].includes(s);
    }
    q('.wbx-grid').addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (!b) return; const c = b.closest('.wbx-card'), key = c.dataset.key, w = st.workspaces.find(x => x.key === key);
      if (b.dataset.d === 'expand') expand(c.querySelector('.wbx-cscr'), key, w?.name || 'Workbox');
      else if (b.dataset.d === 'open') { b.disabled = true; b.textContent = 'Opening…'; api('/desktop', { key, action: 'open' }).then(j => { st = j; draw(); }).catch(x => { msg(x.message, true); b.disabled = false; b.textContent = 'Open screen'; }); }
      else if (b.dataset.d === 'forget') confirmBox(`Remove ${w?.name || 'this workspace'}'s space?`, 'Its folder and screen in the box are deleted. It gets a fresh space the next time it uses the Workbox.', 'Remove', true).then(ok => ok && api('/forget', { key }).then(j => { st = j; draw(); }).catch(x => msg(x.message, true)));
    });
    const sub = () => { if (shown) draw(); };
    return { open() { shown = true; subs.add(sub); q('.wbx-grid').dataset.k = ''; load().then(draw); }, close() { shown = false; subs.delete(sub); for (const v of views.values()) v.close(); views.clear(); q('.wbx-grid').dataset.k = ''; } };
  }

  // ---------- a bot's Desktop tab (bots.js) ----------
  // Every state is handled right here, so the Workbox can be installed where it is used: the install offer, set-up progress,
  // Windows' Linux support missing, off, and the live screen. Everything runs on the host through its API, so a client sees and does the same.
  const post = (path, body) => api(path, body);
  const subText = su => { if (!su?.sub) return ''; const e = su.elapsed || 0, t = e >= 60 ? Math.floor(e / 60) + ' min ' + (e % 60) + ' s' : e + ' s'; return su.sub + (e >= 5 ? ' · ' + t : ''); };
  const detailsHtml = d => d ? '<details class="wbx-det"><summary>Show details</summary><pre>' + H(d) + '</pre></details>' : '';
  const addWorkbox = () => fetch('/api/addons', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Foreman': '1' }, body: JSON.stringify({ workbox: true }) })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Not started.'); return load(); });
  const stepsHtml = su => '<ol class="wbx-steps wbx-steps-s">' + su.steps.map(x => '<li class="' + x.state + '"><i>' + (x.state === 'done' ? '✓' : x.state === 'failed' ? '!' : '') + '</i><span>' + H(x.text)
    + (x.state === 'doing' && (x.id === 'download' || x.id === 'tools') ? ' <em>' + (su.pct || 0) + '%</em><span class="wbx-bar"><i style="width:' + (su.pct || 0) + '%"></i></span>' + (x.id === 'tools' && su.sub ? '<small class="wbx-sub">' + H(subText(su)) + '</small>' : '') : '') + '</span></li>').join('') + '</ol>';
  function botPanel(el, b) {
    const key = 'bot:' + b.id, w = st?.workspaces?.find(x => x.key === key), s = st?.state || '', on = s === 'on', failed = st?.setup && !st.setup.busy && st.setup.error;
    const chip = on ? 'In the Workbox' : s === 'setting-up' ? 'Installing…' : ['not-set-up', 'not-finished', 'no-wsl', 'old-wsl', 'no-virt'].includes(s) ? 'Not installed' : s === 'off' ? 'Workbox is off' : s ? 'Workbox is starting' : 'Checking…';
    el.innerHTML = '<div class="wbx-bot"><div class="wbx-bwin"><div class="wbx-bbar"><b>' + H(b.name) + '\'s screen</b><span class="wbx-chip">' + chip + '</span><span class="wbx-fsp"></span><button type="button" class="wbx-nb" data-x="expand" title="Expand: full screen, sharp" aria-label="Expand" hidden>' + EXP + '</button></div><div class="wbx-bscr"></div></div>'
      + '<p class="bs-p">' + H(b.name) + '\'s own Linux screen inside the Workbox. It builds and tests apps here; nothing opens on this computer. You can watch it, and use it yourself in the expanded view.</p></div>';
    const scr = el.querySelector('.wbx-bscr'), ex = el.querySelector('[data-x="expand"]');
    // card: title, text, buttons [[label, fn, primary]]; an error under it
    const card = (title, text, btns = [], extra = '') => {
      scr.innerHTML = '<div class="wbx-none wbx-offer"><div class="wbx-art wbx-mini">' + BOX + '</div><b>' + H(title) + '</b><span>' + H(text) + '</span>' + extra + '<div class="wbx-acts">' + btns.map(([l, , pri], i) => '<button type="button" class="wbx-btn' + (pri ? ' wbx-pri' : '') + '" data-i="' + i + '">' + H(l) + '</button>').join('') + '</div><em class="wbx-err" hidden></em></div>';
      scr.querySelectorAll('[data-i]').forEach(btn => btn.onclick = async () => { const f = btns[+btn.dataset.i][1]; const was = btn.textContent; btn.disabled = true; btn.textContent = 'One moment…';
        try { await f(); } catch (e2) { const er = scr.querySelector('.wbx-err'); if (er) { er.hidden = false; er.textContent = e2.message; } } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = was; } } });
    };
    const install = async () => { if (!await confirmAsk('Install the Workbox?', 'It downloads about 1 GB (Ubuntu Linux, 3 to 4 GB on disk) onto the host computer and installs its tools inside the box. That takes 10 to 20 minutes; you can keep working, and every screen shows the progress. Nothing is installed on Windows itself and no admin rights are needed.', 'Install')) return; await addWorkbox(); botPanel(el, b); };
    const hero = el.querySelector('.wbx-bscr');
    hero.dataset.s = s;
    if (!st) card('Checking the Workbox…', '');
    else if (s === 'setting-up') { const su = st.setup; card('Installing the Workbox', 'On the host computer. You can keep working; ' + b.name + ' gets its screen when it is done.', [], su ? stepsHtml(su) : ''); scr.querySelector('.wbx-art').classList.add('busy'); }
    else if (failed && ['not-set-up', 'not-finished'].includes(s)) card('The install stopped', st.setup.error, [['Try again', async () => { await addWorkbox(); botPanel(el, b); }, true]], detailsHtml(st.setup.details));
    else if (s === 'not-set-up' || s === 'not-finished') card('Give ' + b.name + ' its own Linux screen', 'Install the Workbox: a private Linux box on the host computer where ' + b.name + ' and your agents build, run and test apps, so nothing opens or installs on your computer. About 1 GB download (3 to 4 GB on disk), 10 to 20 minutes. Needs Windows\' Linux support (WSL2) and virtualization.', [[s === 'not-finished' ? 'Finish installing' : 'Install Workbox', install, true]]);
    else if (s === 'no-wsl' || s === 'old-wsl') card(TEXT[s][0], TEXT[s][1] + ' The permission prompt appears on the host computer.', [[s === 'old-wsl' ? 'Update Linux support…' : 'Turn on Linux support…', async () => {
      if (!await confirmAsk(s === 'old-wsl' ? 'Update Linux support?' : 'Turn on Linux support?', 'Windows on the host computer asks for administrator permission' + (s === 'old-wsl' ? '.' : ', then the host needs a restart. UnderGlow will NOT restart it; do it when it suits you, then install the Workbox here.'), s === 'old-wsl' ? 'Update' : 'Turn on')) return;
      const r = await post('/enable-wsl', { confirm: true, kind: s === 'old-wsl' ? 'update' : 'install' }); if (!r.ok) throw new Error(r.error || 'Windows did not finish it.'); await load(); botPanel(el, b); }, true]]);
    else if (s === 'no-virt') card(TEXT['no-virt'][0], TEXT['no-virt'][1]);
    else if (s === 'unsupported') card(TEXT.unsupported[0], TEXT.unsupported[1]);
    else if (s === 'off') card('The Workbox is off', 'Turn it on to give ' + b.name + ' its screen. It switches itself off again when nothing is happening.', [['Turn on', async () => { st = await post('/start', {}); botPanel(el, b); }, true]]);
    else if (!on) { card(s === 'stopping' ? 'The Workbox is stopping…' : 'The Workbox is starting…', ''); scr.querySelector('.wbx-art').classList.add('busy'); }
    else if (!w?.desktop) card(w ? b.name + '\'s screen is closed' : b.name + ' has not used the Workbox yet', 'Nothing open yet; your agent opens things here. Its screen opens when it needs one, or open it now.', [['Open screen', async () => { st = await post('/desktop', { key, name: b.name, action: 'open' }); botPanel(el, b); }, true]]);
    else { ex.hidden = false; view(scr, key, { quality: 'mid', interactive: true }); ex.onclick = () => expand(scr, key, b.name); }
  }
  // A short offer at the top of an open bot's side area while the Workbox is not installed (dismissable; Install opens the Desktop tab).
  function offer(host, b, openDesktop) {
    host.querySelector(':scope > .wbx-ofr')?.remove();
    const s = st?.state; let off = false; try { off = localStorage.getItem('wbxOfferOff') === '1'; } catch {}
    if (off || !['not-set-up', 'not-finished', 'setting-up'].includes(s)) return;
    const d = document.createElement('div'); d.className = 'wbx-ofr';
    d.innerHTML = s === 'setting-up' ? '<span class="wbx-spin"></span><span>Installing the Workbox… ' + (st.setup?.pct || 0) + '%</span><button type="button" class="wbx-btn" data-o="see">See progress</button>'
      : '<span>Give ' + H(b.name) + ' its own Linux screen to build and test apps on.</span><button type="button" class="wbx-btn wbx-pri" data-o="see">Install Workbox</button><button type="button" class="wbx-nb" data-o="x" title="Not now" aria-label="Not now"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>';
    d.onclick = e => { const o = e.target.closest('[data-o]')?.dataset.o; if (o === 'x') { try { localStorage.setItem('wbxOfferOff', '1'); } catch {} d.remove(); } else if (o === 'see') openDesktop(); };
    host.prepend(d);
  }
  // bots.js: the Desktop tab shows whenever the host can have a Workbox (installed or not: it is also where you install it)
  const available = () => !!st && st.state !== 'unsupported';

  const deskKey = b => (st?.state || '') + (st?.workspaces?.find(x => x.key === 'bot:' + b.id)?.desktop ? '+d' : '') + (st?.state === 'setting-up' ? (st.setup?.step || '') + (st.setup?.pct || 0) : '') + (st?.setup?.error ? 'e' : '');
  window.FmWorkbox = { deskKey, offer, available, mountAddons, mount, view, expand, botPanel, state: () => st, on: () => !!st?.settings?.enabled && ['on', 'off', 'starting', 'stopping'].includes(st.state), refresh: load, onChange: f => watchers.add(f) };
})();
