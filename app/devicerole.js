// Settings > This device: host or client. Talks to the desktop app through the deskRole bridge (preload-hud.cjs / preload-client.cjs).
// Host = runs UnderGlow and the agents on this computer. Client = shows the host's UnderGlow (found automatically, same account).
(() => {
  const st = document.createElement('style');
  st.textContent = `.dr{display:grid;gap:14px;max-width:560px}.dr p{margin:0;color:var(--text-muted)}
  .dr-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .dr-card{position:relative;text-align:left;padding:16px;border-radius:14px;border:0;cursor:pointer;background:var(--block);box-shadow:inset 0 0 0 1px var(--block-stroke);color:var(--text-primary);font:inherit;display:grid;gap:6px;
    transition:transform .22s cubic-bezier(.2,.8,.2,1),box-shadow .22s,background .22s;animation:dr-in .35s cubic-bezier(.2,.8,.2,1) both}
  .dr-card:nth-child(2){animation-delay:.06s}
  .dr-card:hover:not(.on):not(:disabled){transform:translateY(-2px)}
  .dr-card:active:not(:disabled){transform:scale(.98)}
  .dr-card.on{cursor:default;background:color-mix(in srgb,var(--accent,#6c7bff) 14%,var(--block));box-shadow:inset 0 0 0 1.5px var(--accent,#6c7bff)}
  .dr-card b{font-weight:600;font-size:15px}.dr-card span{font-size:12.5px;color:var(--text-muted)}
  .dr-card .dr-tag{position:absolute;top:12px;right:12px;font-size:11px;padding:2px 8px;border-radius:99px;background:var(--accent,#6c7bff);color:#fff;opacity:0;transform:scale(.8);transition:opacity .2s,transform .2s}
  .dr-card.on .dr-tag{opacity:1;transform:none}
  .dr-fw{display:grid;gap:8px;animation:dr-in .35s .12s cubic-bezier(.2,.8,.2,1) both}.dr-btn{justify-self:start;font:500 13px var(--font-sans);padding:9px 14px;border-radius:10px;border:0;cursor:pointer;background:var(--block);box-shadow:inset 0 0 0 1px var(--block-stroke);color:var(--text-primary);transition:transform .15s,background .2s}.dr-btn:hover:not(:disabled){transform:translateY(-1px)}.dr-btn:active:not(:disabled){transform:scale(.97)}.dr-btn:disabled{opacity:.5}
  .dr-msg{min-height:18px;font-size:12.5px;color:var(--text-muted);transition:opacity .2s}.dr-msg.err{color:var(--bad,#ff7a7a)}
    .dr-status{display:grid;gap:6px;font-size:13px;padding:12px 14px;border-radius:12px;background:var(--block);box-shadow:inset 0 0 0 1px var(--block-stroke)}.dr-status .dr-btn{margin-top:4px}
  @keyframes dr-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion:reduce){.dr-card{animation:none;transition:none}}
  @media (max-width:560px){.dr-cards{grid-template-columns:1fr}}`;
  document.head.append(st);
  let el = null, info = null, busy = false, msg = '', bad = false;
  const card = (r, title, text) => `<button class="dr-card${info.role === r ? ' on' : ''}" data-r="${r}" ${busy || info.role === r ? 'disabled' : ''}><i class="dr-tag">This device</i><b>${title}</b><span>${text}</span></button>`;
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Plain-words status: role, whether this computer is on the account's list, and (client) what the host search found / (host) where it listens.
  function status() {
    const L = [], r = info.role;
    L.push('<b>Role:</b> ' + (r === 'host' ? 'Host' : r === 'client' ? 'Client' : 'not chosen yet') + (info.email ? ' · signed in as ' + esc(info.email) : ''));
    L.push('<b>Account list:</b> ' + (info.registry === 'ok' ? 'this computer is listed on your account.' : info.registry === 'failed' ? 'could not be saved (' + esc(info.registryError) + '). Other computers may not accept this one.' : 'not checked yet.'));
    if (r === 'client') {
      const h = info.host || {}, s = info.search;
      L.push('<b>Host:</b> ' + (h.state === 'connected' ? 'connected' + (info.lastHost?.name ? ' to ' + esc(info.lastHost.name) : '') : h.state === 'offline' ? 'found before, not answering now' : h.state === 'searching' ? 'looking…' : 'no host found'));
      if (s && h.state !== 'connected') L.push('<b>Why:</b> ' + [`Local network: ${s.lan ? 'host found' : 'nothing answered'}.`, s.tsState ? 'Tailscale: ' + esc(s.tsState) : s.tsPeers ? `Tailscale: ${s.tsPeers} online computer(s) checked, ${s.tsFound ? 'host found' : 'none runs UnderGlow as host'}.` : 'Tailscale: no other online computers.', s.last ? 'Last host: ' + s.last + '.' : ''].filter(Boolean).join(' '));
      if (h.error && h.state !== 'connected') L.push('<b>Host said:</b> ' + esc(h.error));
    } else if (r === 'host' && info.server) {
      const sv = info.server;
      L.push('<b>Server:</b> ' + (sv.state === 'running' || sv.state === 'ready' ? 'running' : esc(sv.state || 'unknown')) + (sv.phone?.listening ? ', listening for other computers on ' + sv.urls.map(esc).join(', ') : ', <b>not</b> listening for other computers' + (sv.phone?.error ? ' (' + esc(sv.phone.error) + ')' : '')));
      L.push('<b>Tailscale:</b> ' + (sv.tailscale.ip ? 'connected as ' + esc(sv.tailscale.name || sv.tailscale.ip) + ' (' + esc(sv.tailscale.ip) + ')' : esc(sv.tailscale.error || 'not connected')));
    }
    return L.map(x => '<div>' + x + '</div>').join('') + '<button class="dr-btn" data-rc="1"' + (busy ? ' disabled' : '') + '>' + (r === 'client' ? 'Look for the host again' : 'Update this computer on my account') + '</button>';
  }
  function draw() {
    if (!el) return;
    if (!window.deskRole) { el.innerHTML = '<div class="dr"><p>The role of a computer is set in the UnderGlow desktop app.</p></div>'; return; }
    if (!info) { el.innerHTML = '<div class="dr"><p>Loading…</p></div>'; return; }
    el.innerHTML = `<div class="dr"><p>Use this computer as the host (it runs UnderGlow and the agents) or as a client (it shows your host's UnderGlow). Clients find the host by themselves when you are signed in to the same account.</p>
      <div class="dr-cards">${card('host', 'Host', 'Runs UnderGlow and the agents here.')}${card('client', 'Client', 'Shows the UnderGlow running on your host.')}</div>
      <div class="dr-status">${status()}</div>
      ${info.role === 'host' && window.deskRole.firewall ? '<div class="dr-fw"><p>Other computers can only find this host if Windows lets them in. If your client cannot find this computer, click the button (Windows asks once for permission).</p><button class="dr-btn" data-fw="1"' + (busy ? ' disabled' : '') + '>Allow other computers in Windows Firewall</button></div>' : ''}
      <div class="dr-msg${bad ? ' err' : ''}">${msg}</div></div>`;
  }
  async function load() { try { info = await window.deskRole.get(); } catch { info = null; } draw(); }
  async function pick(r) {
    if (busy || !info || info.role === r) return;
    if (!confirm(r === 'client' ? 'Switch this computer to a client? The app restarts and connects to your host. The server on this computer stops (its data stays).' : 'Switch this computer to the host? The app restarts and runs UnderGlow and the agents here.')) return;
    busy = true; bad = false; msg = 'Switching… the app restarts.'; draw();
    try { await window.deskRole.set(r); } catch (e) { busy = false; bad = true; msg = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); draw(); }
  }
  async function recheck() { busy = true; bad = false; msg = 'Checking…'; draw(); try { await window.deskRole.recheck(); msg = 'Checked.'; } catch (e) { bad = true; msg = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); } busy = false; await load(); }
  async function firewall() { busy = true; bad = false; msg = 'Waiting for Windows…'; draw(); try { await window.deskRole.firewall(); msg = 'Done. Other computers can now find this one.'; } catch (e) { bad = true; msg = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); } busy = false; draw(); }
  function mount(host) { el = host; el.addEventListener('click', ev => { const f = ev.target.closest('[data-fw]'); if (f) return firewall(); if (ev.target.closest('[data-rc]')) return recheck(); const b = ev.target.closest('.dr-card[data-r]'); if (b) pick(b.dataset.r); }); draw(); }
  window.FmDeviceRole = { mount, open: load, close() {} };
})();
