/* Stand-in for the Workbox's remote-screen viewer (noVNC) in the landing-page demo. Instead of streaming a real Linux screen it draws a small
   made-up Linux desktop (a browser showing the sample shop and a terminal running tests) into the same box the real viewer would use. */
export default class RFB {
  constructor(target, url, opts) {
    this._l = {}; this.scaleViewport = true; this.resizeSession = false; this.background = ''; this.showDotCursor = false; this.viewOnly = false; this.qualityLevel = 5; this.compressionLevel = 1;
    const d = this._d = document.createElement('div'); d.className = 'ugdesk';
    d.innerHTML = `
      <div class="ugd-wall"></div>
      <div class="ugd-top"><span class="ugd-apps">Applications</span><span class="ugd-sp"></span><span class="ugd-clock"></span></div>
      <div class="ugd-win ugd-br"><div class="ugd-tb"><i></i><i></i><i></i><b>Storefront: Firefox</b></div>
        <div class="ugd-url"><span>‹ ›</span><em>localhost:3000/cart</em></div>
        <div class="ugd-page"><div class="ugd-nav"><b>Storefront</b><span>Shop</span><span>Cart (3)</span></div>
          <div class="ugd-cols"><div class="ugd-items">
            <div class="ugd-it"><div class="ugd-img" style="--c:#6aa3ff"></div><div><b>Canvas tote bag</b><small>Qty 1</small></div><span>$24.00</span></div>
            <div class="ugd-it"><div class="ugd-img" style="--c:#f2b33d"></div><div><b>Ceramic mug</b><small>Qty 2</small></div><span>$28.00</span></div>
          </div><div class="ugd-sum"><b>Order summary</b><p>Subtotal<span>$52.00</span></p><p>Coupon SAVE10<span class="g">-$5.20</span></p><p>Shipping<span>$4.00</span></p><p class="t">Total<span>$50.80</span></p><div class="ugd-btn">Checkout</div></div></div></div></div>
      <div class="ugd-win ugd-tm"><div class="ugd-tb"><i></i><i></i><i></i><b>Terminal</b></div><pre class="ugd-pre"></pre></div>
      <div class="ugd-dock"><span></span><span></span><span></span><span></span></div>`;
    target.appendChild(d);
    const pre = d.querySelector('.ugd-pre'), clock = d.querySelector('.ugd-clock');
    const lines = ['$ npm test', '', '> storefront@1.0.0 test', '> node --test test/', '', '✔ cart adds and removes items', '✔ cart remembers items after reload', '✔ coupon comes off before shipping', '✔ checkout places an order', '✔ search finds products', '✔ money formats cents', '', 'ℹ tests 18   ℹ pass 18   ℹ fail 0', '$ '];
    let i = 0; const tick = () => { if (!d.isConnected) return; pre.textContent = lines.slice(0, ++i).join('\n') + (i >= lines.length ? '█' : ''); if (i > lines.length + 3) i = 0; };
    this._t = setInterval(tick, 700); tick();
    const upd = () => { const t = new Date(); clock.textContent = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }; upd(); this._c = setInterval(upd, 20000);
    // the desktop is drawn at 1920x1080 and scaled to whatever box the app gives it
    const fit = () => { const w = target.clientWidth || 1, h = target.clientHeight || 1, s = Math.min(w / 1920, h / 1080); d.style.transform = `scale(${s})`; d.style.left = (w - 1920 * s) / 2 + 'px'; d.style.top = (h - 1080 * s) / 2 + 'px'; };
    this._ro = new ResizeObserver(fit); this._ro.observe(target); fit();
    if (!document.getElementById('ugdeskcss')) { const l = document.createElement('link'); l.id = 'ugdeskcss'; l.rel = 'stylesheet'; l.href = 'demo-desk.css'; document.head.appendChild(l); }
    setTimeout(() => this._fire('connect'), 400);
  }
  addEventListener(t, f) { (this._l[t] ||= []).push(f); }
  removeEventListener(t, f) { this._l[t] = (this._l[t] || []).filter(x => x !== f); }
  _fire(t) { (this._l[t] || []).forEach(f => f({ detail: {} })); }
  disconnect() { clearInterval(this._t); clearInterval(this._c); this._ro?.disconnect(); this._d.remove(); }
  focus() {}
}
