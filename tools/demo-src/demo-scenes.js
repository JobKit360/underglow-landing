/* Scene scripts for the landing-page demo. They play made-up events into the real app (see demo-mock.js), then loop.
   Every scene starts from a clean state (reset()) so the loop never drifts. */
(function () {
  'use strict';
  var D = window.UGDemo, S = D.S, sleep = D.sleep, say = D.say, botSay = D.botSay;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var MIN = 60000;

  function typeInto(el, text, ms) {
    return new Promise(async function (res) {
      if (!el) return res();
      el.focus && el.focus({ preventScroll: true });
      for (var i = 1; i <= text.length && D.alive; i++) { el.value = text.slice(0, i); el.dispatchEvent(new Event('input', { bubbles: true })); await sleep(ms || 34); }
      res();
    });
  }
  function clearInput(el) { if (!el) return; el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); el.blur && el.blur(); }
  async function userSays(botId, inputSel, text) { // type into the real message box, "send", and show it in the chat
    var el = $(inputSel); await typeInto(el, text); await sleep(450); clearInput(el);
    var e = { role: 'user', text: text, ts: Date.now() }; D.botLog(botId).push(e); D.toBots({ t: 'log', id: botId, entry: e });
  }
  function newAgent(id, name, task, side) {
    var a = D.makeAgent(id, name, side || 'pstore', { status: 'working', workSince: Date.now(), task: task, lastRun: { ts: Date.now() }, log: [] });
    D.agents.push(a); D.toMain({ t: 'agent', agent: a }); return a;
  }
  async function work(id, prompt, steps, finalText) { // an agent reads, edits, tests, then reports
    if (prompt) { D.logAgent(id, { role: 'user', text: prompt }); await sleep(900); }
    for (var i = 0; i < steps.length && D.alive; i++) { D.logAgent(id, { role: steps[i][0], text: steps[i][1] }); await sleep(steps[i][2] || 1200); }
    if (finalText) await say(id, finalText);
  }
  function resetAll() { D.resync(); }

  /* ---------- hero: a pinned bot on the left, agents gliding into the grid ---------- */
  S.page = async function () {
    await D.booted(); if (D.still) return;
    var chatIn = '.bpane textarea.bt-in2';
    while (D.alive) {
      resetAll(); await sleep(2600);
      await userSays('bchief', chatIn, 'Add a sign-in page, and keep the cart between visits.');
      D.setBot('bchief', { status: 'working' }); await sleep(1100);
      await botSay('bchief', 'On it. I will give the sign-in page to a new agent, and Pixel already has the cart.');
      D.setBot('bchief', { status: 'idle', lastLine: 'Sign-in page handed to Ivy.' }); await sleep(900);
      newAgent('a5', 'Ivy', 'Sign-in page');
      await sleep(2200);
      work('a5', 'Add a sign-in page with email and password.', [['tool', 'Read · src/auth/login.js', 1500], ['tool', 'Read · src/auth/session.js', 1300], ['tool', 'Edit · src/auth/login.js', 1700], ['tool', 'Bash · npm test', 1900], ['result', '✓ 21 passed', 900]], 'The sign-in page is ready. It checks the email, shows a clear error and keeps you signed in.');
      await sleep(3000);
      await work('a2', '', [['tool', 'Edit · src/cart/storage.js', 1500], ['tool', 'Bash · npm test', 1700], ['result', '✓ 21 passed', 700]], 'Done. The cart now keeps its items when you reload the page.');
      D.setAgent('a2', { status: 'ready', testNotes: 'Cart keeps its items after a reload.', workSince: null });
      await sleep(2400);
      D.setAgent('a5', { status: 'ready', testNotes: 'Sign-in page works.', workSince: null });
      await sleep(1500);
      await botSay('bchief', 'Both jobs are done and waiting for you to try them.');
      await sleep(4200);
    }
  };

  /* ---------- bot chat: ask a bot, it hands work to agents ---------- */
  S.bot = async function () {
    await D.booted(); if (D.still) return;
    var chatIn = '.bpane textarea.bt-in2';
    while (D.alive) {
      resetAll(); await sleep(2400);
      await userSays('bdisp', chatIn, 'Check the checkout page on a small phone screen.');
      D.setBot('bdisp', { status: 'working' }); await sleep(1000);
      await botSay('bdisp', 'Starting an agent for that now.');
      D.setBot('bdisp', { status: 'idle' }); await sleep(700);
      newAgent('a6', 'Juno', 'Check checkout on phones');
      await work('a6', 'Check the checkout page on a small phone screen and fix anything that does not fit.', [['tool', 'Read · src/checkout/checkout.js', 1500], ['tool', 'Edit · src/ui/theme.js', 1700], ['tool', 'Bash · npm test', 1800], ['result', '✓ 21 passed', 800]], 'The checkout fits on small screens now. The pay button was hidden below the fold, so I moved it up.');
      D.setAgent('a6', { status: 'ready', testNotes: 'Checkout fits small screens.', workSince: null });
      await sleep(1400);
      await botSay('bdisp', 'Juno is done. The checkout now fits on small phones. Want me to ask the Tester to check it?');
      await sleep(4600);
    }
  };

  /* ---------- workflow graph ---------- */
  S.workflow = async function () {
    await D.booted(); if (D.still) { window.FmWorkflow.show(true); return; }
    window.FmWorkflow.show(true); await sleep(900);
    var W = D.wf, pk = 0;
    var move = function (at, state, extra) { return Object.assign({ id: 'k' + pk, at: at, state: state, born: Date.now() }, extra || {}); };
    while (D.alive) {
      pk++; W.packets = []; W.colors = {}; W.agentsWorking = 0; W.botWorking = {}; await sleep(2600);
      W.agentsWorking = 3; W.botWorking = { bchief: true }; await sleep(2400);
      W.packets = [move('agents', 'moving')]; await sleep(1800);
      W.packets = [move('check:test', 'moving')]; W.colors = { 'check:test': 'blue' }; await sleep(2600);
      W.colors = { 'check:test': 'yellow' }; await sleep(2200);
      W.packets = [move('build:local', 'arrived')]; W.colors = {}; await sleep(3000);
      pk++; W.botWorking = {}; W.packets = [move('agents', 'moving')]; await sleep(1700);
      W.packets = [move('step:localhost', 'moving')]; W.colors = { 'step:localhost': 'yellow' }; await sleep(2600);
      W.packets = [move('step:localhost', 'gate', { gate: { kind: 'human', edges: ['step:localhost>deploy:host'] } })]; W.colors = {}; W.agentsWorking = 1; await sleep(5200);
      W.packets = [move('deploy:host', 'arrived')]; W.agentsWorking = 0; await sleep(4200);
    }
  };

  /* ---------- code map ---------- */
  S.map = async function () {
    await D.booted(); window.FmMap.show(true);
    if (D.still) return;
    await sleep(2500);
    var C = D.cm;
    var files = {
      read: ['src/cart/cart.js', 'src/store.js', 'src/checkout/checkout.js', 'src/api/orders.js', 'src/ui/header.js', 'src/auth/session.js', 'src/utils/money.js', 'src/products/catalog.js'],
      edit: ['src/cart/storage.js', 'src/cart/totals.js', 'src/checkout/checkout.js', 'src/auth/login.js', 'src/ui/toast.js']
    };
    var ev = function (aid, agent, file, kind, prev) { return Object.assign({ id: aid + '|' + file + (kind === 'edit' ? '|e' : ''), aid: aid, agent: agent, file: file, kind: kind, t: Date.now() }, prev ? { prev: prev } : {}); };
    var n = 0;
    while (D.alive) {
      C.active = []; C.done = []; C.saved = 0; await sleep(1200);
      for (var i = 0; i < 6 && D.alive; i++, n++) {
        var r1 = files.read[n % files.read.length], r2 = files.read[(n + 3) % files.read.length], e1 = files.edit[n % files.edit.length];
        C.active = [ev('a1', 'Nova', r1, 'read', files.read[(n + 7) % files.read.length]), ev('a2', 'Pixel', r2, 'read')]; C.saved += 4200; await sleep(2000);
        C.active = [ev('a1', 'Nova', files.read[(n + 1) % files.read.length], 'read', r1), ev('a2', 'Pixel', e1, 'edit')]; C.saved += 5100; await sleep(2600);
        C.done = C.done.concat([{ file: e1, agent: 'Pixel', aid: 'a2', kind: 'edit', at: Date.now() }]); C.active = []; await sleep(900);
      }
      await sleep(2500);
    }
  };

  /* ---------- workbox: a bot's own Linux screen ---------- */
  S.workbox = async function () {
    await D.booted(); if (D.still) { return; }
    await sleep(600); var tog = D.until(function () { return $('.bpane .bt-ptog'); }, 6000); (await tog).click(); await sleep(700);
    var tab = [].slice.call(document.querySelectorAll('.bpane button')).find(function (b) { return b.textContent.trim() === 'Desktop'; }); if (tab) tab.click();
    var chatIn = '.bpane textarea.bt-in2';
    while (D.alive) {
      resetAll(); await sleep(3000);
      await userSays('btest', chatIn, 'Run the shop tests and open the cart page.');
      D.setBot('btest', { status: 'working' }); await sleep(900);
      await botSay('btest', 'Running all 21 tests in my Linux box, then opening the cart page so you can watch.');
      D.setBot('btest', { status: 'idle', lastLine: 'All 21 tests passed.' });
      await sleep(4500);
      var big = $('.bpane [data-x="expand"]'); if (big && !big.hidden) { big.click(); await sleep(6500); var shut = $('.wbx-full .wbx-nb'); if (shut) shut.click(); }
      await sleep(2500);
    }
  };

  /* ---------- roadmap ---------- */
  S.roadmap = async function () {
    await D.booted(); window.FmRoadmap.show(true); if (D.still) return;
    var R = D.rm, tabAt = function (i) { var b = document.querySelectorAll('.rb-tabs button')[i]; if (b) b.click(); };
    while (D.alive) {
      D.rmReset(); tabAt(0); await sleep(2800);
      R.move('r1', 'doing'); await sleep(1200); tabAt(1); await sleep(2600);
      R.move('r3', 'test'); await sleep(900); tabAt(2); await sleep(2600);
      R.move('r3', 'done'); R.move('r4', 'done'); await sleep(900); tabAt(3); await sleep(3200);
      R.move('r2', 'doing'); await sleep(900); tabAt(1); await sleep(3000);
    }
  };

  /* ---------- phone: the same app on a small screen ---------- */
  S.phone = async function () {
    await D.booted(); if (D.still) return;
    while (D.alive) { resetAll(); await sleep(1500); await work('a2', 'Make the cart remember items when the page reloads.', [['tool', 'Edit · src/cart/storage.js', 1500], ['tool', 'Bash · npm test', 1700]], 'Done. The cart keeps its items.'); await sleep(5000); }
  };
})();
