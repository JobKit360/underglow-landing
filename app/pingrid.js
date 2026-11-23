// Pinned panes on the page grid. The grid is 3 columns x 3 rows (9 slots). A pinned pane takes a whole column (3 slots), starting from the
// left. Everything else (agents and bots alike) shares the slots that are left. Pure maths, no page code, so it can be tested on its own.
// Drawn on a 24 x 6 grid so every share comes out whole: a column is 8 wide, a row is 2 tall.
(function (root) {
  const MAX_PINS = 2; // at least one column always stays free for the others
  // items: [{ key, pinned }] in the order they were placed. Returns null when nothing is pinned (the normal layout then applies).
  function plan(items, opt) {
    const maxPins = Math.max(0, Math.min(2, (opt && opt.maxPins) ?? MAX_PINS));
    const list = (items || []).filter(i => i && i.key != null);
    const pins = list.filter(i => i.pinned).slice(0, maxPins), pinKeys = new Set(pins.map(i => i.key));
    if (!pins.length) return null;
    const rest = list.filter(i => !pinKeys.has(i.key));
    const R = 3 - pins.length, cap = 3 * R;
    const overflow = rest.slice(0, Math.max(0, rest.length - cap)).map(i => i.key); // the ones placed longest ago make way
    const shown = rest.slice(overflow.length);
    const place = new Map();
    pins.forEach((p, i) => place.set(p.key, { col: 1 + i * 8, colSpan: 8, row: 1, rowSpan: 6, pinned: true }));
    const rows = Math.ceil(shown.length / R) || 1;
    for (let r = 0, at = 0; r < rows; r++) {
      const m = Math.min(R, shown.length - at), w = 8 * R / m;
      for (let c = 0; c < m; c++) place.set(shown[at + c].key, { col: 1 + 8 * pins.length + c * w, colSpan: w, row: 1 + r * (6 / rows), rowSpan: 6 / rows });
      at += m;
    }
    return { pins: pins.length, slots: { pinned: pins.length * 3, free: cap, used: shown.length }, place, overflow };
  }
  const api = { plan, MAX_PINS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FmPinGrid = api;
})(typeof window !== 'undefined' ? window : globalThis);
