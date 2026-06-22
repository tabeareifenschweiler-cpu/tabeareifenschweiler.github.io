/* =============================================================
   Stell dir vor, die Stadt funktioniert.
   Storyboard: 6 Frames (Logo + Karte + Text) blenden über. Die rote
   Route liegt als animiertes Overlay darüber (gleiches Koordinaten-
   system 0–2532 → deckungsgleich mit der Karte) und wächst beim
   Scrollen entlang des Pfads, hält an jeder Station kurz an. Die
   Ansicht (Text) wechselt erst, wenn die Linie die Station erreicht.
   ============================================================= */
(function () {
  // Routen-Längenanteil bei jeder Station (1–5) + Loop-Schluss (1.0).
  // Wachstumsrichtung: Station 1 (Start) → 2 → 3 → 4 → 5 → zurück.
  var FR = [0, 0.01, 0.2208, 0.3282, 0.4387, 0.7594, 1.0];
  var N = 6;                 // 6 Frames / Etappen
  var DWELL = 0.45;          // Halte-Anteil je Etappe (Linie ruht an der Station)

  var story = document.getElementById('story');
  if (!story) return;
  var stage = story.querySelector('.stage');
  var route = story.querySelector('.route');
  var frames = Array.prototype.slice.call(story.querySelectorAll('.frame'));
  if (!route || !frames.length) return;

  // „Infos zu …"-Link je Ansicht: klickbare Fläche über dem roten Linktext.
  var infoHot = document.getElementById('infoHot');
  var INFO = [
    [74, 1892, 646, 1942], [75, 1945, 672, 1998], [74, 1948, 688, 1999],
    [74, 2061, 698, 2112], [74, 1944, 562, 1998], [74, 2122, 693, 2173]
  ];
  function placeInfo(i) {
    if (!infoHot) return;
    var b = INFO[i] || INFO[0];
    var k = (stage.clientWidth || window.innerWidth) / 1170;
    infoHot.style.left = (b[0] * k) + 'px';
    infoHot.style.top = (b[1] * k) + 'px';
    infoHot.style.width = ((b[2] - b[0]) * k) + 'px';
    infoHot.style.height = ((b[3] - b[1]) * k) + 'px';
    infoHot.setAttribute('href', '#page' + (7 + i));
  }

  var len = route.getTotalLength();
  route.style.strokeDasharray = len;
  route.style.strokeDashoffset = len;

  // Frame-Überblendung: neuer Frame blendet über dem vorigen (deckend
  // bleibenden) ein. Frames sind vollflächig deckend → kein Durchscheinen.
  var cur = -1, prev = -1;
  function showFrame(i) {
    if (i === cur) return;
    prev = cur;
    cur = i;
    frames.forEach(function (f, k) {
      if (k === prev) { f.style.zIndex = '2'; f.style.opacity = '1'; }
      else if (k !== i) { f.style.zIndex = '1'; f.style.opacity = '0'; }
    });
    var inc = frames[i];
    inc.style.zIndex = '3';
    inc.style.opacity = '0';
    void inc.getBoundingClientRect();
    inc.style.opacity = '1';
    placeInfo(i);
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

      // Ansicht wechselt erst beim Erreichen des Punkts (arrival-gated):
      // während die Linie wächst bleibt die vorige Ansicht, beim Erreichen
      // (Beginn des Haltens) wird umgeschaltet.
      var view = loc < 1 - DWELL ? sl - 1 : sl;
      view = Math.max(0, Math.min(N - 1, view));
      showFrame(view);

      ticking = false;
    });
  }

  showFrame(0);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
})();
