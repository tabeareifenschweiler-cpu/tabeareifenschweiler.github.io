/* =============================================================
   Cookie-Hinweis + Google Analytics (Opt-in) – tabeareifenschweiler.de
   Eine Datei für alle Seiten der Domain (Portfolio, /Stelldirvor,
   /Beobachtet). Die Seiten selbst setzen keine Cookies; localStorage
   hält nur Sprache und diese Entscheidung. Analytics lädt erst nach
   Einwilligung. Einbinden mit <script src="/consent.js" defer>.

   Auf den Portfolio-Seiten liegt der Kasten als <aside class="consent">
   im HTML und wird über graphic-start.css gestaltet; überall sonst
   erzeugt dieses Skript Kasten und Stil selbst (weiß, schwarze Kontur).
   ============================================================= */
(function () {
  const GA_ID = 'G-7M7PZ918YY';
  const KEY = 'consent';

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function remember(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function loadAnalytics() {
    if (!GA_ID || window.__gaLoaded) return;
    window.__gaLoaded = true;
    const s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true });
  }

  const TEXT = {
    de: { h: 'Cookies', p: 'Diese Seite nutzt Google Analytics nur mit deiner Einwilligung. Alles andere funktioniert ohne Cookies. Details in der <a href="/imprint.html?lang=de#datenschutz">Datenschutzerklärung</a>.', yes: 'Akzeptieren', no: 'Ablehnen' },
    en: { h: 'Cookies', p: 'This site only uses Google Analytics with your consent. Everything else works without cookies. Details in the <a href="/imprint.html?lang=en#privacy">privacy policy</a>.', yes: 'Accept', no: 'Decline' }
  };

  function build() {
    const lang = (document.documentElement.lang || 'de').slice(0, 2) === 'en' ? 'en' : 'de';
    const t = TEXT[lang];
    const el = document.createElement('aside');
    el.className = 'consent consent--own'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', t.h); el.hidden = true;
    el.innerHTML = '<div><h2>' + t.h + '</h2><p>' + t.p + '</p><div class="consent__row">'
      + '<button class="consent__btn consent__btn--yes" type="button" data-consent="granted">' + t.yes + '</button>'
      + '<button class="consent__btn" type="button" data-consent="denied">' + t.no + '</button></div></div>';
    const css = document.createElement('style');
    css.textContent =
      'aside.consent--own{position:fixed;z-index:9999;left:24px;bottom:24px;width:min(420px,calc(100vw - 48px));box-sizing:border-box;padding:22px 24px;' +
      'background:#fff;border:2px solid #000;color:#000;font-family:"Neue Haas Grotesk Display Pro","Neue Haas Grotesk Display",-apple-system,system-ui,sans-serif;font-size:16px;line-height:1.3}' +
      '.consent--own[hidden]{display:none}.consent--own h2{margin:0 0 8px;font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;font-size:17px;font-weight:400;letter-spacing:.02em;text-transform:uppercase}' +
      '.consent--own p{margin:0 0 16px}.consent--own a{color:inherit;text-decoration:underline;text-underline-offset:.12em}' +
      '.consent__row{display:flex;gap:10px}.consent--own .consent__btn{flex:1 1 0;padding:.6em 1em;cursor:pointer;font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;font-size:15px;line-height:1;' +
      'letter-spacing:.02em;text-transform:uppercase;background:#fff;color:#000;border:2px solid #000}' +
      '.consent--own .consent__btn--yes{background:#000;color:#fff}.consent--own .consent__btn:hover,.consent--own .consent__btn:focus-visible{background:#000;color:#fff;outline:none}';
    document.head.appendChild(css);
    document.body.appendChild(el);
    return el;
  }

  function init() {
    /* eigener Kasten nur auf den Portfolio-Seiten (aside.consent); andere
       Elemente mit derselben Klasse (Kontaktformular) sind nicht gemeint */
    let box = document.querySelector('aside.consent');
    if (!box) box = build();
    const c = stored();
    if (c === 'granted') loadAnalytics();
    else if (c !== 'denied') box.hidden = false;
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-consent]');
      if (!b) return;
      remember(b.dataset.consent);
      box.hidden = true;
      if (b.dataset.consent === 'granted') loadAnalytics();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
