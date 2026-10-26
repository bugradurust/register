(function () {
  'use strict';

  var $ = function (id) {
    return document.getElementById(id);
  };
  var startedAt = Date.now();

  // Sunucudan gelen varsayilanlar (config.default.json / config.json).
  var server = {
    pageSeconds: 15,
    weatherRefreshMinutes: 15,
    newsRefreshMinutes: 15,
    marketRefreshMinutes: 5,
    newsMaxAgeHours: 6,
    marketEnabled: true,
    matchesEnabled: true,
    show: { market: true, net: true, forecast: true, news: true, matches: true },
    night: { enabled: false, from: 23, to: 7 }
  };

  // Metin her zaman textContent ile yazilir; haber basliklari HTML olarak yorumlanmaz.
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }
  function getJSON(url) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () {
      ctrl.abort();
    }, 20000);
    return fetch(url, { cache: 'no-store', signal: ctrl.signal })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }
  var numFmts = {};
  function fmt(v, digits) {
    var f = numFmts[digits] || (numFmts[digits] = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
    return f.format(v);
  }

  // ---- ayarlar: bu iPad'e ozel, localStorage'da saklanir --------------------------
  // Bos (null/tanimsiz) alan sunucudaki varsayilani kullanir.
  var prefs = loadPrefs();
  function loadPrefs() {
    var p = {};
    try {
      p = JSON.parse(localStorage.getItem('pano.prefs') || '{}') || {};
    } catch (e) {}
    if (!p.cats || typeof p.cats !== 'object') p.cats = {};
    return p;
  }
  function savePrefs() {
    try {
      localStorage.setItem('pano.prefs', JSON.stringify(prefs));
    } catch (e) {}
  }
  function featureOn(name) {
    if (prefs[name] != null) return !!prefs[name];
    return !server.show || server.show[name] !== false;
  }
  function nightEnabled() {
    return prefs.night != null ? !!prefs.night : !!(server.night && server.night.enabled);
  }

  // ---- saat ----------------------------------------------------------------
  var weekdayFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' });
  var dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  var shortDayFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'short' });
  var lastDay = '';

  function isNight(hour) {
    var n = server.night;
    if (!nightEnabled() || !n) return false;
    return n.from <= n.to ? hour >= n.from && hour < n.to : hour >= n.from || hour < n.to;
  }

  function tick() {
    var now = new Date();
    $('hh').textContent = pad(now.getHours());
    $('mm').textContent = pad(now.getMinutes());
    $('ss').textContent = pad(now.getSeconds());
    var night = isNight(now.getHours());
    var day = now.toDateString();
    if (day !== lastDay) {
      lastDay = day;
      $('weekday').textContent = weekdayFmt.format(now);
      $('date').textContent = dateFmt.format(now);
    }
    document.body.classList.toggle('night', night);
    if (!night) document.body.classList.remove('peek');
    // Gunluk yenileme: sunucudaki guncellemeler iPad'e ulasir, bellek temizlenir.
    if (now.getHours() === 4 && Date.now() - startedAt > 3600000) location.reload();
    setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  }

  // ---- hava durumu -----------------------------------------------------------
  var WMO = {
    0: ['☀️', 'Açık'],
    1: ['🌤️', 'Çoğunlukla açık'],
    2: ['⛅', 'Parçalı bulutlu'],
    3: ['☁️', 'Kapalı'],
    45: ['🌫️', 'Sisli'],
    48: ['🌫️', 'Kırağılı sis'],
    51: ['🌦️', 'Hafif çisenti'],
    53: ['🌦️', 'Çisenti'],
    55: ['🌦️', 'Yoğun çisenti'],
    56: ['🌧️', 'Dondurucu çisenti'],
    57: ['🌧️', 'Dondurucu çisenti'],
    61: ['🌧️', 'Hafif yağmur'],
    63: ['🌧️', 'Yağmur'],
    65: ['🌧️', 'Şiddetli yağmur'],
    66: ['🌧️', 'Dondurucu yağmur'],
    67: ['🌧️', 'Dondurucu yağmur'],
    71: ['🌨️', 'Hafif kar'],
    73: ['🌨️', 'Kar yağışlı'],
    75: ['❄️', 'Yoğun kar'],
    77: ['🌨️', 'Kar taneleri'],
    80: ['🌦️', 'Hafif sağanak'],
    81: ['🌦️', 'Sağanak'],
    82: ['🌧️', 'Şiddetli sağanak'],
    85: ['🌨️', 'Kar sağanağı'],
    86: ['🌨️', 'Yoğun kar sağanağı'],
    95: ['⛈️', 'Gök gürültülü fırtına'],
    96: ['⛈️', 'Dolu ve fırtına'],
    99: ['⛈️', 'Şiddetli dolu']
  };
  function wmo(code, isDay) {
    var w = WMO[code] || ['🌡️', ''];
    var icon = w[0];
    if (isDay === false && (code === 0 || code === 1)) icon = '🌙';
    return { icon: icon, text: w[1] };
  }

  function stat(label, value) {
    var s = el('div');
    s.appendChild(el('b', null, value));
    s.appendChild(document.createTextNode(label));
    return s;
  }

  function renderWeather(w) {
    var c = w.current;
    var info = wmo(c.code, c.isDay);
    var now = $('now');
    now.textContent = '';
    now.appendChild(el('div', 'now-loc', w.location));
    var main = el('div', 'now-main');
    main.appendChild(el('div', 'now-icon', info.icon));
    main.appendChild(el('div', 'now-temp', c.temp + '°'));
    now.appendChild(main);
    now.appendChild(el('div', 'now-desc', info.text));
    var stats = el('div', 'now-stats');
    stats.appendChild(stat(' Hissedilen', c.feels + '°'));
    stats.appendChild(stat(' Nem', '%' + c.humidity));
    stats.appendChild(stat(' Rüzgar', c.wind + ' km/s'));
    now.appendChild(stats);

    $('sun').textContent = '🌅 ' + w.sunrise + '   🌇 ' + w.sunset;

    var fc = $('forecast');
    fc.textContent = '';
    w.days.forEach(function (d, i) {
      var p = d.date.split('-');
      var name = i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : shortDayFmt.format(new Date(+p[0], +p[1] - 1, +p[2]));
      var day = el('div', i === 0 ? 'day today' : 'day');
      day.appendChild(el('div', 'day-name', name));
      day.appendChild(el('div', 'day-icon', wmo(d.code).icon));
      day.appendChild(el('div', 'day-max', d.max + '°'));
      day.appendChild(el('div', 'day-min', d.min + '°'));
      day.appendChild(el('div', 'day-rain', d.rain != null ? '💧 %' + d.rain : ''));
      fc.appendChild(day);
    });
  }

  var weatherOk = false;
  function loadWeather() {
    getJSON('/api/weather')
      .then(function (w) {
        weatherOk = true;
        renderWeather(w);
        setTimeout(loadWeather, server.weatherRefreshMinutes * 60000);
      })
      .catch(function () {
        if (!weatherOk) {
          $('now').textContent = '';
          $('now').appendChild(el('div', 'placeholder', 'Hava durumu alınamadı, tekrar denenecek…'));
        }
        setTimeout(loadWeather, 60000);
      });
  }

  // ---- ust serit: piyasa ve internet ---------------------------------------------
  var marketData = null;
  var netState = null;

  function renderMarket(m) {
    marketData = m;
    var box = $('market');
    box.textContent = '';
    m.items.forEach(function (it) {
      var up = it.change >= 0;
      var e = el('span', 'mk');
      var label = el('span', 'mk-l', it.label);
      if (it.unit) label.appendChild(el('span', 'mk-u', it.unit));
      e.appendChild(label);
      e.appendChild(el('span', 'mk-v', fmt(it.value, it.digits)));
      e.appendChild(el('span', 'mk-c ' + (up ? 'up' : 'down'), (up ? '▲ %' : '▼ %') + fmt(Math.abs(it.change), 2)));
      box.appendChild(e);
    });
    applyLayout();
  }

  function loadMarket() {
    if (!server.marketEnabled) return;
    getJSON('/api/market')
      .then(function (m) {
        renderMarket(m);
        setTimeout(loadMarket, server.marketRefreshMinutes * 60000);
      })
      .catch(function () {
        setTimeout(loadMarket, 120000);
      });
  }

  var netTimer = null;
  function renderNet(n) {
    netState = n || { unreachable: true };
    var b = $('net');
    b.textContent = '';
    var text;
    var cls = 'net';
    if (!n) {
      cls += ' bad';
      text = "PC'ye ulaşılamıyor";
    } else if (n.online === false) {
      cls += ' bad';
      text = 'İnternet yok';
    } else {
      var parts = [];
      if (n.testing) parts.push('Ölçülüyor…');
      else if (n.downMbps != null) parts.push('↓ ' + fmt(n.downMbps >= 100 ? Math.round(n.downMbps) : n.downMbps, n.downMbps >= 100 ? 0 : 1) + ' Mbps');
      if (n.pingMs != null) parts.push(n.pingMs + ' ms');
      text = parts.join('  ·  ') || 'Ölçülüyor…';
      if (n.pingMs != null && n.pingMs >= 300) cls += ' bad';
      else if (n.pingMs != null && n.pingMs >= 120) cls += ' warn';
    }
    b.className = cls;
    b.appendChild(document.createElement('i'));
    b.appendChild(document.createTextNode(text));
    applyLayout();
  }

  function pollNet(delay) {
    clearTimeout(netTimer);
    netTimer = setTimeout(function () {
      getJSON('/api/net')
        .then(function (n) {
          renderNet(n);
          if (n.enabled !== false) pollNet(n.testing ? 3000 : 30000);
        })
        .catch(function () {
          renderNet(null);
          pollNet(15000);
        });
    }, delay);
  }

  // ---- haberler ve kategoriler ---------------------------------------------------
  var categories = [];
  var newsState = 'loading'; // loading | ok | error
  var newsUpdated = null;
  var newsStale = false;
  var activeName = null;
  var page = 0;
  var pageTimer = null;

  function catOn(c) {
    return prefs.cats[c.name] != null ? !!prefs.cats[c.name] : c.enabled !== false;
  }
  // Sunucu zaten son N saati suzer; iPad sunucuya ulasamazken eski veri de N saati gecmesin diye burada da suzulur.
  function catItems(c) {
    var maxAge = (server.newsMaxAgeHours || 0) * 3600000;
    if (!maxAge) return c.items;
    return c.items.filter(function (it) {
      return !it.ts || Date.now() - it.ts <= maxAge;
    });
  }
  function visibleCats() {
    return categories.filter(function (c) {
      return catOn(c) && catItems(c).length > 0;
    });
  }
  function newsVisible() {
    if (!featureOn('news')) return false;
    return newsState !== 'ok' || visibleCats().length > 0;
  }

  function ago(ts) {
    if (!ts) return '';
    var m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'şimdi';
    if (m < 60) return m + ' dk önce';
    if (m < 1440) return Math.floor(m / 60) + ' sa önce';
    return Math.floor(m / 1440) + ' gün önce';
  }

  function newsRow(it) {
    var item = el('div', 'item tap');
    item.addEventListener('click', function () {
      openStory(it);
    });
    var meta = el('div', 'item-meta');
    meta.appendChild(el('b', null, it.source));
    var t = ago(it.ts);
    if (t) meta.appendChild(document.createTextNode('  ·  ' + t));
    item.appendChild(meta);
    item.appendChild(el('div', 'item-title', it.title));
    return item;
  }

  function listSize(list, rowRem, min, max) {
    var rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return Math.max(min, Math.min(max, Math.floor(list.clientHeight / (rowRem * rem))));
  }
  function pageSize() {
    return listSize($('news'), 6.6, 1, 8);
  }

  function drawNews() {
    var list = $('news');
    if (newsState === 'loading') return;
    if (newsState === 'error') {
      $('chips').textContent = '';
      $('dots').textContent = '';
      list.textContent = '';
      list.style.setProperty('--rows', 1);
      list.appendChild(el('div', 'placeholder', 'Haberlere ulaşılamıyor, tekrar denenecek…'));
      return;
    }
    var cats = visibleCats();
    if (!cats.length) return; // kart applyLayout ile gizlenir
    var cur = cats.filter(function (c) {
      return c.name === activeName;
    })[0];
    if (!cur) {
      cur = cats[0];
      activeName = cur.name;
      page = 0;
    }

    var chips = $('chips');
    chips.textContent = '';
    cats.forEach(function (c) {
      var b = el('button', c.name === cur.name ? 'chip on' : 'chip', c.name);
      b.type = 'button';
      b.addEventListener('click', function () {
        selectCat(c.name);
      });
      chips.appendChild(b);
    });
    var on = chips.querySelector('.on');
    if (on && chips.scrollWidth > chips.clientWidth) {
      var left = on.getBoundingClientRect().left - chips.getBoundingClientRect().left + chips.scrollLeft;
      chips.scrollLeft = Math.max(0, left - (chips.clientWidth - on.offsetWidth) / 2);
    }
    chipsFade();

    var items = catItems(cur);
    var size = pageSize();
    var pages = Math.max(1, Math.ceil(items.length / size));
    page = page % pages;
    list.textContent = '';
    list.style.setProperty('--rows', size);
    items.slice(page * size, page * size + size).forEach(function (it) {
      list.appendChild(newsRow(it));
    });

    var dots = $('dots');
    dots.textContent = '';
    for (var i = 0; i < Math.min(pages, 8); i++) dots.appendChild(el('i', i === page % 8 ? 'on' : ''));
    var st = $('status');
    st.className = newsStale ? 'status stale' : 'status';
    st.textContent = newsUpdated ? pad(newsUpdated.getHours()) + ':' + pad(newsUpdated.getMinutes()) : '';
  }

  // Sekmeler tasiyorsa sag kenarda solma ipucu goster (kaydirilabilir oldugunu belli eder).
  function chipsFade() {
    var c = $('chips');
    c.classList.toggle('more', c.scrollWidth - c.scrollLeft - c.clientWidth > 4);
  }

  function nextPage() {
    var cats = visibleCats();
    if (!cats.length) return;
    var idx = 0;
    cats.forEach(function (c, i) {
      if (c.name === activeName) idx = i;
    });
    var pages = Math.ceil(catItems(cats[idx]).length / pageSize());
    if (cats.length === 1 && pages <= 1) return;
    var list = $('news');
    list.classList.add('fade');
    setTimeout(function () {
      if (page + 1 < pages) page++;
      else {
        var all = visibleCats();
        var i = 0;
        all.forEach(function (c, j) {
          if (c.name === activeName) i = j;
        });
        var next = all[(i + 1) % all.length];
        activeName = next.name;
        page = 0;
      }
      drawNews();
      list.classList.remove('fade');
    }, 400);
  }

  function selectCat(name) {
    activeName = name;
    page = 0;
    drawNews();
    restartTimers();
  }

  function loadNews() {
    getJSON('/api/news')
      .then(function (n) {
        categories = n.categories;
        newsUpdated = new Date(n.updated);
        newsStale = !!n.stale;
        newsState = 'ok';
        applyAll();
        setTimeout(loadNews, server.newsRefreshMinutes * 60000);
      })
      .catch(function () {
        newsStale = true;
        if (newsState !== 'ok') newsState = 'error';
        applyAll();
        setTimeout(loadNews, 60000);
      });
  }

  // ---- maclar: haberlerin altinda sabit kart -------------------------------------
  var matchData = null;
  var matchError = false;
  var matchSig = '';
  var matchPage = 0;
  var matchFocus = null; // yeni veri gelince canli (yoksa siradaki) macin sirasi: sayfa ona gore secilir
  var matchTimer = null;
  var monthFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });

  function dayLabel(ts) {
    var d = new Date(ts);
    var t = new Date();
    if (d.toDateString() === t.toDateString()) return 'Bugün';
    var tomorrow = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return 'Yarın';
    return Math.abs(d - t) / 86400000 >= 6 ? monthFmt.format(d) : shortDayFmt.format(d);
  }

  function matchRow(m) {
    var row = el('div', 'item match');
    var when = el('div', 'm-when');
    var d = new Date(m.ts);
    when.appendChild(el('div', 'm-day', dayLabel(m.ts)));
    when.appendChild(el('div', 'm-time', pad(d.getHours()) + ':' + pad(d.getMinutes())));
    row.appendChild(when);

    var teams = el('div', 'm-teams');
    teams.appendChild(el('div', m.homeTracked ? 'm-team mine' : 'm-team', m.home));
    teams.appendChild(el('div', m.awayTracked ? 'm-team mine' : 'm-team', m.away));
    row.appendChild(teams);

    var res = el('div', 'm-res');
    if ((m.state === 'in' || m.state === 'post') && m.homeScore != null && m.awayScore != null) {
      var score = el('div', 'm-score');
      score.appendChild(el('div', null, m.homeScore));
      score.appendChild(el('div', null, m.awayScore));
      res.appendChild(score);
    }
    var badge = null;
    if (m.state === 'in') badge = '● Oynanıyor' + (m.minute ? ' ' + m.minute : '');
    else if (m.state === 'post') badge = 'Maç sonu';
    else if (m.state === 'off') badge = m.note || 'Ertelendi';
    if (badge) res.appendChild(el('div', 'm-badge ' + m.state, badge));
    row.appendChild(res);
    return row;
  }

  function matchesVisible() {
    return featureOn('matches') && server.matchesEnabled !== false;
  }

  function drawMatches() {
    if (!matchesVisible()) return;
    var list = $('matchList');
    var dots = $('mdots');
    list.textContent = '';
    dots.textContent = '';
    var note = null;
    if (!matchData) note = matchError ? 'Maç verisi alınamadı, tekrar denenecek…' : 'Maçlar yükleniyor…';
    else if (!matchData.matches.length) note = 'Bu hafta takip edilen takımların maçı görünmüyor';
    if (note) {
      list.style.setProperty('--rows', 1);
      list.appendChild(el('div', 'placeholder small', note));
      return;
    }
    var items = matchData.matches;
    var size = listSize(list, 5.4, 1, 6);
    var pages = Math.max(1, Math.ceil(items.length / size));
    if (matchFocus != null) {
      matchPage = Math.floor(matchFocus / size);
      matchFocus = null;
    }
    matchPage = matchPage % pages;
    list.style.setProperty('--rows', size);
    items.slice(matchPage * size, matchPage * size + size).forEach(function (m) {
      list.appendChild(matchRow(m));
    });
    if (pages > 1) for (var i = 0; i < Math.min(pages, 8); i++) dots.appendChild(el('i', i === matchPage % 8 ? 'on' : ''));
  }

  function nextMatchPage() {
    if (!matchesVisible() || !matchData || !matchData.matches.length) return;
    var list = $('matchList');
    var pages = Math.ceil(matchData.matches.length / listSize(list, 5.4, 1, 6));
    if (pages <= 1) return;
    list.classList.add('fade');
    setTimeout(function () {
      matchPage++;
      drawMatches();
      list.classList.remove('fade');
    }, 400);
  }

  // Canli mac varsa onun, yoksa siradaki macin sirasi (hepsi bittiyse en sonuncu).
  function focusIndex(items) {
    var now = Date.now();
    var idx = -1;
    items.forEach(function (m, i) {
      if (idx < 0 && m.state === 'in') idx = i;
    });
    items.forEach(function (m, i) {
      if (idx < 0 && m.state === 'pre' && m.ts >= now - 3600000) idx = i;
    });
    return idx < 0 ? Math.max(0, items.length - 1) : idx;
  }

  function loadMatches() {
    if (server.matchesEnabled === false) return;
    getJSON('/api/matches')
      .then(function (m) {
        matchData = m;
        matchError = false;
        var sig = JSON.stringify(m.matches);
        if (sig !== matchSig) {
          matchSig = sig;
          matchFocus = focusIndex(m.matches);
          drawMatches();
        }
        setTimeout(loadMatches, 60000);
      })
      .catch(function () {
        matchError = true;
        if (!matchData) drawMatches();
        setTimeout(loadMatches, 120000);
      });
  }

  function restartTimers() {
    clearInterval(pageTimer);
    clearInterval(matchTimer);
    pageTimer = setInterval(nextPage, server.pageSeconds * 1000);
    matchTimer = setInterval(nextMatchPage, server.pageSeconds * 1000);
  }

  // ---- yerlesim: acik/kapali kartlara gore ızgarayi kur ------------------------------
  // Yatay: solda saat+hava, sagda haberler ustte maclar altta, en altta 7 gun.
  // Dikey: ustte saat+hava, sonra 7 gun, sonra haberler ve maclar alt alta.
  function gridFor(portrait, news, matches, forecast) {
    var right = [];
    if (news) right.push('news');
    if (matches) right.push('matches');
    var cols;
    var rows = [];
    var areas = [];
    if (!portrait) {
      if (!right.length) {
        cols = '1fr 1fr';
        rows.push('minmax(0, 1fr)');
        areas.push("'clock now'");
      } else if (right.length === 1) {
        cols = '1fr 1.4fr';
        rows.push('minmax(0, 1fr)', 'minmax(0, 1fr)');
        areas.push("'clock " + right[0] + "'", "'now " + right[0] + "'");
      } else {
        cols = '1fr 1.4fr';
        rows.push('minmax(0, 1.1fr)', 'minmax(0, 1fr)');
        areas.push("'clock news'", "'now matches'");
      }
      if (forecast) {
        rows.push('auto');
        areas.push("'forecast forecast'");
      }
    } else {
      cols = '1.15fr 0.85fr';
      rows.push(right.length ? 'auto' : 'minmax(0, 1fr)');
      areas.push("'clock now'");
      if (forecast) {
        rows.push('auto');
        areas.push("'forecast forecast'");
      }
      right.forEach(function (name) {
        rows.push(name === 'news' && right.length === 2 ? 'minmax(0, 1.15fr)' : 'minmax(0, 1fr)');
        areas.push("'" + name + ' ' + name + "'");
      });
    }
    return { cols: cols, rows: rows.join(' '), areas: areas.join(' ') };
  }

  function applyLayout() {
    var showMarket = featureOn('market') && server.marketEnabled !== false && !!marketData;
    var showNet = featureOn('net') && !!netState && netState.enabled !== false;
    $('market').hidden = !showMarket;
    $('net').hidden = !showNet;
    $('ticker').hidden = !(showMarket || showNet);
    var news = newsVisible();
    var matches = matchesVisible();
    var forecast = featureOn('forecast');
    $('newsCard').hidden = !news;
    $('matchesCard').hidden = !matches;
    $('forecast').hidden = !forecast;
    var g = gridFor(window.matchMedia('(orientation: portrait)').matches, news, matches, forecast);
    var app = $('app');
    app.style.gridTemplateColumns = g.cols;
    app.style.gridTemplateRows = g.rows;
    app.style.gridTemplateAreas = g.areas;
  }
  function applyAll() {
    applyLayout();
    drawNews();
    drawMatches();
  }

  // ---- haber penceresi: habere dokununca baslik, kaynak, saat ve ozet ---------------
  var storyTimer = null;
  function closeStory() {
    clearTimeout(storyTimer);
    $('story').hidden = true;
  }
  function touchStory() {
    clearTimeout(storyTimer);
    storyTimer = setTimeout(closeStory, 120000);
  }
  function openStory(it) {
    var card = $('storyCard');
    card.textContent = '';
    var meta = el('div', 'story-meta');
    meta.appendChild(el('b', null, it.source));
    if (it.ts) {
      var d = new Date(it.ts);
      meta.appendChild(document.createTextNode('  ·  ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '  ·  ' + ago(it.ts)));
    }
    card.appendChild(meta);
    card.appendChild(el('div', 'story-title', it.title));
    var hasLink = typeof it.link === 'string' && /^https?:\/\//i.test(it.link);
    card.appendChild(
      it.summary
        ? el('div', 'story-body', it.summary)
        : el('div', 'story-body muted', hasLink ? 'Bu haber için özet yok. Aşağıdaki düğmeyle haberin kendisine gidebilirsiniz.' : 'Bu haber için ayrıntı yok.')
    );
    var actions = el('div', 'panel-actions');
    if (hasLink) {
      var open = el('a', 'btn', 'Haberin tamamı ↗');
      open.href = it.link;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      actions.appendChild(open);
    }
    var close = el('button', 'btn primary', 'Kapat');
    close.type = 'button';
    close.addEventListener('click', closeStory);
    actions.appendChild(close);
    card.appendChild(actions);
    $('story').hidden = false;
    card.scrollTop = 0;
    touchStory();
  }

  // ---- ayar paneli ---------------------------------------------------------------
  var panelTimer = null;
  function touchPanel() {
    clearTimeout(panelTimer);
    panelTimer = setTimeout(closePanel, 60000);
  }
  function closePanel() {
    clearTimeout(panelTimer);
    $('panel').hidden = true;
  }
  function changed() {
    savePrefs();
    applyAll();
  }
  function switchRow(label, sub, on, onChange) {
    var b = el('button', 'row');
    b.type = 'button';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    var t = el('span');
    t.appendChild(document.createTextNode(label));
    if (sub) t.appendChild(el('small', null, sub));
    b.appendChild(t);
    b.appendChild(el('span', 'sw'));
    b.addEventListener('click', function () {
      on = !on;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      onChange(on);
      touchPanel();
    });
    return b;
  }

  function buildPanel() {
    var card = $('panelCard');
    card.textContent = '';
    card.appendChild(el('div', 'panel-title', 'Ayarlar'));

    card.appendChild(el('div', 'panel-group', 'Ekranda göster'));
    card.appendChild(
      switchRow('Piyasa şeridi', 'Dolar, euro, gram altın', featureOn('market'), function (v) {
        prefs.market = v;
        changed();
      })
    );
    card.appendChild(
      switchRow('İnternet hızı', 'Sağ üstteki küçük gösterge', featureOn('net'), function (v) {
        prefs.net = v;
        changed();
      })
    );
    card.appendChild(
      switchRow('7 günlük tahmin', null, featureOn('forecast'), function (v) {
        prefs.forecast = v;
        changed();
      })
    );
    card.appendChild(
      switchRow('Haberler', 'Kategorileri aşağıdan seçin', featureOn('news'), function (v) {
        prefs.news = v;
        changed();
      })
    );
    if (server.matchesEnabled !== false) {
      card.appendChild(
        switchRow('Maçlar', 'Galatasaray, Fenerbahçe, Beşiktaş', featureOn('matches'), function (v) {
          prefs.matches = v;
          changed();
        })
      );
    }

    var shown = categories;
    if (shown.length) {
      card.appendChild(el('div', 'panel-group', 'Haber kategorileri'));
      var grid = el('div', 'cat-grid');
      shown.forEach(function (c) {
        grid.appendChild(
          switchRow(c.name, null, catOn(c), function (v) {
            prefs.cats[c.name] = v;
            changed();
          })
        );
      });
      card.appendChild(grid);
    }

    var n = server.night || {};
    card.appendChild(el('div', 'panel-group', 'Gece'));
    card.appendChild(
      switchRow('Gece modu', pad(n.from || 0) + ':00 – ' + pad(n.to || 0) + ':00 arası yalnızca loş saat', nightEnabled(), function (v) {
        prefs.night = v;
        changed();
      })
    );

    var actions = el('div', 'panel-actions');
    var reset = el('button', 'btn', 'Varsayılana dön');
    reset.type = 'button';
    reset.addEventListener('click', function () {
      prefs = { cats: {} };
      savePrefs();
      applyAll();
      buildPanel();
      touchPanel();
    });
    var close = el('button', 'btn primary', 'Kapat');
    close.type = 'button';
    close.addEventListener('click', closePanel);
    actions.appendChild(reset);
    actions.appendChild(close);
    card.appendChild(actions);
  }

  function openPanel() {
    buildPanel();
    $('panel').hidden = false;
    touchPanel();
  }

  // ---- tam ekran dugmesi (Ana Ekrana ekli degilse) ---------------------------------
  function setupFullscreen() {
    var root = document.documentElement;
    var request = root.requestFullscreen || root.webkitRequestFullscreen;
    var standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (!request || standalone) return;
    var btn = $('fs');
    btn.hidden = false;
    btn.addEventListener('click', function () {
      request.call(root);
    });
    function sync() {
      btn.hidden = !!(document.fullscreenElement || document.webkitFullscreenElement);
    }
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
  }

  // ---- baslat ----------------------------------------------------------------
  window.addEventListener('resize', applyAll);
  // Hava durumu, alt serit gibi kartlar sonradan dolunca haber ve mac listelerinin yuksekligi degisir;
  // sayfa boyutu (kac satir sigacagi) yeni yukseklige gore yeniden hesaplanir.
  if (window.ResizeObserver) {
    var listHeights = {};
    var listTimer = null;
    var listObserver = new ResizeObserver(function (entries) {
      var changed = false;
      entries.forEach(function (e) {
        var h = Math.round(e.contentRect.height);
        if (listHeights[e.target.id] == null || Math.abs(listHeights[e.target.id] - h) > 6) {
          listHeights[e.target.id] = h;
          changed = true;
        }
      });
      if (!changed) return;
      clearTimeout(listTimer);
      listTimer = setTimeout(function () {
        drawNews();
        drawMatches();
      }, 120);
    });
    listObserver.observe($('news'));
    listObserver.observe($('matchList'));
  }
  $('chips').addEventListener('scroll', chipsFade);
  $('story').addEventListener('click', function (e) {
    if (e.target === $('story')) closeStory();
  });
  $('storyCard').addEventListener('pointerdown', touchStory);
  $('gear').addEventListener('click', openPanel);
  $('panel').addEventListener('click', function (e) {
    if (e.target === $('panel')) closePanel();
  });
  $('panelCard').addEventListener('pointerdown', touchPanel);
  $('net').addEventListener('click', function () {
    // Dokununca indirme hizini hemen olc (sunucu art arda olcumleri sinirlar).
    getJSON('/api/net?test=1')
      .then(function (n) {
        renderNet(n);
        pollNet(3000);
      })
      .catch(function () {
        renderNet(null);
      });
  });

  var peekTimer = null;
  document.addEventListener('pointerdown', function () {
    // Gece modunda dokununca 30 saniyeligine tum panoyu goster.
    if (!document.body.classList.contains('night')) return;
    document.body.classList.add('peek');
    clearTimeout(peekTimer);
    peekTimer = setTimeout(function () {
      document.body.classList.remove('peek');
    }, 30000);
  });
  document.addEventListener('visibilitychange', function () {
    // iPad uygulamayi askiya alinca zamanlayicilar durur; geri gelince tazele.
    if (!document.hidden) location.reload();
  });

  tick();
  setupFullscreen();
  applyLayout();
  getJSON('/api/config')
    .then(function (s) {
      Object.keys(s).forEach(function (k) {
        server[k] = s[k];
      });
    })
    .catch(function () {})
    .then(function () {
      applyLayout();
      loadWeather();
      loadNews();
      loadMarket();
      loadMatches();
      pollNet(0);
      restartTimers();
    });
})();
