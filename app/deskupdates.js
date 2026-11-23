// Desktop app updates inside the app (customers have no native menu bar): Settings (gear) -> Updates block + a small "Update ready" notice.
// Talks to the Electron shell through window.deskUpd (desktop/preload-hud.cjs / preload-client.cjs). In a plain browser (or a dev copy) there is no bridge: nothing is drawn.
// Pure text helpers live here too (test/inapp-updates.test.mjs loads this file in a sandbox).
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function statusText(u, installed) {
    const at = x => x.checkedAt ? ' · checked ' + new Date(x.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '';
    u = u || {}; const ch = u.channel === 'beta' ? 'Beta' : 'Stable';
    if (u.applying) return 'Installing ' + (u.version || 'the update') + '. The app restarts by itself in a moment…';
    if (u.state === 'ready' && u.applyError) return "Couldn't restart to update: " + u.applyError + '. Your version still works. Try again.';
    switch (u.state) {
      case 'checking': return 'Checking for updates…';
      case 'current': return "You're up to date (version " + installed + ', ' + ch + ' channel)' + at(u);
      case 'downloading': return 'Update ' + (u.version || '') + ' found. Downloading' + (u.progress != null ? ' · ' + u.progress + '%' : '') + '…';
      case 'ready': return 'Version ' + u.version + ' is ready. Restart to update';
      case 'error': return "Couldn't check: " + (u.error || 'unknown error') + at(u) + '. Try again.';
      default: return 'Not checked yet';
    }
  }
  // "Updated to X" after the first launch following an update. n = { from, to, notes } from the shell, or null.
  const updatedText = n => n && n.to ? 'Updated to ' + n.to + (n.from ? ' (from ' + n.from + ')' : '') : '';
  const noticeWanted = s => !!(s && s.packaged && s.updates && s.updates.state === 'ready' && s.updates.version);
  const api = { statusText, noticeWanted, updatedText, esc };
  if (typeof window === 'undefined' || !window.deskUpd) { if (typeof module !== 'undefined') module.exports = api; return; }
  window.FmDeskUpd = api;
  const D = window.deskUpd; let st = null, msg = '', hold = 0, dismissed = '', box = null, note = null, upNote = null;
  const root = () => document.getElementById('setMenu');
  function draw() {
    const m = root(); if (!m || !st || !st.packaged) return;
    for (const el of m.querySelectorAll(':scope > .set-row, :scope > #setChk, :scope > .set-msg')) el.style.display = 'none'; // the server-side "Dev copy / Check for updates" pair would repeat (and mislead) here
    if (!box || !box.isConnected) { box = document.createElement('div'); box.id = 'deskUpd'; box.className = 'set-upd'; box.style.cssText = 'margin-top:0;padding-top:0;border-top:0'; m.insertBefore(box, m.children[1] || null); }
    const u = st.updates || {}, cls = { current: '#3fb950', ready: '#3fb950', error: '#f85149' }[u.state] || '#888';
    const txt = u.available === false ? 'Updates are not available in this build' : statusText(u, st.version);
    box.innerHTML = `<div class="set-row"><span class="set-k">Version</span><span class="set-v"><b>${esc(st.version)}</b> <span id="duTxt"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cls};margin-right:6px"></i>${esc(msg || txt)}</span></span></div>`
      + (u.channelText ? `<div class="set-wait" id="duChan">${esc(u.channelText)}</div>` : '')
      + (u.signInNotice ? `<div class="set-wait warn" id="duSignIn">${esc(u.signInNotice)}</div>` : '')
      + `<button class="set-chk" id="duCheck"${u.available === false || u.state === 'checking' || u.state === 'downloading' || u.applying ? ' disabled' : ''}>${u.state === 'error' ? 'Retry' : 'Check now'}</button>`
      + (u.state === 'ready' ? `<button class="set-go" id="duGo"${u.applying ? ' disabled' : ''}>${u.applying ? 'Restarting…' : u.applyError ? 'Retry restart' : 'Restart to update'}</button>` : '')
      + `<details id="duDiagBox" style="margin-top:10px"><summary class="set-wait" style="cursor:pointer">Diagnostics</summary><pre id="duDiag" style="white-space:pre-wrap;user-select:text;font-size:11px;margin:6px 0">${esc(u.diagnostics || '')}</pre><button class="set-chk" id="duCopy">Copy diagnostics</button></details>`
      + `<div style="margin-top:12px;display:flex;gap:8px"><button class="set-chk" id="duQuit">Quit</button></div>`;
    const $ = id => box.querySelector(id);
    $('#duCheck').onclick = async () => {
      msg = 'Checking for updates…'; hold = Date.now() + 700; draw();
      try { st = (await D.check()) || st; } catch (e) { msg = "Couldn't check: " + (e && e.message || e); draw(); return; }
      setTimeout(() => { msg = ''; hold = 0; draw(); }, Math.max(0, hold - Date.now()) + 20); // 'Checking' stays visible at least 0.7 s, then the real result (it also arrives as a push)
    };
    const go = $('#duGo'); if (go) go.onclick = () => D.apply();
    $('#duCopy').onclick = async () => { const b = $('#duCopy'); try { await D.copy($('#duDiag').textContent); b.textContent = 'Copied'; } catch { b.textContent = 'Select the text and copy it'; } setTimeout(() => { if (b.isConnected) b.textContent = 'Copy diagnostics'; }, 2000); };
    $('#duQuit').onclick = () => D.quit();
  }
  function notice() {
    const want = noticeWanted(st) && dismissed !== st.updates.version;
    if (!want) { if (note) { note.remove(); note = null; } return; }
    if (note && note.isConnected) { note.querySelector('span').textContent = 'Update ' + st.updates.version + ' ready'; return; }
    note = document.createElement('div'); note.id = 'updReadyNote'; note.setAttribute('role', 'status');
    note.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:80;display:flex;align-items:center;gap:10px;padding:8px 10px 8px 14px;border-radius:10px;background:var(--surface-2,#1b1b20);color:var(--text-primary,#eee);box-shadow:inset 0 0 0 1px var(--panel-stroke,#333),0 8px 28px rgba(0,0,0,.35);font:500 12.5px var(--font-sans,system-ui)';
    note.innerHTML = '<span></span><button id="unRestart" style="font:600 12px var(--font-sans,system-ui);padding:4px 10px;border:0;border-radius:7px;background:var(--accent,#6c5ce7);color:#fff;cursor:pointer">Restart</button><button id="unLater" title="Later" aria-label="Dismiss" style="border:0;background:transparent;color:inherit;opacity:.6;cursor:pointer;font-size:15px">×</button>';
    note.querySelector('span').textContent = 'Update ' + st.updates.version + ' ready';
    note.querySelector('#unRestart').onclick = () => D.apply();
    note.querySelector('#unLater').onclick = () => { dismissed = st.updates.version; notice(); };
    document.body.append(note);
  }
  // Small dismissable "Updated to X" confirmation (bottom-right, like the Update-ready notice); dismissing it tells the shell so it does not come back.
  function updatedNote() {
    const n = st && st.updated, txt = updatedText(n);
    if (!txt) { if (upNote) { upNote.remove(); upNote = null; } return; }
    if (upNote && upNote.isConnected) return;
    upNote = document.createElement('div'); upNote.id = 'updatedNote'; upNote.setAttribute('role', 'status');
    upNote.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:81;max-width:340px;display:flex;align-items:flex-start;gap:10px;padding:10px 10px 10px 14px;border-radius:10px;background:var(--surface-2,#1b1b20);color:var(--text-primary,#eee);box-shadow:inset 0 0 0 1px var(--panel-stroke,#333),0 8px 28px rgba(0,0,0,.35);font:500 12.5px var(--font-sans,system-ui)';
    const notes = (n.notes || []).slice(0, 3).map(x => '<li>' + esc(x) + '</li>').join('');
    upNote.innerHTML = '<div style="flex:1"><div style="font-weight:600">' + esc(txt) + '</div>' + (notes ? '<ul style="margin:6px 0 0;padding-left:16px;opacity:.75;font-weight:400">' + notes + '</ul>' : '') + '</div><button id="upDone" title="Dismiss" aria-label="Dismiss" style="border:0;background:transparent;color:inherit;opacity:.6;cursor:pointer;font-size:15px">×</button>';
    upNote.querySelector('#upDone').onclick = () => { upNote.remove(); upNote = null; st.updated = null; try { D.dismissUpdated && D.dismissUpdated(); } catch {} };
    document.body.append(upNote);
  }
  function apply(s) { if (!s) return; st = s; updatedNote(); if (!(hold && Date.now() < hold && s.updates && s.updates.state !== 'checking')) msg = ''; draw(); notice(); }
  D.onState(apply);
  D.state().then(apply).catch(() => {});
  // the Settings panel rewrites #setMenu on every redraw: put the block back right after
  new MutationObserver(() => { const m = root(); if (m && st && !m.querySelector('#deskUpd')) draw(); }).observe(document.body, { childList: true, subtree: true });
})();
