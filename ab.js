// Headline A/B test: sticky random variant per visitor (?v=A|B|C|D forces one). Runs right after the h1 so there is no flash.
(function () {
  var V = {
    A: 'AI helpers that<br><span class="grad">do the work for you.</span>',
    B: 'Hand off the busywork<br><span class="grad">to AI helpers.</span>',
    C: 'Your own AI team.<br><span class="grad">No coding.</span>',
    D: 'Your inbox, invoices and errands.<br><span class="grad">Handled.</span>'
  };
  var keys = 'ABCD', q = new URLSearchParams(location.search).get('v'), k = 'ug_v', v;
  try { v = (q && V[q]) ? q : localStorage.getItem(k); } catch (e) {}
  if (!V[v]) v = keys[Math.floor(Math.random() * keys.length)];
  try { localStorage.setItem(k, v); } catch (e) {}
  window.UG_VARIANT = v;
  var h = document.getElementById('h1'); if (h) h.innerHTML = V[v];
})();
