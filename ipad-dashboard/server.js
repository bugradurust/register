// iPad pano sunucusu: statik dosyalari sunar; hava durumu, haber, piyasa, internet
// durumu ve mac verilerini kendisi cekip onbellekler. Bagimlilik yok, Node 18+ yeterli.
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config, ROOT } from './lib/config.js';
import { log } from './lib/util.js';
import { getWeather } from './lib/weather.js';
import { getNews } from './lib/news.js';
import { getMarket } from './lib/market.js';
import { getMatches } from './lib/matches.js';
import { netStatus, requestSpeedTest, startNet } from './lib/net.js';

const PUBLIC = path.join(ROOT, 'public');

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
const sendJson = (res, status, obj) => send(res, status, MIME['.json'], JSON.stringify(obj), 'no-store');

const API = {
  '/api/weather': () => getWeather(),
  '/api/news': () => getNews(),
  '/api/market': () => (config.market.enabled ? getMarket() : Promise.reject(new Error('kapali'))),
  '/api/matches': () => (config.matches.enabled ? getMatches() : Promise.reject(new Error('kapali'))),
  '/api/net': (query) => {
    if (query.get('test') === '1') requestSpeedTest();
    return netStatus();
  },
  '/api/config': () => ({
    pageSeconds: config.pageSeconds,
    weatherRefreshMinutes: config.weatherRefreshMinutes,
    newsRefreshMinutes: config.newsRefreshMinutes,
    marketRefreshMinutes: config.market.refreshMinutes,
    marketEnabled: config.market.enabled,
    matchesEnabled: config.matches.enabled,
    show: config.show,
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
  let url;
  try {
    url = new URL(req.url, 'http://pano');
  } catch {
    return send(res, 400, 'text/plain; charset=utf-8', 'Bad request');
  }
  const handler = API[url.pathname];
  if (!handler) return serveStatic(req, res, url.pathname);
  try {
    sendJson(res, 200, await handler(url.searchParams));
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
  // Ilk acilista kaynaklari dene ki sorun varsa hemen gorulsun (her kaynak kendi satirini yazar).
  getWeather().then(
    (w) => log(`✓ Hava durumu: ${w.location}, ${w.current.temp}°`),
    (err) => log(`✗ Hava durumu: ${err.message}`)
  );
  getNews().catch((err) => log(`✗ Haberler: ${err.message}`));
  if (config.market.enabled) getMarket().catch(() => {});
  if (config.matches.enabled) getMatches().catch((err) => log(`✗ Maçlar: ${err.message}`));
  startNet();
});
