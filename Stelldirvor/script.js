/* =============================================================
   Stell dir vor, die Stadt funktioniert.
   Beim Scrollen wächst die rote Linie und hält an jeder Station.
   - Die Ansicht wechselt ERST, wenn die Linie den nächsten Punkt
     erreicht hat (arrival-gated).
   - Der Marker des Punkts erscheint genau dann, wenn die Linie ihn
     erreicht.
   - Ansicht 6 schließt den Loop.
   ============================================================= */
(function () {
  // Pfad-Längen-Anteile der Stationen (Marker 1–5) + Loop-Schluss (1.0)
  var FR = [0, 0.017, 0.2309, 0.3371, 0.444, 0.7746, 1.0];
  var N = 6;                 // 6 Frames / Etappen
  var DWELL = 0.45;          // Halte-Anteil je Etappe (Linie ruht an der Station)

  var story = document.getElementById('story');
  if (!story) return;
  var route = story.querySelector('.route');
  var frames = Array.prototype.slice.call(story.querySelectorAll('.cap'));
  var markers = Array.prototype.slice.call(story.querySelectorAll('.markers rect'));
  if (!route || !frames.length) return;

  // „Infos zu …"-Link je Ansicht: HTML-<a> über der Caption-Schicht (.s-cap).
  // Caption-SVG zeigt y-Band 1643–2532 (Höhe 889). Pfeil-y → Prozent im .s-cap.
  var CAP_Y0 = 1643, CAP_H = 889;
  var infoHot = document.getElementById('infoHot');
  var INFO_Y = [1996, 2050, 2053, 2165, 2049, 2227];
  function placeInfo(i) {
    if (!infoHot) return;
    var y = INFO_Y[i] || INFO_Y[0];
    infoHot.style.left = '6.3%';
    infoHot.style.width = '60%';
    infoHot.style.top = ((y - 30 - CAP_Y0) / CAP_H * 100) + '%';
    infoHot.style.height = (80 / CAP_H * 100) + '%';
    infoHot.setAttribute('href', '#page' + (7 + i));
  }

  var len = route.getTotalLength();
  route.style.strokeDasharray = len;
  route.style.strokeDashoffset = len;

  // Caption-Schicht hat einen deckenden Hintergrund (.s-cap) → einfache
  // Überblendung: aktuelle Ansicht opak, alle anderen transparent.
  var curFrame = -1;
  function showFrame(i) {
    if (i === curFrame) return;
    curFrame = i;
    frames.forEach(function (f, k) {
      f.style.zIndex = (k === i) ? '2' : '1';
      f.style.opacity = (k === i) ? '1' : '0';
    });
    placeInfo(i);                       // Infos-Link an diese Ansicht anpassen
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var r = story.getBoundingClientRect();
      var vh = window.innerHeight;
      var scrollable = story.offsetHeight - vh;
      var p = scrollable > 0 ? Math.min(Math.max(-r.top, 0), scrollable) / scrollable : 0;

      var sl = Math.min(N - 1, Math.floor(p * N));   // aktuelle Etappe 0..5
      var loc = p * N - sl;                          // 0..1 in der Etappe
      var grow = loc < 1 - DWELL ? loc / (1 - DWELL) : 1;
      var pf = FR[sl] + grow * (FR[sl + 1] - FR[sl]);

      route.style.strokeDashoffset = len * (1 - pf);

      // Ansicht wechselt erst beim Erreichen des Punkts: während die Linie
      // zur nächsten Station wächst, bleibt die vorige Ansicht stehen; beim
      // Erreichen (Beginn des Haltens) wird umgeschaltet.
      var view = loc < 1 - DWELL ? sl - 1 : sl;
      view = Math.max(0, Math.min(N - 1, view));
      showFrame(view);

      // Marker erscheinen, sobald die Linie sie erreicht hat
      markers.forEach(function (m, k) {
        m.classList.toggle('is-on', pf >= FR[k + 1] - 0.0005);
      });

      ticking = false;
    });
  }

  showFrame(0);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
})();
