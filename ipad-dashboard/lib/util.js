// Ortak yardimcilar: gunluk, ag istegi, onbellek.
export const UA = 'Mozilla/5.0 (compatible; iPadPano/1.0)';
// Bazi servisler (Yahoo gibi) tarayici olmayan istemcileri reddeder.
export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const log = (...args) => console.log(new Date().toLocaleTimeString('tr-TR'), ...args);

export async function fetchText(url, { timeoutMs = 10000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'application/xml,text/xml,application/json,*/*', ...headers }
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

export const fetchJson = async (url, opts) => JSON.parse(await fetchText(url, opts));

// Sonucu ttl boyunca tutar (ttl sayi ya da sonuctan sure donduren fonksiyon).
// Kaynak cevap vermezse eski veriyi (stale: true) dondurur ve bir dakika sonra yeniden dener.
export function cached(ttl, load) {
  let value = null;
  let expires = 0;
  let pending = null;
  const ttlOf = (v) => (typeof ttl === 'function' ? ttl(v) : ttl);
  return async () => {
    if (value && Date.now() < expires) return value;
    pending ||= load()
      .then((v) => {
        value = v;
        expires = Date.now() + ttlOf(v);
        return v;
      })
      .catch((err) => {
        expires = Date.now() + 60000;
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

// Ayni hata mesajini her turda tekrar yazmamak icin: yalniz durum degisince gunluge yazar.
export function stateLogger() {
  const last = new Map();
  return (key, state, message) => {
    if (last.get(key) === state) return;
    last.set(key, state);
    log(message);
  };
}
