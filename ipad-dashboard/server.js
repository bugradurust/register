// iPad pano sunucusu: statik dosyalari sunar, hava durumu ve haberleri
// kendisi cekip onbellekler. Bagimlilik yok, Node 18+ yeterli.
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const UA = 'Mozilla/5.0 (compatible; iPadPano/1.0)';

const config = {
  port: 3000,
  city: 'auto',
  latitude: null,
  longitude: null,
  weatherRefreshMinutes: 15,
  newsRefreshMinutes: 15,
  newsPerSource: 8,
  newsTotal: 30,
  pageSeconds: 15,
  night: { enabled: false, from: 23, to: 7 },
  newsFeeds: [],
  ...JSON.parse(await fs.readFile(path.join(ROOT, 'config.json'), 'utf8'))
};
if (process.env.PORT) config.port = Number(process.env.PORT);

const log = (...args) =>
  console.log(new Date().toLocaleTimeString('tr-TR'), ...args);

// ---- ag yardimcilari -------------------------------------------------------

async function fetchText(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'application/xml,text/xml,application/json,*/*' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // Bazi Turk haber siteleri hala windows-1254 kullaniyor.
    let charset = /charset=([\w-]+)/i.exec(res.headers.get('content-type') || '')?.[1];
    charset ||= /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(buf.subarray(0, 200).toString('latin1'))?.[1];
    try {
      return new TextDecoder(charset || 'utf-8').decode(buf);
    } catch {
      return buf.toString('utf8');
    }
  } catch (err) {
    throw err.name === 'AbortError' ? new Error('zaman asimi') : err;
  } finally {
    clearTimeout(timer);
  }
}

// Sonucu ttl boyunca tutar. Kaynak cevap vermezse eski veriyi (stale: true) dondurur
// ve bir dakika sonra yeniden dener.
function cached(ttlMs, load) {
  let value = null;
  let expires = 0;
  let pending = null;
  return async () => {
    if (value && Date.now() < expires) return value;
    pending ||= load()
      .then((v) => {
        value = v;
        expires = Date.now() + ttlMs;
        return v;
      })
      .catch((err) => {
        expires = Date.now() + Math.min(ttlMs, 60000);
        throw err;
      })
      .finally(() => {
        pending = null;
      });
    try {
      return await pending;
    } catch (err) {
      if (value) return { ...value, stale: true };
      throw err;
    }
  };
}

// ---- hava durumu -----------------------------------------------------------

// Konum onceligi: config'teki koordinat > sehir adi > "auto" (PC'nin IP adresinden bulunur).
// iPad'in GPS'i kullanilamaz: Safari konum iznini yalniz HTTPS sayfalara verir.
const hasCoords = Number.isFinite(config.latitude) && Number.isFinite(config.longitude);
const isAuto = !config.city || config.city.toLowerCase() === 'auto';
const useIp = isAuto && !hasCoords;
const IP_REFRESH_MS = 6 * 3600000;

async function geocode(name, count = 1) {
  const qs = new URLSearchParams({ name, count: String(count), language: 'tr', format: 'json' });
  const data = JSON.parse(await fetchText(`https://geocoding-api.open-meteo.com/v1/search?${qs}`));
  return data.results || [];
}

async function lookupByIp() {
  const sources = ['https://ipwho.is/', 'https://get.geojs.io/v1/ip/geo.json', 'https://ipapi.co/json/'];
  const errors = [];
  for (const url of sources) {
    try {
      const d = JSON.parse(await fetchText(url));
      if (d.success === false || d.error || !d.city || d.latitude == null || d.longitude == null) {
        throw new Error('konum bilgisi yok');
      }
      const latitude = Number(d.latitude);
      const longitude = Number(d.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('gecersiz koordinat');
      return { name: d.city, latitude, longitude };
    } catch (err) {
      errors.push(`${new URL(url).hostname}: ${err.message}`);
    }
  }
  throw new Error(`IP adresinden konum bulunamadi (${errors.join('; ')}). config.json -> city alanina sehir adini yazin`);
}

// IP servisleri "Istanbul" gibi ASCII isim verir; yakindaki Turkce yazimi ("İstanbul") varsa onu kullan.
async function turkishName(found) {
  try {
    const cos = Math.cos((found.latitude * Math.PI) / 180);
    const hit = (await geocode(found.name, 5)).find(
      (r) => Math.hypot(r.latitude - found.latitude, (r.longitude - found.longitude) * cos) < 0.8
    );
    return hit ? hit.name : found.name;
  } catch {
    return found.name;
  }
}

let place = null;
let placeAt = 0;
async function resolvePlace() {
  if (place && (!useIp || Date.now() - placeAt < IP_REFRESH_MS)) return place;
  try {
    let next;
    if (hasCoords) {
      next = { name: isAuto ? '' : config.city, latitude: config.latitude, longitude: config.longitude };
    } else if (useIp) {
      const found = await lookupByIp();
      next = { ...found, name: await turkishName(found) };
    } else {
      const hit = (await geocode(config.city))[0];
      if (!hit) throw new Error(`"${config.city}" bulunamadi (config.json -> city)`);
      next = { name: hit.name, latitude: hit.latitude, longitude: hit.longitude };
    }
    if (useIp && next.name !== place?.name) {
      log(`📍 Konum IP adresinden bulundu: ${next.name} (yanlissa config.json -> city alanina sehir adini yazin)`);
    }
    place = next;
    placeAt = Date.now();
  } catch (err) {
    if (!place) throw err;
    placeAt = Date.now() - IP_REFRESH_MS + 600000; // eski konumla devam et, 10 dk sonra tekrar dene
  }
  return place;
}

const getWeather = cached(config.weatherRefreshMinutes * 60000, async () => {
  const { name, latitude, longitude } = await resolvePlace();
  const qs = new URLSearchParams({
    latitude,
    longitude,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'auto',
    wind_speed_unit: 'kmh',
    forecast_days: '7'
  });
  const d = JSON.parse(await fetchText(`https://api.open-meteo.com/v1/forecast?${qs}`));
  return {
    updated: new Date().toISOString(),
    location: name,
    current: {
      temp: Math.round(d.current.temperature_2m),
      feels: Math.round(d.current.apparent_temperature),
      humidity: Math.round(d.current.relative_humidity_2m),
      wind: Math.round(d.current.wind_speed_10m),
      code: d.current.weather_code,
      isDay: d.current.is_day === 1
    },
    sunrise: d.daily.sunrise[0].slice(11, 16),
    sunset: d.daily.sunset[0].slice(11, 16),
    days: d.daily.time.map((date, i) => ({
      date,
      code: d.daily.weather_code[i],
      max: Math.round(d.daily.temperature_2m_max[i]),
      min: Math.round(d.daily.temperature_2m_min[i]),
      rain: d.daily.precipitation_probability_max[i]
    }))
  };
});

// ---- haberler --------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

function clean(s) {
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ');
  return decodeEntities(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tagText(block, name) {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? clean(m[1]) : '';
}

function parseFeed(xml, source) {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  const now = Date.now();
  const items = [];
  for (const block of blocks) {
    const title = tagText(block, 'title');
    if (!title) continue;
    const date = tagText(block, 'pubDate') || tagText(block, 'dc:date') || tagText(block, 'published') || tagText(block, 'updated');
    const ts = Date.parse(date);
    items.push({ title, source, ts: Number.isFinite(ts) ? Math.min(ts, now) : 0 });
  }
  return items;
}

const feedState = new Map();
async function loadFeed(feed) {
  try {
    const items = parseFeed(await fetchText(feed.url), feed.name);
    if (!items.length) throw new Error('haber bulunamadi');
    if (feedState.get(feed.name) !== 'ok') log(`✓ ${feed.name}: ${items.length} haber`);
    feedState.set(feed.name, 'ok');
    return items.sort((a, b) => b.ts - a.ts).slice(0, config.newsPerSource);
  } catch (err) {
    if (feedState.get(feed.name) !== err.message) log(`✗ ${feed.name}: ${err.message}`);
    feedState.set(feed.name, err.message);
    return [];
  }
}

const getNews = cached(config.newsRefreshMinutes * 60000, async () => {
  const lists = await Promise.all(config.newsFeeds.map(loadFeed));
  const seen = new Set();
  const items = lists
    .flat()
    .sort((a, b) => b.ts - a.ts)
    .filter((it) => {
      const key = it.title.toLowerCase();
      return seen.has(key) ? false : seen.add(key);
    })
    .slice(0, config.newsTotal);
  if (!items.length) throw new Error('hicbir haber kaynagina ulasilamadi');
  return { updated: new Date().toISOString(), items };
});

// ---- http ------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function send(res, status, type, body, cache = 'no-cache') {
  res.writeHead(status, { 'content-type': type, 'cache-control': cache });
  res.end(body);
}
const sendJson = (res, status, obj) =>
  send(res, status, MIME['.json'], JSON.stringify(obj), 'no-store');

const API = {
  '/api/weather': getWeather,
  '/api/news': getNews,
  '/api/config': async () => ({
    pageSeconds: config.pageSeconds,
    weatherRefreshMinutes: config.weatherRefreshMinutes,
    newsRefreshMinutes: config.newsRefreshMinutes,
    night: config.night
  })
};

async function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, 'text/plain; charset=utf-8', 'Bad request');
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(PUBLIC, path.normalize(rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'text/plain; charset=utf-8', 'Forbidden');
  try {
    const body = await fs.readFile(file);
    send(res, 200, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', req.method === 'HEAD' ? '' : body);
  } catch {
    send(res, 404, 'text/plain; charset=utf-8', 'Not found');
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed');
  }
  let pathname;
  try {
    pathname = new URL(req.url, 'http://pano').pathname;
  } catch {
    return send(res, 400, 'text/plain; charset=utf-8', 'Bad request');
  }
  const handler = API[pathname];
  if (!handler) return serveStatic(req, res, pathname);
  try {
    sendJson(res, 200, await handler());
  } catch (err) {
    sendJson(res, 502, { error: err.message });
  }
});

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${config.port} baska bir program tarafindan kullaniliyor.` : err);
  process.exit(1);
});
process.on('uncaughtException', (err) => log('Beklenmeyen hata:', err));
process.on('unhandledRejection', (err) => log('Beklenmeyen hata:', err));

server.listen(config.port, '0.0.0.0', () => {
  const addrs = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  console.log('\nPano calisiyor. iPad Safari icinde su adreslerden birini ac:');
  for (const a of addrs) console.log(`   http://${a}:${config.port}`);
  console.log(`   (bu bilgisayarda: http://localhost:${config.port})\n`);
  // Ilk acilista kaynaklari dene ki sorun varsa hemen gorulsun.
  getWeather().then(
    (w) => log(`✓ Hava durumu: ${w.location}, ${w.current.temp}°`),
    (err) => log(`✗ Hava durumu: ${err.message}`)
  );
  getNews().catch((err) => log(`✗ Haberler: ${err.message}`));
});
