// Internet durumu: gecikme (ping) sik, indirme hizi seyrek olculur.
// Olcum bu PC'nin baglantisini olcer; iPad ayni modemi kullandigi icin ayni hattir.
import { config } from './config.js';
import { log } from './util.js';

const PING_URLS = ['https://speed.cloudflare.com/__down?bytes=0', 'https://www.gstatic.com/generate_204'];
const TEST_COOLDOWN_MS = 60000;

export const net = { online: null, pingMs: null, downMbps: null, speedAt: null, checkedAt: null };
let testing = false;
let lastTestAt = 0;

async function timed(url, timeoutMs = 5000) {
  const t0 = performance.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
  await res.arrayBuffer();
  return performance.now() - t0;
}

async function ping() {
  for (const url of PING_URLS) {
    try {
      // Ilk istek baglanti kurar; sonrakiler gercek gecikmeye yakindir. En kucugu al.
      const times = [];
      for (let i = 0; i < 3; i++) times.push(await timed(url));
      net.pingMs = Math.round(Math.min(...times));
      net.online = true;
      net.checkedAt = Date.now();
      return;
    } catch {
      // siradaki adresi dene
    }
  }
  net.online = false;
  net.pingMs = null;
  net.checkedAt = Date.now();
}

export async function speedTest() {
  if (testing) return;
  testing = true;
  lastTestAt = Date.now();
  try {
    const bytes = config.net.speedBytes;
    const res = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}`, {
      signal: AbortSignal.timeout(30000),
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const start = performance.now(); // baglanti kurulumu sayilmasin: ilk bayttan itibaren
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.byteLength;
    }
    const seconds = (performance.now() - start) / 1000;
    if (got < bytes * 0.9 || seconds <= 0) throw new Error('eksik veri');
    net.downMbps = Math.round(((got * 8) / seconds / 1e6) * 10) / 10;
    net.speedAt = Date.now();
    log(`✓ Internet hizi: ${net.downMbps} Mbps indirme, ${net.pingMs ?? '?'} ms`);
  } catch (err) {
    log(`✗ Internet hizi olculemedi: ${err.message}`);
  } finally {
    testing = false;
  }
}

// Ekrandaki rozete dokununca tetiklenir; art arda olcumleri sinirlar.
export function requestSpeedTest() {
  if (testing || Date.now() - lastTestAt < TEST_COOLDOWN_MS) return false;
  speedTest();
  return true;
}

export const netStatus = () => ({ enabled: config.net.enabled, testing, ...net });

export function startNet() {
  if (!config.net.enabled) return;
  ping();
  setInterval(ping, config.net.pingSeconds * 1000);
  if (config.net.speedMinutes > 0) {
    setTimeout(speedTest, 10000);
    setInterval(speedTest, config.net.speedMinutes * 60000);
  }
}
