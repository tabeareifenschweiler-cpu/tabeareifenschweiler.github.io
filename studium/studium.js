/* =============================================================
   /studium – Kurse, Termine, Abgaben, To-dos

   Datenfluss
     kurse.json   →  Kursinhalte, Abgaben, Literatur (von Hand gepflegt)
     termine.json →  Stundenplan aus dem Outlook-Kalender
                     (python3 ../tools/studium_termine.py)
     localStorage →  Overlay: Notizen, To-dos, erledigte Abgaben, eigene
                     Abgaben und Literatur, belegte Wahlpflichtkurse,
                     Notizen und Markierungen (Abgabe/Präsentation) pro Termin

   Das Overlay wird nie von den JSON-Dateien überschrieben. To-dos und
   Literatur werden über ihren Text erkannt, Abgaben über "b:Titel" (aus
   kurse.json) bzw. ihre id (selbst angelegt), Termine über
   "Kurs|Datum|Beginn" – so überleben Notizen ein neues termine.json.
   ============================================================= */

(() => {
  'use strict';

  const KEY = 'tr.studium.v1';
  const HEUTE = tagesStart(new Date());
  const WT = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  const FARBEN = ['#2b59c3','#d98f2b','#1a7f4b','#8a3ffc','#00838f','#b0306a','#6b7a00','#8d5a3b','#4a5a6a'];
  const ART = {
    pflicht: 'Pflicht',
    wpf: 'Wahlpflicht Forschung',
    wpm: 'Wahlpflicht Management',
    wpg: 'Wahlpflicht Gestaltung'
  };
  const ALLGEMEIN = { id:'allgemein', titel:'Allgemein', kurz:'Allgemein', art:'allgemein', farbe:'#111111',
                      todos:[], abgaben:[], literatur:[] };

  let meta = {}, kurse = [], termine = [], terminStand = null;
  let overlay = ladeOverlay();
  const offen = new Set();
  let aFilter = 'offen';
  let typFilter = 'alle';          // Abgaben-Reiter: alle | abgabe | praes
  let nurWichtig = false;          // Woche + Kalender: nur Abgaben & Präsentationen
  let dialogTermin = null;
  let woStart = montag(HEUTE);
  let kalMonat = new Date(HEUTE.getFullYear(), HEUTE.getMonth(), 1);

  /* --- kleine Helfer ---------------------------------------- */
  function tagesStart(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
  function zuDatum(s)    { return s ? tagesStart(new Date(s + 'T00:00:00')) : null; }
  function tage(s)       { const d = zuDatum(s); return d ? Math.round((d - HEUTE) / 86400000) : null; }
  function iso(d)        { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function montag(d)     { const x = tagesStart(d); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; }
  function plus(d, n)    { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function wt(s)         { return WT[(zuDatum(s).getDay() + 6) % 7]; }
  function fmt(s)        { const d = zuDatum(s); return d ? wt(s) + ' ' + d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}) : 'offen'; }
  function fmtLang(s)    { const d = zuDatum(s); return d ? d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}) : '–'; }
  function kw(d) {
    const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
    return Math.ceil(((x - Date.UTC(x.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  }
  function abstand(s) {
    const t = tage(s);
    if (t == null) return '';
    if (t === 0) return 'heute';
    if (t === 1) return 'morgen';
    if (t === -1) return 'gestern';
    return t > 0 ? `in ${t} Tagen` : `vor ${-t} Tagen`;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  // Links in Literatur und Notizen klickbar machen (Text ist schon escaped).
  function verlinken(s) {
    return esc(s).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener">Link öffnen ↗</a>`);
  }
  const el = id => document.getElementById(id);

  /* --- Speicher --------------------------------------------- */
  function ladeOverlay() {
    const leer = { kurse:{}, gewaehlt:{}, termine:{}, gespeichert:null };
    try { return Object.assign(leer, JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch (e) { return leer; }
  }
  function sichern() {
    overlay.gespeichert = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(overlay)); } catch (e) { console.warn(e); }
    speicherinfo();
  }
  function eintrag(id) {
    const leer = { notizen:'', erledigt:{}, eigeneTodos:[], weg:[], literatur:[], gelesen:{}, fertig:{}, eigeneAbgaben:[] };
    overlay.kurse[id] = Object.assign(leer, overlay.kurse[id] || {});
    return overlay.kurse[id];
  }

  /* --- abgeleitete Listen ----------------------------------- */
  function kurs(id) { return id === 'allgemein' ? ALLGEMEIN : kurse.find(k => k.id === id); }
  function belegt(k) {
    if (k.art === 'pflicht' || k.art === 'allgemein') return true;
    return overlay.gewaehlt[k.id] != null ? overlay.gewaehlt[k.id] : !!k.gewaehlt;
  }
  function belegte() { return kurse.filter(belegt); }
  function mitAllgemein() { return belegte().concat(ALLGEMEIN); }

  function todosVon(k) {
    const e = eintrag(k.id);
    return (k.todos || []).filter(t => e.weg.indexOf(t) === -1)
      .concat(e.eigeneTodos)
      .map(text => ({ text, fertig: !!e.erledigt[text] }));
  }
  function literaturVon(k) {
    const e = eintrag(k.id);
    return (k.literatur || []).map(t => ({ text:t, eigen:false }))
      .concat(e.literatur.map(t => ({ text:t, eigen:true })))
      .map(l => Object.assign(l, { gelesen: !!e.gelesen[l.text] }));
  }
  function abgabenVon(k) {
    const e = eintrag(k.id);
    return (k.abgaben || []).map(a => Object.assign({ key:'b:' + a.titel, eigen:false }, a))
      .concat(e.eigeneAbgaben.map(a => Object.assign({ key:a.id, eigen:true }, a)))
      .map(a => Object.assign(a, { kurs:k, fertig: !!e.fertig[a.key] }));
  }
  function alleAbgaben() {
    return mitAllgemein().flatMap(abgabenVon).sort((a, b) =>
      (a.datum || '9999').localeCompare(b.datum || '9999'));
  }
  /* Alles mit Frist in einer Liste: Abgaben aus kurse.json/eigene und
     Termine, die als Abgabe oder Präsentation markiert sind. */
  function fristen() {
    const ab = alleAbgaben().map(a => Object.assign({}, a, { quelle:'liste', typen:[a.typ === 'praes' ? 'praes' : 'abgabe'] }));
    const te = sichtbareTermine().filter(wichtig).map(t => {
      const info = terminInfo(t);
      return { quelle:'termin', t: termine.indexOf(t), kurs: t.kurs ? kurs(t.kurs) : ALLGEMEIN,
               titel: terminName(t), datum: t.datum, zeit: t.von, info, fertig: !kommt(t),
               typen: [info.praes && 'praes', info.abgabe && 'abgabe'].filter(Boolean) };
    });
    return ab.concat(te).sort((a, b) =>
      ((a.datum || '9999') + (a.zeit || '')).localeCompare((b.datum || '9999') + (b.zeit || '')));
  }
  function typText(f) { return f.typen.map(x => x === 'praes' ? 'Präsentation' : 'Abgabe').join(' + '); }

  function termineVon(k) { return termine.filter(t => t.kurs === k.id); }
  function sichtbareTermine() {
    return termine.filter(t => !t.kurs || (kurs(t.kurs) && belegt(kurs(t.kurs))));
  }
  function terminName(t) { return t.kurs ? kurs(t.kurs).kurz : t.titel; }
  function terminKey(t)  { return [t.kurs || t.titel, t.datum, t.von].join('|'); }
  /* Präsentation ist vorbelegt, wenn der Kalender sie so nennt oder der Kurs
     das Datum in kurse.json unter "praesentationen" führt. */
  function terminInfo(t) {
    const o = overlay.termine[terminKey(t)] || {};
    const k = t.kurs ? kurs(t.kurs) : null;
    const praesVorgabe = t.art === 'praesentation' || !!(k && (k.praesentationen || []).indexOf(t.datum) !== -1);
    return {
      notiz: o.notiz || '',
      abgabe: !!o.abgabe,
      praes: o.praes != null ? o.praes : praesVorgabe
    };
  }
  function terminSetzen(t, feld, wert) {
    const key = terminKey(t);
    overlay.termine[key] = Object.assign(overlay.termine[key] || {}, { [feld]: wert });
  }
  function wichtig(t) { const i = terminInfo(t); return i.abgabe || i.praes; }
  function terminMarken(info) {
    return (info.praes ? ' <span class="marke marke--rot">Präsentation</span>' : '')
         + (info.abgabe ? ' <span class="marke marke--dunkel">Abgabe</span>' : '')
         + (info.notiz ? ' <span class="marke" title="Notiz vorhanden">✎ Notiz</span>' : '');
  }
  function naechsterTermin(k) {
    return termineVon(k).find(kommt) || null;
  }

  /* --- Laden ------------------------------------------------ */
  async function laden() {
    try {
      const [k, t] = await Promise.all([
        fetch('kurse.json',   { cache:'no-store' }).then(r => r.json()),
        fetch('termine.json', { cache:'no-store' }).then(r => r.json())
      ]);
      meta = k.meta || {};
      kurse = k.kurse;
      termine = t.termine || [];
      terminStand = t;
    } catch (e) {
      el('kursliste').innerHTML = '<p class="hinweis">kurse.json oder termine.json konnte nicht geladen werden. '
        + 'Lokal über einen Server öffnen (nicht als Datei).</p>';
      console.error(e);
      return;
    }
    el('semester').textContent = meta.semester || '';
    el('kopfinfo').textContent = [meta.studiengang, meta.hochschule, 'KW ' + kw(HEUTE)].filter(Boolean).join(' · ');
    kurswahlFuellen();
    alles();
  }

  function alles() {
    // Farben nur unter belegten Kursen verteilen, damit sie sich nicht doppeln.
    kurse.forEach(k => k.farbe = '#9ca3af');
    belegte().forEach((k, i) => k.farbe = FARBEN[i % FARBEN.length]);
    zeichneKurse();
    zeichneWoche();
    zeichneKalender();
    zeichneAbgaben();
    zeichneTodos();
    zeichneDaten();
  }

  /* --- Kurse ------------------------------------------------ */
  function kommt(t) {
    const h = iso(HEUTE);
    if (t.datum !== h) return t.datum > h;
    const jetzt = new Date();
    return t.bis > String(jetzt.getHours()).padStart(2,'0') + ':' + String(jetzt.getMinutes()).padStart(2,'0');
  }

  function zeichneKurse() {
    const h = iso(HEUTE);
    const naechste = sichtbareTermine().filter(kommt).slice(0, 6);
    el('naechste-termine').innerHTML = naechste.length ? naechste.map(t => terminZeile(t, true)).join('')
      : '<p class="leer">Keine Termine mehr.</p>';

    const ab = fristen().filter(f => !f.fertig && (!f.datum || f.datum >= h)).slice(0, 5);
    el('naechste-abgaben').innerHTML = ab.length ? ab.map(fristZeile).join('')
      : '<p class="leer">Nichts offen.</p>';

    const gruppen = [
      ['Pflicht', belegte().filter(k => k.art === 'pflicht')],
      ['Wahlpflicht', belegte().filter(k => k.art !== 'pflicht')]
    ];
    el('kursliste').innerHTML = gruppen.map(([titel, liste]) => liste.length ? `
      <div class="gruppe"><h3>${titel}</h3>${liste.map(karte).join('')}</div>` : '').join('');
  }

  function terminZeile(t, mitDatum) {
    const k = t.kurs ? kurs(t.kurs) : null;
    const vorbei = t.datum < iso(HEUTE);
    const info = terminInfo(t);
    return `<div class="zeile zeile--klick${vorbei ? ' zeile--vorbei' : ''}" data-t="${termine.indexOf(t)}" role="button" tabindex="0">
      ${mitDatum ? `<span class="zeile__datum">${fmt(t.datum)}, ${t.von}</span>` : `<span class="zeile__datum">${fmt(t.datum)}</span>`}
      <span class="zeile__was"><span class="punkt" style="--k:${k ? k.farbe : 'transparent'}"></span>${esc(terminName(t))}${terminMarken(info)}</span>
      <span class="zeile__wo">${mitDatum ? '' : t.von + '–' + t.bis + ' · '}${esc(t.raum || '')}${t.online ? ' · online' : ''}</span>
      ${!mitDatum && info.notiz ? `<span class="zeile__notiz">${esc(info.notiz)}</span>` : ''}
    </div>`;
  }

  function fristZeile(f) {
    const t = tage(f.datum);
    const eilig = t != null && t >= 0 && t <= 7;
    const ziel = f.quelle === 'termin' ? `data-t="${f.t}"` : `data-gehe="${f.kurs.id}"`;
    return `<div class="zeile zeile--klick${eilig ? ' zeile--eilig' : ''}" ${ziel} role="button" tabindex="0">
      <span class="zeile__datum">${f.datum ? fmt(f.datum) : 'Datum offen'}</span>
      <span class="zeile__was"><span class="punkt" style="--k:${f.kurs.farbe}"></span>${esc(f.quelle === 'termin' ? typText(f) : f.titel)}
        <span class="dim klein"> · ${esc(f.kurs.kurz)}</span></span>
      <span class="zeile__wo">${f.datum ? abstand(f.datum) : esc(f.hinweis || '')}${f.geschaetzt ? ' · geschätzt' : ''}</span>
    </div>`;
  }

  function karte(k) {
    const n = naechsterTermin(k);
    const todos = todosVon(k).filter(t => !t.fertig).length;
    const naechsteF = fristen().find(f => f.kurs.id === k.id && !f.fertig && f.datum && f.datum >= iso(HEUTE));
    const marken = [];
    if (naechsteF) {
      const t = tage(naechsteF.datum);
      marken.push(`<span class="marke${t <= 7 ? ' marke--rot' : ' marke--dunkel'}">${typText(naechsteF)} ${fmt(naechsteF.datum)}</span>`);
    }
    if (todos) marken.push(`<span class="marke">${todos} To-do${todos > 1 ? 's' : ''}</span>`);
    if (!(k.zusammenfassung || []).length) marken.push('<span class="marke">Inhalt fehlt</span>');

    return `<article class="karte${offen.has(k.id) ? ' offen' : ''}" id="kurs-${k.id}" style="--k:${k.farbe}">
      <button class="karte__kopf" data-oeffne="${k.id}" aria-expanded="${offen.has(k.id)}">
        <span class="karte__name">${esc(k.titel)}
          <span class="karte__unter">${esc((k.lehrende || []).join(', '))}</span></span>
        <span class="karte__info">${esc(k.rhythmus || '')}<br>
          <span class="dim">${n ? 'nächster Termin ' + fmt(n.datum) + ', ' + n.von : 'keine Termine mehr'}</span></span>
        <span class="karte__marken">${marken.join('')}</span>
      </button>
      <div class="karte__inhalt">${offen.has(k.id) ? inhalt(k) : ''}</div>
    </article>`;
  }

  function inhalt(k) {
    const e = eintrag(k.id);
    const zus = k.zusammenfassung || [];
    const zeilen = [
      ['Lehrende', (k.lehrende || []).join('<br>')],
      ['Art', ART[k.art]],
      ['Umfang', [k.ects && k.ects + ' ECTS', k.sws && k.sws + ' SWS'].filter(Boolean).join(', ')],
      ['Format', esc(k.format)],
      ['Wann', esc(k.rhythmus)],
      ['Bewertung', esc(k.bewertung)],
      ['Beschreibung', k.kursbeschreibung ? `<a href="${esc(k.kursbeschreibung)}" target="_blank" rel="noopener">Kursbeschreibung öffnen ↗</a>` : '']
    ].filter(z => z[1]);

    const todos = todosVon(k), lit = literaturVon(k), ab = abgabenVon(k), te = termineVon(k);

    return `<div class="innen2">
      <div>
        ${(k.hinweise || []).map(h => `<p class="hinweis" style="margin-top:16px">${esc(h)}</p>`).join('')}

        <div class="block"><table class="tabelle">${zeilen.map(z => `<tr><th>${z[0]}</th><td>${z[1]}</td></tr>`).join('')}</table></div>

        <div class="block"><h3>Worum es geht</h3>
          ${zus.length ? `<ul>${zus.map(z => `<li>${esc(z)}</li>`).join('')}</ul>`
            : `<p class="hinweis">Noch nicht zusammengefasst. ${k.kursbeschreibung ? `<a href="${esc(k.kursbeschreibung)}" target="_blank" rel="noopener">Kursbeschreibung lesen</a>` : ''}</p>`}
        </div>

        ${(k.abschnitte || []).map(ab => `<div class="block"><h3>${esc(ab.titel)}</h3>
          <ul>${(ab.punkte || []).map(z => `<li>${esc(z)}</li>`).join('')}</ul></div>`).join('')}

        ${(k.leistungsnachweis || []).length ? `<div class="block"><h3>Leistungsnachweis</h3>
          <ul>${k.leistungsnachweis.map(z => `<li>${esc(z)}</li>`).join('')}</ul></div>` : ''}

        <div class="block"><h3>Literatur</h3>
          <ul class="pruefliste">${lit.map((l, i) => `<li>
            <label><input type="checkbox" data-lit="${k.id}" data-i="${i}" ${l.gelesen ? 'checked' : ''}><span>${verlinken(l.text)}</span></label>
            ${l.eigen ? `<button class="weg" data-weg-lit="${k.id}" data-i="${i}" aria-label="Entfernen">×</button>` : ''}
          </li>`).join('') || '<li class="leer">Noch nichts.</li>'}</ul>
          <form class="reihe" data-form="lit" data-kurs="${k.id}">
            <input class="eingabe" name="text" placeholder="Empfehlung, Link, Buch …" required>
            <button class="knopf" type="submit">+</button>
          </form>
        </div>
      </div>

      <div>
        <div class="block"><h3>Abgaben &amp; Präsentationen</h3>
          ${te.filter(wichtig).map(t => terminZeile(t, true)).join('')}
          <ul class="pruefliste">${ab.map((a, i) => abgabePunkt(a, i)).join('') || (te.some(wichtig) ? '' : '<li class="leer">Keine bekannt. Termine lassen sich per Klick als Abgabe oder Präsentation markieren.</li>')}</ul>
          <form class="reihe" data-form="abgabe" data-kurs="${k.id}">
            <input class="eingabe" name="titel" placeholder="Neue Abgabe" required>
            <input class="eingabe" name="datum" type="date" style="max-width:160px">
            <button class="knopf" type="submit">+</button>
          </form>
        </div>

        <div class="block"><h3>To-dos</h3>
          <ul class="pruefliste">${todos.map((t, i) => `<li>
            <label><input type="checkbox" data-todo="${k.id}" data-i="${i}" ${t.fertig ? 'checked' : ''}><span>${esc(t.text)}</span></label>
            <button class="weg" data-weg-todo="${k.id}" data-i="${i}" aria-label="Entfernen">×</button>
          </li>`).join('') || '<li class="leer">Nichts zu tun.</li>'}</ul>
          <form class="reihe" data-form="todo" data-kurs="${k.id}">
            <input class="eingabe" name="text" placeholder="Neues To-do" required>
            <button class="knopf" type="submit">+</button>
          </form>
        </div>

        <div class="block"><h3>Notizen</h3>
          <textarea class="notiz" data-notiz="${k.id}" placeholder="Mitschriften, Fragen, Ideen … (speichert automatisch)">${esc(e.notizen)}</textarea>
        </div>

        <div class="block"><h3>Termine (${te.length})</h3>
          <div class="terminliste">${te.map(t => terminZeile(t, false)).join('') || '<p class="leer">Keine im Kalender.</p>'}</div>
        </div>
      </div>
    </div>`;
  }

  function abgabePunkt(a, i) {
    const t = tage(a.datum);
    const eilig = !a.fertig && t != null && t >= 0 && t <= 7;
    return `<li>
      <label><input type="checkbox" data-abgabe="${a.kurs.id}" data-i="${i}" ${a.fertig ? 'checked' : ''}>
        <span>${a.typ === 'praes' ? '<span class="marke marke--rot">Präsentation</span> ' : ''}${esc(a.titel)}${a.zeit ? ', ' + esc(a.zeit) + ' Uhr' : ''}${a.geschaetzt ? ' <span class="dim klein">(geschätzt)</span>' : ''}${a.hinweis ? ` <span class="dim klein">– ${esc(a.hinweis)}</span>` : ''}</span></label>
      <span class="datum${eilig ? ' datum--eilig' : ''}">${a.datum ? fmt(a.datum) : ''}</span>
      ${a.eigen ? `<button class="weg" data-weg-abgabe="${a.kurs.id}" data-i="${i}" aria-label="Entfernen">×</button>` : ''}
    </li>`;
  }

  /* --- Woche ------------------------------------------------ */
  function eintraegeAm(s) {
    const te = sichtbareTermine().filter(t => t.datum === s)
      .filter(t => !nurWichtig || wichtig(t))
      .map(t => ({
        typ: t.kurs ? 'termin' : 'allgemein', kurs: t.kurs, t: termine.indexOf(t), name: terminName(t),
        zeit: t.von + '–' + t.bis, wo: [t.raum, t.online ? 'online' : ''].filter(Boolean).join(' · '),
        farbe: t.kurs ? kurs(t.kurs).farbe : null, info: terminInfo(t)
      }));
    const ab = alleAbgaben().filter(a => a.datum === s).map(a => ({
      typ: a.typ === 'praes' ? 'praes' : 'abgabe', kurs: a.kurs.id,
      name: (a.typ === 'praes' ? 'Präsentation: ' : 'Abgabe: ') + a.titel + (a.fertig ? ' ✓' : ''),
      zeit: a.zeit || '', wo: a.kurs.kurz, farbe: a.kurs.farbe
    }));
    return ab.concat(te);
  }
  // Termine öffnen den Termin-Dialog, Abgaben springen zum Kurs.
  function ziel(x) { return x.t != null ? `data-t="${x.t}"` : (x.kurs ? `data-gehe="${x.kurs}"` : ''); }
  function kennung(x) {
    if (!x.info) return '';
    return (x.info.praes ? '★ ' : '') + (x.info.abgabe ? '⬆ ' : '') + (x.info.notiz ? '✎ ' : '');
  }

  function zeichneWoche() {
    const ende = plus(woStart, 6);
    el('wo-titel').textContent = `KW ${kw(woStart)} · ${fmtLang(iso(woStart)).slice(0, 6)}–${fmtLang(iso(ende))}`;
    let html = '';
    for (let i = 0; i < 7; i++) {
      const d = plus(woStart, i), s = iso(d);
      const liste = eintraegeAm(s);
      const we = i >= 5 && !eintraegeAm(s).length;
      html += `<div class="tag${s === iso(HEUTE) ? ' tag--heute' : ''}${we ? ' tag--we' : ''}">
        <div class="tag__kopf">${WT[i]} ${d.getDate()}.${d.getMonth() + 1}.</div>
        ${liste.map(x => `<button class="eintrag${x.typ === 'abgabe' || x.typ === 'praes' || (x.info && (x.info.praes || x.info.abgabe)) ? ' eintrag--abgabe' : ''}${x.typ === 'allgemein' ? ' eintrag--allgemein' : ''}"
            ${ziel(x)} style="--k:${x.farbe || 'var(--grau)'}">
            <b>${esc(kennung(x) + x.name)}</b>${esc(x.zeit)}${x.wo ? `<br><span class="dim">${esc(x.wo)}</span>` : ''}
            ${x.info && x.info.notiz ? `<span class="eintrag__notiz">${esc(x.info.notiz)}</span>` : ''}
          </button>`).join('') || `<span class="dim klein">${nurWichtig ? '–' : 'frei'}</span>`}
      </div>`;
    }
    el('woche').innerHTML = html;
  }

  /* --- Monat ------------------------------------------------ */
  function zeichneKalender() {
    const j = kalMonat.getFullYear(), m = kalMonat.getMonth();
    el('kal-monat').textContent = kalMonat.toLocaleDateString('de-DE', { month:'long', year:'numeric' });
    let html = WT.map(w => `<div class="kal__wt">${w}</div>`).join('');
    const vorlauf = (new Date(j, m, 1).getDay() + 6) % 7;
    const anzahl = new Date(j, m + 1, 0).getDate();
    for (let i = 0; i < vorlauf; i++) html += '<div class="kal__tag kal__tag--leer"></div>';
    for (let t = 1; t <= anzahl; t++) {
      const s = iso(new Date(j, m, t));
      html += `<div class="kal__tag${s === iso(HEUTE) ? ' kal__tag--heute' : ''}">
        <span class="kal__zahl">${t}</span>
        ${eintraegeAm(s).map(x => `<button class="kal__termin${x.typ === 'abgabe' || x.typ === 'praes' ? ' kal__termin--abgabe' : ''}${x.typ === 'allgemein' ? ' kal__termin--allgemein' : ''}${x.info && (x.info.praes || x.info.abgabe) ? ' kal__termin--wichtig' : ''}"
          ${ziel(x)} style="--k:${x.farbe || 'var(--grau)'}" title="${esc(x.name + ' ' + x.zeit + (x.info && x.info.notiz ? '\n' + x.info.notiz : ''))}">${esc(kennung(x) + x.name)}</button>`).join('')}
      </div>`;
    }
    const rest = (7 - (vorlauf + anzahl) % 7) % 7;
    for (let i = 0; i < rest; i++) html += '<div class="kal__tag kal__tag--leer"></div>';
    el('kal').innerHTML = html;

    el('legende').innerHTML = belegte().map(k =>
      `<span><span class="punkt" style="--k:${k.farbe}"></span>${esc(k.kurz)}</span>`).join('')
      + '<span><span class="punkt" style="--k:var(--rot)"></span>Abgabe aus Kursliste</span>'
      + '<span>★ Präsentation</span><span>⬆ Abgabe-Termin</span><span>✎ Notiz</span>';
  }

  /* --- Abgaben & Präsentationen ---------------------------- */
  function zeichneAbgaben() {
    const h = iso(HEUTE);
    let liste = fristen();
    if (aFilter === 'offen') liste = liste.filter(f => !f.fertig);
    if (typFilter !== 'alle') liste = liste.filter(f => f.typen.indexOf(typFilter) !== -1);
    const vorbei = liste.filter(f => f.datum && f.datum < h);
    const kommend = liste.filter(f => !f.datum || f.datum >= h);
    const zeile = f => {
      const t = tage(f.datum);
      const eilig = !f.fertig && t != null && t >= 0 && t <= 7;
      const datum = `<span class="datum${eilig ? ' datum--eilig' : ''}">${f.datum ? fmt(f.datum) + (f.zeit ? ', ' + esc(f.zeit) : '') + ' · ' + abstand(f.datum) : 'Datum offen'}</span>`;
      const marke = f.typen.indexOf('praes') !== -1 ? '<span class="marke marke--rot">Präsentation</span> ' : '<span class="marke marke--dunkel">Abgabe</span> ';
      if (f.quelle === 'termin') {
        return `<li style="--k:${f.kurs.farbe}" class="zeile--klick" data-t="${f.t}" role="button" tabindex="0">
          <span class="frist__text"><span class="punkt"></span>${f.typen.map(x => x === 'praes' ? '<span class="marke marke--rot">Präsentation</span>' : '<span class="marke marke--dunkel">Abgabe</span>').join(' ')}
            ${esc(f.titel)} <span class="dim klein">· Sitzung${f.info.notiz ? ' · ✎ ' + esc(f.info.notiz.split('\n')[0]) : ''}</span></span>
          ${datum}
        </li>`;
      }
      const i = abgabenVon(f.kurs).findIndex(x => x.key === f.key);
      return `<li style="--k:${f.kurs.farbe}">
        <label><input type="checkbox" data-abgabe="${f.kurs.id}" data-i="${i}" ${f.fertig ? 'checked' : ''}>
          <span><span class="punkt"></span>${marke}${esc(f.titel)} <span class="dim klein">· ${esc(f.kurs.kurz)}${f.geschaetzt ? ' · geschätzt' : ''}${f.hinweis ? ' · ' + esc(f.hinweis) : ''}</span></span></label>
        ${datum}
        ${f.eigen ? `<button class="weg" data-weg-abgabe="${f.kurs.id}" data-i="${i}" aria-label="Entfernen">×</button>` : ''}
      </li>`;
    };
    el('abgabenliste').innerHTML =
      (kommend.length ? `<ul class="pruefliste">${kommend.map(zeile).join('')}</ul>` : '<p class="leer">Nichts offen.</p>')
      + (vorbei.length ? `<h3 style="margin-top:28px">Vorbei</h3><ul class="pruefliste">${vorbei.map(zeile).join('')}</ul>` : '');
  }

  /* --- To-dos ----------------------------------------------- */
  function zeichneTodos() {
    const zeigen = el('erledigte-zeigen').checked;
    const html = mitAllgemein().map(k => {
      const todos = todosVon(k).map((t, i) => Object.assign(t, { i })).filter(t => zeigen || !t.fertig);
      if (!todos.length) return '';
      return `<div class="block" style="--k:${k.farbe}"><h3><span class="punkt"></span>${esc(k.kurz)}</h3>
        <ul class="pruefliste">${todos.map(t => `<li>
          <label><input type="checkbox" data-todo="${k.id}" data-i="${t.i}" ${t.fertig ? 'checked' : ''}><span>${esc(t.text)}</span></label>
          <button class="weg" data-weg-todo="${k.id}" data-i="${t.i}" aria-label="Entfernen">×</button>
        </li>`).join('')}</ul></div>`;
    }).join('');
    el('todoliste').innerHTML = html || '<p class="leer">Alles erledigt.</p>';
  }

  /* --- Daten ------------------------------------------------ */
  function zeichneDaten() {
    el('wp-wahl').innerHTML = ['wpf', 'wpm', 'wpg'].map(art => `
      <div class="block"><h3>${ART[art].replace('Wahlpflicht ', '')}</h3>
        <ul class="pruefliste">${kurse.filter(k => k.art === art).map(k => `<li>
          <label><input type="checkbox" data-wp="${k.id}" ${belegt(k) ? 'checked' : ''}>
          <span style="text-decoration:none;color:inherit">${esc(k.kurz)} <span class="dim klein">· ${esc(k.rhythmus)}</span></span></label>
        </li>`).join('')}</ul></div>`).join('');
    el('standtext').textContent = `Kursdaten: Stand ${fmtLang(meta.stand)}. Termine: ${terminStand ? terminStand.quelle + ', Stand ' + fmtLang(terminStand.stand) : '–'}.`;
    speicherinfo();
  }
  function speicherinfo() {
    el('speicherinfo').textContent = overlay.gespeichert
      ? 'Zuletzt gespeichert: ' + new Date(overlay.gespeichert).toLocaleString('de-DE')
      : 'Noch nichts Eigenes gespeichert.';
  }

  function kurswahlFuellen() {
    const opt = mitAllgemein().map(k => `<option value="${k.id}">${esc(k.kurz)}</option>`).join('');
    document.querySelectorAll('.kurswahl').forEach(s => { const v = s.value; s.innerHTML = opt; if (v) s.value = v; });
  }

  /* --- Navigation ------------------------------------------- */
  function zeigeSeite(name) {
    document.querySelectorAll('#reiter button').forEach(b => b.setAttribute('aria-selected', b.dataset.seite === name));
    document.querySelectorAll('.seite').forEach(s => s.classList.toggle('aktiv', s.id === 'seite-' + name));
    try { sessionStorage.setItem(KEY + '.seite', name); } catch (e) {}
  }
  function geheZuKurs(id) {
    if (id === 'allgemein') { zeigeSeite('todos'); return; }
    offen.add(id);
    zeigeSeite('kurse');
    zeichneKurse();
    const k = el('kurs-' + id);
    if (k) k.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  /* --- Termin-Dialog ---------------------------------------- */
  function oeffneTermin(i) {
    const t = termine[i];
    if (!t) return;
    dialogTermin = t;
    const info = terminInfo(t), k = t.kurs ? kurs(t.kurs) : null;
    el('td-punkt').style.setProperty('--k', k ? k.farbe : 'transparent');
    el('td-titel').textContent = k ? k.titel : t.titel;
    el('td-wann').textContent = `${fmt(t.datum)} ${zuDatum(t.datum).getFullYear()}, ${t.von}–${t.bis}`
      + (t.raum ? ' · ' + t.raum : '') + (t.online ? ' · online' : '');
    el('td-praes').checked = info.praes;
    el('td-abgabe').checked = info.abgabe;
    el('td-notiz').value = info.notiz;
    el('td-kurs').hidden = !k;
    el('termin-dialog').showModal();
  }

  /* --- Ereignisse ------------------------------------------- */
  document.addEventListener('click', ev => {
    if (ev.target.closest('label, input, textarea, select, a')) return;
    const t = ev.target.closest('button, [data-oeffne], [data-t]');
    if (!t) return;
    const d = t.dataset;

    if (d.seite) { zeigeSeite(d.seite); return; }
    if (d.t != null) { oeffneTermin(+d.t); return; }
    if (d.wfilter) { nurWichtig = d.wfilter === 'wichtig'; zeichneWoche(); zeichneKalender(); filterKnoepfe(); return; }
    if (d.typ) { typFilter = d.typ; zeichneAbgaben(); filterKnoepfe(); return; }
    if (d.oeffne) { offen.has(d.oeffne) ? offen.delete(d.oeffne) : offen.add(d.oeffne); zeichneKurse(); return; }
    if (d.gehe) { geheZuKurs(d.gehe); return; }
    if (d.afilter) {
      aFilter = d.afilter;
      zeichneAbgaben(); filterKnoepfe(); return;
    }

    if (d.wegTodo) {
      const k = kurs(d.wegTodo), e = eintrag(k.id), text = todosVon(k)[+d.i].text;
      if ((k.todos || []).indexOf(text) !== -1) e.weg.push(text);
      else e.eigeneTodos = e.eigeneTodos.filter(x => x !== text);
      delete e.erledigt[text];
      sichern(); alles(); return;
    }
    if (d.wegLit) {
      const k = kurs(d.wegLit), e = eintrag(k.id), text = literaturVon(k)[+d.i].text;
      e.literatur = e.literatur.filter(x => x !== text);
      delete e.gelesen[text];
      sichern(); alles(); return;
    }
    if (d.wegAbgabe) {
      const k = kurs(d.wegAbgabe), e = eintrag(k.id), a = abgabenVon(k)[+d.i];
      if (!confirm(`„${a.titel}“ löschen?`)) return;
      e.eigeneAbgaben = e.eigeneAbgaben.filter(x => x.id !== a.key);
      delete e.fertig[a.key];
      sichern(); alles(); return;
    }

    switch (t.id) {
      case 'td-kurs': {
        const id = dialogTermin && dialogTermin.kurs;
        el('termin-dialog').close();
        if (id) geheZuKurs(id);
        break;
      }
      case 'wo-zurueck': woStart = plus(woStart, -7); zeichneWoche(); break;
      case 'wo-vor':     woStart = plus(woStart, 7);  zeichneWoche(); break;
      case 'wo-heute':   woStart = montag(HEUTE);     zeichneWoche(); break;
      case 'kal-zurueck': kalMonat = new Date(kalMonat.getFullYear(), kalMonat.getMonth() - 1, 1); zeichneKalender(); break;
      case 'kal-vor':     kalMonat = new Date(kalMonat.getFullYear(), kalMonat.getMonth() + 1, 1); zeichneKalender(); break;
      case 'kal-heute':   kalMonat = new Date(HEUTE.getFullYear(), HEUTE.getMonth(), 1); zeichneKalender(); break;
      case 'export': exportieren(); break;
      case 'zuruecksetzen':
        if (confirm('Alle Notizen, To-dos, erledigten Abgaben und eigene Literatur in diesem Browser löschen?')) {
          try { localStorage.removeItem(KEY); } catch (e) {}
          overlay = ladeOverlay(); alles();
        }
        break;
    }
  });

  document.addEventListener('keydown', ev => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-t][role="button"]')) {
      ev.preventDefault(); oeffneTermin(+ev.target.dataset.t);
    }
  });

  function filterKnoepfe() {
    document.querySelectorAll('[data-afilter]').forEach(b => b.setAttribute('aria-pressed', b.dataset.afilter === aFilter));
    document.querySelectorAll('[data-typ]').forEach(b => b.setAttribute('aria-pressed', b.dataset.typ === typFilter));
    document.querySelectorAll('[data-wfilter]').forEach(b => b.setAttribute('aria-pressed', (b.dataset.wfilter === 'wichtig') === nurWichtig));
  }

  el('termin-dialog').addEventListener('close', () => { dialogTermin = null; alles(); });

  document.addEventListener('change', ev => {
    const t = ev.target, d = t.dataset;
    if (d.todo) {
      const k = kurs(d.todo), text = todosVon(k)[+d.i].text;
      eintrag(k.id).erledigt[text] = t.checked;
    } else if (d.lit) {
      const k = kurs(d.lit), text = literaturVon(k)[+d.i].text;
      eintrag(k.id).gelesen[text] = t.checked;
    } else if (d.abgabe) {
      const k = kurs(d.abgabe), a = abgabenVon(k)[+d.i];
      eintrag(k.id).fertig[a.key] = t.checked;
    } else if (d.wp) {
      overlay.gewaehlt[d.wp] = t.checked;
      kurswahlFuellen();
    } else if ((t.id === 'td-praes' || t.id === 'td-abgabe') && dialogTermin) {
      terminSetzen(dialogTermin, t.id === 'td-praes' ? 'praes' : 'abgabe', t.checked);
      sichern(); return;               // neu gezeichnet wird beim Schließen
    } else if (t.id === 'erledigte-zeigen') {
      zeichneTodos(); return;
    } else if (t.id === 'import') {
      importieren(t.files[0]); t.value = ''; return;
    } else return;
    sichern(); alles();
  });

  // Notizen speichern beim Tippen, ohne neu zu zeichnen (sonst springt der Cursor).
  let notizTimer = null;
  document.addEventListener('input', ev => {
    if (ev.target.id === 'td-notiz' && dialogTermin) {
      terminSetzen(dialogTermin, 'notiz', ev.target.value);
      clearTimeout(notizTimer);
      notizTimer = setTimeout(sichern, 400);
      return;
    }
    const id = ev.target.dataset && ev.target.dataset.notiz;
    if (!id) return;
    eintrag(id).notizen = ev.target.value;
    clearTimeout(notizTimer);
    notizTimer = setTimeout(sichern, 400);
  });

  document.addEventListener('submit', ev => {
    if (ev.target.method === 'dialog') { clearTimeout(notizTimer); sichern(); return; }
    ev.preventDefault();
    const f = ev.target, daten = new FormData(f);
    const kid = f.dataset.kurs || daten.get('kurs');
    const e = eintrag(kid);
    const text = String(daten.get('text') || '').trim();

    if (f.dataset.form === 'todo' || f.id === 'neu-todo') {
      if (!text || todosVon(kurs(kid)).some(t => t.text === text)) return;
      e.eigeneTodos.push(text);
    } else if (f.dataset.form === 'lit') {
      if (!text || literaturVon(kurs(kid)).some(l => l.text === text)) return;
      e.literatur.push(text);
    } else if (f.dataset.form === 'abgabe' || f.id === 'neu-abgabe') {
      const titel = String(daten.get('titel') || '').trim();
      if (!titel) return;
      e.eigeneAbgaben.push({ id:'e:' + Date.now().toString(36), titel, datum: daten.get('datum') || null,
                             typ: daten.get('typ') === 'praes' ? 'praes' : 'abgabe' });
    } else return;

    sichern();
    f.reset();
    if (f.dataset.kurs) offen.add(kid);
    alles();
    const neu = f.dataset.kurs && document.querySelector(`form[data-form="${f.dataset.form}"][data-kurs="${kid}"] input`);
    if (neu) neu.focus();
  });

  /* --- Export / Import -------------------------------------- */
  function exportieren() {
    const blob = new Blob([JSON.stringify({ art:'studium-overlay', version:1, overlay }, null, 1)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `studium-stand-${iso(HEUTE)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importieren(datei) {
    if (!datei) return;
    datei.text().then(s => {
      const d = JSON.parse(s);
      if (d.art !== 'studium-overlay' || !d.overlay || !d.overlay.kurse) throw new Error('Kein Studium-Export');
      if (!confirm('Den Stand aus der Datei übernehmen? Was hier im Browser gespeichert ist, wird ersetzt.')) return;
      overlay = Object.assign({ kurse:{}, gewaehlt:{}, termine:{} }, d.overlay);
      sichern(); kurswahlFuellen(); alles();
    }).catch(err => alert('Import fehlgeschlagen: ' + err.message));
  }

  try { const s = sessionStorage.getItem(KEY + '.seite'); if (s) zeigeSeite(s); } catch (e) {}
  laden();
})();
