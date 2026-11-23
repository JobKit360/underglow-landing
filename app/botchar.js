// Bot characters (Bots page): little SVG critters drawn from a bot's look { body, color, acc } and its state, which sets the face and a
// small animation (idle: blinks and bobs · working: busy eyes and a thinking bubble · needs_you: "!" and raised brows · paused: asleep,
// floating z's · error: dizzy). Lists must match bots.mjs (BODIES / COLORS / ACCS).
(() => {
  const BODIES = ['blob', 'bot', 'cat', 'ghost', 'frog', 'bear', 'owl', 'slime'];
  const COLORS = ['#5B8DEF', '#E8655A', '#3DBE8B', '#F2B33D', '#A46BE8', '#EF7FB1', '#3EC1D3', '#8C9AAF', '#F08A3C', '#7BC043'];
  const ACCS = ['none', 'antenna', 'hat', 'headphones', 'bow', 'sprout', 'crown', 'glasses'];
  const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255;
    const m = v => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f); return '#' + [m(r), m(g), m(b)].map(v => v.toString(16).padStart(2, '0')).join(''); };
  // body: shape (+ ears etc.), where the eyes and mouth go, and whether the face sits on a dark screen (robot)
  function body(kind, c, d, l) {
    switch (kind) {
      case 'bot': return { y: 56, my: 67, screen: true, svg: `<rect x="16" y="26" width="68" height="60" rx="17" fill="${c}"/><rect x="24" y="37" width="52" height="38" rx="11" fill="#1A1E29"/><rect x="10" y="48" width="7" height="16" rx="3" fill="${d}"/><rect x="83" y="48" width="7" height="16" rx="3" fill="${d}"/>` };
      case 'cat': return { y: 58, my: 69, svg: `<path d="M22 44 L27 15 L45 32 Z M55 32 L73 15 L78 44 Z" fill="${c}"/><path d="M27 23 L30 32 L37 30 Z M73 23 L70 32 L63 30 Z" fill="${l}"/><ellipse cx="50" cy="60" rx="35" ry="30" fill="${c}"/><path d="M14 62 L28 63 M14 70 L28 67 M86 62 L72 63 M86 70 L72 67" stroke="${d}" stroke-width="1.6" stroke-linecap="round"/>` };
      case 'ghost': return { y: 52, my: 64, svg: `<path d="M17 56 C17 34 32 20 50 20 C68 20 83 34 83 56 L83 88 L74 80 L65 88 L56 80 L47 88 L38 80 L29 88 L17 80 Z" fill="${c}"/>` };
      case 'frog': return { y: 39, my: 67, svg: `<ellipse cx="50" cy="65" rx="37" ry="25" fill="${c}"/><circle cx="33" cy="40" r="13" fill="${c}"/><circle cx="67" cy="40" r="13" fill="${c}"/><ellipse cx="50" cy="77" rx="20" ry="7" fill="${l}" opacity=".55"/>`, ex: 17 };
      case 'bear': return { y: 56, my: 70, svg: `<circle cx="25" cy="31" r="11" fill="${c}"/><circle cx="75" cy="31" r="11" fill="${c}"/><circle cx="25" cy="31" r="5.5" fill="${l}"/><circle cx="75" cy="31" r="5.5" fill="${l}"/><circle cx="50" cy="59" r="32" fill="${c}"/><ellipse cx="50" cy="70" rx="13" ry="9.5" fill="${l}"/><ellipse cx="50" cy="65.5" rx="4" ry="3" fill="#2A2230"/>` };
      case 'owl': return { y: 52, my: 64, owl: true, svg: `<path d="M21 36 L25 16 L39 29 Z M61 29 L75 16 L79 36 Z" fill="${d}"/><ellipse cx="50" cy="58" rx="33" ry="32" fill="${c}"/><ellipse cx="50" cy="75" rx="18" ry="13" fill="${l}"/><path d="M30 73 q3 3 6 0 M42 79 q3 3 6 0 M54 79 q3 3 6 0 M64 73 q3 3 6 0" stroke="${d}" stroke-width="1.4" fill="none" opacity=".6"/>` };
      case 'slime': return { y: 60, my: 71, svg: `<path d="M50 17 C58 34 85 45 85 66 C85 82 69 90 50 90 C31 90 15 82 15 66 C15 45 42 34 50 17 Z" fill="${c}"/><ellipse cx="34" cy="55" rx="5" ry="8" fill="#fff" opacity=".35" transform="rotate(-20 34 55)"/>` };
      default: return { y: 56, my: 68, svg: `<path d="M50 21 C73 21 87 37 87 58 C87 79 71 90 50 90 C29 90 13 79 13 58 C13 37 27 21 50 21 Z" fill="${c}"/>` };
    }
  }
  function face(b, st) {
    const y = b.y, ex = b.ex || 12, L = 50 - ex, R = 50 + ex, ink = b.screen ? '#9FF3FF' : '#22202B', my = b.my;
    let eyes, mouth, brows = '';
    const ring = b.owl ? `<circle cx="${L}" cy="${y}" r="10.5" fill="#fff"/><circle cx="${R}" cy="${y}" r="10.5" fill="#fff"/>` : '';
    if (st === 'paused') eyes = `<path d="M${L - 5} ${y} q5 4 10 0 M${R - 5} ${y} q5 4 10 0" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    else if (st === 'error') eyes = `<path d="M${L - 4} ${y - 4} l8 8 m0 -8 l-8 8 M${R - 4} ${y - 4} l8 8 m0 -8 l-8 8" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`;
    else { const ry = st === 'needs_you' ? 7.6 : 6.4; eyes = `<g class="bce">${ring}<ellipse cx="${L}" cy="${y}" rx="5.2" ry="${ry}" fill="${ink}"/><ellipse cx="${R}" cy="${y}" rx="5.2" ry="${ry}" fill="${ink}"/><g class="bcp"><circle cx="${L + 1.8}" cy="${y - 2.4}" r="1.8" fill="#fff"/><circle cx="${R + 1.8}" cy="${y - 2.4}" r="1.8" fill="#fff"/></g></g>`; }
    if (st === 'needs_you') brows = `<path d="M${L - 6} ${y - 12} q6 -4 11 -1 M${R - 5} ${y - 13} q5 -3 11 1" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    if (st === 'working') mouth = `<ellipse cx="50" cy="${my}" rx="3" ry="2.6" fill="${ink}"/>`;
    else if (st === 'needs_you') mouth = `<ellipse cx="50" cy="${my + 1}" rx="3.6" ry="4.4" fill="${ink}"/>`;
    else if (st === 'paused') mouth = `<path d="M46 ${my} h8" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;
    else if (st === 'error') mouth = `<path d="M43 ${my + 1} q3.5 -3 7 0 t7 0" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    else mouth = `<path d="M44 ${my - 1} q6 5.5 12 0" stroke="${ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    const cheeks = b.screen ? '' : `<ellipse cx="${L - 7}" cy="${y + 9}" rx="5" ry="3" fill="#FF6F91" opacity=".35"/><ellipse cx="${R + 7}" cy="${y + 9}" rx="5" ry="3" fill="#FF6F91" opacity=".35"/>`;
    const beak = b.owl ? `<path d="M46 ${y + 7} L54 ${y + 7} L50 ${y + 13} Z" fill="#F2B33D"/>` : '';
    return cheeks + eyes + brows + (b.owl ? beak : mouth);
  }
  function acc(kind, c, d, b) {
    const top = { frog: 26, cat: 26, bear: 26, owl: 24, ghost: 21, slime: 18, bot: 27 }[b] ?? 22;
    switch (kind) {
      case 'antenna': return `<path d="M50 ${top} V${top - 13}" stroke="${d}" stroke-width="3" stroke-linecap="round"/><circle class="bca" cx="50" cy="${top - 15}" r="4.5" fill="#FF6F91"/>`;
      case 'hat': return `<rect x="30" y="${top - 3}" width="40" height="6" rx="3" fill="#2A2733"/><rect x="37" y="${top - 21}" width="26" height="20" rx="4" fill="#2A2733"/><rect x="37" y="${top - 8}" width="26" height="4" fill="#E8655A"/>`;
      case 'headphones': return `<path d="M17 ${top + 30} C17 ${top - 10} 83 ${top - 10} 83 ${top + 30}" stroke="#2A2733" stroke-width="5" fill="none"/><rect x="9" y="${top + 22}" width="13" height="20" rx="6" fill="#2A2733"/><rect x="78" y="${top + 22}" width="13" height="20" rx="6" fill="#2A2733"/>`;
      case 'bow': return `<g transform="translate(68 ${top + 2}) rotate(18)"><path d="M0 0 L-12 -8 L-12 8 Z M0 0 L12 -8 L12 8 Z" fill="#FF6F91"/><circle r="3.5" fill="#E04F7A"/></g>`;
      case 'sprout': return `<path d="M50 ${top + 1} V${top - 10}" stroke="#3E9B4F" stroke-width="2.6" stroke-linecap="round"/><path d="M50 ${top - 9} C42 ${top - 20} 33 ${top - 12} 36 ${top - 7} C41 ${top - 5} 47 ${top - 6} 50 ${top - 9} Z M50 ${top - 9} C58 ${top - 22} 68 ${top - 14} 64 ${top - 8} C59 ${top - 6} 53 ${top - 6} 50 ${top - 9} Z" fill="#7BC043"/>`;
      case 'crown': return `<path d="M33 ${top + 2} L35 ${top - 14} L43 ${top - 5} L50 ${top - 17} L57 ${top - 5} L65 ${top - 14} L67 ${top + 2} Z" fill="#F2C94C" stroke="#D9A82B" stroke-width="1.5" stroke-linejoin="round"/><circle cx="50" cy="${top - 3}" r="2.2" fill="#E8655A"/>`;
      case 'glasses': return '';
      default: return '';
    }
  }
  function glasses(b) { const y = b.y, ex = b.ex || 12; return `<g fill="none" stroke="#2A2733" stroke-width="2.4"><circle cx="${50 - ex}" cy="${y}" r="9"/><circle cx="${50 + ex}" cy="${y}" r="9"/><path d="M${50 - ex + 9} ${y} H${50 + ex - 9}"/></g>`; }
  function bubble(st) {
    if (st === 'working') return `<g class="bcb"><path d="M74 4 h20 a6 6 0 0 1 6 6 v8 a6 6 0 0 1 -6 6 h-12 l-6 5 v-5 h-2 a6 6 0 0 1 -6 -6 v-8 a6 6 0 0 1 6 -6 z" fill="#fff" opacity=".95"/><circle class="d1" cx="78" cy="14" r="2.2" fill="#4A8FE8"/><circle class="d2" cx="84" cy="14" r="2.2" fill="#4A8FE8"/><circle class="d3" cx="90" cy="14" r="2.2" fill="#4A8FE8"/></g>`;
    if (st === 'needs_you') return `<g class="bcb"><circle cx="86" cy="14" r="11" fill="#F2B33D"/><path d="M86 8 V15" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><circle cx="86" cy="20" r="1.8" fill="#fff"/></g>`;
    if (st === 'paused') return `<g class="bcz" fill="#AEB4C6" font-family="system-ui,sans-serif" font-weight="700"><text x="74" y="22" font-size="11">z</text><text x="83" y="12" font-size="8">z</text></g>`;
    if (st === 'error') return `<path class="bcb" d="M84 10 q-6 9 0 12 q6 -3 0 -12 z" fill="#7CC8FF"/>`;
    return '';
  }
  // look → SVG string. state: idle | working | needs_you | paused | error. opts.still = no animation.
  function draw(look, state = 'idle', opts = {}) {
    const k = BODIES.includes(look?.body) ? look.body : 'blob', c = COLORS.includes(look?.color) ? look.color : COLORS[0], a = ACCS.includes(look?.acc) ? look.acc : 'none';
    const d = shade(c, -0.22), l = shade(c, 0.45), b = body(k, c, d, l), st = ['working', 'needs_you', 'paused', 'error'].includes(state) ? state : 'idle';
    const behind = a === 'headphones' ? acc(a, c, d, k) : '', front = a !== 'headphones' && a !== 'glasses' ? acc(a, c, d, k) : '';
    return `<svg class="bchar s-${st}${opts.still ? ' still' : ''}" viewBox="0 0 100 100" aria-hidden="true"><ellipse class="bcs" cx="50" cy="94" rx="26" ry="4" fill="#000" opacity=".22"/><g class="bcbody">${behind}${b.svg}<ellipse cx="38" cy="36" rx="10" ry="6" fill="#fff" opacity="${b.screen ? 0 : .18}" transform="rotate(-25 38 36)"/>${front}${b.screen ? '' : ''}<g class="bcf">${face(b, st)}${a === 'glasses' ? glasses(b) : ''}</g></g>${opts.still ? '' : bubble(st)}</svg>`;
  }
  const random = () => ({ body: BODIES[Math.random() * BODIES.length | 0], color: COLORS[Math.random() * COLORS.length | 0], acc: ACCS[Math.random() * ACCS.length | 0] });
  window.BotChar = { draw, random, BODIES, COLORS, ACCS };
})();
