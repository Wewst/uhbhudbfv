/**
 * Бэкенд: вся логика запросов к API. Ссылку на бэкенд задаёт фронт (Admin.html) в window.BACKEND_URL.
 */

(function () {
  'use strict';

  function getBase() {
    return (window.BACKEND_URL || '').replace(/\/$/, '');
  }

  function request(method, path, body) {
    var url = getBase() + path;
    var opts = {
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body && (method === 'POST' || method === 'PUT')) {
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error('API ' + r.status);
      return r.json();
    });
  }

  function getSumData() {
    return request('GET', '/api/sum');
  }

  function getDeals() {
    return request('GET', '/api/deals');
  }

  function addDeal(username, amount) {
    var name = String(username || '').trim().replace(/^@/, '') || 'user';
    return request('POST', '/api/deals', { username: name, amount: amount || 9000 });
  }

  window.AdminApi = {
    getSumData: getSumData,
    getDeals: getDeals,
    addDeal: addDeal
  };
})();
