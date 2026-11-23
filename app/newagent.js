// Agents page "+" → a one-off worker: an AI agent (Claude, Codex or Cursor; sign in under Settings → AI providers)
// or a plain Windows terminal (PowerShell / Command Prompt, terminals.mjs + termpane.js), or a Bot for this page (2026-11-16: one combined +;
// a new bot made for the page, or an existing bot let in; bots.js FmBots).
// Right-click a standing card → the same box in edit mode (name, instructions, Remove). Opens anchored to the + button / the card.
(() => {
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'newagent.css?v=2'; document.head.appendChild(css);
  const TERM_SVG = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 9l3 3-3 3M12.5 15H17"/></svg>';
  const AI = [
    { id: 'claude', name: 'Claude', by: 'Anthropic', logo: 'logos/providers/anthropic.svg', ready: true },
    { id: 'codex', name: 'Codex', by: 'OpenAI', logo: 'logos/providers/openai.svg', ready: true, cli: true },
    { id: 'cursor', name: 'Cursor', by: 'Cursor', logo: 'logos/providers/cursor.svg', ready: true, cli: true },
  ];
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const box = document.createElement('div'); box.id = 'naPick'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Add to this page');
  document.body.append(box);
  let ctx = null, anchor = null, view = 'main';
  const tiles = (sel) => AI.map(p => `<button class="na-tile${p.ready ? '' : ' soon'}${sel === p.id ? ' sel' : ''}" data-ai="${p.id}" ${p.ready ? '' : 'aria-disabled="true"'} title="${p.ready ? `${p.name}` : `${p.name}: coming soon`}">
        <img src="${p.logo}" alt="" width="26" height="26" onerror="this.style.visibility='hidden'"><b>${p.name}</b><span>${p.ready ? p.by : 'Soon'}</span></button>`).join('');
  const soon = p => { const m = box.querySelector('#naMsg'); m.innerHTML = `${p.name} agents are coming soon. <a href="#" id="naSet">Settings → AI accounts</a>`; m.querySelector('#naSet').onclick = e => { e.preventDefault(); close(); window.setOpen?.(true, 'ai'); }; };

  // Terminal types come from the host computer (GET /api/shells): PowerShell / Command Prompt on Windows, Terminal / sh on Linux. Until it answers: the Windows pair.
  let HOSTSH = null; fetch('/api/shells').then(r => r.ok ? r.json() : null).then(j => { if (j && Array.isArray(j.shells)) HOSTSH = j; }).catch(() => {});
  const shellTiles = () => HOSTSH && HOSTSH.platform !== 'win32'
    ? HOSTSH.shells.map(s => `<button class="na-tile" data-sh="${esc(s.id)}" title="New ${esc(s.name)} in this page's folder">${TERM_SVG}<b>${esc(s.name)}</b><span>${HOSTSH.platform === 'darwin' ? 'Mac' : 'Linux'}</span></button>`).join('')
    : `<button class="na-tile" data-sh="powershell" title="New PowerShell in this page's folder">${TERM_SVG}<b>PowerShell</b><span>Windows</span></button>
        <button class="na-tile" data-sh="cmd" title="New Command Prompt in this page's folder">${TERM_SVG}<b>Command Prompt</b><span>Windows</span></button>`;

  function draw() {
    const head = `<div class="na-h">Add to ${ctx.what ? esc(ctx.what) : 'this page'}</div>`;
    box.innerHTML = head + `<div class="na-k">AI agent</div>
      <div class="na-grid">${tiles(null)}</div>
      <div class="na-k">Bot</div>
      <div class="na-grid one"><button class="na-tile" data-pickbot="1" title="Add a bot to this page: it works in this page's folder"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V5M10 4h4M9 13v1.5M15 13v1.5"/></svg><b>Bots</b><span>Choose or create</span></button></div>
      <div class="na-k">Terminal</div>
      <div class="na-grid two">
        ${shellTiles()}
      </div>
      <div class="na-msg" id="naMsg"></div>`;
    box.querySelector('[data-pickbot]').onclick = () => { const side = ctx.side; close(); window.FmBots?.newBot({ page: side }); };
    box.querySelectorAll('[data-ai]').forEach(b => b.onclick = () => {
      const p = AI.find(x => x.id === b.dataset.ai); if (!p.ready) return soon(p);
      ctx.send({ t: 'spawn', side: ctx.side, model: p.cli ? '' : 'opus', ...(p.cli ? { provider: p.id } : {}) }); close(); // Codex / Cursor: the CLI's own sign-in (Settings → AI accounts); the agent says so if it is not signed in
    });
    box.querySelectorAll('[data-sh]').forEach(b => b.onclick = () => { ctx.send({ t: 'spawn', side: ctx.side, kind: 'terminal', shell: b.dataset.sh }); close(); });
  }

  function drawEdit() { // right-click a standing card
    const a = ctx.agent, st = !!a.standing;
    box.innerHTML = `<div class="na-h">${esc(a.name)} <span class="na-tag">${st ? 'Standing agent' : 'Page chat'}</span></div>`
      + (st ? `<label class="na-f">Name<input id="naName" maxlength="40" spellcheck="false" value="${esc(a.name)}"></label>
        <label class="na-f">What it does<textarea id="naText" rows="6">${esc(a.instructions || '')}</textarea></label>
        <p class="na-note">Saved changes apply from its next reply; its chat and notes are kept.</p>`
        : `<p class="na-note">The built-in page chat for this page. Removing it ends its chat; its notes are kept, and a bot (e.g. Dispatcher) does this job now.</p>`)
      + `<div class="na-msg" id="naMsg"></div>
      <div class="na-acts"><button class="na-btn ghost danger" id="naRm">Remove</button>${st ? '<button class="na-btn" id="naSave">Save</button>' : ''}</div>`;
    box.querySelector('#naRm').onclick = () => { if (!confirm(`Remove ${a.name}?\n\nIts chat ends. ${st ? 'Agents it started stay on the page.' : 'Agents on the page stay.'}`)) return; ctx.send({ t: 'removestanding', id: a.id }); close(); };
    const sv = box.querySelector('#naSave'); if (sv) sv.onclick = () => {
      const name = box.querySelector('#naName').value.trim(), text = box.querySelector('#naText').value.trim();
      if (!text) return error('Write what it does.');
      ctx.send({ t: 'editstanding', id: a.id, name, instructions: text }); close();
    };
  }
  function error(msg) { if (box.hidden) return false; const m = box.querySelector('#naMsg'); if (!m) return false; m.textContent = msg; m.classList.add('err'); const g = box.querySelector('#naGo'); if (g) g.disabled = false; return true; }
  function place() {
    const r = anchor.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
    let x = r.left, y = r.bottom + 8;
    if (x + w > innerWidth - 8) x = Math.max(8, innerWidth - 8 - w);
    if (y + h > innerHeight - 8) y = Math.max(8, r.top - 8 - h);
    if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - 8 - h);
    box.style.left = Math.round(x) + 'px'; box.style.top = Math.round(y) + 'px';
  }
  function open(a, c) { anchor = a; ctx = c; view = 'main'; draw(); box.hidden = false; place(); box.querySelector('.na-tile:not(.soon)')?.focus(); }
  function close() { box.hidden = true; ctx = null; }
  document.addEventListener('pointerdown', e => { if (!box.hidden && !box.contains(e.target) && e.target !== anchor && !anchor?.contains(e.target)) close(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !box.hidden) close(); });
  addEventListener('resize', () => { if (!box.hidden) place(); });
  window.FmNewAgent = {
    open: (a, c) => (box.hidden || anchor !== a) ? open(a, c) : close(), close, error, added: () => close(),
    edit: (a, c) => { anchor = a; ctx = c; drawEdit(); box.hidden = false; place(); box.querySelector('#naText, #naRm')?.focus(); },
  };
})();
