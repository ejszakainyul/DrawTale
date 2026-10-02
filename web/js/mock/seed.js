/*
 * Demó adatok (REQ-DB-04): 2 fiók + egy tesztfiók, 3 kész mese.
 *   anna@demo.hu / demo1234   – szülő (Bence és Lili)
 *   dani@demo.hu / admin1234  – admin
 * A rajzok a web/assets/demo/ SVG-i; a mozgások a core/anim.js mintáiból készülnek,
 * pontosan úgy, ahogy az „Életre kel!” is csinálja.
 */
(function (g) {
  'use strict';

  var ART = 'assets/demo/';
  var SIZE = {
    cat: [260, 210], sun: [240, 240], butterfly: [150, 120], bird: [190, 130], cloud: [300, 160],
    moon: [200, 220], star: [130, 130], fish: [230, 140], crab: [230, 160], starfish: [170, 170],
    bubble: [90, 90], jellyfish: [170, 200], rocket: [260, 170], alien: [180, 230], planet: [240, 170],
    flower: [110, 220]
  };

  // [kép, név, x, y, minta|null, méretarány]
  var STORIES = [
    {
      title: 'A bátor cica', child: 0, speed: 'medium',
      pages: [
        ['Volt egyszer egy szürke cica, akit Cirmosnak hívtak. Cirmos nagyon bátor volt, és imádott a réten sétálni.',
          'bg-meadow', [['sun', 'nap', 1250, 90, 'pulse'], ['flower', 'virág', 1180, 730, null], ['butterfly', 'pillangó', 860, 360, 'fly'], ['cat', 'cica', 520, 740, 'walk']]],
        ['Egy nap Cirmos meglátott egy kék madarat. – Hová repülsz, madárka? – kérdezte. – A piros házhoz, ott a legszebb a naplemente!',
          'bg-meadow-house', [['cloud', 'felhő', 560, 110, 'float'], ['cloud', 'kis felhő', 1150, 220, 'float', 0.7], ['bird', 'madár', 300, 300, 'fly'], ['cat', 'cica', 520, 740, 'bounce']]],
        ['Cirmos felmászott a ház tetejére. Kicsit félt, de nem nézett le. Fent integetett a madárnak, aki már várta.',
          'bg-house-big', [['sun', 'nap', 130, 110, 'pulse', 0.9], ['bird', 'madár', 1180, 260, 'float'], ['cat', 'cica', 680, 300, 'wave']]],
        ['Lement a nap, feljött a Hold és a csillagok. Cirmos hazament, és boldogan elaludt. Holnap új kaland vár rá!',
          'bg-night', [['moon', 'Hold', 1250, 90, 'float'], ['star', 'csillag', 200, 120, 'pulse'], ['star', 'kis csillag', 560, 230, 'spin', 0.7], ['star', 'csillag', 930, 90, 'pulse', 0.85], ['cat', 'cica', 1060, 780, null]]]
      ]
    },
    {
      title: 'Halacska nagy útja', child: 1, speed: 'slow',
      pages: [
        ['Élt egyszer a tengerben egy kis narancssárga hal, Bubu. Bubu mindig buborékokat fújt, ha boldog volt.',
          'bg-sea', [['bubble', 'buborék', 780, 380, 'float'], ['bubble', 'buborék', 860, 230, 'float', 0.7], ['bubble', 'buborék', 740, 130, 'float', 0.5], ['fish', 'Bubu', 500, 420, 'fly']]],
        ['Egy nap találkozott Rák Rozival, aki oldalazva sétált a homokon. – Gyere, sétálj velem! – mondta Rozi.',
          'bg-sea', [['starfish', 'tengeri csillag', 1250, 830, null], ['fish', 'Bubu', 300, 300, 'float'], ['crab', 'Rozi', 700, 860, 'walk']]],
        ['Csillag Csilla, a tengeri csillag, táncra perdült örömében. A medúza is velük táncolt, és együtt nevettek.',
          'bg-sea', [['jellyfish', 'medúza', 1100, 300, 'float'], ['starfish', 'Csilla', 600, 820, 'spin'], ['fish', 'Bubu', 300, 250, 'fly']]]
      ]
    },
    {
      title: 'Rakéta a Holdra', child: 0, speed: 'medium',
      pages: [
        ['Bence megépítette a világ leggyorsabb rakétáját. Három, kettő, egy… start!',
          'bg-space', [['star', 'csillag', 200, 200, 'pulse'], ['rocket', 'rakéta', 640, 480, 'enter']]],
        ['A rakéta elsuhant a gyűrűs bolygó mellett. – Hú, de nagy! – kiáltott Bence.',
          'bg-space', [['planet', 'bolygó', 860, 230, 'pulse', 1.2], ['star', 'csillag', 1320, 140, 'spin', 0.8], ['rocket', 'rakéta', 200, 620, 'fly']]],
        ['A Holdon egy kedves zöld űrlény várta. – Szia! – integetett. Bence lett az első gyerek, aki űrlénnyel barátkozott.',
          'bg-space', [['star', 'csillag', 300, 200, 'spin'], ['rocket', 'rakéta', 520, 700, null], ['alien', 'űrlény', 1290, 600, 'wave']]]
      ]
    }
  ];

  function iso(daysAgo, hours) {
    var d = new Date(Date.now() - daysAgo * 864e5 - (hours || 0) * 36e5);
    return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  /** Teljes demó adatbázis (a mock szerver táblái, SRS 8.2). */
  function build(hashes) {
    var A = g.DrawTaleAnim;
    var db = {
      seq: {}, users: [], child_profiles: [], stories: [], story_pages: [], drawings: [],
      drawing_elements: [], page_animations: [], share_links: [], processing_jobs: [],
      refresh_tokens: [], sessions: {}, login_attempts: {}, reset_tokens: [], audit_log: [], reports: []
    };
    function id(table) { db.seq[table] = (db.seq[table] || 0) + 1; return db.seq[table]; }

    var anna = { id: id('users'), email: 'anna@demo.hu', password_hash: hashes.demo, display_name: 'Anna', role: 'parent', consent_at: iso(30), is_blocked: false, created_at: iso(30), deleted_at: null };
    var dani = { id: id('users'), email: 'dani@demo.hu', password_hash: hashes.admin, display_name: 'Dani (admin)', role: 'admin', consent_at: iso(40), is_blocked: false, created_at: iso(40), deleted_at: null };
    var peter = { id: id('users'), email: 'peter@demo.hu', password_hash: hashes.demo, display_name: 'Péter', role: 'parent', consent_at: iso(3), is_blocked: false, created_at: iso(3), deleted_at: null };
    db.users.push(anna, dani, peter);

    var kids = [
      { id: id('child_profiles'), parent_id: anna.id, nickname: 'Bence', avatar: 'lion', created_at: iso(30) },
      { id: id('child_profiles'), parent_id: anna.id, nickname: 'Lili', avatar: 'cat', created_at: iso(29) }
    ];
    db.child_profiles.push.apply(db.child_profiles, kids);

    STORIES.forEach(function (s, si) {
      var story = { id: id('stories'), owner_id: anna.id, child_profile_id: kids[s.child].id, title: s.title, status: 'done', created_at: iso(20 - si * 6), updated_at: iso(18 - si * 6) };
      db.stories.push(story);
      s.pages.forEach(function (p, pi) {
        var page = { id: id('story_pages'), story_id: story.id, page_no: pi + 1, text: p[0], version: 1, updated_at: story.updated_at };
        db.story_pages.push(page);
        var drawing = { id: id('drawings'), story_page_id: page.id, original_path: null, background_path: ART + p[1] + '.svg', width: 1600, height: 1200, status: 'done', error_code: null, created_at: story.created_at };
        db.drawings.push(drawing);
        db.processing_jobs.push({ id: id('processing_jobs'), type: 'cutout', ref_id: drawing.id, status: 'done', attempts: 1, error_msg: null, created_at: story.created_at, updated_at: story.created_at });
        var els = p[2].map(function (e, ei) {
          var k = (e[5] || 1) * 1.35; // a figurák a rajz méretéhez képest
          var sz = SIZE[e[0]];
          var el = { id: id('drawing_elements'), drawing_id: drawing.id, image_path: ART + e[0] + '.svg', bbox_x: e[2], bbox_y: e[3], bbox_w: Math.round(sz[0] * k), bbox_h: Math.round(sz[1] * k), label: e[1], is_animated: !!e[4], is_deleted: false, z_order: ei };
          db.drawing_elements.push(el);
          return el;
        });
        var data = A.buildAnimation({
          width: 1600, height: 1200, duration: 6, background: drawing.background_path,
          elements: els.map(function (el, ei) {
            return { id: el.id, name: el.label, image: el.image_path, x: el.bbox_x, y: el.bbox_y, w: el.bbox_w, h: el.bbox_h, z: el.z_order, preset: p[2][ei][4], speed: s.speed };
          })
        });
        db.page_animations.push({ id: id('page_animations'), story_page_id: page.id, data: data, version: 1, updated_at: story.updated_at });
      });
    });

    db.share_links.push({ id: id('share_links'), story_id: 1, token: 'demo-cica-' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12), expires_at: iso(-30), revoked: false, view_count: 3, created_at: iso(5) });

    // Egy elhasalt feldolgozás az admin felülethez (UC-13).
    var failedPage = { id: id('story_pages'), story_id: 0, page_no: 1, text: '', version: 1, updated_at: iso(0, 7) };
    var fs = { id: id('stories'), owner_id: peter.id, child_profile_id: null, title: 'Péter első meséje', status: 'draft', created_at: iso(0, 8), updated_at: iso(0, 7) };
    failedPage.story_id = fs.id;
    db.stories.push(fs);
    db.story_pages.push(failedPage);
    var fd = { id: id('drawings'), story_page_id: failedPage.id, original_path: ART + 'sample-photo.jpg', background_path: null, width: 1600, height: 1200, status: 'failed', error_code: 'PROCESSING_FAILED', created_at: iso(0, 7) };
    db.drawings.push(fd);
    db.processing_jobs.push({ id: id('processing_jobs'), type: 'cutout', ref_id: fd.id, status: 'failed', attempts: 3, error_msg: 'MemoryError: a kép felbontása túl nagy (8000×6000) – requestId 7f3c9a1e', created_at: iso(0, 7), updated_at: iso(0, 6) });

    for (var d = 7; d >= 1; d--) {
      db.reports.push({ date: iso(d).slice(0, 10), new_users: [2, 1, 0, 3, 1, 2, 1][7 - d], uploads: [9, 6, 4, 12, 7, 10, 5][7 - d], cutouts_ok: [9, 5, 4, 11, 7, 10, 4][7 - d], cutouts_failed: [0, 1, 0, 1, 0, 0, 1][7 - d] });
    }
    return db;
  }

  g.DTMockSeed = { build: build, SIZE: SIZE };
})(window);
