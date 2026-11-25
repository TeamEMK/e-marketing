/* Chhath Puja decoration: a day at the ghat along the foot of the page (story() below). A man brings the
   daura of offerings on his head while the women on the steps sing Chhath geet; the sun sinks into the river
   and the vratis stand in the water with their soops raised, milk poured from a lota as arghya; night comes
   with lamps floating on the water and stars; then the sun rises out of the river for the morning arghya,
   and the wish. A soop of prasad and a kosi on the left, "🌅 जय छठी मइया" above them. The sky, sun, river,
   lamps and stars are drawn on the canvas, the people and offerings are the user's paintings
   (public/img/themes/chhath-<name>-<w>.webp); movement is css (css/themes/chhath.css). */
ThemeDecor.register('chhath', function (d) {
  // ART: [small width, its height, large width]
  var ART = { soop: [150, 151, 300], kosi: [140, 186, 280], singers: [220, 142, 440], 'daura-man': [120, 272, 240],
              'vrati-1': [120, 198, 240], 'lota-man': [120, 230, 240], 'vrati-2': [120, 275, 240] };
  function art(name, px) {
    var a = ART[name], base = '/img/themes/chhath-' + name;
    return '<img src="' + base + '-' + a[0] + '.webp" srcset="' + base + '-' + a[0] + '.webp ' + a[0] + 'w, ' + base + '-' + a[2] + '.webp ' + a[2] + 'w"' +
           ' sizes="' + px + 'px" width="' + a[0] + '" height="' + a[1] + '" alt="" draggable="false">';
  }

  // the floor, and room at the end of the page so its last rows scroll clear of it (as Diwali does)
  var band = document.createElement('div');
  band.className = 'td-item ch-band';
  d.layer.insertBefore(band, d.layer.firstChild);
  document.documentElement.classList.add('ch-band-on');
  d.svg(art('soop', 140), 'ch-soop td-drag');
  d.svg(art('kosi', 100), 'ch-kosi');
  var greet = document.createElement('div');
  greet.className = 'td-item ch-greet td-drag';
  greet.textContent = '🌅 जय छठी मइया';
  d.layer.appendChild(greet);

  // The ghat: the singers on the steps, the man with the daura, and in the river the two vratis facing the
  // sun from either side with the man pouring milk beside the first. Each has a speech bubble (.ch-say).
  var ghat = document.createElement('div');
  ghat.className = 'td-item ch-ghat';
  ghat.innerHTML = '<div class="ch-p ch-singers">' + art('singers', 200) + '<div class="ch-say"></div></div>' +
    '<div class="ch-p ch-daura">' + art('daura-man', 76) + '</div>' +
    '<div class="ch-p ch-wet ch-vrati1">' + art('vrati-1', 84) + '<div class="ch-say"></div></div>' +
    '<div class="ch-p ch-wet ch-lota">' + art('lota-man', 80) + '</div>' +
    '<div class="ch-p ch-wet ch-vrati2">' + art('vrati-2', 72) + '<div class="ch-say"></div></div>';
  d.layer.appendChild(ghat);
  var dauraEl = ghat.querySelector('.ch-daura'), lotaEl = ghat.querySelector('.ch-lota');
  // the river starts this far along the ghat, the sun sits this far along it
  var RIVER = 0.36, SUN_X = 0.67;

  // The wish from the E-Marketing family after the morning arghya.
  var wish = document.createElement('div');
  wish.className = 'td-item ch-wish';
  wish.innerHTML = '<b>E-Marketing परिवार की ओर से</b><span>छठ पूजा की हार्दिक शुभकामनाएँ</span>';
  d.layer.appendChild(wish);

  // STORY: the second each part of the day starts (an 80-second loop). SKY: the sky over the ghat through the
  // day, [second, top colour, colour at the water], rgba, eased between.
  var STORY = { walk: 1, stop: 9, sink: 6, set: 24, night: 26, dawn: 40, risen: 56, wish: 58, again: 80 };
  var SKY = [[0, [255, 237, 213, 0], [254, 215, 170, 0.22]], [6, [255, 237, 213, 0], [254, 215, 170, 0.22]],
             [16, [251, 146, 60, 0.32], [244, 114, 182, 0.48]], [24, [109, 40, 217, 0.3], [49, 46, 129, 0.58]],
             [28, [30, 27, 75, 0.5], [15, 23, 42, 0.72]], [40, [30, 27, 75, 0.5], [15, 23, 42, 0.72]],
             [48, [244, 114, 182, 0.34], [251, 146, 60, 0.46]], [56, [255, 237, 213, 0], [254, 215, 170, 0.22]], [80, [255, 237, 213, 0], [254, 215, 170, 0.22]]];
  // what the singers sing (Chhath geet) and the vratis say, by turns: [second, who, words]
  var SAYS = [[2, 'singers', 'काँच ही बाँस के बहंगिया 🎶'], [9, 'singers', 'बहंगी लचकत जाय 🎶'], [17, 'vrati1', 'जय छठी मइया'],
              [21, 'vrati2', 'हे दीनानाथ, अरघ स्वीकार करीं'], [29, 'singers', 'केरवा जे फरेला घवद से 🎶'], [35, 'singers', 'ओह पर सुगा मेड़राय 🎶'],
              [43, 'singers', 'उगी हे सूरज देव 🎶'], [49, 'vrati1', 'भइल अरघ के बेर'], [53, 'vrati2', 'जय छठी मइया']];

  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // with reduced motion the story stands still at the evening arghya
  var storyT = still ? 18 : 0, sayI = 0, sayEl = null, sayHide = 0, rang = {}, splash = [], stars = [], lamps = [], glints = [];
  for (var si = 0; si < 40; si++) stars.push({ x: Math.random(), y: Math.random(), r: d.rand(.6, 1.6), ph: d.rand(0, 6.28) });
  for (var li = 0; li < 9; li++) lamps.push({ x: Math.random(), y: Math.random(), sp: d.rand(.006, .014), ph: d.rand(0, 6.28) });
  for (var gi = 0; gi < 24; gi++) glints.push({ x: Math.random(), y: Math.random(), r: d.rand(1, 2.2), vy: d.rand(8, 16), ph: d.rand(0, 6.28) });
  function box(el) { var r = el.getBoundingClientRect(), b = d.layer.getBoundingClientRect(); return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height }; }
  function ease(k) { k = Math.max(0, Math.min(1, k)); return k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
  function mix(a, b, k) { return a.map(function (v, i) { return v + (b[i] - v) * k; }); }
  function rgba(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? c[3] : a).toFixed(3) + ')'; }
  function skyAt(t) {
    for (var i = 1; i < SKY.length; i++) if (t <= SKY[i][0]) { var k = ease((t - SKY[i - 1][0]) / (SKY[i][0] - SKY[i - 1][0])); return [mix(SKY[i - 1][1], SKY[i][1], k), mix(SKY[i - 1][2], SKY[i][2], k)]; }
    return [SKY[0][1], SKY[0][2]];
  }
  // how high the sun stands: 1 high in the afternoon, 0 on the water, below 0 under it
  function sunAt(t) {
    var S = STORY;
    if (t < S.sink) return 1;
    if (t < S.set) return 1 - 1.4 * ease((t - S.sink) / (S.set - S.sink));
    if (t < S.dawn) return -0.4;
    if (t < S.risen) return -0.4 + 1.4 * ease((t - S.dawn) / (S.risen - S.dawn));
    return 1;
  }
  function say(who, words) {
    if (sayEl) sayEl.classList.remove('ch-saying');
    sayEl = ghat.querySelector('.ch-' + who + ' .ch-say');
    sayEl.textContent = words; sayEl.classList.add('ch-saying');
    sayHide = storyT + 3.4;
  }

  function story(ctx, dt, w, h) {
    if (!still) storyT += dt;
    var t = storyT, S = STORY, g = box(ghat), i, p;
    var rx = g.x + g.w * RIVER, top = h - 62, night = t >= S.night - 2 && t < S.dawn + 4;
    // the light on the people: full by day, warm at the arghyas, dim at night (css: --ch-light)
    var light = t < S.sink ? 1 : t < S.set ? 1 - .25 * ease((t - S.sink) / (S.set - S.sink)) : t < S.night ? .75 - .2 * ease((t - S.set) / (S.night - S.set)) :
                t < S.dawn ? .55 : t < S.risen ? .55 + .45 * ease((t - S.dawn) / (S.risen - S.dawn)) : 1;
    ghat.style.setProperty('--ch-light', light.toFixed(3));
    ghat.classList.toggle('ch-night', night);
    ghat.classList.toggle('ch-arghya', (t >= 14 && t < S.set) || (t >= 46 && t < S.risen));
    d.layer.classList.toggle('ch-night', night);
    // the sky over the floor (from the sidebar's edge, no higher than the floor), fading up into the page
    var sky = skyAt(t), sy = h - 200, bx = box(band).x;
    var grd = ctx.createLinearGradient(0, sy, 0, top);
    grd.addColorStop(0, rgba(sky[0], 0)); grd.addColorStop(.35, rgba(sky[0])); grd.addColorStop(1, rgba(sky[1]));
    ctx.globalAlpha = 1; ctx.fillStyle = grd; ctx.fillRect(bx, sy, w - bx, h - sy);
    // the stars, at night
    var starA = t < S.night - 2 ? 0 : t < S.night + 2 ? (t - S.night + 2) / 4 : t < S.dawn ? 1 : t < S.dawn + 6 ? 1 - (t - S.dawn) / 6 : 0;
    if (starA > 0) {
      ctx.fillStyle = '#FFF7E0';
      for (i = 0; i < stars.length; i++) {
        p = stars[i]; ctx.globalAlpha = starA * (.45 + .45 * Math.sin(t * 2.2 + p.ph));
        ctx.beginPath(); ctx.arc(g.x + p.x * (w - g.x), sy + 30 + p.y * (top - sy - 50), p.r, 0, 6.2832); ctx.fill();
      }
    }
    // the sun, clipped at the water so it sinks into the river and rises out of it
    var e = sunAt(t), sx = g.x + g.w * SUN_X, sunY = top - 18 - e * 120, warm = Math.max(0, Math.min(1, 1 - e));
    if (e > -0.35) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, top); ctx.clip();
      var halo = ctx.createRadialGradient(sx, sunY, 0, sx, sunY, 90);
      halo.addColorStop(0, 'rgba(255,214,140,.75)'); halo.addColorStop(.4, 'rgba(251,146,60,' + (.25 + .3 * warm).toFixed(2) + ')'); halo.addColorStop(1, 'rgba(251,146,60,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(sx, sunY, 90, 0, 6.2832); ctx.fill();
      ctx.fillStyle = rgba(mix([253, 224, 71], [234, 88, 12], warm), 1); ctx.beginPath(); ctx.arc(sx, sunY, 24, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(255,247,237,' + (.5 - .3 * warm).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(sx - 6, sunY - 6, 10, 0, 6.2832); ctx.fill();
      ctx.restore();
    }
    // the river: blue, darker at night, with ripples; the sun's road of light on it when low
    // its near bank slopes down from the ghat (a strip of wet sand along it)
    var wg = ctx.createLinearGradient(0, top, 0, h);
    wg.addColorStop(0, night ? '#1E3A5F' : '#7DD3FC'); wg.addColorStop(1, night ? '#0B2545' : '#0369A1');
    ctx.globalAlpha = .55; ctx.strokeStyle = '#D6B98C'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(rx + 46, top); ctx.bezierCurveTo(rx + 14, top + 12, rx - 6, h - 26, rx - 40, h); ctx.stroke();
    ctx.globalAlpha = .92; ctx.fillStyle = wg;
    ctx.beginPath(); ctx.moveTo(rx + 46, top); ctx.lineTo(w, top); ctx.lineTo(w, h); ctx.lineTo(rx - 40, h);
    ctx.bezierCurveTo(rx - 6, h - 26, rx + 14, top + 12, rx + 46, top); ctx.closePath(); ctx.fill();
    rx += 40; // ripples and lamps keep to the open water
    ctx.globalAlpha = .55; ctx.strokeStyle = '#E0F2FE'; ctx.lineWidth = 1.2;
    for (i = 0; i < 7; i++) {
      var ry = top + 8 + i * 8, off = (t * (14 + i * 3) + i * 70) % 160;
      ctx.beginPath();
      for (var xx = rx - 160 + off; xx < w; xx += 160) { ctx.moveTo(xx, ry); ctx.quadraticCurveTo(xx + 10, ry - 3, xx + 20, ry); }
      ctx.stroke();
    }
    if (e > -0.35 && e < 0.9) {
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < 6; i++) {
        var ww = (40 - i * 5) * (1 - Math.max(0, e)) + 6;
        ctx.globalAlpha = (.55 - i * .07) * (0.6 + 0.4 * Math.sin(t * 3 + i));
        ctx.fillStyle = '#FDBA74'; ctx.fillRect(sx - ww / 2 + Math.sin(t * 2 + i) * 3, top + 4 + i * 9, ww, 3);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // lamps floating on the river from dusk to morning
    var lampA = t < S.set - 4 ? 0 : t < S.set ? (t - S.set + 4) / 4 : t < S.risen ? 1 : t < S.risen + 4 ? 1 - (t - S.risen) / 4 : 0;
    if (lampA > 0) {
      for (i = 0; i < lamps.length; i++) {
        p = lamps[i]; if (!still) p.x = (p.x + p.sp * dt) % 1;
        var lx = rx + 10 + p.x * (w - rx - 20), ly = top + 14 + p.y * 34 + Math.sin(t * 1.6 + p.ph) * 1.5;
        ctx.globalAlpha = lampA * .4; ctx.fillStyle = '#FDE047'; ctx.beginPath(); ctx.arc(lx, ly - 5, 8, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = lampA; ctx.fillStyle = '#B45309'; ctx.beginPath(); ctx.moveTo(lx - 6, ly); ctx.quadraticCurveTo(lx, ly + 5, lx + 6, ly); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#F97316'; ctx.beginPath(); ctx.moveTo(lx, ly - 8); ctx.quadraticCurveTo(lx + 3, ly - 3, lx, ly - 1); ctx.quadraticCurveTo(lx - 3, ly - 3, lx, ly - 8); ctx.fill();
      }
    }
    // the milk from the lota splashing on the water at the arghyas
    if (ghat.classList.contains('ch-arghya') && !still) {
      var lb = box(lotaEl), fx = lb.x + lb.w * 0.86;
      for (i = 0; i < 2; i++) splash.push({ x: fx + d.rand(-3, 3), y: top + 10, vx: d.rand(-30, 30), vy: d.rand(-70, -30), life: d.rand(.3, .6) });
    }
    ctx.fillStyle = '#FFFFFF';
    for (i = splash.length - 1; i >= 0; i--) {
      p = splash[i]; p.life -= dt; p.vy += 220 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) { splash.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillRect(p.x - 1, p.y - 1, 2.2, 2.2);
    }
    // golden glints rising over the ghat by day
    if (!night) {
      for (i = 0; i < glints.length; i++) {
        p = glints[i]; if (!still) { p.y -= (p.vy * dt) / 200; if (p.y < 0) { p.y = 1; p.x = Math.random(); } }
        ctx.globalAlpha = .3 + .3 * Math.sin(t * 2 + p.ph); ctx.fillStyle = i % 3 ? '#FDBA74' : '#FDE047';
        ctx.beginPath(); ctx.arc(g.x + p.x * g.w, h - 30 - p.y * 200, p.r, 0, 6.2832); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // the man with the daura walks to the water's edge, and steps back to the start for the next day
    var wk = t < S.walk ? 0 : t < S.stop ? (t - S.walk) / (S.stop - S.walk) : 1;
    dauraEl.style.left = (18 + 14 * wk).toFixed(2) + '%';
    dauraEl.classList.toggle('ch-walking', !still && t >= S.walk && t < S.stop);
    dauraEl.style.opacity = t > S.again - 2 ? Math.max(0, (S.again - t) / 2).toFixed(2) : t < 1 ? t.toFixed(2) : '';
    // bells at the two arghyas, a shankh as the sun comes up
    if (t >= 16 && !rang.eve) { rang.eve = 1; if (ThemeDecor.sound) ThemeDecor.sound('bell', .3); }
    if (t >= 46 && !rang.dawn) { rang.dawn = 1; if (ThemeDecor.sound) ThemeDecor.sound('conch', .3); }
    // the songs and the vratis' words, by turns
    if (sayEl && t >= sayHide) { sayEl.classList.remove('ch-saying'); sayEl = null; }
    if (!still && sayI < SAYS.length && t >= SAYS[sayI][0]) { say(SAYS[sayI][1], SAYS[sayI][2]); sayI++; }
    // the wish, once the sun is up again
    if (t >= S.wish && !rang.wish) { rang.wish = 1; wish.classList.remove('ch-wish-on'); void wish.offsetWidth; wish.classList.add('ch-wish-on'); }
    if (t >= S.again) { storyT = 0; sayI = 0; rang = {}; }
  }

  return {
    scale: 0.75,
    stop: function () { document.documentElement.classList.remove('ch-band-on'); d.layer.classList.remove('ch-night'); },
    frame: function (ctx, dt, w, h) { story(ctx, dt, w, h); return true; }
  };
});
