/* =============================================================
   /todos – Awards, Fristen, To-dos

   Datenfluss
     awards.json  →  Basis, im Repo gepflegt
     localStorage →  Overlay: Status, Notizen, To-do-Spalten, Material,
                     gelöschte Awards, selbst angelegte Awards und To-dos

   Das Overlay wird nie von awards.json überschrieben. "Daten neu laden"
   holt die Basis frisch und legt das Overlay wieder darüber.
   ============================================================= */

(() => {
  'use strict';

  const KEY = 'tr.todos.v2';
  const HEUTE = tagesStart(new Date());

  const STATI = ['geplant', 'in Vorbereitung', 'eingereicht', 'gewonnen', 'abgelehnt', 'verpasst'];
  const SPALTEN = [
    { id: 'offen',       titel: 'Offen' },
    { id: 'bearbeitung', titel: 'In Bearbeitung' },
    { id: 'erledigt',    titel: 'Erledigt' }
  ];
  const TYP = {
    early_bird: 'Early Bird', regular: 'Regulär', final: 'Final Deadline',
    anmeldung: 'Anmeldeschluss', nominierung: 'Nominierungsschluss', brief: 'Brief-Abgabe'
  };
  const BEREICH_TITEL = {
    arbeit: 'Bachelorarbeit einreichen',
    brief:  'Eigene Aufgabe'
  };

  let basis = null;
  let overlay = ladeOverlay();
  let awards = [];                 // sichtbar, Basis + eigene, ohne gelöschte
  let alleAwards = [];             // inklusive gelöschter

  let fRaum   = 'alle';
  let fStatus = 'alle';
  let fTodo    = 'alle';
  let kalMonat = new Date(HEUTE.getFullYear(), HEUTE.getMonth(), 1);
  let aufgeklappt = null;

  /* --- kleine Helfer ---------------------------------------- */
  function tagesStart(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
  function zuDatum(iso)  { return iso ? tagesStart(new Date(iso + 'T00:00:00')) : null; }
  function tage(iso)     { const d = zuDatum(iso); return d ? Math.round((d - HEUTE) / 86400000) : null; }
  function iso(d)        { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function fmt(s)        { const d = zuDatum(s); return d ? d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}) : '–'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function zeilen(s) { return String(s||'').split('\n').map(x=>x.trim()).filter(Boolean); }
  const el = id => document.getElementById(id);

  /* Nächste offene Frist, sonst die letzte vergangene. */
  function naechsteFrist(a) {
    const ds = (a.deadlines || []).slice().sort((x,y) => x.datum.localeCompare(y.datum));
    return ds.find(d => tage(d.datum) >= 0) || ds[ds.length-1] || null;
  }

  /* --- Speicher --------------------------------------------- */
  function ladeOverlay() {
    const leer = { awards:{}, material:{}, eigene:[], eigeneTodos:[], geloescht:[], eigenesMaterial:[], zeigeBriefs:false, gespeichert:null };
    try {
      const o = JSON.parse(localStorage.getItem(KEY));
      return Object.assign(leer, o || {});
    } catch (e) { return leer; }
  }
  function sichern() {
    overlay.gespeichert = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(overlay)); } catch (e) { console.warn(e); }
    speicherinfo();
  }
  function eintrag(id) {
    if (!overlay.awards[id]) overlay.awards[id] = { status:null, notizen:null, todos:{}, extra:[] };
    const e = overlay.awards[id];
    e.todos = e.todos || {}; e.extra = e.extra || [];
    return e;
  }

  /* Basis und Overlay zusammenführen. To-dos werden über ihren Text
     identifiziert, damit Änderungen an awards.json die Spaltenzuordnung
     nicht verschieben. */
  function mischen() {
    const roh = basis.awards.concat(overlay.eigene);
    alleAwards = roh.map(a => {
      const o = overlay.awards[a.id] || {};
      const texte = (a.todos || []).map(t => t.text).concat(o.extra || []);
      return Object.assign({}, a, {
        geloescht: overlay.geloescht.indexOf(a.id) !== -1,
        status:  o.status  != null ? o.status  : (a.status || 'geplant'),
        notizen: o.notizen != null ? o.notizen : (a.notizen || ''),
        todos: texte.map(text => {
          const basisTodo = (a.todos || []).find(t => t.text === text);
          const gespeichert = o.todos && o.todos[text];
          return {
            text,
            zustand: gespeichert || (basisTodo && basisTodo.zustand) || 'offen',
            eigen: !basisTodo
          };
        })
      });
    });
    // Brief-Wettbewerbe sind global ausgeblendet, bis sie eingeschaltet werden.
    // Das wirkt auf Übersicht, Kalender und To-do-Brett gleichzeitig.
    awards = alleAwards.filter(a => !a.geloescht)
                       .filter(a => overlay.zeigeBriefs || a.bereich !== 'brief');
  }

  /* --- Eignungsprüfung -------------------------------------- */
  function pruefen(a) {
    const p = basis.profil, out = [];
    const bezug = a.zeitfenster_bezug === 'abgabe' ? p.abgabe_am : p.veroeffentlicht_am;
    const bezugName = a.zeitfenster_bezug === 'abgabe' ? 'Abgabe' : 'Erstveröffentlichung';

    if (a.zeitfenster_von && a.zeitfenster_bis) {
      const drin = bezug >= a.zeitfenster_von && bezug <= a.zeitfenster_bis;
      out.push({ warn: !drin, text: drin
        ? `${bezugName} am ${fmt(bezug)} liegt im Zeitfenster (${fmt(a.zeitfenster_von)} bis ${fmt(a.zeitfenster_bis)}).`
        : `${bezugName} am ${fmt(bezug)} liegt außerhalb des Zeitfensters (${fmt(a.zeitfenster_von)} bis ${fmt(a.zeitfenster_bis)}).` });
    }
    if (a.hochschule_muss_angemeldet_sein) out.push({ warn:true, text:'Die Hochschule muss angemeldet sein. Zuerst klären, ob die HdM teilnimmt.' });
    if (a.nominierung_noetig)              out.push({ warn:true, text:'Nicht frei einreichbar – es braucht eine Nominierung.' });
    if (a.auftrag_vorausgesetzt)           out.push({ warn:true, text:'Setzt ein Auftragsverhältnis voraus. Eine freie Abschlussarbeit fällt hier meist raus.' });
    if (a.brief_vorausgesetzt)             out.push({ warn:true, text:'Nur Einreichungen auf einen gesetzten Brief. Die Bachelorarbeit passt nicht direkt.' });
    if (a.immatrikulation_stichtag)        out.push({ warn:true, text:`Immatrikulation am ${fmt(a.immatrikulation_stichtag)} vorausgesetzt.` });
    if (a.landesbezug)                     out.push({ warn:true, text:`Landesbezug zu ${a.landesbezug} vorausgesetzt – die HdM liegt in Baden-Württemberg. Fällt damit raus.` });
    if (a.objekt_einsenden)                out.push({ warn:true, text:'Das Original soll zur Jurysitzung geschickt werden. Bei einer begehbaren Ausstellung vorher klären, ob eine Station oder eine Dokumentation reicht.' });
    if (a.umsetzung_gefordert === 'konzept' && p.umsetzung === 'gebaut')
      out.push({ warn:true, text:'Zielt auf noch nicht realisierte Konzepte. Die Ausstellung ist gebaut und gezeigt – Zulässigkeit prüfen.' });
    if (a.kosten_bei_gewinn && !/^keine/i.test(a.kosten_bei_gewinn))
      out.push({ warn:true, text:'Kosten im Gewinnfall: ' + a.kosten_bei_gewinn });

    if (a.umsetzung_gefordert === 'gebaut') out.push({ warn:false, text:'Gebaute Umsetzung gefordert – liegt vor.' });
    if (a.sdg_pflicht)                      out.push({ warn:false, text:`SDG-Bezug gefordert – Projekt deckt SDG ${p.sdg.join(' und ')} ab.` });
    if (a.abschluss_max_jahre) {
      const g = zuDatum(p.abgabe_am); g.setFullYear(g.getFullYear() + a.abschluss_max_jahre);
      out.push({ warn:false, text:`Einreichbar bis ${a.abschluss_max_jahre} Jahre nach Abschluss, also bis ${fmt(iso(g))}.` });
    }
    const schnitt = (a.passende_disziplinen || []).filter(d =>
      p.disziplinen.indexOf(d) !== -1 || p.disziplinen_sekundaer.indexOf(d) !== -1);
    if ((a.passende_disziplinen || []).length)
      out.push({ warn: !schnitt.length, text: schnitt.length
        ? 'Passt zu: ' + schnitt.join(', ') + '.'
        : 'Keine Überschneidung mit den Disziplinen des Projekts.' });

    const n = naechsteFrist(a);
    if (n && tage(n.datum) < 0) out.push({ warn:true, text:'Alle hinterlegten Fristen sind vorbei. Nächste Ausschreibung suchen.' });
    return out;
  }

  /* --- Übersicht -------------------------------------------- */
  function sichtbareAwards() {
    return awards
      .filter(a => fRaum === 'alle' || a.raum === fRaum)
      .filter(a => fStatus  === 'alle' || a.status  === fStatus)
      .sort((x,y) => {
        const nx = naechsteFrist(x), ny = naechsteFrist(y);
        const tx = nx ? tage(nx.datum) : 99999, ty = ny ? tage(ny.datum) : 99999;
        if ((tx < 0) !== (ty < 0)) return tx < 0 ? 1 : -1;
        return tx - ty;
      });
  }

  function zeichneListe() {
    const box = el('liste');
    const items = sichtbareAwards();
    if (!items.length) { box.innerHTML = '<p class="leer">Kein Award in dieser Auswahl.</p>'; return; }

    box.innerHTML = items.map(a => {
      const n = naechsteFrist(a);
      const t = n ? tage(n.datum) : null;
      const vorbei = t != null && t < 0;
      const eilig  = t != null && t >= 0 && t <= 30;
      const fertig = a.todos.filter(x => x.zustand === 'erledigt').length;
      const txt = t == null ? 'kein Termin' : vorbei ? 'abgelaufen'
        : t === 0 ? 'heute' : 'noch ' + t + (t === 1 ? ' Tag' : ' Tage');

      return `
      <div class="karte ${eilig?'karte--eilig':''} ${vorbei?'karte--vorbei':''} ${aufgeklappt===a.id?'offen':''}" data-id="${esc(a.id)}">
        <div class="karte__kopf" data-auf="${esc(a.id)}">
          <span class="karte__name">${esc(a.name)}
            <span class="karte__veranstalter">${esc(a.veranstalter||'')}</span>
          </span>
          ${a.bereich==='brief' ? '<span class="marke marke--brief">eigene Aufgabe</span>' : ''}
          <span class="marke ${a.status==='gewonnen'?'marke--gut':(a.status!=='geplant'?'marke--aktiv':'')}">${esc(a.status)}</span>
          <span class="marke">${fertig}/${a.todos.length} To-dos</span>
          <span class="karte__frist">
            <span class="karte__tage ${eilig?'karte__tage--eilig':''}">${txt}</span><br>
            <span class="dim">${n ? (n.geschaetzt?'≈ ':'') + fmt(n.datum) + ' · ' + (TYP[n.typ]||n.typ) : ''}</span>
          </span>
        </div>
        <div class="karte__inhalt">${aufgeklappt===a.id ? detail(a) : ''}</div>
      </div>`;
    }).join('');

    box.querySelectorAll('[data-auf]').forEach(k => k.addEventListener('click', e => {
      if (e.target.closest('a,button,select,textarea,input')) return;
      aufgeklappt = aufgeklappt === k.dataset.auf ? null : k.dataset.auf;
      zeichneListe();
    }));
    if (aufgeklappt) detailBedienung(aufgeklappt);
  }

  function detail(a) {
    const p = pruefen(a);
    const liste = arr => (arr && arr.length)
      ? '<ul>' + arr.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>'
      : '<p class="dim klein">Nichts hinterlegt.</p>';

    const zeile = (k,v) => v ? `<tr><th>${k}</th><td>${v}</td></tr>` : '';

    return `
      <div class="block">
        <h3>Fristen</h3>
        ${(a.deadlines||[]).slice().sort((x,y)=>x.datum.localeCompare(y.datum)).map(d => {
          const t = tage(d.datum);
          return `<div class="naechste__zeile">
            <span class="naechste__datum">${fmt(d.datum)}</span>
            <span>${TYP[d.typ]||esc(d.typ)}${d.geschaetzt?' <span class="dim klein">≈ geschätzt</span>':''}</span>
            <span class="${t>=0&&t<=30?'rot':'dim'}">${t>=0? t+' Tage':'vorbei'}</span>
          </div>`;
        }).join('') || '<p class="dim klein">Keine Frist hinterlegt.</p>'}
      </div>

      <div class="block">
        <h3>Was es zu gewinnen gibt</h3>
        <p style="margin:0">${esc(a.preis) || '<span class="dim">noch prüfen</span>'}</p>
      </div>

      <div class="block">
        <h3>Teilnahmebedingungen</h3>
        ${liste(a.teilnahmebedingungen)}
      </div>

      <div class="block">
        <h3>Was eingereicht werden muss</h3>
        ${liste(a.einreichung)}
      </div>

      <div class="block">
        <h3>Eckdaten</h3>
        <table class="tabelle">
          ${zeile('Website', a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.url)}</a>` : '')}
          ${zeile('Veranstalter', esc(a.veranstalter))}
          ${zeile('Kategorie', esc(a.kategorie))}
          ${zeile('Einreichkategorie', esc(a.einreichkategorie))}
          ${zeile('Region', esc(a.region))}
          ${zeile('Kosten', esc(a.kosten))}
          ${zeile('Kosten bei Gewinn', esc(a.kosten_bei_gewinn))}
          ${zeile('Zeitfenster', a.zeitfenster_von ? fmt(a.zeitfenster_von)+' bis '+fmt(a.zeitfenster_bis)+' <span class="dim klein">(bezogen auf '+(a.zeitfenster_bezug==='abgabe'?'die Abgabe':'die Erstveröffentlichung')+')</span>' : '')}
          ${zeile('Quelle der Angaben', esc(a.quelle))}
        </table>
      </div>

      ${p.length ? `<div class="block">
        <h3>Eignungsprüfung</h3>
        ${p.map(x => `<p class="hinweis ${x.warn?'':'hinweis--ok'}">${esc(x.text)}</p>`).join('')}
      </div>` : ''}

      <div class="block">
        <h3>Status und Notizen</h3>
        <div class="leiste">
          <select class="knopf" id="d-status">
            ${STATI.map(s => `<option ${a.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
          <button class="knopf knopf--weg" id="d-weg">Kommt nicht in Frage – überall entfernen</button>
        </div>
        <textarea class="notiz" id="d-notiz" placeholder="Notizen">${esc(a.notizen)}</textarea>
      </div>

      <div class="block">
        <h3>To-dos</h3>
        <p class="klein dim">Verschieben geht auf dem Reiter To-dos.</p>
        <ul class="pruefliste">
          ${a.todos.map(t => `<li><label style="cursor:default">
            <span class="marke">${t.zustand === 'bearbeitung' ? 'in Bearbeitung' : t.zustand}</span>
            <span>${esc(t.text)}</span></label></li>`).join('') || '<li class="dim klein" style="padding:9px 0">Noch keine To-dos.</li>'}
        </ul>
        <form class="reihe" id="d-neu" style="margin-top:12px;max-width:520px">
          <input class="eingabe" name="text" placeholder="To-do für diesen Award" required>
          <button class="knopf" type="submit">+</button>
        </form>
      </div>`;
  }

  function detailBedienung(id) {
    const a = awards.find(x => x.id === id);
    if (!a) return;

    el('d-status').addEventListener('change', e => {
      eintrag(id).status = e.target.value; sichern(); mischen(); zeichneAlles();
    });
    el('d-notiz').addEventListener('input', e => { eintrag(id).notizen = e.target.value; sichern(); });

    el('d-weg').addEventListener('click', () => {
      if (!confirm(`"${a.name}" überall entfernen? Der Award verschwindet aus Übersicht, Kalender und To-dos. Über den Papierkorb unten holst du ihn zurück.`)) return;
      overlay.geloescht.push(id);
      aufgeklappt = null;
      sichern(); mischen(); zeichneAlles();
    });

    el('d-neu').addEventListener('submit', e => {
      e.preventDefault();
      const text = e.target.text.value.trim();
      if (!text) return;
      const ein = eintrag(id);
      if (ein.extra.indexOf(text) === -1) ein.extra.push(text);
      ein.todos[text] = 'offen';
      sichern(); mischen(); zeichneAlles();
    });
  }

  function zeichnePapierkorb() {
    const box = el('papierkorb');
    const weg = alleAwards.filter(a => a.geloescht);
    if (!weg.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<h3>Entfernt (${weg.length})</h3>` + weg.map(a =>
      `<div class="naechste__zeile">
         <span style="flex:1">${esc(a.name)}</span>
         <button class="knopf" data-zurueck="${esc(a.id)}">zurückholen</button>
       </div>`).join('');
    box.querySelectorAll('[data-zurueck]').forEach(b => b.addEventListener('click', () => {
      overlay.geloescht = overlay.geloescht.filter(x => x !== b.dataset.zurueck);
      sichern(); mischen(); zeichneAlles();
    }));
  }

  /* --- Kalender --------------------------------------------- */
  function alleTermine() {
    const out = [];
    awards.forEach(a => (a.deadlines||[]).forEach(d => out.push({ a, d })));
    return out.sort((x,y) => x.d.datum.localeCompare(y.d.datum));
  }

  function zeichneKalender() {
    const termine = alleTermine();
    const proTag = {};
    termine.forEach(t => { (proTag[t.d.datum] = proTag[t.d.datum] || []).push(t); });

    el('kal-monat').textContent = kalMonat.toLocaleDateString('de-DE', { month:'long', year:'numeric' });

    const erster = new Date(kalMonat.getFullYear(), kalMonat.getMonth(), 1);
    const tageImMonat = new Date(kalMonat.getFullYear(), kalMonat.getMonth()+1, 0).getDate();
    const vorlauf = (erster.getDay() + 6) % 7;             // Woche beginnt Montag
    const heuteIso = iso(HEUTE);

    let html = ['Mo','Di','Mi','Do','Fr','Sa','So'].map(w => `<div class="kal__wt">${w}</div>`).join('');
    for (let i = 0; i < vorlauf; i++) html += '<div class="kal__tag kal__tag--leer"></div>';

    for (let d = 1; d <= tageImMonat; d++) {
      const tagIso = iso(new Date(kalMonat.getFullYear(), kalMonat.getMonth(), d));
      const eintraege = proTag[tagIso] || [];
      html += `<div class="kal__tag ${tagIso===heuteIso?'kal__tag--heute':''}">
        <div class="kal__zahl">${d}</div>
        ${eintraege.map(t => {
          const tg = tage(t.d.datum);
          const kl = tg < 0 ? 'kal__termin--vorbei' : (tg <= 30 ? 'kal__termin--eilig' : '');
          return `<button class="kal__termin ${kl}" data-zeige="${esc(t.a.id)}"
                    title="${esc(t.a.name)} – ${TYP[t.d.typ]||esc(t.d.typ)}">${esc(t.a.name)}</button>`;
        }).join('')}
      </div>`;
    }
    el('kal').innerHTML = html;

    el('fristenliste').innerHTML = termine.length ? termine.map(t => {
      const tg = tage(t.d.datum);
      return `<div class="naechste__zeile">
        <span class="naechste__datum ${tg>=0&&tg<=30?'rot':''}">${t.d.geschaetzt?'≈ ':''}${fmt(t.d.datum)}</span>
        <span style="flex:1 1 240px"><a href="#" data-zeige="${esc(t.a.id)}">${esc(t.a.name)}</a>
          <span class="dim klein">· ${TYP[t.d.typ]||esc(t.d.typ)}</span></span>
        <span class="dim klein">${BEREICH_TITEL[t.a.bereich]||''}</span>
        <span class="${tg>=0&&tg<=30?'rot':'dim'}">${tg>=0? tg+' Tage':'vorbei'}</span>
      </div>`;
    }).join('') : '<p class="leer">Keine Termine.</p>';

    document.querySelectorAll('[data-zeige]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault();
      aufgeklappt = b.dataset.zeige;
      fRaum = 'alle'; fStatus = 'alle';
      document.querySelectorAll('[data-raum]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.raum==='alle')));
      document.querySelectorAll('[data-status]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.status==='alle')));
      zeigeSeite('uebersicht');
      zeichneListe();
      const k = document.querySelector('.karte.offen');
      if (k) k.scrollIntoView({ behavior:'smooth', block:'center' });
    }));
  }

  /* --- To-do-Brett ------------------------------------------ */
  function alleTodos() {
    const out = [];
    awards.forEach(a => a.todos.forEach(t => out.push({
      awardId: a.id, award: a.name, bereich: a.bereich, text: t.text, zustand: t.zustand, eigen: t.eigen
    })));
    overlay.eigeneTodos.forEach(t => out.push({
      awardId: null, award: 'Ohne Award', bereich: 'eigene', text: t.text, zustand: t.zustand, eigen: true
    }));
    return out.filter(t =>
      fTodo === 'alle' ? true :
      fTodo === 'eigene' ? (t.eigen || t.awardId === null) :
      t.bereich === fTodo);   // 'arbeit' oder 'brief'
  }

  function setzeZustand(awardId, text, zustand) {
    if (awardId) { eintrag(awardId).todos[text] = zustand; }
    else {
      const t = overlay.eigeneTodos.find(x => x.text === text);
      if (t) t.zustand = zustand;
    }
    sichern(); mischen(); zeichneBrett(); zeichneListe();
  }

  function zeichneBrett() {
    const todos = alleTodos();
    el('brett').innerHTML = SPALTEN.map((s, si) => {
      const drin = todos.filter(t => t.zustand === s.id);
      return `<div class="spalte" data-spalte="${s.id}">
        <div class="spalte__kopf"><span>${s.titel}</span><span class="dim">${drin.length}</span></div>
        ${drin.map(t => `
          <div class="zettel" draggable="true"
               data-text="${esc(t.text)}" data-award="${esc(t.awardId||'')}">
            ${esc(t.text)}
            <span class="zettel__herkunft">${esc(t.award)}</span>
            <span class="zettel__fuss">
              <button class="zettel__pfeil" data-links ${si===0?'disabled':''} aria-label="nach links">←</button>
              <button class="zettel__pfeil" data-rechts ${si===SPALTEN.length-1?'disabled':''} aria-label="nach rechts">→</button>
              ${t.eigen ? '<button class="zettel__weg" data-weg aria-label="löschen">×</button>' : ''}
            </span>
          </div>`).join('') || '<p class="klein dim" style="margin:4px 0">–</p>'}
      </div>`;
    }).join('');

    // Auswahl im Formular aktuell halten
    const sel = document.querySelector('#neu-todo select[name=award]');
    sel.innerHTML = '<option value="">ohne Award</option>' +
      awards.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');

    // Pfeile und Löschen
    el('brett').querySelectorAll('.zettel').forEach(z => {
      const text = z.dataset.text, awardId = z.dataset.award || null;
      const si = SPALTEN.findIndex(s => s.id === z.closest('.spalte').dataset.spalte);
      const b = z.querySelector('[data-links]');
      const v = z.querySelector('[data-rechts]');
      if (b) b.addEventListener('click', () => setzeZustand(awardId, text, SPALTEN[si-1].id));
      if (v) v.addEventListener('click', () => setzeZustand(awardId, text, SPALTEN[si+1].id));
      const w = z.querySelector('[data-weg]');
      if (w) w.addEventListener('click', () => {
        if (awardId) {
          const e = eintrag(awardId);
          e.extra = e.extra.filter(x => x !== text);
          delete e.todos[text];
        } else {
          overlay.eigeneTodos = overlay.eigeneTodos.filter(x => x.text !== text);
        }
        sichern(); mischen(); zeichneBrett(); zeichneListe();
      });

      // Drag & Drop
      z.addEventListener('dragstart', ev => {
        z.classList.add('zieht');
        ev.dataTransfer.setData('text/plain', JSON.stringify({ text, awardId }));
        ev.dataTransfer.effectAllowed = 'move';
      });
      z.addEventListener('dragend', () => z.classList.remove('zieht'));
    });

    el('brett').querySelectorAll('.spalte').forEach(sp => {
      sp.addEventListener('dragover', ev => { ev.preventDefault(); sp.classList.add('ueber'); });
      sp.addEventListener('dragleave', () => sp.classList.remove('ueber'));
      sp.addEventListener('drop', ev => {
        ev.preventDefault(); sp.classList.remove('ueber');
        try {
          const d = JSON.parse(ev.dataTransfer.getData('text/plain'));
          setzeZustand(d.awardId, d.text, sp.dataset.spalte);
        } catch (e) { /* nichts Brauchbares fallengelassen */ }
      });
    });
  }

  /* --- Material --------------------------------------------- */
  function materialListe() {
    return basis.profil.material.concat(overlay.eigenesMaterial);
  }
  function zeichneMaterial() {
    el('material').innerHTML = materialListe().map(m => {
      const an = Object.prototype.hasOwnProperty.call(overlay.material, m.id) ? overlay.material[m.id] : m.vorhanden;
      return `<li><label><input type="checkbox" data-id="${esc(m.id)}" ${an?'checked':''}><span>${esc(m.text)}</span></label></li>`;
    }).join('');
    el('material').querySelectorAll('input').forEach(cb => cb.addEventListener('change', () => {
      overlay.material[cb.dataset.id] = cb.checked; sichern();
    }));
  }

  /* --- Reiter ----------------------------------------------- */
  function zeigeSeite(name) {
    document.querySelectorAll('.seite').forEach(s => s.classList.toggle('aktiv', s.id === 'seite-'+name));
    document.querySelectorAll('#reiter button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.seite === name)));
    window.scrollTo(0, 0);
  }

  function speicherinfo() {
    const n = Object.keys(overlay.awards).length;
    el('speicherinfo').textContent = overlay.gespeichert
      ? `Zuletzt gespeichert: ${new Date(overlay.gespeichert).toLocaleString('de-DE')} · ${n} Award(s) mit eigenen Angaben · ${overlay.eigene.length} selbst angelegt · ${overlay.geloescht.length} entfernt.`
      : 'Noch nichts lokal gespeichert.';
  }

  function zeichneAlles() {
    zeichneListe(); zeichnePapierkorb(); zeichneKalender(); zeichneBrett();
    const briefs = alleAwards.filter(a => !a.geloescht && a.bereich === 'brief').length;
    el('briefschalter').checked = !!overlay.zeigeBriefs;
    el('briefzahl').textContent = briefs;
    el('kopfinfo').textContent = awards.length + (awards.length===1?' Award · ':' Awards · ') +
      alleTermine().filter(t => tage(t.d.datum) >= 0).length + ' offene Fristen';
  }

  /* --- Export ----------------------------------------------- */
  function exportieren() {
    const out = {
      meta: Object.assign({}, basis.meta, { exportiert_am: iso(new Date()) }),
      profil: Object.assign({}, basis.profil, {
        material: materialListe().map(m => Object.assign({}, m, {
          vorhanden: Object.prototype.hasOwnProperty.call(overlay.material, m.id) ? overlay.material[m.id] : m.vorhanden
        }))
      }),
      awards: alleAwards.map(a => {
        const c = Object.assign({}, a);
        c.todos = a.todos.map(t => ({ text: t.text, zustand: t.zustand }));
        return c;
      }),
      eigene_todos: overlay.eigeneTodos
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'awards.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* --- Laden ------------------------------------------------ */
  async function laden() {
    const res = await fetch('awards.json?v=' + Date.now());
    if (!res.ok) throw new Error('awards.json nicht erreichbar (' + res.status + ')');
    basis = await res.json();
    el('standtext').textContent =
      'Stand ' + fmt(basis.meta.recherche_stand) + '. ' + basis.meta.hinweis;
    mischen(); zeichneAlles(); zeichneMaterial(); speicherinfo();
  }

  /* --- Bedienung -------------------------------------------- */
  el('reiter').addEventListener('click', e => {
    const b = e.target.closest('button'); if (b) zeigeSeite(b.dataset.seite);
  });

  document.querySelectorAll('[data-raum]').forEach(b => b.addEventListener('click', () => {
    fRaum = b.dataset.raum;
    document.querySelectorAll('[data-raum]').forEach(x => x.setAttribute('aria-pressed', String(x===b)));
    zeichneListe();
  }));

  // Globaler Schalter für die Brief-Wettbewerbe
  el('briefschalter').addEventListener('change', e => {
    overlay.zeigeBriefs = e.target.checked;
    sichern(); mischen(); zeichneAlles();
  });
  document.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', () => {
    fStatus = b.dataset.status;
    document.querySelectorAll('[data-status]').forEach(x => x.setAttribute('aria-pressed', String(x===b)));
    zeichneListe();
  }));
  document.querySelectorAll('[data-tfilter]').forEach(b => b.addEventListener('click', () => {
    fTodo = b.dataset.tfilter;
    document.querySelectorAll('[data-tfilter]').forEach(x => x.setAttribute('aria-pressed', String(x===b)));
    zeichneBrett();
  }));

  el('kal-zurueck').addEventListener('click', () => { kalMonat.setMonth(kalMonat.getMonth()-1); zeichneKalender(); });
  el('kal-vor').addEventListener('click',     () => { kalMonat.setMonth(kalMonat.getMonth()+1); zeichneKalender(); });
  el('kal-heute').addEventListener('click',   () => { kalMonat = new Date(HEUTE.getFullYear(), HEUTE.getMonth(), 1); zeichneKalender(); });

  el('neu').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = String(f.get('name')).trim();
    const id = 'eigen-' + name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') + '-' + Date.now().toString(36);
    overlay.eigene.push({
      id, bereich: f.get('bereich'), raum: f.get('raum') || 'international', name,
      veranstalter: String(f.get('veranstalter')||'').trim(),
      url: String(f.get('url')||'').trim(),
      kategorie: '', einreichkategorie: '', region: '',
      deadlines: [{ typ:'regular', datum: f.get('deadline'), geschaetzt:false }],
      kosten: String(f.get('kosten')||'').trim(), kosten_bei_gewinn: '',
      preis: String(f.get('preis')||'').trim(),
      teilnahmebedingungen: zeilen(f.get('teilnahmebedingungen')),
      einreichung: zeilen(f.get('einreichung')),
      hochschule_muss_angemeldet_sein: false,
      status: 'geplant', notizen: String(f.get('notizen')||'').trim(),
      quelle: 'selbst angelegt', todos: []
    });
    sichern(); mischen(); zeichneAlles();
    e.target.reset();
    el('liste').scrollIntoView({ behavior:'smooth', block:'start' });
  });

  el('neu-todo').addEventListener('submit', e => {
    e.preventDefault();
    const text = e.target.text.value.trim();
    const awardId = e.target.award.value || null;
    if (!text) return;
    if (awardId) {
      const ein = eintrag(awardId);
      if (ein.extra.indexOf(text) === -1) ein.extra.push(text);
      ein.todos[text] = 'offen';
    } else {
      overlay.eigeneTodos.push({ text, zustand:'offen' });
    }
    sichern(); mischen(); zeichneBrett(); zeichneListe();
    e.target.reset();
  });

  el('neu-material').addEventListener('submit', e => {
    e.preventDefault();
    const text = e.target.text.value.trim();
    if (!text) return;
    overlay.eigenesMaterial.push({ id: 'm-eigen-' + Date.now().toString(36), text, vorhanden: false });
    sichern(); zeichneMaterial();
    e.target.reset();
  });

  el('export').addEventListener('click', exportieren);
  el('neuladen').addEventListener('click', () => laden().catch(err => alert(err.message)));
  el('zuruecksetzen').addEventListener('click', () => {
    if (!confirm('Alle eigenen Angaben löschen: Status, Notizen, To-do-Spalten, entfernte und selbst angelegte Awards. Vorher exportieren?')) return;
    localStorage.removeItem(KEY);
    overlay = ladeOverlay();
    mischen(); zeichneAlles(); zeichneMaterial(); speicherinfo();
  });

  laden().catch(err => {
    el('liste').innerHTML = '<p class="leer">' + esc(err.message) +
      ' – die Seite muss über einen Webserver laufen, nicht per Doppelklick auf die Datei.</p>';
  });
})();
