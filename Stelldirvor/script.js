/* =============================================================
   Stell dir vor, die Stadt funktioniert.
   Scroll-Storyboard mit animierter Route. Zwei Layouts teilen sich
   dieselbe Logik:
     • Mobil  – Hochformat-Frames (1170×2532), volle Breite, oben verankert
     • Laptop – Querformat-Frames (1920×1080), zentriert eingepasst
   Pro Viewport ist immer nur eines sichtbar; animiert wird das sichtbare.
   ============================================================= */
(function () {
  // Längenanteile an den Stationen. Jeder Frame wächst genau bis zum Marker,
  // der in ihm hinzukommt: F4 endet exakt an Eckpunkt v7 (links oben).
  var FR = [0, 0.01, 0.2355, 0.3282, 0.4440, 0.775, 1.0];
  var N = 6;
  var DWELL = 0.45;

  // „Infos zu …"-Klickflächen je Ansicht, in SVG-Koordinaten des jeweiligen Layouts.
  var INFO_MOBILE = [
    [74, 1892, 646, 1942], [75, 1945, 672, 1998], [74, 1948, 688, 1999],
    [74, 2061, 698, 2112], [74, 1944, 562, 1998], [74, 2122, 693, 2173]
  ];
  var INFO_LAP = [
    [1146, 574, 1520, 606], [1146, 610, 1520, 643], [1146, 610, 1520, 643],
    [1146, 682, 1520, 714], [1146, 610, 1520, 643], [1146, 667, 1520, 699]
  ];

  function build(cfg) {
    var story = document.getElementById(cfg.storyId);
    if (!story) return null;
    var route = story.querySelector(cfg.routeSel);
    var frames = Array.prototype.slice.call(story.querySelectorAll(cfg.frameSel));
    if (!route || !frames.length) return null;
    return {
      story: story,
      stage: story.querySelector(cfg.stageSel),
      route: route,
      frames: frames,
      infoHot: document.getElementById(cfg.infoId),
      INFO: cfg.INFO,
      vbW: cfg.vbW, vbH: cfg.vbH,
      contain: cfg.contain,
      prefix: cfg.prefix,
      len: 0, cur: -1, prev: -1
    };
  }

  function placeInfo(S, i) {
    if (!S.infoHot) return;
    var b = S.INFO[i] || S.INFO[0];
    var W = S.stage.clientWidth, H = S.stage.clientHeight;
    var sc, ox, oy;
    if (S.contain) {                         // Laptop: 16:9 zentriert eingepasst
      sc = Math.min(W / S.vbW, H / S.vbH);
      ox = (W - S.vbW * sc) / 2;
      oy = (H - S.vbH * sc) / 2;
    } else {                                 // Mobil: volle Breite, oben verankert
      sc = W / S.vbW;
      ox = 0; oy = 0;
    }
    S.infoHot.style.left = (ox + b[0] * sc) + 'px';
    S.infoHot.style.top = (oy + b[1] * sc) + 'px';
    S.infoHot.style.width = ((b[2] - b[0]) * sc) + 'px';
    S.infoHot.style.height = ((b[3] - b[1]) * sc) + 'px';
    S.infoHot.setAttribute('href', S.prefix + (7 + i));
  }

  function showFrame(S, i) {
    if (i === S.cur) return;
    S.prev = S.cur;
    S.cur = i;
    S.frames.forEach(function (f, k) {
      if (k === S.prev) { f.style.zIndex = '2'; f.style.opacity = '1'; }
      else if (k !== i) { f.style.zIndex = '1'; f.style.opacity = '0'; }
    });
    var inc = S.frames[i];
    inc.style.zIndex = '3';
    inc.style.opacity = '0';
    void inc.getBoundingClientRect();
    inc.style.opacity = '1';
    placeInfo(S, i);
  }

  function update(S) {
    if (!S.len) {
      S.len = S.route.getTotalLength();
      if (!S.len) return;                    // noch nicht sichtbar/bereit
      S.route.style.strokeDasharray = S.len;
      S.route.style.strokeDashoffset = S.len;
    }
    var r = S.story.getBoundingClientRect();
    var vh = window.innerHeight;
    var scrollable = S.story.offsetHeight - vh;
    var p = scrollable > 0 ? Math.min(Math.max(-r.top, 0), scrollable) / scrollable : 0;

    var sl = Math.min(N - 1, Math.floor(p * N));
    var loc = p * N - sl;
    var grow = loc < 1 - DWELL ? loc / (1 - DWELL) : 1;
    var pf = FR[sl] + grow * (FR[sl + 1] - FR[sl]);
    S.route.style.strokeDashoffset = S.len * (1 - pf);

    var view = loc < 1 - DWELL ? sl - 1 : sl;
    view = Math.max(0, Math.min(N - 1, view));
    showFrame(S, view);
  }

  var stories = [
    build({ storyId: 'story', stageSel: '.stage', routeSel: '.route', frameSel: '.frame',
            infoId: 'infoHot', INFO: INFO_MOBILE, vbW: 1170, vbH: 2532, contain: false, prefix: '#page' }),
    build({ storyId: 'storyLap', stageSel: '.lap-fit', routeSel: '.route-lap', frameSel: '.frame-lap',
            infoId: 'infoHotLap', INFO: INFO_LAP, vbW: 1920, vbH: 1080, contain: false, prefix: '#lpage' })
  ].filter(Boolean);
  if (!stories.length) return;

  function active() {
    for (var i = 0; i < stories.length; i++) {
      // sichtbar = nimmt Layout-Platz ein (display:none → offsetParent null)
      if (stories[i].story.offsetParent !== null) return stories[i];
    }
    return null;
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var S = active();
      if (S) update(S);
      ticking = false;
    });
  }

  function onResize() {
    var S = active();
    if (S) { S.cur = -1; update(S); placeInfo(S, S.cur < 0 ? 0 : S.cur); }
  }

  // Startzustand für beide (das versteckte rechnet erst, wenn es sichtbar wird)
  stories.forEach(function (S) { showFrame(S, 0); });
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
})();

/* Laptop A12: Play-Button -> Video-Lightbox */
(function () {
  var lb = document.getElementById('lap-lightbox');
  if (!lb) return;
  var frame = lb.querySelector('.lb-frame');
  function open(id) {
    frame.innerHTML = '<iframe src="https://www.youtube.com/embed/' + id +
      '?autoplay=1&rel=0" title="Video" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>';
    document.body.classList.add('lb-open');
  }
  function close() { document.body.classList.remove('lb-open'); frame.innerHTML = ''; }
  document.querySelectorAll('.lap-play').forEach(function (b) {
    b.addEventListener('click', function () { open(b.getAttribute('data-yt')); });
  });
  lb.addEventListener('click', function (e) { if (e.target === lb || e.target.className === 'lb-close') close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
})();
