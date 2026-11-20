// Point the Download button straight at the latest STABLE installer (.exe). Falls back to the releases page (the href already in the HTML).
// GitHub's /releases/latest already excludes prereleases and drafts; pickInstaller re-checks anyway so a mislabelled beta can never be linked.
(function () {
  var REPO = 'JobKit360/underglow-releases';
  // -> download url or null. Rejects prereleases, drafts, odd asset names, assets from another repo or not fully uploaded.
  function pickInstaller(rel) {
    if (!rel || rel.prerelease === true || rel.draft === true || rel.prerelease === undefined || rel.draft === undefined) return null;
    var prefix = 'https://github.com/' + REPO + '/releases/download/';
    var list = (rel.assets || []).filter(function (x) {
      return x && /^[\w.-]+-Setup-\d+\.\d+\.\d+\.exe$/i.test(x.name || '') && (x.state === undefined || x.state === 'uploaded') &&
        typeof x.browser_download_url === 'string' && x.browser_download_url.indexOf(prefix) === 0;
    });
    return list.length ? list[0].browser_download_url : null;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { pickInstaller: pickInstaller };
  if (typeof document === 'undefined') return;
  var a = document.getElementById('download');
  if (!a) return;
  fetch('https://api.github.com/repos/' + REPO + '/releases/latest')
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (rel) {
      var url = pickInstaller(rel);
      if (url) { a.href = url; a.setAttribute('download', ''); }
    })
    .catch(function () {});
})();
