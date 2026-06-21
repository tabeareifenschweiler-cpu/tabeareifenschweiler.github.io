/* =============================================================
   Stell dir vor, die Stadt funktioniert.
   Storyboard: 6 vollständige Frames (Ansicht 1–6) mit fest auf der
   Karte eingebackener Route. Beim Scrollen blendet ein Frame in den
   nächsten über – die Route „wächst" dadurch von Station zu Station.
   ============================================================= */
(function () {
  var N = 6;                 // 6 Frames / Stationen

  var story = document.getElementById('story');
  if (!story) return;
  var stage = story.querySelector('.stage');
  var frames = Array.prototype.slice.call(story.querySelectorAll('.frame'));
  if (!frames.length) return;

  // „Infos zu …"-Link je Ansicht: klickbare Fläche über dem roten Linktext.
  // Boxen in SVG-Koordinaten (Frame ist 1170 breit, oben verankert) → px,
  // skaliert mit der tatsächlichen Bühnenbreite.
  var infoHot = document.getElementById('infoHot');
  var INFO = [
    [74, 1892, 646, 1942],   // 1: Infos zum Gesprächsraum
    [75, 1945, 672, 1998],   // 2: Infos zu Straßenbelästigung
    [74, 1948, 688, 1999],   // 3: Infos zur expansiven Haltung
    [74, 2061, 698, 2112],   // 4
    [74, 1944, 562, 1998],   // 5
    [74, 2122, 693, 2173]    // 6
  ];
  function placeInfo(i) {
    if (!infoHot) return;
    var b = INFO[i] || INFO[0];
    var k = (stage.clientWidth || window.innerWidth) / 1170;  // SVG-Einheit → px
    infoHot.style.left = (b[0] * k) + 'px';
    infoHot.style.top = (b[1] * k) + 'px';
    infoHot.style.width = ((b[2] - b[0]) * k) + 'px';
    infoHot.style.height = ((b[3] - b[1]) * k) + 'px';
    infoHot.setAttribute('href', '#page' + (7 + i));
  }

  // Flicker-frei überblenden: neuer Frame blendet ÜBER dem vorigen (deckend
  // bleibenden) ein. Frames sind vollflächig deckend → kein Durchscheinen.
  var cur = -1, prev = -1;
  function show(i) {
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
    void inc.getBoundingClientRect();   // Reflow erzwingen
    inc.style.opacity = '1';            // sanft einblenden
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
      var view = Math.min(N - 1, Math.floor(p * N));
      show(view);
      ticking = false;
    });
  }

  show(0);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
})();
