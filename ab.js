// Headline A/B test: sticky random variant per visitor (?v=A|B|C|D forces one). Runs right after the h1 so there is no flash.
(function () {
  var V = {
    A: 'Your own AI team,<br><span class="grad">on your own computer.</span>',
    B: 'Bots with names,<br><span class="grad">jobs and schedules.</span>',
    C: 'Hand off the busywork<br><span class="grad">to your AI team.</span>',
    D: 'Routines that run themselves.<br><span class="grad">Quiet unless it matters.</span>'
  };
  var keys = 'ABCD', q = new URLSearchParams(location.search).get('v'), k = 'ug_v', v;
  try { v = (q && V[q]) ? q : localStorage.getItem(k); } catch (e) {}
  if (!V[v]) v = keys[Math.floor(Math.random() * keys.length)];
  try { localStorage.setItem(k, v); } catch (e) {}
  window.UG_VARIANT = v;
  var h = document.getElementById('h1'); if (h) h.innerHTML = V[v];
})();
