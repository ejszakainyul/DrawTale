/*
 * DrawTale – API kliens.
 * Minden kérés az /api/v1 alá megy, JSON-nal; a hibák egységes formában
 * jönnek: { error: { code, message, requestId } } (SRS 3.2.7).
 * A rövid életű tokent lejáratkor csendben megújítja (UC-02).
 */
(function (g) {
  'use strict';

  var cfg = g.DT_CONFIG || {};
  var TOKENS = 'drawtale.tokens';
  var USER = 'drawtale.user';

  function ApiError(status, err) {
    err = err || {};
    this.name = 'ApiError';
    this.status = status;
    this.code = err.code || 'HTTP_' + status;
    this.message = err.message || 'Váratlan hiba történt. Próbáld újra!';
    this.requestId = err.requestId || null;
    this.details = err.details || null;
  }
  ApiError.prototype = Object.create(Error.prototype);

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function writeJson(key, v) {
    try {
      if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v));
    } catch (e) { /* tele / privát mód */ }
  }

  function getTokens() { return readJson(TOKENS); }
  function setTokens(t) { writeJson(TOKENS, t); }
  function getUser() { return readJson(USER); }
  function setUser(u) { writeJson(USER, u); }

  function clearSession() {
    setTokens(null);
    setUser(null);
  }

  function transport(method, path, body, headers) {
    if (cfg.mock) {
      return g.DTMock.handle({ method: method, path: path, body: body, headers: headers });
    }
    var init = { method: method, headers: headers };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) {
      init.body = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
    return fetch(cfg.apiBase + path, init).then(function (res) {
      if (res.status === 204) return { status: 204, body: null };
      return res.json().then(
        function (json) { return { status: res.status, body: json }; },
        function () { return { status: res.status, body: null }; }
      );
    });
  }

  var refreshing = null;
  function refresh() {
    if (refreshing) return refreshing;
    var t = getTokens();
    if (!t || !t.refreshToken) return Promise.resolve(false);
    refreshing = transport('POST', '/auth/refresh', { refreshToken: t.refreshToken }, {})
      .then(function (res) {
        if (res.status === 200) {
          setTokens({ accessToken: res.body.accessToken, refreshToken: res.body.refreshToken });
          return true;
        }
        clearSession();
        return false;
      }, function () { return false; })
      .then(function (ok) { refreshing = null; return ok; });
    return refreshing;
  }

  function request(method, path, body, opts) {
    opts = opts || {};
    var headers = { Accept: 'application/json' };
    var t = getTokens();
    if (t && t.accessToken && opts.auth !== false) headers.Authorization = 'Bearer ' + t.accessToken;

    return Promise.resolve()
      .then(function () { return transport(method, path, body, headers); })
      .catch(function () {
        throw new ApiError(0, { code: 'NETWORK', message: 'Nincs internetkapcsolat. Próbáld újra, ha lesz net!' });
      })
      .then(function (res) {
        if (res.status === 401 && opts.auth !== false && !opts._retried && t && t.refreshToken) {
          return refresh().then(function (ok) {
            if (ok) return request(method, path, body, Object.assign({}, opts, { _retried: true }));
            g.dispatchEvent(new CustomEvent('drawtale:logout'));
            throw new ApiError(401, res.body && res.body.error);
          });
        }
        if (res.status >= 400) throw new ApiError(res.status, res.body && res.body.error);
        return res.body;
      });
  }

  function storeLogin(data) {
    setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    setUser(data.user);
    return data.user;
  }

  var api = {
    ApiError: ApiError,
    request: request,
    get: function (p) { return request('GET', p); },
    post: function (p, b) { return request('POST', p, b === undefined ? {} : b); },
    patch: function (p, b) { return request('PATCH', p, b); },
    put: function (p, b) { return request('PUT', p, b); },
    del: function (p, b) { return request('DELETE', p, b); },

    user: getUser,
    isLoggedIn: function () { return !!(getTokens() && getUser()); },

    login: function (email, password) {
      return request('POST', '/auth/login', { email: email, password: password }, { auth: false }).then(storeLogin);
    },
    register: function (data) {
      return request('POST', '/auth/register', data, { auth: false }).then(storeLogin);
    },
    resetPassword: function (token, password) {
      return request('POST', '/auth/reset', { token: token, password: password }, { auth: false }).then(storeLogin);
    },
    logout: function () {
      var t = getTokens();
      var done = function () { clearSession(); };
      if (!t) return Promise.resolve(done());
      return request('POST', '/auth/logout', { refreshToken: t.refreshToken }).then(done, done);
    },
    refreshMe: function () {
      return request('GET', '/users/me').then(function (r) { setUser(r.user); return r.user; });
    },
    clearSession: clearSession,

    /** Kép elérési útja → böngészőben használható URL (Promise). */
    media: function (path) {
      if (!path) return Promise.resolve(null);
      if (/^(https?:|data:|blob:)/.test(path) || path.indexOf('assets/') === 0) return Promise.resolve(path);
      if (cfg.mock) return g.DTMock.mediaUrl(path);
      return Promise.resolve(cfg.mediaBase + path);
    }
  };

  g.DT = g.DT || {};
  g.DT.api = api;
})(window);
