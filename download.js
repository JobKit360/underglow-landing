// Point the Download button straight at the latest installer (.exe). Falls back to the releases page (the href already in the HTML).
(function () {
  var a = document.getElementById('download');
  if (!a) return;
  fetch('https://api.github.com/repos/JobKit360/underglow-releases/releases/latest')
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (rel) {
      var asset = (rel.assets || []).filter(function (x) { return /\.exe$/i.test(x.name) && !/blockmap/i.test(x.name); })[0];
      if (asset) { a.href = asset.browser_download_url; a.setAttribute('download', ''); }
    })
    .catch(function () {});
})();
