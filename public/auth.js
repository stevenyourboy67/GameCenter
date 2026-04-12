(function () {
  const KEY = 'kah_sess';
  const _fetch = window.fetch.bind(window);

  window.setSessionToken = function (t) { localStorage.setItem(KEY, t || ''); };
  window.clearSessionToken = function () { localStorage.removeItem(KEY); };
  window.getSessionToken = function () { return localStorage.getItem(KEY) || ''; };

  window.fetch = function (url, opts) {
    const token = localStorage.getItem(KEY);
    if (token && typeof url === 'string' &&
        (url[0] === '/' || url.startsWith(location.origin))) {
      opts = Object.assign({}, opts);
      opts.headers = Object.assign({ 'X-Session-Token': token }, opts.headers || {});
    }
    return _fetch(url, opts);
  };

  window.doLogout = function () {
    localStorage.removeItem(KEY);
    window.location.href = '/logout';
  };
})();
