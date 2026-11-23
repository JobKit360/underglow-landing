/* UnderGlow landing-page demo: the REAL app UI (same HTML, CSS and scripts as the installed app) running on made-up data.
   This file stands in for the server: it fakes the app's fetch() calls and its sockets, and plays a short script of sample events
   (agents typing, files lighting up on the code map, cards moving on the roadmap). Nothing here talks to a real account, computer or project.
   Scenes (?scene=): page (hero) | bot | workflow | map | workbox | roadmap | phone. Add &still=1 for a motionless frame. */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search), SCENE = Q.get('scene') || 'page', STILL = Q.get('still') === '1';
  var NOW = Date.now(), MIN = 60000;
  try { navigator.serviceWorker.register = function () { return Promise.reject(new Error('off')); }; } catch (e) {}
  // the demo keeps its own settings in memory, so it never reads or changes anything the website itself stores
  (function () {
    var mem = {}, st = { getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; }, clear: function () { mem = {}; }, key: function (i) { return Object.keys(mem)[i] || null; }, get length() { return Object.keys(mem).length; } };
    try { Object.defineProperty(window, 'localStorage', { value: st, configurable: true }); Object.defineProperty(window, 'sessionStorage', { value: st, configurable: true }); } catch (e) {}
    st.setItem('tab', 'pg:pstore'); st.setItem('wbxOfferOff', '1'); st.setItem('agAutoDock', '0');
    var onDesk = { page: 'bchief', bot: 'bdisp', workbox: 'btest' }[SCENE]; if (onDesk) st.setItem('botDesk', JSON.stringify({ pstore: [onDesk] }));
  })();
  window.FOREMAN_BLANK = true; // the customer edition: no built-in extra tabs
  document.documentElement.classList.add('blank');

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var alive = true;
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  /* ---------- sample data ---------- */
  var FOLDER = 'C:\\Projects\\';
  var pages = [
    { id: 'pstore', name: 'Storefront', folder: FOLDER + 'storefront', logo: '/logo.svg' },
    { id: 'pmobile', name: 'Mobile App', folder: FOLDER + 'mobile-app' },
    { id: 'pdocs', name: 'Docs', folder: FOLDER + 'docs' }
  ];
  function agent(id, name, side, o) {
    return Object.assign({ id: id, name: name, role: 'worker', cwd: FOLDER + 'storefront', color: '', mode: 'auto', status: 'idle', lastRun: { ts: NOW - 20 * MIN }, queued: 0, branch: null, look: false,
      testNotes: null, testUrl: null, testLocal: null, side: side, deploy: null, provider: 'anthropic', enforcement: null, account: 'auto', acct: null, restorable: false, stalled: false,
      stuck: false, blocked: false, asking: null, replied: false, workSince: null, log: [] }, o || {});
  }
  var T0 = NOW - 8 * MIN;
  var LOGS = {
    a1: [ // Nova: a finished job, ready to test
      { role: 'user', text: 'Fix the checkout total so coupons apply before shipping.', ts: T0 },
      { role: 'tool', text: 'Read · src/checkout/checkout.js', ts: T0 + 4000 },
      { role: 'tool', text: 'Edit · src/cart/totals.js', ts: T0 + 20000 },
      { role: 'tool', text: 'Bash · npm test', ts: T0 + 40000 },
      { role: 'result', text: '✓ 18 passed', ts: T0 + 52000 },
      { role: 'assistant', text: 'Fixed. Coupons now come off the price before shipping is added, and the tests pass.', ts: T0 + 60000 }
    ],
    a2: [ // Pixel
      { role: 'user', text: 'Make the cart remember items when the page reloads.', ts: NOW - 3 * MIN },
      { role: 'tool', text: 'Read · src/cart/cart.js', ts: NOW - 3 * MIN + 3000 },
      { role: 'tool', text: 'Read · src/cart/storage.js', ts: NOW - 3 * MIN + 9000 },
      { role: 'assistant', text: 'The cart only lives in memory right now. I will save it to the browser storage and load it back on start.', ts: NOW - 3 * MIN + 14000 }
    ]
  };
  var agents = [
    agent('a1', 'Nova', 'pstore', { status: 'ready', testNotes: 'Coupons now apply before shipping.', lastRun: { ts: NOW - 4 * MIN }, log: clone(LOGS.a1) }),
    agent('a2', 'Pixel', 'pstore', { status: 'working', workSince: NOW - 3 * MIN, task: 'Cart remembers items', log: clone(LOGS.a2), lastRun: { ts: NOW } }),
    agent('a3', 'Rook', 'pmobile', { lastRun: { ts: NOW - 2 * 60 * MIN } }),
    agent('a4', 'Quill', 'pdocs', { status: 'working', workSince: NOW - 2 * MIN, task: 'Rewrite the install guide', lastRun: { ts: NOW } })
  ];
  function bot(id, name, job, look, o) {
    return Object.assign({ id: id, name: name, job: job, personality: '', instructions: job + '.', look: look, model: 'sonnet', level: 'auto', page: 'pstore', pages: ['pstore'], archived: false,
      placed: true, browser: false, vaults: [], mailboxes: [], askSend: true, chief: false, pinned: false, paused: false, created: NOW - 5e8, order: 0, status: 'idle', unread: 0,
      lastLine: '', lastAt: NOW - 12 * MIN, restorable: false, ctxTokens: 0, queued: 0, routines: [], browserOpen: false, url: '', home: FOLDER + 'bots\\' + id }, o || {});
  }
  var bots = [
    bot('bchief', 'Chief of Staff', 'Runs the team and keeps the day on track', { body: 'owl', color: '#5B8DEF', acc: 'glasses' }, { chief: true, pinned: SCENE === 'page', order: 0, lastLine: 'Checkout fix is in review.' }),
    bot('bdisp', 'Dispatcher', 'Hands out coding work to agents', { body: 'bot', color: '#F08A3C', acc: 'headphones' }, { order: 1, lastLine: 'Handed the cart job to Pixel.' }),
    bot('btest', 'Tester', 'Tries every change before it ships', { body: 'cat', color: '#A46BE8', acc: 'glasses' }, { order: 2, lastLine: 'All 18 checks passed.' })
  ];
  var botLogs = {
    bchief: [
      { role: 'user', text: 'What is everyone working on?', ts: NOW - 14 * MIN },
      { role: 'bot', text: 'Pixel is making the cart remember items between visits. Nova finished the checkout fix and it is waiting for you to try it. The Tester is checking it now.', ts: NOW - 13 * MIN }
    ],
    bdisp: [], btest: []
  };

  /* ---------- roadmap (shared by every scene) ---------- */
  var RM = { todo: [['r1', 'Email receipts after checkout'], ['r2', 'Dark mode for the shop']], doing: [['r3', 'Cart remembers items']], test: [['r4', 'Coupons apply before shipping']], done: [['r5', 'Sign-in page'], ['r6', 'Product search']] };
  var rmRev = 1;
  function rmDoc() {
    var C = [['todo', 'To do', 'todo'], ['doing', 'In progress', 'doing'], ['test', 'Waiting test', 'test'], ['done', 'Complete', 'done']];
    return { text: '', rev: 'r' + rmRev, source: 'underglow', file: '', name: 'Roadmap, by Underglow', label: 'Roadmap, by Underglow', connected: false, lost: null, candidates: [],
      cols: C.map(function (c) { return { key: c[0], name: c[1], role: c[2], items: RM[c[0]].map(function (i) { return { id: i[0], text: i[1], note: '', done: c[0] === 'done', agent: null }; }) }; }) };
  }
  function rmMove(id, col, idx) {
    var it; Object.keys(RM).forEach(function (k) { RM[k] = RM[k].filter(function (i) { if (i[0] === id) { it = i; return false; } return true; }); });
    if (!it) return; var a = RM[col]; if (idx == null || idx > a.length) idx = a.length; a.splice(idx, 0, it); rmRev++;
  }

  /* ---------- workflow + code map (recorded from the real scanners on a made-up project) ---------- */
  var DATA = {}; // filled by loadData()
  var wfState = { agentsWorking: 0, packets: [], colors: {}, botWorking: {} };
  function wfView() {
    var v = clone(DATA.workflow); (v.simple.nodes || []).forEach(function (n) { if (n.name === 'Render') n.name = 'Live site'; }); v.scannedAt = NOW - MIN; v.packets = clone(wfState.packets); v.colors = clone(wfState.colors);
    v.team.agents = { total: 4, working: wfState.agentsWorking, color: wfState.agentsWorking ? 'yellow' : null };
    v.team.bots = bots.map(function (b) { return { id: b.id, name: b.name, chief: !!b.chief, working: !!wfState.botWorking[b.id] }; });
    return v;
  }
  var cmAct = { active: [], done: [], saved: 0 };
  function cmRoute(rest) {
    var q = new URLSearchParams(rest.split('?')[1] || ''), name = rest.split('?')[0]; q.delete('g');
    var key = q.toString() ? name + '?' + q.toString().replace(/\+/g, '%20') : name;
    if (name === 'activity') return { ok: true, now: Date.now(), active: cmAct.active, done: cmAct.done, saved: cmAct.saved, status: { status: 'idle', progress: null, files: 46, pending: 0, saved: 0 } };
    var r = DATA.codemap[key]; if (!r) { // folder?p= / file?f= keys come with different escaping; match on the decoded value
      var want = decodeURIComponent(q.toString().replace(/^[pf]=/, '')), pre = name + '?';
      for (var k in DATA.codemap) { if (k.indexOf(pre) === 0 && decodeURIComponent(k.slice(pre.length + 2)) === want) { r = DATA.codemap[k]; break; } }
    }
    if (name === 'state' && r) { r = clone(r); r.indexedAt = NOW - 2 * MIN; }
    return r || { ok: false };
  }

  /* ---------- Workbox ---------- */
  var wbx = { state: 'on', desktop: true };
  function wbxView() {
    return { state: wbx.state, wslVersion: '2.7.3.0', boxRunning: true, needsUpdate: false,
      settings: { enabled: true, memoryGB: 4, idleMin: 15, wsMemMB: 2048, wsCpu: 400, portFirst: 21000, portLast: 28999, screen: '1920x1080' },
      distro: 'UnderGlow-Workbox', error: '', setup: null, limits: { screen: { w: 1920, h: 1080 }, screens: ['1280x720', '1600x900', '1920x1080', '2560x1440'], memChoices: [1, 2, 3, 4, 6, 8, 12], idleChoices: [5, 10, 15, 30, 60, 0], portBlock: 20, defaults: {} },
      memory: { used: 1.4 * 1024 ** 3, total: 4 * 1024 ** 3 }, busy: 0,
      workspaces: bots.concat(agents).filter(function (x) { return x.id === 'btest' || x.id === 'bchief'; }).map(function (x, i) { return { key: 'bot:' + x.id, kind: 'bot', name: x.name, user: 'ws' + i, ports: [21000 + i * 20, 21019 + i * 20], display: ':' + (11 + i), desktop: wbx.desktop, watching: 0 }; }) };
  }

  /* ---------- fake fetch ---------- */
  var realFetch = window.fetch.bind(window);
  var json = function (o, status) { return Promise.resolve(new Response(JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json' } })); };
  function dashboard() {
    return { now: Date.now(), pages: pages.map(function (p) {
      var ag = agents.filter(function (a) { return a.side === p.id; }), run = ag.filter(function (a) { return a.status === 'working'; });
      return { id: p.id, name: p.name, folder: p.folder, status: run.length ? 'working' : 'idle', agents: { total: ag.length, running: run.length, needYou: 0, ready: ag.filter(function (a) { return a.status === 'ready'; }).length },
        bots: { total: p.id === 'pstore' ? bots.length : 0, working: 0, needYou: 0 }, needsYou: 0, activity: run[0] ? { who: run[0].name, text: run[0].task || '', since: run[0].workSince } : null, hasError: false, lastActivity: Date.now(), lastUpdate: { by: 'Nova', ts: NOW - 4 * MIN } };
    }) };
  }
  function route(p, o, search) {
    var m = (o && o.method) || 'GET', mm;
    if (p === '/api/dashboard') return json(dashboard());
    if (p === '/api/bots') return json({ bots: bots, templates: [], pageList: pages, browserReady: true, max: 50 });
    if ((mm = /^\/api\/bots\/([^/]+)\/log/.exec(p))) return json({ log: botLogs[mm[1]] || [] });
    if (p === '/api/pageinfo') return json({ git: { repo: 'storefront', trees: [{ path: FOLDER + 'storefront', branch: 'main', main: true, changed: 2, agents: ['Nova', 'Pixel'] }] }, out: { all: 24994801, month: 23097989, today: 551676, since: '2026-06-11T14:57:49.479Z', rate: 46332, bestDay: 2583589 }, today: { usd: 12.4 }, plan: { price: 100, month: 640, today: 12.4, perDay: 3.33, best: 98 }, roadmap: { todo: RM.todo.length, doing: RM.doing.length, test: RM.test.length, done: RM.done.length, source: 'underglow', name: 'Roadmap, by Underglow' } });
    if (p === '/api/roadmap/op') { var b = {}; try { b = JSON.parse(o.body); } catch (e) {} if (b.op === 'move') rmMove(b.id, b.col, b.index); return json(rmDoc()); }
    if (p === '/api/roadmap') return json(rmDoc());
    if (p === '/api/workflow') return json(wfView());
    if (p.indexOf('/api/workflow/') === 0) return json({ ok: true });
    if (p.indexOf('/api/codemap/') === 0) return json(cmRoute(p.slice(13) + search));
    if (p === '/api/workbox') return json(wbxView());
    if (p.indexOf('/api/workbox/') === 0) return json(wbxView());
    if (p === '/api/addons') return json({ android: { on: false, installed: false, download: '1.5 GB', disk: '6 GB', needs: '' }, workbox: { on: true } });
    if (p === '/api/foreman-tracker') return json({ items: [] });
    if (p === '/api/providers/accounts') return json({ method: 'subscription', others: [], accounts: [{ id: 'default', email: null, plan: null, loggedIn: true, active: true, limitedUntil: null, utilization: null }] });
    if (p === '/api/update') return json({ installed: true, release: null, date: null, commit: null, update: null });
    if (p === '/api/account') return json({ required: false, paywall: false, signedIn: true, email: null, offline: false });
    if (p === '/api/shells') return json({ platform: 'win32', default: 'powershell', shells: [{ id: 'powershell', name: 'PowerShell' }] });
    if (p === '/api/host-update/settings') return json({ on: true });
    if (p === '/api/host-update/status') return json({ phase: 'idle', target: null, from: null, hostVersion: '0.0.0', enabled: true, supported: false, endsAt: null, now: Date.now(), busy: [], progress: null, reason: null, ui: null, last: null, clientVersion: null });
    if (p === '/api/autoresume') return json({ on: true });
    if (p === '/api/android/status') return json({ phase: 'none', msg: '', pct: null, step: '', ws: 'home', mode: 'phone', switching: false, tvReady: false, installed: false, serial: null, lastApp: null, viewers: 0, idleOffIn: 0, sdk: '', adb: null });
    if (p === '/api/access') return json({ ownCode: FOLDER, granted: [], default: FOLDER, memory: FOLDER, sides: { pstore: [FOLDER + 'storefront'] } });
    if (p === '/screens/claude-limits.json') return json({ updatedAt: new Date().toISOString(), limits: { source: 'sample', pollOk: true, stale: false, session: { percent: 36, resetsAt: new Date(Date.now() + 2 * 3600e3).toISOString() }, weekly: { percent: 38, resetsAt: new Date(Date.now() + 30 * 3600e3).toISOString() }, scoped: [] }, limitsError: null, backoffUntil: null });
    if (p.indexOf('/api/') === 0) return json({});
    return null;
  }
  window.fetch = function (url, o) {
    var u; try { u = new URL(String(url), location.href); } catch (e) { return realFetch(url, o); }
    if (u.origin === location.origin && (u.pathname.indexOf('/api/') === 0 || u.pathname.indexOf('/screens/') === 0)) { var r = route(u.pathname, o, u.search); if (r) return r; }
    return realFetch(url, o);
  };

  /* ---------- fake sockets ---------- */
  var mainSocks = [], botSocks = [];
  function Sock(url) {
    var self = this; this.url = String(url); this.readyState = 0; this.bufferedAmount = 0; this.protocol = ''; this.extensions = ''; this.binaryType = 'blob'; this._l = {};
    setTimeout(function () {
      self.readyState = 1; self._fire('open', {});
      var path = new URL(self.url, location.href).pathname;
      if (path === '/') { mainSocks.push(self); self._send(initMsg()); }
      else if (path === '/bots/ws') { botSocks.push(self); self._send({ t: 'init', bots: bots, pageList: pages }); }
    }, 5);
  }
  Sock.prototype.addEventListener = function (t, f) { (this._l[t] = this._l[t] || []).push(f); };
  Sock.prototype.removeEventListener = function (t, f) { this._l[t] = (this._l[t] || []).filter(function (x) { return x !== f; }); };
  Sock.prototype._fire = function (t, e) { var h = this['on' + t]; if (h) h.call(this, e); (this._l[t] || []).forEach(function (f) { f.call(this, e); }, this); };
  Sock.prototype._send = function (o) { var s = this; setTimeout(function () { if (s.readyState === 1) s._fire('message', { data: JSON.stringify(o) }); }, 0); };
  Sock.prototype.send = function () {};
  Sock.prototype.close = function () { this.readyState = 3; this._fire('close', { code: 1000 }); };
  Sock.CONNECTING = 0; Sock.OPEN = 1; Sock.CLOSING = 2; Sock.CLOSED = 3;
  window.WebSocket = Sock;
  function toMain(o) { mainSocks.forEach(function (s) { s._send(o); }); }
  function toBots(o) { botSocks.forEach(function (s) { s._send(o); }); }
  function initMsg() {
    return { t: 'init', boot: 'demo', update: null, hud: null, defaultCwd: FOLDER, pages: pages, tabNames: {}, tabLogos: {}, missing: [], folderState: { pstore: 'ok', pmobile: 'ok', pdocs: 'ok' }, homeFolder: FOLDER, tabOrder: [], screens: [],
      topbar: [{ id: 'claude-limits', order: 10, source: '/screens/claude-limits.json', stale: 'limits.stale', meters: [{ label: '5H', path: 'limits.session' }, { label: 'WK', path: 'limits.weekly' }] }], builds: [], deck: null, autoDock: null, agents: agents };
  }

  /* ---------- helpers that drive the real UI ---------- */
  function setAgent(id, patch) { var a = agents.find(function (x) { return x.id === id; }); Object.assign(a, patch); var m = Object.assign({}, a); toMain({ t: 'agent', agent: m }); return a; }
  function logAgent(id, entry) { var a = agents.find(function (x) { return x.id === id; }); entry.ts = Date.now(); a.log.push(entry); toMain({ t: 'log', id: id, entry: entry }); }
  async function say(id, text, cps) { // stream text into an agent pane, then commit it
    var step = cps || 3;
    for (var i = step; i < text.length + step; i += step) { if (!alive) return; toMain({ t: 'delta', id: id, text: text.slice(i - step, i) }); await sleep(30); }
    logAgent(id, { role: 'assistant', text: text });
  }
  async function botSay(id, text) {
    var step = 3;
    for (var i = step; i < text.length + step; i += step) { if (!alive) return; toBots({ t: 'delta', id: id, text: text.slice(i - step, i) }); await sleep(28); }
    var e = { role: 'bot', text: text, ts: Date.now() }; botLogs[id].push(e); toBots({ t: 'log', id: id, entry: e });
  }
  function setBot(id, patch) { var b = bots.find(function (x) { return x.id === id; }); Object.assign(b, patch); toBots({ t: 'bot', bot: b }); }
  function click(sel, root) { var el = (root || document).querySelector(sel); if (el) el.click(); return el; }
  function until(f, ms) { return new Promise(function (res) { var t0 = Date.now(); (function w() { var v; try { v = f(); } catch (e) {} if (v) return res(v); if (Date.now() - t0 > (ms || 8000)) return res(null); setTimeout(w, 80); })(); }); }

  /* ---------- scenes ---------- */
  var S = {};
  async function booted() { await until(function () { return window.FmBots && document.querySelector('#s-pg-pstore') && !document.documentElement.classList.contains('booting'); }, 10000); await sleep(600); }

  S.page = async function () { // hero: agents work in the grid, a new agent glides in
    await booted(); if (STILL) return;
    while (alive) {
      await sleep(1800);
      await pixelJob();
      await sleep(2500);
    }
  };
  async function pixelJob() {
    var a = agents.find(function (x) { return x.id === 'a2'; });
    logAgent('a2', { role: 'tool', text: 'Edit · src/cart/storage.js' }); await sleep(1400);
    logAgent('a2', { role: 'tool', text: 'Bash · npm test' }); await sleep(1600);
    logAgent('a2', { role: 'result', text: '✓ 18 passed' }); await sleep(900);
    await say('a2', 'Done. The cart now keeps its items when you reload the page.');
  }

  /* run */
  async function loadData() {
    var r = await Promise.all([realFetch('demo-data/workflow.json').then(function (x) { return x.json(); }), realFetch('demo-data/codemap.json').then(function (x) { return x.json(); })]);
    DATA.workflow = r[0]; DATA.codemap = r[1];
  }
  function resync() { var snap = clone(BASE_AGENTS); agents.length = 0; snap.forEach(function (a) { agents.push(a); }); botLogs.bchief = clone(BASE_BOTLOGS.bchief); botLogs.bdisp = []; botLogs.btest = clone(BASE_BOTLOGS.btest); toMain(initMsg()); toBots({ t: 'init', bots: bots, pageList: pages }); }
  function rmReset() { RM = clone(RM0); rmRev++; }
  var BASE_AGENTS = clone(agents), BASE_BOTLOGS = clone(botLogs), RM0 = clone(RM);
  window.UGDemo = { resync: resync, rmReset: rmReset, makeAgent: agent, botLog: function (id) { return botLogs[id] = botLogs[id] || []; }, toMain: toMain, toBots: toBots, setAgent: setAgent, logAgent: logAgent, say: say, botSay: botSay, setBot: setBot, sleep: sleep, until: until, click: click, wf: wfState, cm: cmAct, rm: { move: rmMove }, wbx: wbx, S: S, scene: SCENE, still: STILL, agents: agents, bots: bots, pages: pages, booted: booted,
    stop: function () { alive = false; }, get alive() { return alive; } };
  // The scene scripts live in demo-scenes.js (loaded after the app, when the window exists)
  window.addEventListener('load', function () {
    loadData().then(function () { var s = document.createElement('script'); s.src = 'demo-scenes.js'; s.onload = function () { (S[SCENE] || S.page)(); }; document.body.appendChild(s); });
  });
  // data must exist before the app's first fetch: block briefly
  var ready = loadData(); var rf = window.fetch; window.fetch = function (u, o) { return DATA.workflow ? rf(u, o) : ready.then(function () { return rf(u, o); }); };
})();
