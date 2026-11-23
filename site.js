// Tiny page polish: scroll reveals, header shadow, current year. No tracking, no network. Respects reduced motion.
(function () {
  var d = document, root = d.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) root.classList.add('anim');
  function go() {
    var y = d.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
    var els = d.querySelectorAll('.reveal');
    if (reduce || !('IntersectionObserver' in window)) { for (var i = 0; i < els.length; i++) els[i].classList.add('in'); }
    else {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold: 0.12 });
      for (var j = 0; j < els.length; j++) io.observe(els[j]);
    }
    var top = d.querySelector('.top');
    if (top) { var f = function () { top.classList.toggle('stuck', window.scrollY > 8); }; f(); window.addEventListener('scroll', f, { passive: true }); }
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', go); else go();
})();
