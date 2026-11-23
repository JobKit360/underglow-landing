// Shared size + position for the Roadmap, Map and Workflow popups (see popdock.css). One rule set: same box, same row drop. Git keeps its own (gitgraph.js).
window.FmPopDock = (() => {
  // where the icon row sits once dropped to the counter's place; sets --rb-gy so popdock.css can slide it there
  function rowDrop(z) {
    const slot = z.querySelector(':scope > .dkres'), row = slot?.querySelector('.sp-ics'); if (!slot || !row) return null;
    const sr = slot.getBoundingClientRect(), rr = row.getBoundingClientRect(), tf = getComputedStyle(row).transform, nat = rr.top - (tf && tf !== 'none' ? new DOMMatrix(tf).m42 : 0);
    const gy = Math.max(0, Math.round(sr.bottom - 2 - rr.height - nat)); slot.style.setProperty('--rb-gy', gy + 'px'); return nat + gy;
  }
  // pg = the page ({g}); returns false when it could not measure (caller keeps the old box)
  function place(dock, pg) {
    if (!pg) return false;
    const z = document.getElementById('dzone-' + pg.g), phone = matchMedia('(max-width: 900px)').matches;
    if (phone || !z) { Object.assign(dock.style, { left: '8px', top: '56px', width: (innerWidth - 16) + 'px', height: (innerHeight - 64) + 'px' }); return true; }
    const zr = z.getBoundingClientRect(); if (!zr.width) return false;
    const frame = z.closest('.agpage')?.parentElement?.getBoundingClientRect(), left = frame?.width ? Math.min(zr.left - 12, frame.left + 20) : zr.left - 12, right = zr.right + 3; // same edges as the Git dock
    const rowTop = rowDrop(z), top = zr.top, bot = rowTop != null ? rowTop - 8 : zr.bottom;
    Object.assign(dock.style, { left: Math.round(left) + 'px', top: Math.round(top) + 'px', width: Math.round(right - left) + 'px', height: Math.max(160, Math.round(bot - top)) + 'px' });
    return true;
  }
  const clear = () => document.querySelectorAll('.dkres').forEach(s => s.style.removeProperty('--rb-gy'));
  return { place, clear };
})();
