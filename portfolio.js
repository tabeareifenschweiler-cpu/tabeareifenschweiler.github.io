/* =============================================================
   Portfolio – Karussells (Desktop über SVG-Layout + gestapeltes Mobil).
   Loop, Kreis-Pfeile (halb über dem Bild), optionale Video-Slides.
   ============================================================= */
(function () {
  var P = {
    essperten: {
      title: 'Essperten', year: '2025', role: 'Visual Lead, UI & Motion Design',
      cat: 'Educational Technology, Gamification, App Design',
      team: 'Biran Arslan, Jule Doebele, Kai Gaertner, Mara Kretz, David Seng, Aylin Sentuerk, Tabea Reifenschweiler',
      n: 7, video: true,
      desc: 'Developing the visual identity, illustrations, and motion assets for Essperten (Food Experts), a digital learning tool for primary schools. By integrating pedagogical research from the University of Education Weingarten with user-centered design methodologies, the project focuses on gamifying nutrition education to make healthy habits accessible. The design process utilized persona development and iterative field testing with 2nd-grade students, ensuring that the interface and Unity-based animations effectively engage the young target audience.'
    },
    smears: {
      title: 'Smears', year: '2025', role: 'Illustrator, Motion Designer, 2D Animator',
      cat: 'Motion Graphics, Social Commentary, Short Film',
      team: 'Tabea Reifenschweiler',
      n: 6, video: true,
      desc: 'Developing a short 2D animation film titled Smears, using Adobe Illustrator and After Effects. By looking at the dissonance between digital representation and physical reality, the film critiques the trend of glamorizing travel destinations through filters and selective framing. Smears focuses on the distortion of perception, utilizing the visual metaphor of a „smear“ to illustrate how the truth is manipulated to fit a curated online aesthetic.'
    },
    designschau: {
      title: 'Design Schau', year: '2023', role: 'Environmental Graphic Designer, Experience Designer',
      cat: 'Wayfinding, Exhibition Design, Spatial Graphics',
      team: 'Lina Moll, Jule Doebele, Tabea Reifenschweiler',
      n: 6,
      desc: 'Co-developing a comprehensive wayfinding system for the Integrated Product Design (IP7) semester exhibition at Stuttgart Media University. By applying the Double Diamond methodology to structure our research and ideation, the project focuses on creating a coherent visual dialogue between functionality and aesthetics. The concept utilizes the circle as a central graphic element to guide visitors, manifesting physically as magenta balloons that act as high-visibility anchors. This motif connects the entire experience, extending from outdoor signage to indoor spatial markers and promotional collateral.'
    },
    garden: {
      title: 'Garden Reverie', year: '2024', role: '3D Artist, Environment Design',
      cat: '3D Animation, CGI, Immersive Experience',
      team: 'Lina Moll, Tevin Zielke, Tabea Reifenschweiler',
      n: 5, video: true,
      desc: 'Co-producing a photorealistic 3D short film titled Garden Reverie using Blender and Adobe Premiere. By exploring the concept of nature as a space for mental escape, the project focuses on creating a fully immersive sensory experience (utilizing high-fidelity textures and ambient sound design to achieve this). The narrative is driven by the flight of a butterfly, serving as a visual guide that threads together the exploration of an untamed, naturalistic environment.'
    },
    modola: {
      title: 'Modola', year: '2024', role: 'Industrial Designer, Product Engineer',
      cat: 'Product Design, Sustainable Design, Furniture Construction',
      team: 'Lina Moll, Tabea Reifenschweiler',
      n: 7,
      desc: 'Designing and engineering Modola, a modular pergola system. By looking at the constraints of industrial manufacturing and the need for sustainable lifecycles, the project focuses on the efficiency of its construction (utilizing 2D planar elements to generate a complex 3D volume). This topic extends to the assembly, using threaded rods for detachable connections that allow for easy disassembly and strict material separation of wood and metal, ensuring full recyclability.'
    }
  };

  var BASE = document.body.getAttribute('data-base') || '';
  // Pfeil-Form exakt aus dem Design-SVG (gefüllter Pfeil), auf 0–20 normiert
  var ARROW = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M0.04 11.27L0.04 8.72L15.3 8.72L8.66 2.223L10.42 0.47L19.95 10.005L10.42 19.54L8.66 17.768L15.31 11.27L0.04 11.27Z" fill="currentColor"/></svg>';

  // YouTube-IDs der Projektvideos
  var VID = { garden: '1g8kzJn8J3w', smears: 'SP8tjID6y9U', essperten: '56To1LDAcGo' };

  // Lightbox für Videos
  var box;
  function openVideo(id) {
    if (!box) {
      box = document.createElement('div'); box.className = 'lightbox';
      box.innerHTML = '<button class="lb-close" aria-label="schließen">&times;</button><div class="lb-frame"></div>';
      box.addEventListener('click', function (e) { if (e.target === box || e.target.className === 'lb-close') closeVideo(); });
      document.body.appendChild(box);
    }
    box.querySelector('.lb-frame').innerHTML =
      '<iframe src="https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0" title="Video" ' +
      'allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>';
    document.body.classList.add('lb-open');
  }
  function closeVideo() { document.body.classList.remove('lb-open'); if (box) box.querySelector('.lb-frame').innerHTML = ''; }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeVideo(); });

  function slideImg(slug, i) {
    var s = document.createElement('div'); s.className = 'slide';
    var img = document.createElement('img'); img.loading = 'lazy';
    img.src = BASE + 'img/' + slug + '/' + (i < 10 ? '0' + i : i) + '.jpg';
    img.alt = (P[slug] ? P[slug].title : slug) + ' ' + i;
    s.appendChild(img); return s;
  }
  function videoSlide(slug) {
    var s = slideImg(slug, 1); s.classList.add('video');
    var play = document.createElement('span'); play.className = 'play'; s.appendChild(play);
    if (VID[slug]) {
      s.style.cursor = 'pointer';
      s.addEventListener('click', function () { openVideo(VID[slug]); });
    }
    return s;
  }
  function buildTrack(slug) {
    var track = document.createElement('div'); track.className = 'track';
    var p = P[slug] || {};
    if (p.video) track.appendChild(videoSlide(slug));        // Video als erster Slide
    for (var i = 1; i <= (p.n || 0); i++) track.appendChild(slideImg(slug, i));
    return track;
  }

  // Desktop-Karussell per transform: translateX (nativer Scroll von Overflow-
  // Containern ist hier unzuverlässig). Position wird virtuell in track._x gehalten.
  function setX(track, x) {
    var max = track.scrollWidth - track.clientWidth;
    if (max < 0) max = 0;
    x = Math.max(0, Math.min(x, max));
    track._x = x;
    track.style.transform = 'translateX(' + (-x) + 'px)';
  }
  // Pro Klick genau ein Bild weiter (zum nächsten/vorigen Slide-Anfang); mit Loop.
  function scrollCar(track, dir) {
    if (!track) return;
    var slides = track.children;
    var x = track._x || 0;
    var max = track.scrollWidth - track.clientWidth;
    var i;
    if (dir > 0) {
      if (x >= max - 2) { setX(track, 0); return; }                 // Loop: am Ende → erstes
      for (i = 0; i < slides.length; i++) {
        if (slides[i].offsetLeft > x + 2) { setX(track, slides[i].offsetLeft); return; }
      }
      setX(track, max);
    } else {
      if (x <= 2) { setX(track, max); return; }                     // Loop: am Anfang → letztes
      for (i = slides.length - 1; i >= 0; i--) {
        if (slides[i].offsetLeft < x - 2) { setX(track, slides[i].offsetLeft); return; }
      }
      setX(track, 0);
    }
  }

  // Innenleben (track + zwei Kreis-Pfeile) in einen .carousel-wrap bauen
  function fillCarousel(wrap) {
    var slug = wrap.getAttribute('data-project');
    var car = document.createElement('div'); car.className = 'carousel';
    var track = buildTrack(slug); car.appendChild(track);
    var prev = document.createElement('button'); prev.className = 'arrow prev'; prev.innerHTML = ARROW; prev.setAttribute('aria-label', 'zurück');
    var next = document.createElement('button'); next.className = 'arrow next'; next.innerHTML = ARROW; next.setAttribute('aria-label', 'weiter');
    prev.addEventListener('click', function () { scrollCar(track, -1); });
    next.addEventListener('click', function () { scrollCar(track, 1); });
    wrap.appendChild(car); wrap.appendChild(prev); wrap.appendChild(next);
  }

  // ---- Desktop ----
  document.querySelectorAll('.page .carousel-wrap').forEach(fillCarousel);

  // ---- Mobil: gestapeltes Layout ----
  var page = document.body.getAttribute('data-page');
  var mount = document.getElementById('mobile-list');
  if (page && mount) {
    var ORDER = { graphic: ['essperten', 'smears', 'designschau', 'garden'], product: ['modola', 'designschau'] };
    (ORDER[page] || []).forEach(function (slug) {
      var p = P[slug]; if (!p) return;
      var sec = document.createElement('section'); sec.className = 'm-proj';
      var wrap = document.createElement('div'); wrap.className = 'carousel-wrap m-car'; wrap.setAttribute('data-project', slug);
      fillCarousel(wrap);
      var h = document.createElement('h2'); h.textContent = p.title;
      var d = document.createElement('p'); d.className = 'm-desc'; d.textContent = p.desc;
      var meta = document.createElement('dl'); meta.className = 'm-meta';
      [['Year', p.year], ['Role', p.role], ['Category', p.cat], ['Design Team', p.team]].forEach(function (r) {
        var dt = document.createElement('dt'); dt.textContent = r[0];
        var dd = document.createElement('dd'); dd.textContent = r[1];
        meta.appendChild(dt); meta.appendChild(dd);
      });
      sec.appendChild(wrap); sec.appendChild(h); sec.appendChild(d); sec.appendChild(meta);
      mount.appendChild(sec);
    });
  }

  // ---- Mobil-Burgermenü ----
  var burger = document.querySelector('.m-burger');
  if (burger) {
    var nav = document.getElementById('m-nav');
    burger.addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    if (nav) nav.addEventListener('click', function (e) { if (e.target.tagName === 'A') document.body.classList.remove('nav-open'); });
  }
})();
