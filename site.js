// Page polish: scroll reveals, animated counters, gentle parallax glows, header shadow, current year. No tracking, no network. Respects reduced motion.
(function () {
  var d = document, root = d.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) root.classList.add('anim');
  function count(el) {
    var to = parseFloat(el.getAttribute('data-count')), suf = el.getAttribute('data-suffix') || '', t0 = null, dur = 1400;
    function step(t) { if (t0 === null) t0 = t; var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * e) + suf; if (p < 1) requestAnimationFrame(step); }
    el.textContent = '0' + suf; requestAnimationFrame(step);
  }
  function go() {
    var y = d.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
    var els = d.querySelectorAll('.reveal'), nums = d.querySelectorAll('[data-count]');
    if (reduce || !('IntersectionObserver' in window)) { for (var i = 0; i < els.length; i++) els[i].classList.add('in'); }
    else {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) {
        if (!e.isIntersecting) return; e.target.classList.add('in'); io.unobserve(e.target);
        var c = e.target.querySelectorAll('[data-count]'); for (var k = 0; k < c.length; k++) count(c[k]);
      }); }, { threshold: 0.12 });
      for (var j = 0; j < els.length; j++) io.observe(els[j]);
    }
    var top = d.querySelector('.top'), glows = d.querySelectorAll('.glow[data-speed]'), tick = false;
    function onScroll() {
      if (top) top.classList.toggle('stuck', window.scrollY > 8);
      if (reduce || tick) return; tick = true;
      requestAnimationFrame(function () { tick = false; var y = window.scrollY; for (var g = 0; g < glows.length; g++) glows[g].style.translate = '0 ' + Math.round(y * glows[g].getAttribute('data-speed')) + 'px'; });
    }
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', go); else go();
})();
