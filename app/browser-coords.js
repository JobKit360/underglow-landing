// Live browser panel: maps a mouse position on the shown frame to a point on the real page. Pure; also loaded by tests.
// The frame is drawn "contain"-fitted inside its box, so there can be empty bars (letterbox) on two sides. There is one
// scale = min(boxW / pageW, boxH / pageH). A point in a bar clamps to the nearest page edge.
(function (root) {
  // box: { left, top, width, height } of the element in CSS px (getBoundingClientRect); page: { w, h } the page viewport in CSS px.
  // Returns the drawn frame rect inside the box.
  function fit(box, page) {
    const pw = page.w > 0 ? page.w : 1, ph = page.h > 0 ? page.h : 1, s = Math.min(box.width / pw, box.height / ph) || 1;
    const w = pw * s, h = ph * s;
    return { x: box.left + (box.width - w) / 2, y: box.top + (box.height - h) / 2, w, h, scale: s };
  }
  function toPage(clientX, clientY, box, page) {
    const f = fit(box, page), pw = page.w > 0 ? page.w : 1, ph = page.h > 0 ? page.h : 1;
    const cl = (v, m) => Math.min(Math.max(v, 0), m - 1);
    return { x: Math.round(cl((clientX - f.x) / f.scale, pw)), y: Math.round(cl((clientY - f.y) / f.scale, ph)) };
  }
  // Page size to ask for so a box of boxW x boxH (CSS px) shows the page 1:1 (sane limits).
  function viewportFor(boxW, boxH) {
    const c = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
    return { w: c(boxW, 320, 3840), h: c(boxH, 240, 2160) };
  }
  const api = { fit, toPage, viewportFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FmBrowserCoords = api;
})(typeof window !== 'undefined' ? window : globalThis);
