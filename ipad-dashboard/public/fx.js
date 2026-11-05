// Hava durumu kartinin hareketli arka plani (canvas): yagmur, kar, simsek, gunes isigi, yildizlar, bulut, sis.
// Eski iPad'ler icin hafif tutulur: 30 kare/sn, sinirli parcacik, yalniz kart gorunurken ve sayfa aciksa calisir.
(function (root) {
  'use strict';

  var TAU = 6.2832;
  var canvas = null;
  var ctx = null;
  var W = 0;
  var H = 0;
  var scene = { group: 'cloudy', day: true };
  var parts = [];
  var clouds = [];
  var stars = [];
  var ripples = [];
  var enabled = true;
  var raf = 0;
  var last = 0;
  var clock = 0; // saniye
  var flash = 0;
  var nextBolt = 3;
  var bolt = null;

  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }

  var COUNTS = { drizzle: 40, rain: 75, heavy: 120, thunder: 90, snow: 55 };
  var CLOUDS = { partly: 4, cloudy: 6, drizzle: 4, rain: 5, heavy: 6, thunder: 6, snow: 4 };
  var TINT = {
    clear: ['rgba(255,190,70,0.20)', 'rgba(255,190,70,0)'],
    partly: ['rgba(255,200,110,0.14)', 'rgba(120,150,200,0.06)'],
    cloudy: ['rgba(140,160,190,0.16)', 'rgba(90,110,140,0.06)'],
    fog: ['rgba(200,210,220,0.14)', 'rgba(160,170,185,0.06)'],
    drizzle: ['rgba(70,110,170,0.20)', 'rgba(40,70,120,0.06)'],
    rain: ['rgba(40,80,140,0.26)', 'rgba(30,60,110,0.08)'],
    heavy: ['rgba(30,60,120,0.32)', 'rgba(20,40,90,0.10)'],
    snow: ['rgba(200,220,255,0.14)', 'rgba(170,195,235,0.05)'],
    thunder: ['rgba(40,40,90,0.38)', 'rgba(25,25,60,0.12)']
  };

  function newPart(initial) {
    var g = scene.group;
    if (g === 'snow') {
      return { x: Math.random() * W, y: initial ? Math.random() * H : -6, r: rnd(1.4, 3.4), v: rnd(0.5, 1.3), p: Math.random() * TAU, sw: rnd(0.4, 1.2) };
    }
    var heavy = g === 'heavy' || g === 'thunder';
    return {
      x: Math.random() * (W + 60),
      y: initial ? Math.random() * H : rnd(-30, -5),
      len: rnd(9, 17),
      v: heavy ? rnd(11, 16) : g === 'drizzle' ? rnd(5, 8) : rnd(8, 12)
    };
  }

  function build() {
    parts = [];
    clouds = [];
    stars = [];
    ripples = [];
    bolt = null;
    var g = scene.group;
    var i;
    var n = COUNTS[g] ? Math.round(COUNTS[g] * Math.max(0.6, Math.min(1.4, W / 400))) : 0;
    for (i = 0; i < n; i++) parts.push(newPart(true));
    for (i = 0; i < (CLOUDS[g] || 0); i++) {
      clouds.push({ x: rnd(-0.2, 1) * W, y: rnd(0.0, 0.42) * H, s: rnd(0.8, 1.5), v: rnd(0.12, 0.32), a: rnd(0.5, 1) });
    }
    if (g === 'fog') {
      for (i = 0; i < 5; i++) {
        clouds.push({ x: rnd(-0.3, 1) * W, y: (0.12 + i * 0.18) * H, s: rnd(1, 1.6), v: rnd(0.1, 0.25) * (i % 2 ? -1 : 1), a: rnd(0.5, 1) });
      }
    }
    if (!scene.day && (g === 'clear' || g === 'partly')) {
      for (i = 0; i < 30; i++) stars.push({ x: Math.random() * W, y: Math.random() * H * 0.75, r: rnd(0.6, 1.6), p: Math.random() * TAU, f: rnd(0.8, 2) });
    }
  }

  function measure() {
    if (!canvas) return false;
    var r = canvas.getBoundingClientRect();
    var w = Math.round(r.width);
    var h = Math.round(r.height);
    if (!w || !h) return false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w !== W || h !== H || canvas.width !== Math.round(w * dpr)) {
      W = w;
      H = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }
    return true;
  }

  // ---- cizim -----------------------------------------------------------------
  function tint(g, day) {
    var c = !day && (g === 'clear' || g === 'partly') ? ['rgba(40,60,150,0.38)', 'rgba(10,14,40,0.10)'] : TINT[g] || TINT.cloudy;
    var gr = ctx.createLinearGradient(0, 0, W * 0.6, H);
    gr.addColorStop(0, c[0]);
    gr.addColorStop(1, c[1]);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
    if (!day && g !== 'clear' && g !== 'partly') {
      ctx.fillStyle = 'rgba(6,10,30,0.26)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawSun() {
    var cx = W * 0.8;
    var cy = H * 0.3;
    var r = 90 + (0.5 + 0.5 * Math.sin(clock * 1.6)) * 14;
    var gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, 'rgba(255,214,110,0.55)');
    gr.addColorStop(0.35, 'rgba(255,190,70,0.22)');
    gr.addColorStop(1, 'rgba(255,190,70,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(clock * 0.15);
    ctx.fillStyle = 'rgba(255,214,110,0.05)';
    for (var i = 0; i < 10; i++) {
      ctx.rotate(TAU / 10);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-8, -130);
      ctx.lineTo(8, -130);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMoon() {
    var cx = W * 0.8;
    var cy = H * 0.28;
    var gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80);
    gr.addColorStop(0, 'rgba(210,225,255,0.42)');
    gr.addColorStop(1, 'rgba(210,225,255,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, 80, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(235,242,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, TAU);
    ctx.fill();
  }

  function drawStars() {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var a = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(clock * s.f + s.p));
      ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
  }

  function cloudPath(x, y, s) {
    var c = [[0, 0, 22], [26, -12, 28], [58, -2, 24], [84, 6, 18], [30, 8, 24], [56, 12, 22]];
    for (var i = 0; i < c.length; i++) {
      ctx.moveTo(x + (c[i][0] + c[i][2]) * s, y + c[i][1] * s);
      ctx.arc(x + c[i][0] * s, y + c[i][1] * s, c[i][2] * s, 0, TAU);
    }
  }

  function drawClouds(dt, g) {
    var dark = g === 'drizzle' || g === 'rain' || g === 'heavy' || g === 'thunder';
    var i;
    var c;
    if (g === 'fog') {
      for (i = 0; i < clouds.length; i++) {
        c = clouds[i];
        c.x += c.v * dt;
        if (c.v > 0 && c.x > W + 40) c.x = -W * 0.9;
        if (c.v < 0 && c.x < -W * 0.9) c.x = W + 40;
        var gr = ctx.createLinearGradient(c.x, 0, c.x + W * 0.9, 0);
        gr.addColorStop(0, 'rgba(225,232,240,0)');
        gr.addColorStop(0.5, 'rgba(225,232,240,' + (0.10 + 0.08 * c.a).toFixed(2) + ')');
        gr.addColorStop(1, 'rgba(225,232,240,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(c.x, c.y, W * 0.9, 22 * c.s);
      }
      return;
    }
    for (i = 0; i < clouds.length; i++) {
      c = clouds[i];
      c.x += c.v * dt;
      if (c.x > W + 40) c.x = -130 * c.s;
      ctx.fillStyle = dark ? 'rgba(25,35,65,' + (0.18 + 0.14 * c.a).toFixed(2) + ')' : 'rgba(255,255,255,' + (0.09 + 0.08 * c.a).toFixed(2) + ')';
      ctx.beginPath();
      cloudPath(c.x, c.y + 24, c.s);
      ctx.fill();
    }
  }

  function drawRain(dt, day) {
    var slant = -0.18;
    var i;
    var p;
    ctx.strokeStyle = day ? 'rgba(150,205,255,0.55)' : 'rgba(150,190,255,0.5)';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + slant * p.len, p.y + p.len);
      p.y += p.v * dt;
      p.x += slant * p.v * dt;
      if (p.y > H) {
        if (ripples.length < 12 && Math.random() < 0.2) ripples.push({ x: p.x, y: H - rnd(4, 16), r: 1, a: 0.5 });
        parts[i] = newPart(false);
      }
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    for (i = ripples.length - 1; i >= 0; i--) {
      var r = ripples[i];
      r.r += 0.6 * dt;
      r.a -= 0.025 * dt;
      if (r.a <= 0) {
        ripples.splice(i, 1);
        continue;
      }
      ctx.strokeStyle = 'rgba(170,215,255,' + r.a.toFixed(2) + ')';
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r * 2.2, r.r * 0.7, 0, 0, TAU);
      ctx.stroke();
    }
  }

  function drawSnow(dt) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      ctx.moveTo(p.x + p.r, p.y);
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      p.y += p.v * dt;
      p.x += Math.sin(clock * 1.5 + p.p) * p.sw * 0.5 * dt;
      if (p.y > H + 6) parts[i] = newPart(false);
    }
    ctx.fill();
  }

  function drawLightning(dt) {
    if (!bolt && clock > nextBolt) {
      var x = rnd(0.2, 0.8) * W;
      var pts = [[x, 0]];
      var y = 0;
      while (y < H * 0.75) {
        y += rnd(18, 32);
        x += rnd(-22, 22);
        pts.push([x, y]);
      }
      bolt = { t: 0, pts: pts };
      flash = 0.5;
      nextBolt = clock + rnd(3.5, 8);
    }
    if (bolt) {
      bolt.t += dt;
      if (bolt.t < 3 || (bolt.t > 5 && bolt.t < 8)) {
        if (bolt.t > 5 && bolt.t < 5 + dt) flash = Math.max(flash, 0.3);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(190,210,255,0.35)';
        ctx.lineWidth = 7;
        ctx.beginPath();
        for (var i = 0; i < bolt.pts.length; i++) {
          if (i) ctx.lineTo(bolt.pts[i][0], bolt.pts[i][1]);
          else ctx.moveTo(bolt.pts[i][0], bolt.pts[i][1]);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,245,0.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (bolt.t > 12) bolt = null;
    }
    if (flash > 0.02) {
      ctx.fillStyle = 'rgba(255,255,230,' + flash.toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
      flash *= Math.pow(0.82, dt);
    }
  }

  function draw(dt) {
    var g = scene.group;
    var day = scene.day;
    ctx.clearRect(0, 0, W, H);
    tint(g, day);
    if (stars.length) drawStars();
    if (g === 'clear' || g === 'partly') {
      if (day) drawSun();
      else drawMoon();
    }
    drawClouds(dt, g);
    if (g === 'snow') drawSnow(dt);
    else if (g === 'drizzle' || g === 'rain' || g === 'heavy' || g === 'thunder') drawRain(dt, day);
    if (g === 'thunder') drawLightning(dt);
  }

  // ---- dongu -----------------------------------------------------------------
  function frame(ts) {
    raf = 0;
    if (!enabled || !canvas) return;
    if (document.hidden || canvas.offsetParent === null) {
      setTimeout(kick, 1000); // kart gizliyken (gece modu) bosuna cizme
      return;
    }
    if (ts - last < 32) {
      raf = requestAnimationFrame(frame);
      return;
    }
    var dt = last ? Math.min(3, (ts - last) / 16.67) : 1;
    last = ts;
    clock += dt / 60;
    if (!measure()) {
      setTimeout(kick, 500);
      return;
    }
    draw(dt);
    raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!raf && enabled && canvas) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  root.Fx = {
    init: function (el) {
      canvas = el;
      ctx = el.getContext('2d');
      kick();
    },
    // group: clear | partly | cloudy | fog | drizzle | rain | heavy | snow | thunder
    set: function (group, isDay) {
      scene = { group: group, day: isDay !== false };
      if (W) build();
      kick();
    },
    enable: function (on) {
      enabled = !!on;
      if (!enabled) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ctx && W) ctx.clearRect(0, 0, W, H);
      } else {
        kick();
      }
    }
  };
})(window);
