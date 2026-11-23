// YouTube card for Settings → Connectors (server: youtube.mjs). connectors.js calls FmYouTube.card(state, esc) and FmYouTube.wire(el, act, redraw).
// Credentials are typed into password fields here, POSTed to /api/connectors/youtube and sealed on the server; they are never shown again.
window.FmYouTube = {
  card(s, e) {
    const q = s.quota || {}, pct = Math.min(100, Math.round((q.used || 0) / (q.limit || 10000) * 100));
    const hd = `<div class="cn-hd"><b>YouTube</b><span class="cn-dim">Channel stats, videos, comments, analytics</span><span class="cn-tag"><span class="cn-dot ${s.connected && !s.error ? 'ok' : ''}"></span>${s.connected ? (s.error ? 'Needs attention' : 'Connected') : 'Not connected'}</span></div>`;
    const pend = (s.pending || []).map(p => `<div class="cn-acc"><div class="cn-who"><b>Waiting for you: ${e(p.summary)}</b><span>Staged by an agent. Nothing is sent to YouTube until you approve.</span></div><div class="cn-accts"><button class="cn-btn pri" data-yta="${e(p.id)}">Approve</button><button class="cn-ghost" data-ytr="${e(p.id)}">Reject</button></div></div>`).join('');
    const rec = (s.recent || []).map(p => `<div class="cn-acc"><div class="cn-who"><b>${e(p.summary)}</b><span>${e(p.status)}${p.error ? ': ' + e(p.error) : ''}</span></div></div>`).join('');
    const form = `<div class="cn-dev"><div class="cn-step"><span class="cn-n">1</span>API key (public data) ${s.apiKey ? '✓ saved' : ''}</div>
      <input class="cn-in" id="ytKey" type="password" autocomplete="off" spellcheck="false" placeholder="AIza…" aria-label="YouTube API key">
      <div class="cn-step"><span class="cn-n">2</span>OAuth client (your own channel + analytics) ${s.hasClient ? '✓ saved' : ''}</div>
      <input class="cn-in" id="ytCid" type="password" autocomplete="off" spellcheck="false" placeholder="Client ID …apps.googleusercontent.com" aria-label="OAuth client ID">
      <input class="cn-in" id="ytSec" type="password" autocomplete="off" spellcheck="false" placeholder="Client secret GOCSPX-…" aria-label="OAuth client secret">
      <div class="cn-acts"><button class="cn-btn pri" id="ytSave">Save</button></div>
      <div class="cn-step"><span class="cn-n">3</span>Sign in with Google (redirect URI: <code>${e(s.redirect || '')}</code>)</div>
      <div class="cn-acts"><button class="cn-btn" id="ytIn" ${s.hasClient ? '' : 'disabled'}>Sign in (read only)</button><button class="cn-btn" id="ytInW" ${s.hasClient ? '' : 'disabled'}>Sign in (allow changes, each needs your approval)</button></div></div>`;
    return `<div class="cn-card${s.connected && !s.error ? ' on' : ''}">${hd}<div class="cn-body">
      <p class="cn-dim">Agents can read channel stats, uploads, playlists, comments, live status and analytics. Changes (edit a title or description, reply to a comment, upload) are only staged: nothing happens until you press Approve here. Keys stay encrypted on this computer. Setup steps: docs/youtube-connector.md.</p>
      ${s.error ? `<div class="cn-note bad">${e(s.error)}</div>` : ''}
      ${s.connected ? `<div class="cn-list"><div class="cn-acc on"><div class="cn-who"><b>${e(s.account || 'YouTube')}</b><span>${s.oauth ? 'Owner sign-in active' + (s.write ? ' (changes allowed after approval)' : ' (read only)') : 'API key only (public data)'} · quota today ${q.used || 0} / ${q.limit || 10000} (${pct}%)</span></div><div class="cn-accts"><button class="cn-btn" id="svRef">Refresh</button><button class="cn-ghost" id="svDis">Disconnect</button></div></div>
      ${(s.items || []).map(i => `<div class="cn-acc"><div class="cn-who"><b>${e(i.name)}</b><span>${e(i.sub)}</span></div></div>`).join('')}${pend}${rec}</div>` : ''}
      ${form}</div></div>`;
  },
  wire(el, act) {
    const $ = id => el.querySelector('#' + id), v = id => $(id)?.value || '';
    const on = (id, f) => { const b = $(id); if (b) b.onclick = f; };
    on('ytSave', () => act('connect', { apiKey: v('ytKey'), clientId: v('ytCid'), clientSecret: v('ytSec') }, 'Saved.', 'youtube'));
    const go = write => async () => { try { const r = await fetch('/api/connectors/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Foreman': '1' }, body: JSON.stringify({ action: 'authurl', write }) }); const j = await r.json(); if (j.url) window.open(j.url, '_blank', 'noopener'); } catch {} };
    on('ytIn', go(false)); on('ytInW', go(true));
    el.querySelectorAll('[data-yta]').forEach(b => b.onclick = () => act('approve', { id: b.dataset.yta }, 'Approved and sent to YouTube.', 'youtube'));
    el.querySelectorAll('[data-ytr]').forEach(b => b.onclick = () => act('reject', { id: b.dataset.ytr }, 'Rejected.', 'youtube'));
  },
};
