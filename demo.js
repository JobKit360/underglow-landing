// Live preview on the landing page. Each screen is the REAL UnderGlow app (website/app/, built from the app's own files by
// website/tools/build-demo-app.mjs) playing a short made-up story: sample projects and agents only. Plain JS, no libraries, no tracking.
// Previews load ahead of time, nearest to the screen first, a few at a time, and then stay loaded (a still skeleton shows until each is ready);
// reduced motion shows still screens.
(function () {
  'use strict';
  var d = document;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var VER = d.documentElement.getAttribute('data-app') || '1';
  function el(tag, cls, html) { var e = d.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function I(p) { return '<svg viewBox="0 0 24 24">' + p + '</svg>'; }

  // view = the part of the 1440 x 900 app window to show (x, y, w, h). Rows use a tighter crop for the side panels so they stay readable.
  var FULL = [0, 0, 1440, 900], SIDE = [0, 48, 640, 850];
  var SC = {
    page: { label: 'Agents', icon: I('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'), cap: 'Your lead agent pinned to the left column, with more agents joining the grid as they get jobs. Sample data.', view: FULL },
    bot: { label: 'Agent chat', icon: I('<path d="M4 5h16v11H9l-5 4z"/>'), cap: 'Ask an agent in plain words. It starts more agents, and they appear on the grid. Sample data.', view: FULL },
    workflow: { label: 'Workflow', icon: I('<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7 7l4 9M17 7l-4 9"/>'), cap: 'An example workflow: a change moves from the agents to a test build and on to the live site, and waits at a gate for your yes. You set up your own steps and gates.', view: FULL, rowView: SIDE },
    map: { label: 'Code map', icon: I('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 11l7.4-4M8.3 13l7.4 4"/>'), cap: 'Blue dots are files an agent is reading, yellow ones are being edited. Sample project.', view: FULL, rowView: SIDE },
    workbox: { label: 'Workbox', icon: I('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>'), cap: 'An agent’s own machine: it runs the tests, opens the page and shows you its screen. Expand it in the app for full screen.', view: FULL },
    roadmap: { label: 'Roadmap', icon: I('<path d="M5 5h14v4H5zM5 11h9v4H5zM5 17h12v2H5z"/>'), cap: 'Cards move along as the work gets done, from To do to Complete.', view: FULL, rowView: SIDE },
    phone: { label: 'Phone', icon: I('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>'), cap: 'The same app in your phone’s browser, so you can check in from anywhere.', view: [0, 0, 390, 844], phone: true }
  };

  // Loads the frames a few at a time, nearest to the viewport first. The very first frame goes alone so the files every frame shares
  // (scripts, styles, fonts) are downloaded once and the others reuse them from the browser cache.
  var Q = [], active = 0, firstDone = false, FAR = 2;
  function dist(it) {
    var r = it.node.getBoundingClientRect(), vh = window.innerHeight || 800;
    return (r.bottom < 0 ? -r.bottom : r.top > vh ? r.top - vh : 0) + it.pen;
  }
  function pump() {
    if (d.hidden) return;
    while (Q.length) {
      var max = firstDone ? 2 : 1, best = -1, bd = 1e9, i;
      for (i = 0; i < Q.length; i++) { var dd = dist(Q[i]); if (dd < bd) { bd = dd; best = i; } }
      var urgent = bd < (window.innerHeight || 800) * FAR; // something is close to the screen: it gets a slot even if the queue is busy
      if (active >= max + (urgent && firstDone ? 1 : 0)) return;
      var it = Q.splice(best, 1)[0]; active++; run(it);
    }
  }
  function run(it) {
    var done = false, fin = function () { if (done) return; done = true; active--; firstDone = true; setTimeout(pump, 200); };
    it.start(fin); setTimeout(fin, 12000); // never block the queue for long
  }
  function enqueue(node, pen, start) { Q.push({ node: node, pen: pen || 0, start: start }); pump(); }
  window.addEventListener('scroll', function () { if (Q.length) pump(); }, { passive: true });
  d.addEventListener('visibilitychange', pump);

  function mount(host, keys, o) {
    o = o || {}; host.innerHTML = '';
    var one = keys.length === 1, sc0 = SC[keys[0]];
    var ug = el('div', 'ug' + (o.tabs ? '' : ' single') + (one && o.row && sc0.rowView ? ' tall' : '')), bar = el('div', 'ug-bar', '<i></i><i></i><i></i><span>' + (o.title || 'UnderGlow') + '</span><em class="ug-live">Live preview</em>');
    var tabs = o.tabs ? el('div', 'ug-tabs') : null, stage = el('div', 'ug-stage'), cap = el('div', 'ug-cap'), cur = null, vis = !('IntersectionObserver' in window), locked = !o.auto || reduce, btn = {};
    if (tabs) tabs.setAttribute('role', 'tablist');
    ug.appendChild(bar); tabs && ug.appendChild(tabs); ug.appendChild(stage); ug.appendChild(cap); host.appendChild(ug);
    // Tab mode: every scene gets its own panel with its own app, all stacked in the same window. They load once and are never
    // reloaded; switching tabs only fades and slides the panels, so the frame, tabs and every running animation stay put.
    var P = {}, tabMode = !!o.tabs && keys.length > 1;
    function viewOf(k) { var s = SC[k]; return o.row && s.rowView ? s.rowView : s.view; }
    function paneFor(k) {
      if (P[k]) return P[k];
      var s = SC[k], pane = el('div', 'ug-pane' + (tabMode && s.phone ? ' phone' : '')), v = el('div', 'ug-view');
      pane.appendChild(v); stage.appendChild(pane); P[k] = { pane: pane, view: v, frame: null, cs: viewOf(k) };
      return P[k];
    }
    function fit(k) {
      (k ? [k] : Object.keys(P)).forEach(function (x) {
        var p = P[x]; if (!p || !p.frame) return; var vw = p.view.clientWidth; if (!vw) return; var sc = vw / p.cs[2];
        p.frame.style.transform = 'translate(' + (-p.cs[0] * sc) + 'px,' + (-p.cs[1] * sc) + 'px) scale(' + sc + ')';
      });
    }
    var PHONE_CSS = function (v) { return 'position:absolute;top:30px;bottom:30px;left:50%;aspect-ratio:' + v[2] + '/' + v[3] + ';transform:translateX(-50%);border-radius:28px;overflow:hidden;box-shadow:0 0 0 1px #3a3a44,0 0 0 6px #08080a,0 30px 60px -20px rgba(0,0,0,.8)'; };
    function layout(k) {
      var s = SC[k], p = paneFor(k), v = p.cs = viewOf(k);
      if (tabMode) { p.view.style.cssText = s.phone ? PHONE_CSS(v) : 'position:absolute;inset:0;overflow:hidden'; return; }
      ug.classList.toggle('phone-frame', !!s.phone);
      if (s.phone) { p.view.style.cssText = PHONE_CSS(v); stage.style.cssText = ''; }
      else { p.view.style.cssText = 'position:absolute;inset:0;overflow:hidden'; stage.style.setProperty('--ar', v[2] + ' / ' + v[3]); }
    }
    // Tab mode: the stage is as tall as the 1440 x 900 app at the current width, except on the phone tab, where it is made tall
    // enough that the whole phone is visible and centered (it grows smoothly, so switching tabs stays smooth on small screens too).
    function sizeStage() {
      if (!tabMode) return; var w = stage.clientWidth; if (!w) return;
      var h = w * FULL[3] / FULL[2];
      if (cur && SC[cur].phone) { var ph = Math.min(640, Math.max(h - 60, 520)); ph = Math.min(ph, (w - 28) * SC[cur].view[3] / SC[cur].view[2]); h = Math.max(h, ph + 60); }
      stage.style.height = Math.round(h) + 'px';
    }
    var queued = {};
    // Put a scene in the loading queue (pen = how much later than its position it may be loaded). Once loaded it is kept.
    function loadOne(k, pen) {
      var p = paneFor(k); if (p.frame || queued[k]) return; queued[k] = 1; layout(k);
      enqueue(host, pen, function (fin) { startFrame(k, fin); });
    }
    function startFrame(k, fin) {
      var p = paneFor(k), s = SC[k]; if (p.frame) { fin(); return; } layout(k);
      var frame = el('iframe', 'ug-app'); frame.setAttribute('title', 'UnderGlow app preview: ' + s.label); frame.setAttribute('tabindex', '-1'); frame.setAttribute('aria-hidden', 'true');
      frame.style.setProperty('--vw', (s.phone ? s.view[2] : 1440) + 'px'); frame.style.setProperty('--vh', (s.phone ? s.view[3] : 900) + 'px');
      frame.addEventListener('load', function () { fin(); setTimeout(function () { if (p.frame === frame) frame.classList.add('on'); }, 450); });
      frame.src = 'app/index.html?scene=' + k + '&v=' + VER + (reduce ? '&still=1' : ''); p.view.appendChild(frame); p.frame = frame; fit(k);
    }
    function load() { if (tabMode) { loadOne(cur, 0); keys.forEach(function (x, i) { if (x !== cur) loadOne(x, 700 + i * 300); }); } else loadOne(cur, 0); }
    function show(k) {
      if (k === cur) { load(); return; }
      var prev = cur; cur = k; cap.textContent = SC[k].cap; sizeStage();
      keys.forEach(function (x) { if (btn[x]) { btn[x].setAttribute('aria-selected', x === k ? 'true' : 'false'); btn[x].classList.remove('auto'); } });
      if (btn[k] && !locked) { void btn[k].offsetWidth; btn[k].classList.add('auto'); }
      if (tabMode) {
        var idx = keys.indexOf(k), pi = prev ? keys.indexOf(prev) : idx;
        keys.forEach(function (x) { var p = paneFor(x); if (x === k) { p.pane.style.setProperty('--dx', (idx >= pi ? 28 : -28) + 'px'); p.pane.classList.add('act'); } else if (p.pane.classList.contains('act')) { p.pane.style.setProperty('--dx', (idx >= pi ? -28 : 28) + 'px'); p.pane.classList.remove('act'); } });
        loadOne(k, -100000); fit(k); pump();
        return;
      }
      load();
    }
    function next() { var i = keys.indexOf(cur); show(keys[(i + 1) % keys.length]); }
    if (tabs) keys.forEach(function (k) {
      var b = el('button', '', SC[k].icon + '<span>' + SC[k].label + '</span>'); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', 'false'); b.style.setProperty('--dur', (o.dur || 26) + 's'); tabs.appendChild(b); btn[k] = b;
      b.addEventListener('click', function () { locked = true; show(k); }); b.addEventListener('animationend', function () { if (!locked) next(); });
    });
    if ('ResizeObserver' in window) new ResizeObserver(function () { sizeStage(); fit(); }).observe(stage); else window.addEventListener('resize', function () { fit(); });
    function sync() { ug.classList.toggle('paused', !vis || d.hidden); }
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { vis = es[0].isIntersecting; sync(); }, { threshold: .15 }).observe(ug);
    d.addEventListener('visibilitychange', sync);
    ug.addEventListener('pointerenter', function () { ug.classList.add('paused'); }); ug.addEventListener('pointerleave', function () { ug.classList.toggle('paused', !vis); });
    show(keys[0]); keys.forEach(function (k) { layout(k); }); load(); // the skeleton shows at once, the live scene follows
    return ug;
  }

  function floats(host) {
    var F = [['f1', '✓', 'Tests passed', 'Checkout fix · 18 of 18'], ['f2', '!', 'Needs you', 'Approve the live site'], ['f3', '→', 'Moved to Complete', 'Sign-in page']], E = F.map(function (f) { var e = el('div', 'float ' + f[0], '<span class="dotc"></span><span><b>' + f[2] + '</b><small>' + f[3] + '</small></span>'); e.setAttribute('aria-hidden', 'true'); host.appendChild(e); return e; });
    if (reduce) { E.forEach(function (e) { e.classList.add('on'); }); return; }
    var i = 0; setInterval(function () { if (d.hidden) return; E.forEach(function (e, j) { e.classList.toggle('on', j === i % 3 || j === (i + 1) % 3); }); i++; }, 3200);
  }

  function init() {
    var hero = d.getElementById('heroDemo');
    if (hero) { mount(hero, ['page', 'workflow', 'map', 'workbox', 'roadmap', 'phone'], { tabs: true, auto: true, dur: 28, title: 'UnderGlow · Sample project' }); }
    [].forEach.call(d.querySelectorAll('[data-demo]'), function (h) { mount(h, [h.getAttribute('data-demo')], { title: h.getAttribute('data-title'), row: true }); });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
