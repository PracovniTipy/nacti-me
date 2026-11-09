// BrosWars Partner – doporučení od tvůrců (https://broswarsstudio.chatnelo.com/).
// Odkaz tvůrce vede na nacti.me/?bw=<id>. Uložíme poslední kliknutí (poslední vyhrává) a parametr z adresy
// odstraníme. Když je zařízení přihlášené k Načti.me, kliknutí se připíše k účtu, aby šlo platbu přiřadit tvůrci.
(function () {
  'use strict';
  var KEY = 'bw_click', DONE = 'bw_attached', WINDOW = 365 * 864e5, ID = /^bw_[a-z0-9]{20}$/;
  function read() {
    try { var c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && ID.test(c.id) && +c.at > 0 ? c : null; } catch (e) { return null; }
  }
  try {
    var u = new URL(location.href), v = u.searchParams.get('bw');
    if (v !== null) {
      if (ID.test(v)) { try { localStorage.setItem(KEY, JSON.stringify({ id: v, at: Date.now() })); } catch (e) {} }
      u.searchParams.delete('bw');
      history.replaceState(history.state, '', u.pathname + (u.search === '?' ? '' : u.search) + u.hash);
    }
  } catch (e) {}

  // Platné kliknutí (nejvýš 365 dní staré), jinak null
  function click() { var c = read(); return c && Date.now() - c.at <= WINDOW ? c.id : null; }

  // Připíše kliknutí k přihlášenému účtu (každé kliknutí jen jednou)
  function attach(api) {
    var id = click(), t = null;
    try { t = localStorage.getItem('nacti_token'); if (localStorage.getItem(DONE) === id) return; } catch (e) { return; }
    api = (api || (window.NACTI && window.NACTI.apiUrl) || '').replace(/\/$/, '');
    if (!id || !t || !api || !window.fetch) return;
    fetch(api + '/aff/attach', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ click_id: id }) })
      .then(function (r) { if (r.ok) { try { localStorage.setItem(DONE, id); } catch (e) {} } })
      .catch(function () {});
  }

  window.BW = { click: click, attach: attach };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { attach(); });
  else attach();
})();
