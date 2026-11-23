// Page name from a work folder (the "+" popup auto-fills it): last path segment, prettified. Pure; also loaded by tests.
// "C:\Users\me\my-app\" -> "My App", "/home/me/Website_v2" -> "Website V2", "MyApp" stays "MyApp", "C:\" -> "C Drive", "/" -> "".
(function (root) {
  function fromFolder(folder) {
    const parts = String(folder || '').trim().replace(/^"|"$/g, '').split(/[\\/]+/).filter(Boolean); // Windows and POSIX separators, trailing slashes
    let seg = parts.at(-1) || '';
    if (!seg) return '';
    if (/^[a-z]:$/i.test(seg)) return parts.length === 1 ? seg[0].toUpperCase() + ' Drive' : ''; // drive root
    seg = seg.replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
    const name = seg.split(' ').map(w => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' '); // keep MyApp / API as typed
    return name.slice(0, 40).trim();
  }
  const api = { fromFolder };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FmPageName = api;
})(typeof window !== 'undefined' ? window : globalThis);
