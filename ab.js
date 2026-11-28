// Headline A/B test: sticky random variant per visitor (?v=A|B forces one). Runs right after the h1 so there is no flash.
(function () {
  var V = {
    A: 'Your AI builds it.<br><span class="grad">You test it right here.</span>',
    B: 'Every change gets a test link.<br><span class="grad">Click, try, approve.</span>'
  };
  var keys = 'AB', q = new URLSearchParams(location.search).get('v'), k = 'ug_v2', v;
  try { v = (q && V[q]) ? q : localStorage.getItem(k); } catch (e) {}
  if (!V[v]) v = keys[Math.floor(Math.random() * keys.length)];
  try { localStorage.setItem(k, v); } catch (e) {}
  window.UG_VARIANT = v;
  var h = document.getElementById('h1'); if (h) h.innerHTML = V[v];
})();
