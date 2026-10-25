(function () {
  'use strict';

  var $ = function (id) {
    return document.getElementById(id);
  };
  var startedAt = Date.now();
  var settings = {
    pageSeconds: 15,
    weatherRefreshMinutes: 15,
    newsRefreshMinutes: 15,
    night: { enabled: true, from: 23, to: 7 }
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

  // ---- saat ----------------------------------------------------------------
  var weekdayFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' });
  var dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  var shortDayFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'short' });
  var lastDay = '';

  function isNight(hour) {
    var n = settings.night;
    if (!n || !n.enabled) return false;
    return n.from <= n.to ? hour >= n.from && hour < n.to : hour >= n.from || hour < n.to;
  }

  function tick() {
    var now = new Date();
    $('hh').textContent = pad(now.getHours());
    $('mm').textContent = pad(now.getMinutes());
    var night = isNight(now.getHours());
    $('ss').textContent = pad(now.getSeconds());
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
        setTimeout(loadWeather, settings.weatherRefreshMinutes * 60000);
      })
      .catch(function () {
        if (!weatherOk) {
          $('now').textContent = '';
          $('now').appendChild(el('div', 'placeholder', 'Hava durumu alınamadı, tekrar denenecek…'));
        }
        setTimeout(loadWeather, 60000);
      });
  }

  // ---- haberler --------------------------------------------------------------
  var newsItems = [];
  var newsUpdated = null;
  var newsStale = false;
  var page = 0;
  var pageTimer = null;

  function ago(ts) {
    if (!ts) return '';
    var m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'şimdi';
    if (m < 60) return m + ' dk önce';
    if (m < 1440) return Math.floor(m / 60) + ' sa önce';
    return Math.floor(m / 1440) + ' gün önce';
  }

  function pageSize() {
    var list = $('news');
    var rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return Math.max(2, Math.min(8, Math.floor(list.clientHeight / (8.4 * rem))));
  }

  function drawPage() {
    var list = $('news');
    list.textContent = '';
    var size = pageSize();
    var pages = Math.max(1, Math.ceil(newsItems.length / size));
    page = page % pages;
    list.style.setProperty('--rows', size);
    newsItems.slice(page * size, page * size + size).forEach(function (it) {
      var item = el('div', 'item');
      var meta = el('div', 'item-meta');
      meta.appendChild(el('b', null, it.source));
      var t = ago(it.ts);
      if (t) meta.appendChild(document.createTextNode('  ·  ' + t));
      item.appendChild(meta);
      item.appendChild(el('div', 'item-title', it.title));
      list.appendChild(item);
    });
    var dots = $('dots');
    dots.textContent = '';
    for (var i = 0; i < Math.min(pages, 12); i++) dots.appendChild(el('i', i === page % 12 ? 'on' : ''));
    var st = $('status');
    st.className = newsStale ? 'status stale' : 'status';
    st.textContent = newsUpdated ? pad(newsUpdated.getHours()) + ':' + pad(newsUpdated.getMinutes()) : '';
  }

  function nextPage() {
    if (!newsItems.length) return;
    var list = $('news');
    list.classList.add('fade');
    setTimeout(function () {
      page++;
      drawPage();
      list.classList.remove('fade');
    }, 400);
  }

  function loadNews() {
    getJSON('/api/news')
      .then(function (n) {
        newsItems = n.items;
        newsUpdated = new Date(n.updated);
        newsStale = !!n.stale;
        drawPage();
        setTimeout(loadNews, settings.newsRefreshMinutes * 60000);
      })
      .catch(function () {
        newsStale = true;
        if (newsItems.length) drawPage();
        else {
          $('news').textContent = '';
          $('news').appendChild(el('div', 'placeholder', 'Haberlere ulaşılamıyor, tekrar denenecek…'));
        }
        setTimeout(loadNews, 60000);
      });
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
  window.addEventListener('resize', function () {
    if (newsItems.length) drawPage();
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
  getJSON('/api/config')
    .then(function (s) {
      settings = s;
    })
    .catch(function () {})
    .then(function () {
      loadWeather();
      loadNews();
      pageTimer = setInterval(nextPage, settings.pageSeconds * 1000);
    });
})();
