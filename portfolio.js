/* =============================================================
   Portfolio – Karussells (Desktop: über SVG-Layout) und
   gestapeltes Mobil-Layout (aus denselben Projektdaten).
   ============================================================= */
(function () {
  var P = {
    essperten: {
      title: 'Essperten', year: '2025', role: 'Visual Lead, UI & Motion Design',
      cat: 'Educational Technology, Gamification, App Design',
      team: 'Biran Arslan, Jule Doebele, Kai Gaertner, Mara Kretz, David Seng, Aylin Sentuerk, Tabea Reifenschweiler',
      n: 8,
      desc: 'Developing the visual identity, illustrations, and motion assets for Essperten (Food Experts), a digital learning tool for primary schools. By integrating pedagogical research from the University of Education Weingarten with user-centered design methodologies, the project focuses on gamifying nutrition education to make healthy habits accessible. The design process utilized persona development and iterative field testing with 2nd-grade students, ensuring that the interface and Unity-based animations effectively engage the young target audience.'
    },
    smears: {
      title: 'Smears', year: '2025', role: 'Illustrator, Motion Designer, 2D Animator',
      cat: 'Motion Graphics, Social Commentary, Short Film',
      team: 'Tabea Reifenschweiler',
      n: 6,
      desc: 'Developing a short 2D animation film titled Smears, using Adobe Illustrator and After Effects. By looking at the dissonance between digital representation and physical reality, the film critiques the trend of glamorizing travel destinations through filters and selective framing. Smears focuses on the distortion of perception, utilizing the visual metaphor of a „smear“ to illustrate how the truth is manipulated to fit a curated online aesthetic.'
    },
    designschau: {
      title: 'Design Schau', year: '2023', role: 'Environmental Graphic Designer, Experience Designer',
      cat: 'Wayfinding, Exhibition Design, Spatial Graphics',
      team: 'Lina Moll, Jule Doebele, Tabea Reifenschweiler',
      n: 9,
      desc: 'Co-developing a comprehensive wayfinding system for the Integrated Product Design (IP7) semester exhibition at Stuttgart Media University. By applying the Double Diamond methodology to structure our research and ideation, the project focuses on creating a coherent visual dialogue between functionality and aesthetics. The concept utilizes the circle as a central graphic element to guide visitors, manifesting physically as magenta balloons that act as high-visibility anchors. This motif connects the entire experience, extending from outdoor signage to indoor spatial markers and promotional collateral.'
    },
    garden: {
      title: 'Garden Reverie', year: '2024', role: '3D Artist, Environment Design',
      cat: '3D Animation, CGI, Immersive Experience',
      team: 'Lina Moll, Tevin Zielke, Tabea Reifenschweiler',
      n: 4,
      desc: 'Co-producing a photorealistic 3D short film titled Garden Reverie using Blender and Adobe Premiere. By exploring the concept of nature as a space for mental escape, the project focuses on creating a fully immersive sensory experience (utilizing high-fidelity textures and ambient sound design to achieve this). The narrative is driven by the flight of a butterfly, serving as a visual guide that threads together the exploration of an untamed, naturalistic environment.'
    },
    modola: {
      title: 'Modola', year: '2024', role: 'Industrial Designer, Product Engineer',
      cat: 'Product Design, Sustainable Design, Furniture Construction',
      team: 'Lina Moll, Tabea Reifenschweiler',
      n: 4,
      desc: 'Designing and engineering Modola, a modular pergola system. By looking at the constraints of industrial manufacturing and the need for sustainable lifecycles, the project focuses on the efficiency of its construction (utilizing 2D planar elements to generate a complex 3D volume). This topic extends to the assembly, using threaded rods for detachable connections that allow for easy disassembly and strict material separation of wood and metal, ensuring full recyclability.'
    }
  };

  var BASE = document.body.getAttribute('data-base') || '';

  function imgEl(slug, i) {
    var img = document.createElement('img');
    img.loading = 'lazy';
    img.src = BASE + 'img/' + slug + '/' + (i < 10 ? '0' + i : i) + '.jpg';
    img.alt = (P[slug] ? P[slug].title : slug) + ' ' + i;
    return img;
  }
  function buildTrack(slug) {
    var track = document.createElement('div');
    track.className = 'track';
    var n = (P[slug] || {}).n || 0;
    for (var i = 1; i <= n; i++) track.appendChild(imgEl(slug, i));
    return track;
  }
  function scrollCar(car, dir) {
    if (!car._track) return;
    car._track.scrollBy({ left: dir * car._track.clientWidth * 0.6, behavior: 'smooth' });
  }
  function wireArrows(scope) {
    scope.querySelectorAll('.arrow').forEach(function (btn) {
      var sel = '.carousel[data-project="' + btn.getAttribute('data-for') + '"]';
      var car = (btn.closest('.m-proj') || document).querySelector(sel) || document.querySelector(sel);
      btn.addEventListener('click', function () { scrollCar(car, btn.classList.contains('next') ? 1 : -1); });
    });
  }

  // ---- Desktop: vorhandene .carousel-Platzhalter über dem SVG füllen ----
  document.querySelectorAll('.page > .carousel').forEach(function (car) {
    var t = buildTrack(car.getAttribute('data-project'));
    car.appendChild(t); car._track = t;
  });
  wireArrows(document.querySelector('.page') || document);

  // ---- Mobil: gestapeltes Layout aus den Projektdaten ----
  var page = document.body.getAttribute('data-page');   // 'graphic' | 'product'
  var mount = document.getElementById('mobile');
  if (page && mount) {
    var ORDER = { graphic: ['essperten', 'smears', 'designschau', 'garden'], product: ['modola', 'designschau'] };
    var list = ORDER[page] || [];
    list.forEach(function (slug) {
      var p = P[slug]; if (!p) return;
      var sec = document.createElement('section');
      sec.className = 'm-proj';

      var car = document.createElement('div');
      car.className = 'carousel'; car.setAttribute('data-project', slug);
      var t = buildTrack(slug); car.appendChild(t); car._track = t;

      var prev = document.createElement('button'); prev.className = 'arrow prev'; prev.setAttribute('data-for', slug); prev.setAttribute('aria-label', 'zurück');
      var next = document.createElement('button'); next.className = 'arrow next'; next.setAttribute('data-for', slug); next.setAttribute('aria-label', 'weiter');
      var carWrap = document.createElement('div'); carWrap.className = 'm-car';
      carWrap.appendChild(car); carWrap.appendChild(prev); carWrap.appendChild(next);

      var h = document.createElement('h2'); h.textContent = p.title;
      var d = document.createElement('p'); d.className = 'm-desc'; d.textContent = p.desc;
      var meta = document.createElement('dl'); meta.className = 'm-meta';
      [['Year', p.year], ['Role', p.role], ['Category', p.cat], ['Design Team', p.team]].forEach(function (row) {
        var dt = document.createElement('dt'); dt.textContent = row[0];
        var dd = document.createElement('dd'); dd.textContent = row[1];
        meta.appendChild(dt); meta.appendChild(dd);
      });

      sec.appendChild(carWrap); sec.appendChild(h); sec.appendChild(d); sec.appendChild(meta);
      mount.appendChild(sec);
    });
    wireArrows(mount);
  }
})();
