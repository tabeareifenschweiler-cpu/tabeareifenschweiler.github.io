/* =============================================================
   Startseite → Projektseite

   Zwei Phasen:
     1. MORPH   Der Ordner wird aus dem Stapel gezogen. Seine 9 Polygon-
                punkte werden von der Stapelform auf die Projektform
                interpoliert. Beide Formen haben identische x-Werte –
                nur y ändert sich, der Morph ist deshalb exakt.
     2. AUFKLAPP Der Ordner expandiert per clip-path von der Bühne auf den
                vollen Viewport. Ab da ist es ein normales Dokument.

   Zielform nach Anwendungsbeispiele/Projektansicht.svg: der Ordner läuft
   randlos von 0 bis 1920, Reiteroberkante 55.81, Korpusoberkante 126.38,
   Unterkante 1080. Der Reiter behält seine x-Position aus dem Stapel.
   Deshalb ändern sich hier x UND y – beides wird interpoliert.
   ============================================================= */
(() => {
  'use strict';

  const OPEN_MS    = 600;         /* Ordner steigt (Morph) bis nur die Fläche bleibt; Stapel sinkt */
  const SHEET_LAG  = 120;         /* Blatt (weißer Ordner mit Inhalt) setzt kurz danach an … */
  const SHEET_MS   = 600;         /* … und kommt in 600 ms hoch (muss zu .pv-body/.pv-tab in project-system.css passen) */
  const TUCK_MS    = 340;         /* Blatt zurück in den Ordner: 300 ms Transition + Reserve, erst dann ausblenden */
  const CLOSE_MS   = 420;         /* Ordner sinkt zurück in den Stapel */

  /* Ordner mit eigener Projektseite. Die Zielform wird nicht mehr als
     Delta hinterlegt, sondern beim Öffnen aus der aktuellen Form
     abgeleitet – so stimmt sie am Desktop wie im Hochformat. */
  const PROJECTS = ['smears', 'modola', 'garden', 'essperten', 'designschau', 'stelldirvor'];




  const stage = document.querySelector('.stage');
  if (!stage) return;
  const svg = stage.querySelector('svg');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  /* Mobil = schmaler als 900 px oder flacher als 520 px (Handy quer) – muss zur Media-Query in graphic-start.css passen */
  const isMobile = () => innerWidth < 900 || innerHeight < 520;

  /* ---------- Sprache ---------- */
  const LANGS = ['en', 'de'];
  function currentLang() {
    const q = new URLSearchParams(location.search).get('lang');
    if (LANGS.includes(q)) return q;
    try { const v = localStorage.getItem('lang'); if (LANGS.includes(v)) return v; } catch (e) {}
    return 'en';
  }
  function setLang(lang, push) {
    if (!LANGS.includes(lang)) return;
    document.documentElement.lang = lang;
    try { localStorage.setItem('lang', lang); } catch (e) {}
    for (const b of document.querySelectorAll('.lang__btn')) {
      const on = b.dataset.lang === lang;
      b.setAttribute('aria-current', on ? 'true' : 'false');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (push) {
      const u = new URL(location.href);
      u.searchParams.set('lang', lang);
      history.replaceState(history.state, '', u);
    }
    /* Sprache in alle internen Links schreiben. Nötig, weil Safari bei
       lokal geöffneten Dateien jede Datei als eigene Herkunft behandelt
       und localStorage dann nicht von Seite zu Seite reicht. */
    for (const a of document.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href');
      if (/^(https?:|mailto:|#)/.test(h)) continue;
      const [base, hash = ''] = h.split('#');
      const [path, q = ''] = base.split('?');
      const p = new URLSearchParams(q); p.set('lang', lang);
      a.setAttribute('href', path + '?' + p.toString() + (hash ? '#' + hash : ''));
    }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('.lang__btn');
    if (b) { e.preventDefault(); setLang(b.dataset.lang, true); }
  });
  setLang(currentLang(), false);

  /* Cookie-Hinweis + Analytics: consent.js (eine Datei für alle Seiten der Domain) */

  /* ---------- Formen einlesen ---------- */
  const folders = new Map();
  for (const key of PROJECTS) {
    const g = stage.querySelector(`.folder[data-folder="${key}"]`);
    const panel = document.getElementById('proj-' + key);
    if (!g || !panel) continue;

    const polys = [...g.querySelectorAll('polygon.fdr-base, .fdr-tex > polygon')];
    if (!polys.length) continue;
    const from = polys[0].getAttribute('points').trim().split(/\s+/).map(Number);
    if (from.length !== 18) { console.warn('[proj] unerwartete Punktzahl bei', key); continue; }

    /* from/to werden beim Öffnen aus der dann gültigen Form gesetzt,
       weil der Stapel im Hochformat anders gerechnet ist. */
    folders.set(key, {
      g, polys, panel, from, to: from.slice(), logoShift: 0,
      logo: g.querySelector('.fdr-tex > g')
    });
  }
  /* Seiten ohne Detail-Panels (Produkt) brauchen trotzdem Mobil-Layout
     und Burger – deshalb hier kein Abbruch mehr; alle Schleifen unten
     laufen mit leerer Map einfach leer. */

  /* Kopf-/Fußzeile markieren (Staffelung des Stapels wird je Klick gesetzt) */
  /* (aus den Attributen gelesen, nicht per getBBox – die ausgeblendete
     Sprachgruppe hat keine Layoutbox) */
  const yOf = el => {
    const t = el.getAttribute('transform'), m = t && t.match(/translate\(\s*[-\d.]+[\s,]+([-\d.]+)/);
    if (m) return +m[1];
    if (el.hasAttribute('y')) return +el.getAttribute('y');
    const c = el.querySelector('[y], [transform]'); return c ? yOf(c) : NaN;
  };
  for (const el of stage.querySelectorAll('.svg-i18n > *')) {
    const y = yOf(el); if (isNaN(y)) continue;
    el.classList.add(y < 300 ? 'chrome-top' : 'chrome-bottom');
  }

  /* ---------- Morph ---------- */
  const easeOutBack = t => { const s = 0.8, u = t - 1; return 1 + u * u * ((s + 1) * u + s); };
  const easeInCubic = t => t * t * t;
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

  function paint(f, t) {
    const pts = new Array(f.from.length);
    for (let i = 0; i < f.from.length; i++) {
      pts[i] = (f.from[i] + (f.to[i] - f.from[i]) * t).toFixed(2);
    }
    const s = pts.join(' ');
    for (const p of f.polys) p.setAttribute('points', s);
    /* Das Logo sitzt im Reiter und muss dessen Weg mitgehen – zusätzlich zum
       Versatz aus dem Bühnenlayout (data-logo-shift, gesetzt in layoutFit/Mobile). */
    if (f.logo) f.logo.style.transform = `translate(${f.g.dataset.logoShiftX || 0}px, ${(+(f.g.dataset.logoShift || 0) + f.logoShift * t).toFixed(2)}px)`;
  }

  let raf = 0, rafGuard = 0;
  function animate(f, a, b, ms, ease, done) {
    cancelAnimationFrame(raf); clearTimeout(rafGuard);
    if (reduced.matches) { paint(f, b); done && done(); return; }
    let finished = false;
    const finish = () => { if (finished) return; finished = true; clearTimeout(rafGuard); paint(f, b); done && done(); };
    const t0 = performance.now();
    (function step(now) {
      if (finished) return;
      const p = Math.min(1, (now - t0) / ms);
      paint(f, a + (b - a) * ease(p));
      if (p < 1) raf = requestAnimationFrame(step); else finish();
    })(t0);
    /* Sicherheitsnetz: liefert der Browser keine Frames (Hintergrund-Tab,
       gedrosselte Ansicht), wird der Endzustand trotzdem gesetzt. */
    rafGuard = setTimeout(finish, ms + 250);
  }

  /* ---------- Aufklappen: Bühne → voller Viewport ----------
     Der Ordner füllt am Ende des Morphs die ganze Bühne, also wächst
     das Panel von genau diesem Rechteck auf den Viewport. */
  function clipToStage(panel) {
    const r = stage.getBoundingClientRect();
    panel.style.setProperty('--clip-l', Math.max(0, r.x) + 'px');
    panel.style.setProperty('--clip-t', Math.max(0, r.y) + 'px');
    panel.style.setProperty('--clip-r', Math.max(0, innerWidth  - r.right)  + 'px');
    panel.style.setProperty('--clip-b', Math.max(0, innerHeight - r.bottom) + 'px');
  }

  /* Reiter im Band der Projektansicht auf die Bühnenform legen: am Desktop
     die Vorlagenkoordinaten, mobil die umgerechneten (viewBox 504, Reiter
     rechts/links). Die Logo-Pfade des Reiters werden dafür einmal in eine
     Gruppe gefasst und mit dem Reiter verschoben. */
  function syncPanelTab(f) {
    const tab = f.panel.querySelector('.pv-tab'); if (!tab) return;
    const shape = tab.querySelector('.pv-tab__shape'), line = tab.querySelector('.pv-tab__line');
    if (!tab.dataset.shape0) { tab.dataset.shape0 = shape.getAttribute('points'); tab.dataset.line0 = line.getAttribute('points'); tab.dataset.vb0 = tab.getAttribute('viewBox'); }
    let logo = tab.querySelector('.pv-tab__logo');
    if (!logo) {
      logo = document.createElementNS('http://www.w3.org/2000/svg', 'g'); logo.setAttribute('class', 'pv-tab__logo');
      const rest = [...tab.children].filter(el => el !== shape && el !== line);
      tab.appendChild(logo); rest.forEach(el => logo.appendChild(el));
    }
    const dx = +(f.g.dataset.logoShiftX || 0);
    if (!dx) {
      tab.setAttribute('viewBox', tab.dataset.vb0); shape.setAttribute('points', tab.dataset.shape0); line.setAttribute('points', tab.dataset.line0);
      logo.removeAttribute('transform'); return;
    }
    const xs = [...new Set(f.from.filter((_, n) => n % 2 === 0))].filter(x => x > 0 && x < 1920).sort((a, b) => a - b);
    const [x1, x2, x3, x4] = xs;
    tab.setAttribute('viewBox', `0 0 ${MOB_W} 126.38`);
    shape.setAttribute('points', `${x1} 127.5 ${x2} 55.81 ${x3} 55.81 ${x4} 127.5`);
    line.setAttribute('points', `-6000 126.38 ${x1} 126.38 ${x2} 55.81 ${x3} 55.81 ${x4} 126.38 8000 126.38`);
    logo.setAttribute('transform', `translate(${dx} 0)`);
  }

  /* ---------- Zustand ---------- */
  let current = null;
  let timer = 0;

  function open(key, { animated = true } = {}) {
    const f = folders.get(key);
    if (!f || current === key) return;
    current = key;
    clearTimeout(timer);

    /* Startform frisch aus dem DOM lesen – mobil ist der Stapel anders
       gerechnet als am Desktop. Die Zielform füllt jeweils den ganzen
       viewBox, dessen Höhe im Hochformat größer als 1080 ist. */
    const vbH = +(svg.getAttribute('viewBox').split(/\s+/)[3]) || 1080;
    f.from = f.polys[0].getAttribute('points').trim().split(/\s+/).map(Number);
    const fy = f.from.filter((_, n) => n % 2);
    const yTab = Math.min(...fy), yBot = Math.max(...fy);
    /* Zielform: der Ordner steigt so weit, dass sein Reiter über den oberen
       Rand hinaus ist (Reiter -70.57, Korpus 0) und nur noch die farbige
       Fläche bleibt – das Band der Projektansicht. Die Unterkante bleibt
       am unteren Rand, die Breite wird voll. */
    const TAB_TOP = 55.81 - 126.38 - 1.5, BODY_TOP = -1.5;   /* 1.5 über dem Rand: die Kontur (2 Einheiten) bleibt unsichtbar */
    f.to = f.from.map((v, i) => i % 2
      ? (v === yTab ? TAB_TOP : v === yBot ? vbH + 1 : BODY_TOP)
      : (Math.abs(v) < .01 || Math.abs(v - 46.78) < .01 ? 0
        : Math.abs(v - 1920) < .01 || Math.abs(v - 1873.22) < .01 ? 1920 : v));
    f.logoShift = TAB_TOP - yTab;
    syncPanelTab(f);

    /* Der restliche Stapel geht nach unten aus dem Bild, gestaffelt vom
       angeklickten Ordner weg (40 ms je Ordner); die Kopfzeile nach oben. */
    const order = ORDER.filter(k => stage.querySelector(`.folder[data-folder="${k}"]`));
    const ai = order.indexOf(key);
    order.forEach((k, i) => {
      stage.querySelector(`.folder[data-folder="${k}"]`).style.setProperty('--exit-delay', Math.max(0, Math.abs(i - ai) - 1) * 40 + 'ms');
    });
    stage.classList.add('is-open');
    f.g.classList.add('is-active');
    document.body.classList.add('proj-open');
    f.panel.hidden = false;
    f.panel.setAttribute('aria-hidden', 'false');

    if (!animated || reduced.matches) {
      stage.classList.add('no-anim');
      paint(f, 1);
      f.panel.classList.remove('is-tucked', 'is-closing');
      f.panel.classList.add('is-expanded');
      if (f.panel.__pv) f.panel.__pv.reset();
      setTimeout(() => stage.classList.remove('no-anim'), 80);
      return;
    }

    /* Stapel sinkt, Kopfzeile fährt hoch, der angeklickte Ordner steigt
       (Morph, ohne Überschwingen), bis nur seine Fläche als Band bleibt.
       Kurz danach zieht er das weiße Blatt mit Reiter und Inhalt aus dem
       Stapel nach; das Panel ist dabei durchsichtig, der Ordner der Bühne
       bleibt als Band sichtbar. */
    f.panel.hidden = true;
    f.panel.classList.add('is-tucked');
    f.panel.classList.remove('is-expanded', 'is-closing');
    animate(f, 0, 1, OPEN_MS, easeOutCubic, null);
    timer = setTimeout(() => {
      if (current !== key) return;
      clipToStage(f.panel);
      f.panel.hidden = false;
      if (f.panel.__pv) f.panel.__pv.reset();    /* setzt den Pfeil – jetzt, wo das Panel Layout hat */
      void f.panel.offsetHeight;                 /* Reflow, damit die Transition greift */
      f.panel.classList.add('is-expanded', 'is-moving');
      f.panel.classList.remove('is-tucked');
      timer = setTimeout(() => { f.panel.classList.remove('is-moving'); f.panel.focus({ preventScroll: true }); }, SHEET_MS + 60);
    }, SHEET_LAG);
  }

  function close({ animated = true } = {}) {
    if (!current) return;
    const key = current, f = folders.get(current);
    current = null;
    clearTimeout(timer);

    document.body.classList.remove('proj-open');
    f.panel.setAttribute('aria-hidden', 'true');

    if (f.panel.__pv) f.panel.__pv.stop();
    const done = () => {
      stage.classList.remove('is-open');
      f.g.classList.remove('is-active');
      f.panel.hidden = true;
      f.g.focus?.();
    };

    if (!animated || reduced.matches) { paint(f, 0); f.panel.classList.remove('is-expanded'); done(); applyLayout(); return; }

    /* Rückweg: Blatt zurück in den Ordner, dann sinkt der Ordner in den
       Stapel, während der Rest hochkommt und die Kopfzeile zurückfährt. */
    clipToStage(f.panel);
    f.panel.classList.add('is-tucked', 'is-closing', 'is-moving');
    timer = setTimeout(() => {
      f.panel.hidden = true;
      f.panel.classList.remove('is-expanded', 'is-closing', 'is-moving');
      stage.classList.remove('is-open');       /* der Rest kommt zurück, wohin er ging */
      animate(f, 1, 0, CLOSE_MS, easeInCubic, () => {
        f.g.classList.remove('is-active'); f.panel.hidden = true; f.g.focus?.();
        applyLayout();                          /* Fenster wurde evtl. bei offenem Projekt verändert */
      });
    }, TUCK_MS);
  }

  /* ---------- Routing ---------- */
  function sync(animated) {
    const key = new URLSearchParams(location.search).get('p');
    if (key && folders.has(key)) open(key, { animated });
    else close({ animated });
  }
  addEventListener('popstate', () => sync(true));

  /* Beim Größenändern den Clip nachziehen, solange geschlossen wird. */
  addEventListener('resize', () => { if (current) clipToStage(folders.get(current).panel); });

  /* ---------- Bedienung ---------- */
  for (const [key, f] of folders) {
    f.g.setAttribute('role', 'link');
    f.g.setAttribute('tabindex', '0');
    f.g.setAttribute('aria-label', f.panel.dataset.title || key);

    const go = e => {
      e.preventDefault();
      if (current) return;                     /* schon ein Projekt offen (oder gerade im Aufklappen) */
      const u = new URL(location.href);
      u.searchParams.set('p', key);
      history.pushState({ p: key }, '', u);
      open(key);
    };
    f.g.addEventListener('click', go);
    f.g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(e); });
  }
  /* Ordner ohne Panel auf dieser Seite (Produkt): Klick führt zur
     Projektansicht auf der Startseite, Sprache bleibt erhalten. */
  for (const key of PROJECTS) {
    const g = stage.querySelector(`.folder[data-folder="${key}"]`);
    if (!g || folders.has(key)) continue;
    g.setAttribute('role', 'link'); g.setAttribute('tabindex', '0'); g.setAttribute('aria-label', key);
    const go = e => {
      e.preventDefault();
      const u = new URL('./', location.href);
      u.searchParams.set('p', key);
      u.searchParams.set('lang', document.documentElement.lang || 'en');
      location.href = u;
    };
    g.addEventListener('click', go);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(e); });
  }

  function back() {
    const u = new URL(location.href);
    u.searchParams.delete('p');
    history.pushState({}, '', u);
    close();
  }
  /* Zurück über den Namen oder den Weißraum der Kopfzeile.
     Der Sprachumschalter darin ist ausgenommen. */
  document.addEventListener('click', e => {
    if (!current) return;
    if (e.target.closest('.lang')) return;
    const home = e.target.closest('[data-proj-home]');
    if (home) { e.preventDefault(); back(); }
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && current) back(); });


  /* =============================================================
     Mobilfassung: Bühne hochkant, Stapel neu gerechnet

     Auf dem Handy schrumpft die 16:9-Bühne zu einem Streifen. Statt
     dessen wird der viewBox hochkant gesetzt (Breite bleibt 1920, die
     Höhe folgt dem Seitenverhältnis) und die sechs Ordner werden über
     die volle Höhe verteilt. Reiterform und -breite bleiben unverändert,
     nur die Registerschritte werden größer. Die Logos wandern mit ihrem
     Reiter mit.
     ============================================================= */
  const TAB_H = 70.57;                 /* Reiterhöhe, bleibt konstant */
  const ORDER = ['garden', 'smears', 'modola', 'essperten', 'designschau', 'stelldirvor', 'front'];
  const stack = ORDER.map(k => {
    const g = stage.querySelector(`.folder[data-folder="${k}"]`);
    if (!g) return null;
    const polys = [...g.querySelectorAll('polygon.fdr-base, .fdr-tex > polygon, .fdr-tex polygon.fdr-clip')];
    return {
      key: k, g, polys,
      base: polys[0].getAttribute('points').trim().split(/\s+/).map(Number),
      logo: g.querySelector('.fdr-tex > g')
    };
  }).filter(Boolean);

  /* ---------- Mobil: Bühne hochkant, viewBox 504 × vbH ----------
     Vorlage Mobil_Startseite.svg: erster Reiter bei 35 % der Höhe,
     Registerschritt 4,06 % der Höhe, Reiter abwechselnd rechts/links
     (Deckel immer rechts), Reiterform und -maße wie am Desktop. Der
     Korpus läuft randlos über die 504 Einheiten. Das Deckelfoto wird als
     Ausschnitt (slice) in den Korpus gelegt. */
  const MOB_W = 504, MOB_MARGIN = 36;
  const MOB_SLOT = 96;                 /* Registerschritt: Reiter (70.57) ganz sichtbar plus Luft */
  function layoutMobile(vbH) {
    const slot = MOB_SLOT;
    /* Stapel hängt unten: Deckelkorpus ~22 % der Höhe, darüber die Register */
    const top = Math.max(0.18 * vbH, vbH - ((stack.length - 1) * slot + 70.57 + 0.22 * vbH));
    stack.forEach((f, i) => {
      const v = f.base, ys = v.filter((_, n) => n % 2), xs = v.filter((_, n) => n % 2 === 0);
      const yTab = Math.min(...ys), yBody = [...new Set(ys)].sort((a, b) => a - b)[1];
      const tabTop = top + i * slot, bodyTop = tabTop + (yBody - yTab);
      /* Reiter: vier x-Werte zwischen den Korpuskanten (-2 / 1922) */
      const inner = [...new Set(xs)].filter(x => x > 0 && x < 1920).sort((a, b) => a - b);
      const baseL = inner[0], baseW = inner[inner.length - 1] - inner[0];
      /* Reiter mittig auf der Seite; Form und Logo-Lage im Reiter bleiben (Gruppe) */
      const newL = (MOB_W - baseW) / 2;
      const pts = new Array(v.length);
      for (let n = 0; n < v.length; n += 2) {
        const x = v[n], y = v[n + 1];
        pts[n] = x <= 0 ? x : x >= 1920 ? MOB_W + (x - 1920) : newL + (x - baseL);
        pts[n + 1] = y === yTab ? tabTop : y === yBody ? bodyTop : vbH + 1;
      }
      const str = pts.map(x => +x.toFixed(2)).join(' ');
      for (const p of f.polys) p.setAttribute('points', str);
      if (f.key === 'front' && coverImg) {
        coverImg.setAttribute('transform', '');
        coverImg.setAttribute('x', 0); coverImg.setAttribute('y', tabTop.toFixed(2));
        coverImg.setAttribute('width', MOB_W); coverImg.setAttribute('height', (vbH - tabTop + 1).toFixed(2));
        coverImg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        cover.style.transformOrigin = `${MOB_W / 2}px ${((tabTop + vbH) / 2).toFixed(1)}px`;
      }
      /* Logo wandert mit seinem Reiter (x und y) – gleiche Lage im Reiter wie
         am Desktop und wie im Band der Projektansicht */
      f.g.dataset.logoShift = (tabTop - yTab).toFixed(2);
      f.g.dataset.logoShiftX = (newL - baseL).toFixed(2);
      if (f.logo && f.key !== 'front') f.logo.style.transform = `translate(${f.g.dataset.logoShiftX}px, ${f.g.dataset.logoShift}px)`;
    });
  }

  /* ---------- Desktop: Bühne füllt jedes Seitenverhältnis ----------
     viewBox 1920 × vbH. Kopfzeile bleibt, Fußzeile (Vektortext und
     Klickflächen) und Stapel hängen an der Unterkante:
       vbH ≥ 1080  Stapel rutscht um (vbH − 1080) nach unten, Register
                   bleiben exakt wie in der Vorlage (16:10, 4:3 …)
       vbH < 1080  Registerschritte werden ab dem obersten Reiter
                   proportional gestaucht, Reiterhöhe bleibt (21:9 …)
     Alle Werte werden aus den Vorlagenkoordinaten (base) gerechnet,
     nie aus dem vorherigen Zustand – so bleibt es bei jedem Resize exakt. */
  const Y_TOP = Math.min(...stack.map(f => Math.min(...f.base.filter((_, n) => n % 2))));   /* oberster Reiter (227.37) */
  const chromeBottom = [...stage.querySelectorAll('.chrome-bottom')].map(el => ({
    el, t: el.getAttribute('transform'), y: el.hasAttribute('y') ? +el.getAttribute('y') : null
  }));
  /* Klickflächen: aus den Prozentwerten der Vorlage (1920 × 1080) in Einheiten */
  const hots = [...stage.querySelectorAll('.hot')].map(a => {
    const st = a.style, pc = k => parseFloat(st[k]) || 0;
    return { a, x: pc('left') * 19.2, y: pc('top') * 10.8, w: pc('width') * 19.2, h: pc('height') * 10.8, foot: a.classList.contains('foot') };
  });
  const cover = stage.querySelector('.front-photo');
  const coverImg = cover && cover.querySelector('image');

  function layoutFit(vbH) {
    const shift = Math.max(0, vbH - 1080);
    const k = vbH >= 1080 ? 1 : (vbH - Y_TOP) / (1080 - Y_TOP);
    let frontTop = 491.3;
    stack.forEach(f => {
      const v = f.base, ys = v.filter((_, n) => n % 2);
      const yTab = Math.min(...ys), yBody = [...new Set(ys)].sort((a, b) => a - b)[1];
      const tabTop = Y_TOP + (yTab - Y_TOP) * k + shift;
      const bodyTop = tabTop + (yBody - yTab);                  /* Reiterhöhe wie in der Vorlage */
      if (f.key === 'front') frontTop = tabTop;
      const pts = new Array(v.length);
      for (let n = 0; n < v.length; n += 2) {
        pts[n] = v[n];
        pts[n + 1] = v[n + 1] === yTab ? tabTop : v[n + 1] === yBody ? bodyTop : vbH + 1;
      }
      const str = pts.map(x => +x.toFixed(2)).join(' ');
      for (const p of f.polys) p.setAttribute('points', str);
      /* Logo wandert mit dem Reiter. Beim Deckel ist die Gruppe das Foto samt
         Clip – der Clip ist schon über die Polygone umgerechnet, das Foto
         wird unten eigens gesetzt; die Gruppe darf nicht zusätzlich wandern. */
      f.g.dataset.logoShift = (tabTop - yTab).toFixed(2); delete f.g.dataset.logoShiftX;
      if (f.logo && f.key !== 'front') f.logo.style.transform = `translateY(${f.g.dataset.logoShift}px)`;
    });
    /* Deckelfoto: Oberkante auf den Deckelreiter, Parallax-Drehpunkt in die Mitte */
    if (coverImg) {
      coverImg.removeAttribute('transform');
      coverImg.setAttribute('x', -1); coverImg.setAttribute('y', frontTop.toFixed(2));
      coverImg.setAttribute('width', 1922); coverImg.setAttribute('height', (vbH - frontTop + 2).toFixed(2));
      coverImg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      cover.style.transformOrigin = `960px ${((frontTop + vbH) / 2).toFixed(1)}px`;
    }
    /* Fußzeile: Vektortext und Klickflächen um (vbH − 1080) versetzen */
    const dy = vbH - 1080;
    for (const c of chromeBottom) {
      if (c.t) c.el.setAttribute('transform', c.t.replace(/translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)/, (m, x, y) => `translate(${x} ${(+y + dy).toFixed(4)})`));
      else if (c.y !== null) c.el.setAttribute('y', (c.y + dy).toFixed(2));
    }
    for (const h of hots) {
      const y = h.foot ? h.y + dy : h.y;
      h.a.style.left = `calc(var(--u) * ${h.x.toFixed(3)})`;
      h.a.style.top = `calc(var(--u) * ${y.toFixed(3)})`;
      h.a.style.width = `calc(var(--u) * ${h.w.toFixed(3)})`;
      h.a.style.height = `calc(var(--u) * ${h.h.toFixed(3)})`;
    }
  }

  let lastVbH = null;
  function applyLayout() {
    if (current) return;                       /* offenes Projekt nicht anfassen */
    /* Ohne gültiges Viewport (versteckter Tab, Druckvorschau) nichts
       rechnen – sonst landet NaN im viewBox und in allen Polygonen. */
    if (!(innerWidth > 0 && innerHeight > 0)) return;
    if (!stack.length) return;                 /* Seiten ohne Stapel (Impressum) */
    /* Hochkant (Handy): eigener Stapel auf 504 Einheiten. Quer (Handy
       liegend) und Desktop: Vorlagenstapel, an die Höhe angepasst. */
    const portrait = isMobile() && innerHeight >= innerWidth;
    const vbW = portrait ? MOB_W : 1920;
    const vbH = Math.round(vbW * innerHeight / innerWidth);
    const key = (portrait ? 'm' : 'd') + vbH;
    if (key === lastVbH) return;
    lastVbH = key;
    svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);
    stage.style.setProperty('--exit-y', (vbH + 200) + 'px');   /* Absinkweg des Stapels */
    if (portrait) layoutMobile(vbH); else layoutFit(vbH);
  }

  /* Auf Mobil ist der Stapel die Navigation – Hover gibt es dort nicht,
     ein Tipp öffnet direkt. Das erledigt der bestehende click-Handler. */
  addEventListener('resize', applyLayout);
  applyLayout();

  /* ---------- Touch: Ordner fächern unter dem Finger wie unter der Maus ----------
     :hover gibt es auf dem Handy nicht; beim Streichen über den Stapel bekommt
     der Ordner unter dem Finger is-hover (dieselben Regeln wie :hover in
     graphic-start.css). Ein kurzes Tippen ohne Bewegung öffnet wie gehabt. */
  let hovered = null;
  const setHover = g => {
    if (g === hovered) return;
    hovered && hovered.classList.remove('is-hover');
    hovered = g; g && g.classList.add('is-hover');
  };
  const folderAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest ? el.closest('.folder--proj') : null; };
  stage.addEventListener('touchstart', e => { if (!current) setHover(folderAt(e.touches[0].clientX, e.touches[0].clientY)); }, { passive: true });
  stage.addEventListener('touchmove',  e => {
    if (current) return;
    if (e.cancelable) e.preventDefault();      /* Seite bleibt stehen: kein Gummiband, kein Neuladen durch Runterziehen */
    setHover(folderAt(e.touches[0].clientX, e.touches[0].clientY));
  }, { passive: false });
  stage.addEventListener('touchend',   () => setTimeout(() => setHover(null), 350), { passive: true });
  stage.addEventListener('touchcancel', () => setHover(null), { passive: true });

  /* ---------- Schalter Produkt ↔ Grafik in der Kopfzeile ----------
     Der schwarze Kasten mit dem weißen Knopf zwischen PRODUCTDESIGN und
     GRAPHICDESIGN ist ein Schieber: Knopf links = Produkt, rechts = Grafik.
     Klick auf den Kasten wechselt die Seite; der Knopf lässt sich auch mit
     der Maus ziehen und rastet beim Loslassen auf der näheren Seite ein.
     Je Sprache eine Klickfläche (die SVG-Fassungen liegen an anderer x). */
  const KNOB = 11.94, TRACK = 33.16, INSET = 2.32;              /* Einheiten aus der Vorlage */
  const PAGE = (document.body.dataset.page === 'produkt' ? 'product' : document.body.dataset.page) || 'graphic';
  const isProduct = PAGE === 'product';
  for (const grp of stage.querySelectorAll('.svg-i18n')) {
    const lang = grp.dataset.langSvg;
    const track = [...grp.querySelectorAll('rect')].find(r => Math.abs(+r.getAttribute('width') - TRACK) < .1);
    const knob  = [...grp.querySelectorAll('rect')].find(r => Math.abs(+r.getAttribute('width') - KNOB) < .1 && Math.abs(+r.getAttribute('y') - 62.93) < .1);
    if (!track || !knob) continue;
    const x0 = +track.getAttribute('x'), y0 = +track.getAttribute('y');
    const travel = TRACK - KNOB - 2 * INSET;                     /* 16.58 */
    const rest = +knob.getAttribute('x') - (x0 + INSET);         /* 0 (links/Produkt) oder travel (rechts/Grafik) */
    const hot = document.createElement('button');
    hot.type = 'button'; hot.className = 'hot switch'; hot.dataset.langHot = lang;
    hot.setAttribute('aria-label', isProduct ? 'Graphic Design' : 'Product Design');
    hot.style.cssText = `left:calc(var(--u) * ${x0 - 4});top:calc(var(--u) * ${y0 - 6});width:calc(var(--u) * ${TRACK + 8});height:calc(var(--u) * ${16.58 + 12})`;
    stage.appendChild(hot);
    knob.style.transition = 'transform 160ms ease';
    let drag = null;
    const setKnob = dx => { knob.style.transform = `translateX(${dx.toFixed(2)}px)`; };
    const go = toProduct => {
      const u = new URL(toProduct ? 'product.html' : './', location.href);
      u.searchParams.set('lang', document.documentElement.lang || 'en');
      location.href = u;
    };
    hot.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, moved: false }; hot.setPointerCapture(e.pointerId);
      knob.style.transition = 'none';
    });
    hot.addEventListener('pointermove', e => {
      if (!drag) return;
      const u = innerWidth / 1920;
      let dx = (e.clientX - drag.x) / u;                          /* in Einheiten */
      if (Math.abs(dx) > 1) drag.moved = true;
      dx = Math.max(-rest, Math.min(travel - rest, dx));          /* im Kasten bleiben */
      setKnob(dx);
    });
    const release = e => {
      if (!drag) return;
      const u = innerWidth / 1920;
      const dx = Math.max(-rest, Math.min(travel - rest, (e.clientX - drag.x) / u));
      const wasDrag = drag.moved; drag = null;
      knob.style.transition = 'transform 160ms ease';
      const pos = rest + dx;                                      /* 0 … travel */
      const target = wasDrag ? (pos > travel / 2 ? 'graphic' : 'product') : (isProduct ? 'graphic' : 'product');
      const changes = target !== PAGE;                             /* auf Who/Impressum führt auch "Grafik" weg */
      setKnob(target === 'product' ? -rest : travel - rest);
      if (changes) setTimeout(() => go(target === 'product'), 170);
    };
    hot.addEventListener('pointerup', release);
    hot.addEventListener('pointercancel', () => { if (drag) { drag = null; setKnob(0); knob.style.transition = 'transform 160ms ease'; } });
    hot.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(!isProduct); } });
  }

  /* ---------- Deckel-Foto: Parallax mit der Maus ----------
     Kleine, gegenläufige Verschiebung in SVG-Einheiten. Die Position
     läuft dem Ziel in einer rAF-Schleife weich hinterher (Lerp) statt
     über eine CSS-Transition, die bei jedem mousemove neu anlaufen und
     dadurch ruckeln würde. */
  const photo = stage.querySelector('.front-photo');
  if (photo && matchMedia('(hover: hover)').matches && !reduced.matches) {
    const AMP_X = 9, AMP_Y = 4, EASE = .08;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    function tick() {
      cx += (tx - cx) * EASE; cy += (ty - cy) * EASE;
      photo.style.setProperty('--px', cx.toFixed(2) + 'px');
      photo.style.setProperty('--py', cy.toFixed(2) + 'px');
      raf = (Math.abs(tx - cx) > .02 || Math.abs(ty - cy) > .02) ? requestAnimationFrame(tick) : 0;
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    stage.addEventListener('mousemove', e => {
      const r = stage.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - .5, ny = (e.clientY - r.top) / r.height - .5;
      tx = -nx * AMP_X * 2; ty = -ny * AMP_Y * 2; kick();
    });
    stage.addEventListener('mouseleave', () => { tx = 0; ty = 0; kick(); });
  }

  /* ---------- Mobilmenü (MENU-Kasten wird zum X) ---------- */
  const burger = document.querySelector('.m-menu');
  const mnav = document.querySelector('.m-nav');
  if (burger && mnav) {
    const setMenu = open => {
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
      mnav.hidden = !open;
    };
    burger.addEventListener('click', () => setMenu(mnav.hidden));
    mnav.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && !mnav.hidden) setMenu(false); });
    addEventListener('resize', () => { if (!isMobile()) setMenu(false); });
  }


  /* =============================================================
     Projektansicht v2: Screens + Bildstapel

     Zustand = Schritt 0 … N-1 (N = Bilder). Schritt 0 zeigt Screen 1
     (Intro + Fakten), ab Schritt 1 steht Screen 2. Bei jedem Schritt
     fliegt das oberste Bild nach rechts aus dem Ordner; rückwärts kommt
     es wieder herein. Beim letzten Bild verschwinden Pfeil und (more).
     Der Pfeil beginnt immer im selben Abstand unter dem sichtbaren Text
     – seine Linie wird nach dem Umschalten gemessen und gesetzt.
     ============================================================= */
  for (const panel of document.querySelectorAll('.proj--v2')) {
    const N = +panel.dataset.count || panel.querySelectorAll('.pv-fig').length;
    const figs = [...panel.querySelectorAll('.pv-fig')];
    const arrow = panel.querySelector('.pv-arrow');
    const band = panel.querySelector('.pv-band');
    const back = panel.querySelector('.pv-back');
    /* Ein Projekt kann mehrere Filme im Stapel haben (Stell dir vor) */
    const vidFigs = [...panel.querySelectorAll('.pv-fig--video')];
    /* mode="swap": Screen 2 tauscht den Abschnitt pro Schritt aus statt ihn
       anzuhängen (lange Texte, ein Abschnitt je Bild); ein Abschnitt kann
       mehrere Schritte abdecken (data-sec bis data-until). */
    const swap = panel.dataset.mode === 'swap';
    let step = 0, lock = 0;

    const u = () => Math.min(innerWidth / 1920, innerHeight / 1080);

    function placeArrow() {
      if (isMobile()) {
        /* mobil steht der Pfeil im Fluss nach den Metadaten und reicht bis
           kurz über den unteren Rand des ersten Bildschirms */
        if (!arrow || panel.hidden) return;
        const u = innerWidth / 504;
        const top = arrow.getBoundingClientRect().top + panel.scrollTop;
        const h = innerHeight - 40 * u - top;
        arrow.style.height = Math.max(120 * u, h) + 'px';
        return;
      }
      const txt = panel.querySelector(step === 0 ? '.pv-text--1' : '.pv-text--2');
      const block = txt && [...txt.children].find(c => getComputedStyle(c).display !== 'none');
      if (!block) return;
      const sheet = panel.querySelector('.pv-sheet').getBoundingClientRect();
      /* Screen 2: bis zum letzten eingeblendeten Abschnitt messen */
      const shown = [...block.querySelectorAll('.pv-sec.is-shown')];
      let ref = shown.length ? shown[shown.length - 1] : block;
      /* noch unsichtbarer Unterabschnitt: nur bis zum Element davor messen */
      const hiddenSub = ref.querySelector('.pv-sub:not(.is-shown)');
      if (hiddenSub && hiddenSub.previousElementSibling) ref = hiddenSub.previousElementSibling;
      const bottom = ref.getBoundingClientRect().bottom - sheet.top;
      /* Grundlinie der letzten Zeile ≈ Unterkante minus Unterlänge (~0.2em) */
      const baseline = bottom - 0.2 * 18 * u();
      panel.style.setProperty('--arrow-top', (baseline + 51 * u()) + 'px');
      /* Spitze auf der Unterkante des obersten noch liegenden Bildes.
         Ist das Bild kürzer als der Text (Designschau), bleibt eine
         Mindestlänge von 40 Einheiten – sonst zeigte der Pfeil nach oben. */
      const top = figs.filter(f => +f.dataset.i >= step).sort((a, b) => +a.dataset.i - +b.dataset.i)[0];
      if (top) {
        const arrowTop = baseline + 51 * u();
        /* Layoutbox statt getBoundingClientRect: die enthält beim Zurückholen
           noch die Wurf-Transformation (verschoben, gedreht) und lieferte eine
           andere Unterkante als beim Runterscrollen. offset* ignoriert Transforms. */
        const stack = top.offsetParent;
        const bottom = (stack ? stack.offsetTop : 0) + top.offsetTop + top.offsetHeight;
        panel.style.setProperty('--arrow-tip', Math.max(bottom, arrowTop + 40 * u()) + 'px');
      }
    }

    function render(dir) {
      panel.dataset.step = step;
      panel.classList.toggle('is-last', step >= N - 1);
      /* Screen 2 stufenweise: Schritt 1 -> Abschnitt 1, 2 -> 1+2, ab 3 alle.
         Im swap-Modus steht nur der Abschnitt des aktuellen Schritts; er wird
         erst aus dem Fluss genommen (is-off) und nach einem erzwungenen
         Reflow eingeblendet, damit die Opacity-Transition greift. */
      panel.querySelectorAll('.pv-sec').forEach(sec => {
        const from = +sec.dataset.sec, to = +(sec.dataset.until || sec.dataset.sec);
        const on = swap ? (step >= from && step <= to) : from <= step;
        if (swap) {
          sec.classList.toggle('is-off', !on);
          /* Reflow erzwingen, damit die Opacity-Transition nach display:none greift
             (kein requestAnimationFrame: das steht in Hintergrund-Tabs still) */
          if (on) { void sec.offsetHeight; sec.classList.add('is-shown'); }
          else sec.classList.remove('is-shown');
        } else sec.classList.toggle('is-shown', on);
      });
      /* Unterabschnitt innerhalb eines Abschnitts (z. B. Website unter
         Accompanying media): bleibt im Fluss, blendet ab seinem Schritt ein */
      panel.querySelectorAll('.pv-sub').forEach(sub => sub.classList.toggle('is-shown', step >= +sub.dataset.sec));
      figs.forEach(f => {
        const i = +f.dataset.i, out = i < step;
        f.classList.toggle('is-back', !out && dir < 0);
        f.classList.toggle('is-out', out);
        f.classList.toggle('is-top', i === step);
      });
      vidFigs.forEach(vf => { if (+vf.dataset.i !== step) stopVideo(vf); });
      /* Pfeil sofort setzen: die Sichtbarkeit der Abschnitte ist reine Opacity,
         das Layout steht in diesem Moment schon fest. */
      placeArrow();
    }

    function go(d) {
      const next = Math.max(0, Math.min(N - 1, step + d));
      if (next === step || lock) return;
      lock = 1; step = next; render(d);
      setTimeout(() => { lock = 0; }, 760);
    }

    function stopVideo(vf) {
      if (!vf) { vidFigs.forEach(stopVideo); return; }
      vf.querySelector('video').pause(); vf.classList.remove('is-playing');
    }

    panel.addEventListener('wheel', e => {
      if (panel.hidden || isMobile()) return;         /* mobil scrollt das Blatt selbst */
      e.preventDefault();
      if (Math.abs(e.deltaY) < 8) return;
      go(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    panel.addEventListener('keydown', e => {
      if (isMobile()) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowUp'   || e.key === 'PageUp')                    { e.preventDefault(); go(-1); }
    });
    let ty = null;
    panel.addEventListener('touchstart', e => { ty = e.touches[0].clientY; }, { passive: true });
    panel.addEventListener('touchend',   e => {
      if (ty === null || isMobile()) return;
      const dy = ty - e.changedTouches[0].clientY; ty = null;
      if (Math.abs(dy) > 40) go(dy > 0 ? 1 : -1);
    });

    /* Video: Play-Button startet den Film im selben Rahmen */
    for (const vf of vidFigs) {
      const play = vf.querySelector('.pv-play'), video = vf.querySelector('video');
      if (!play || !video) continue;
      play.addEventListener('click', e => {
        e.stopPropagation();
        vf.classList.add('is-playing');
        video.play();
      });
      video.addEventListener('ended', () => vf.classList.remove('is-playing'));
    }

    /* "(back)" folgt dem Zeiger über dem Band */
    if (band && back) {
      band.addEventListener('mouseenter', () => band.classList.add('is-hover'));
      band.addEventListener('mouseleave', () => band.classList.remove('is-hover'));
      band.addEventListener('mousemove', e => { back.style.left = e.clientX + 'px'; back.style.top = e.clientY + 'px'; });
      band.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); band.click(); } });
    }

    addEventListener('resize', () => { if (!panel.hidden) placeArrow(); });

    /* ---- Mobil: Scroll-Modus ----
       Das Blatt scrollt normal; die Bilder liegen als Stapel fest unter dem
       Band und werden nur getauscht: Maßgeblich ist der Abschnitt, der oben
       unter dem Bild steht. Deckt ein Abschnitt mehrere Bilder ab (Stell dir
       vor: data-until; der letzte Abschnitt: alle restlichen Bilder), wird
       seine Scrollstrecke gleichmäßig auf die Bilder verteilt. */
    const stack = panel.querySelector('.pv-stack');
    const sheet = panel.querySelector('.pv-sheet');
    let mobPrepared = false;
    function ratioOf(fig) { const w = +(fig.style.getPropertyValue('--fw') || 1120), h = +(fig.style.getPropertyValue('--fh') || 630); return `${w} / ${h}`; }
    function prepareMobile() {
      if (mobPrepared || !stack) return; mobPrepared = true;
      stack.style.setProperty('--ratio', ratioOf(figs.find(f => +f.dataset.i === 0) || figs[0]));

    }
    let mobStep = -1;
    function showFig(i) {
      if (i === mobStep) return; mobStep = i;
      figs.forEach(f => f.classList.toggle('is-cur', +f.dataset.i === i));
      vidFigs.forEach(vf => { if (+vf.dataset.i !== i) stopVideo(vf); });
    }
    function onScroll() {
      if (!isMobile() || panel.hidden || !stack) return;
      const block = [...panel.querySelectorAll('.pv-text--2 > [data-lang-block]')].find(b => getComputedStyle(b).display !== 'none');
      if (!block) return;
      const secs = [...block.querySelectorAll('.pv-sec')]; if (!secs.length) { showFig(0); return; }
      const edge = stack.getBoundingClientRect().bottom + 24, st = panel.scrollTop;
      /* Scrollposition, bei der jeder Abschnitt oben an der Bildunterkante ankommt */
      const starts = secs.map(s => st + s.getBoundingClientRect().top - edge);
      const lastR = secs[secs.length - 1].getBoundingClientRect();
      const end = starts[starts.length - 1] + lastR.height;
      /* Ist das Blatt kürzer als diese Strecke (kurze Projekte), wird sie auf
         den tatsächlichen Scrollweg gestaucht: die Bilder wechseln dann
         entsprechend früher, alle bleiben erreichbar, kein Leerraum nötig */
      const max = Math.max(1, panel.scrollHeight - panel.clientHeight);
      const eff = end > max ? st * (end / max) : st;
      let k = -1;
      starts.forEach((s0, n) => { if (eff >= s0) k = n; });
      if (k < 0) { showFig(0); return; }
      const cur = secs[k], last = k === secs.length - 1;
      const a = +cur.dataset.sec, b = last ? N - 1 : +(cur.dataset.until || cur.dataset.sec);
      const count = b - a + 1;
      if (count <= 1) { showFig(a); return; }
      const len = last ? lastR.height : starts[k + 1] - starts[k];
      const progress = Math.max(0, Math.min(.999, (eff - starts[k]) / Math.max(1, len)));
      showFig(a + Math.floor(progress * count));
    }
    panel.addEventListener('scroll', onScroll, { passive: true });
    let poll = 0;   /* Sicherheitsnetz: Scroll-Ereignisse kommen bei Trägheits-Scrollen nicht immer sofort */

    panel.__pv = {
      reset() {
        step = 0; lock = 0; figs.forEach(f => f.classList.remove('is-out', 'is-back')); stopVideo();
        clearInterval(poll); poll = 0;
        if (isMobile() && stack) { prepareMobile(); panel.scrollTop = 0; mobStep = -1; showFig(0); placeArrow(); setTimeout(placeArrow, 700); poll = setInterval(onScroll, 250); }
        else render(0);
      },
      stop()  { stopVideo(); clearInterval(poll); poll = 0; }
    };
    /* Eigenständige Seite ohne Ordnerstapel (Who I am): sofort aufbauen */
    if (!panel.hidden) { panel.__pv.reset(); addEventListener('load', placeArrow); }
  }

  sync(false);
})();
