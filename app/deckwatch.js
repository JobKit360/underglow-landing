// deckwatch.js: the ONE place that decides whether an agent lies on the desk (open) or on the pile (folded) in the HUD deck layout.
// The pane / card / drag code never picks an agent's placement itself: status changes come in through observe()/sweep(),
// the user's own moves through byHand(), touches through touch(), new agents made from this HUD through spawned().
// The page supplies the mechanics (io); this file only holds the rules.
//
// Per agent a small state machine on its status kind ('work' | 'attn' = needs the user / finished | 'rest' = idle):
//   a raw kind must hold for SETTLE[kind] ms before it counts (status flicker never thrashes a pane);
//   settled -> work : fold pending (open agents go back onto the pile once nothing holds them)
//   settled -> attn : opens on its own (finished / asking / needs the user); never auto-folds until it works again
//   settled -> rest : opens on its own when it was working (it stopped: finished / answered / set itself idle); otherwise nothing moves
// Holds (a pending fold waits while any is true): the user is carrying it; pointer over it, focus in it, text typed, a menu open;
// in hand (he pulled it out or made it here) for HAND_IDLE since his last touch; touched for TOUCH_IDLE.
// Sending it a message (sent()) is the opposite of a hold: the pane folds as soon as the agent is working, ignoring the pointer /
// focus / touch holds (only text typed in its box, a menu or a drag still keep it out) — until it next needs the user or he pulls it out.
// Exception: an agent in hand (the user pulled it out of the deck / made it here) is not folded by a message; it keeps its hand hold.
// Pile cards open only by dragging (byHand); a plain click on a card never reaches here.
// Settings → Agents → "Dock agents automatically" (localStorage agAutoDock, '0' = off): off, nothing ever folds on its own (working
// agents stay on the desk, new working agents start on the desk); agents needing the user still come out. the user's drags work as always.
(function () {
  const TOUCH_IDLE = 5 * 60e3, HAND_IDLE = 20 * 60e3;
  const SETTLE = { work: 2500, attn: 1200, rest: 1500 };
  const autoDock = () => { try { return localStorage.getItem('agAutoDock') !== '0'; } catch { return true; } };
  window.createDeckWatch = function (io) {
    // io: { on() deck layout active, kind(a), isOpen(id), saved(id) had a stored placement, setOpen(id, open, opt),
    //       dragging(id), busy(id), relayout(), loadHand() -> ids, saveHand(ids) }
    const S = new Map(); // id -> { kind (settled), cand (raw, settling), since, fold (pending fold) }
    const hand = new Set(io.loadHand()), touched = new Map([...hand].map(id => [id, Date.now()])); // after a reload the grace restarts
    const mine = new Set(); // made from this HUD, waiting to be seen
    // last settled kind per agent, kept over reloads / Prod-Dev switches: a reload must not re-open an agent the user folded while it
    // already needed him; only a real change to 'attn' (including one that happened while this HUD was closed) brings it out.
    const KK = 'agDeckKinds', kinds = (() => { try { const o = JSON.parse(localStorage.getItem(KK) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } })();
    let kindsT = 0; const kindsSave = () => { clearTimeout(kindsT); kindsT = setTimeout(() => { try { localStorage.setItem(KK, JSON.stringify(kinds)); } catch {} }, 300); };
    const kindSet = (id, k) => { if (kinds[id] !== k) { kinds[id] = k; kindsSave(); } };
    let timer = 0, timerAt = 0;
    const saveHand = () => io.saveHand([...hand]);
    const holdLeft = id => { const idle = Date.now() - (touched.get(id) || 0); return (hand.has(id) ? HAND_IDLE : TOUCH_IDLE) - idle; };
    function wake(ms) { // one timer: re-run the layout (and so sweep) when the earliest pending decision is due
      const at = Date.now() + Math.max(0, ms);
      if (timer && timerAt <= at) return;
      clearTimeout(timer); timerAt = at; timer = setTimeout(() => { timer = 0; io.relayout(); }, Math.max(0, ms) + 30);
    }
    function grab(id, open, opt) { // the user placed it: open = in hand, folded = out of hand
      const s = S.get(id); if (s) { s.fold = false; s.quick = false; }
      if (open) touch(id, true); else if (hand.delete(id)) saveHand();
      io.setOpen(id, open, opt || {});
    }
    function enter(id, s, prev) { // a settled kind change (prev = the settled kind before)
      kindSet(id, s.kind);
      if (s.kind === 'work') s.fold = autoDock() && io.isOpen(id);
      else { s.fold = false; if (s.kind === 'attn' || prev === 'work') { s.quick = false; io.setOpen(id, true, { auto: true }); } } // needs the user, or stopped working
    }
    function first(id, k) { // first sight this session
      const was = kinds[id]; kindSet(id, k);
      if (io.saved(id)) { if (!io.isOpen(id) && was && ((k === 'attn' && was !== 'attn') || (k === 'rest' && was === 'work'))) io.setOpen(id, true, { auto: true }); return; } // reload: keep where it lay unless it started needing the user or stopped working since (folded while already needing him / idle = stays folded)
      io.setOpen(id, k !== 'work' || !autoDock(), { auto: true, front: true }); // brand new: idle / needs the user on the desk (first slot, left), working on the pile
    }
    function tryFold(id, s) {
      if (s.kind !== 'work' || !io.isOpen(id) || !autoDock()) { s.fold = false; return; }
      if (io.busy(id, s.quick)) return; // re-checked on pointer leave / focus out (poke)
      if (!s.quick) { const left = holdLeft(id); if (left > 0) { wake(left); return; } }
      s.fold = false; s.quick = false; io.setOpen(id, false, { auto: true });
    }
    function observe(a) {
      if (!io.on()) return;
      const id = a.id; if (io.dragging(id)) return; // never decided while it is in the user's hand
      const k = io.kind(a), now = Date.now();
      let s = S.get(id);
      if (mine.delete(id)) { // the user just made it: on the desk, first slot (left), in hand, even if it starts working at once
        if (!s) { s = { kind: k, cand: k, since: now, fold: false }; S.set(id, s); }
        grab(id, true, { auto: false, front: true });
        s.fold = autoDock() && s.kind === 'work'; // already working: goes back onto the pile once the hold runs out
      }
      if (!s) { S.set(id, { kind: k, cand: k, since: now, fold: false }); first(id, k); return; }
      if (k !== s.cand) { s.cand = k; s.since = now; }
      if (s.cand !== s.kind) {
        const wait = SETTLE[s.cand] - (now - s.since);
        if (wait > 0) wake(wait); else { const prev = s.kind; s.kind = s.cand; enter(id, s, prev); }
      }
      if (s.fold) tryFold(id, s);
    }
    function sweep(list) {
      if (!io.on()) return;
      const ids = new Set(list.map(a => a.id));
      for (const id of S.keys()) if (!ids.has(id)) { S.delete(id); touched.delete(id); }
      if (list.length) for (const id of Object.keys(kinds)) if (!ids.has(id)) { delete kinds[id]; kindsSave(); } // forget removed agents
      if ([...hand].some(id => !ids.has(id)) && list.length) { for (const id of hand) if (!ids.has(id)) hand.delete(id); saveHand(); }
      list.forEach(observe);
    }
    function sent(id) { // the user messaged it from its pane: no hold; fold once it works (now, if it already is)
      if (hand.has(id)) { touch(id); return; } // he pulled it out himself: it stays on the desk (normal in-hand hold, refreshed)
      if (!autoDock()) return; // auto-docking off: messaging never folds it
      touched.delete(id);
      const s = S.get(id); if (!s) return;
      s.quick = true; if (s.kind === 'work' && io.isOpen(id)) { s.fold = true; setTimeout(io.relayout, 0); }
    }
    function touch(id, hold) { touched.set(id, Date.now()); if (hold && !hand.has(id)) { hand.add(id); saveHand(); } }
    const pending = id => !!S.get(id)?.fold;
    function poke(id) { if (pending(id)) setTimeout(io.relayout, 0); } // pointer left / focus left a pane waiting to fold
    return { observe, sweep, touch, poke, pending, spawned: id => { mine.add(id); }, sent, byHand: grab, held: id => holdLeft(id) > 0 };
  };
})();
