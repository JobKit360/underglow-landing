// Terminal panes (agent kind 'terminal'): xterm.js inside the pane's .pterm, wired to the host's shell over /term/ws?id=<id> (terminals.mjs).
// index.html's renderPane calls FmTerm.mount(termEl, id) once per pane. Keys go straight to the shell; the pane has no message box.
(() => {
  let lib = null;
  const load = () => lib ||= new Promise((ok, fail) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'vendor/xterm/xterm.css'; document.head.appendChild(l);
    const add = src => new Promise((r, f) => { const s = document.createElement('script'); s.src = src; s.onload = r; s.onerror = () => f(new Error('could not load ' + src)); document.head.appendChild(s); });
    add('vendor/xterm/xterm.js').then(() => add('vendor/xterm/addon-fit.js')).then(() => ok({ Terminal: window.Terminal, Fit: window.FitAddon.FitAddon }), fail);
  });

  async function mount(el, id) {
    if (el._term) return;
    el._term = true; el.classList.add('xtermhost'); el.textContent = '';
    const { Terminal, Fit } = await load();
    const t = new Terminal({ fontFamily: '"Cascadia Mono", Consolas, "Courier New", monospace', fontSize: 13, cursorBlink: true, allowTransparency: true, scrollback: 5000,
      theme: { background: 'rgba(0,0,0,0)', foreground: '#d6d8de', cursor: '#d6d8de', selectionBackground: 'rgba(110,168,255,.35)' } });
    const fit = new Fit(); t.loadAddon(fit); t.open(el);
    let sock = null, alive = true, retry = 0;
    const size = () => { if (!el.offsetWidth || !el.offsetHeight) return; try { fit.fit(); } catch {} if (sock?.readyState === 1) sock.send(JSON.stringify({ t: 'size', cols: t.cols, rows: t.rows })); };
    const connect = () => {
      if (!alive) return;
      sock = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/term/ws?id=' + encodeURIComponent(id));
      sock.onopen = () => { retry = 0; t.reset(); size(); };
      sock.onmessage = e => t.write(typeof e.data === 'string' ? e.data : '');
      sock.onclose = ev => { if (!alive || !document.getElementById('p-' + id)) { alive = false; return; } if (ev.code === 4004) return; setTimeout(connect, Math.min(10000, 1000 * ++retry)); }; // server restart: reconnect (a fresh shell starts)
    };
    t.onData(d => { if (sock?.readyState === 1) sock.send(JSON.stringify({ t: 'in', d })); });
    new ResizeObserver(() => requestAnimationFrame(size)).observe(el);
    // Ctrl+C copies when text is selected (otherwise it interrupts, like Windows Terminal); Ctrl+V pastes.
    t.attachCustomKeyEventHandler(e => {
      if (e.type !== 'keydown' || !e.ctrlKey) return true;
      if (e.key === 'c' && t.hasSelection()) { navigator.clipboard?.writeText(t.getSelection()); t.clearSelection(); return false; }
      if (e.key === 'v') return false; // the browser's paste event delivers it
      return true;
    });
    el.addEventListener('mousedown', () => t.focus());
    connect();
  }
  window.FmTerm = { mount };
  document.querySelectorAll('.apane.tpane').forEach(p => mount(p.querySelector('.pterm'), p.id.slice(2))); // panes drawn before this file loaded
})();
