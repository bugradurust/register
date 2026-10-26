// Dolar, euro ve gram altin. Birinci kaynak calismazsa siradakine gecilir.
import { config } from './config.js';
import { BROWSER_UA, cached, fetchJson, stateLogger } from './util.js';

const OUNCE_GRAMS = 31.1034768;
const note = stateLogger();

// ---- Yahoo Finance (grafik uc noktasi, anahtar gerekmez) -----------------------
async function yahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const d = await fetchJson(url, { headers: { 'user-agent': BROWSER_UA } });
  const r = d.chart?.result?.[0];
  if (!r) throw new Error(d.chart?.error?.description || `${symbol}: veri yok`);
  const stamps = r.timestamp || [];
  const closes = r.indicators?.quote?.[0]?.close || [];
  const bars = stamps.map((t, i) => ({ t, c: closes[i] })).filter((b) => Number.isFinite(b.c));
  const price = r.meta?.regularMarketPrice ?? bars.at(-1)?.c;
  if (!Number.isFinite(price)) throw new Error(`${symbol}: fiyat yok`);
  // Son gunluk mum bugunun muma ise "onceki kapanis" bir oncekidir; degilse son mumun kendisi.
  const day = (t) => Math.floor((t + (r.meta?.gmtoffset || 0)) / 86400);
  const last = bars.at(-1);
  let prev = last ? (day(last.t) === day(r.meta?.regularMarketTime ?? last.t) ? bars.at(-2)?.c : last.c) : undefined;
  prev ??= r.meta?.previousClose ?? r.meta?.chartPreviousClose;
  return { price, prev: Number.isFinite(prev) ? prev : null };
}

// Degisim bilinmiyorsa null: ekranda sifir gibi gosterilmez, "—" yazar.
const pct = (price, prev) => (Number.isFinite(prev) && prev ? ((price - prev) / prev) * 100 : null);

async function yahoo() {
  const [usd, eur, ounce] = await Promise.all([yahooQuote('USDTRY=X'), yahooQuote('EURTRY=X'), yahooQuote('GC=F')]);
  const gram = (o, u) => (o * u) / OUNCE_GRAMS; // ons altin (USD) x dolar / ons gram sayisi
  const goldNow = gram(ounce.price, usd.price);
  const goldPrev = Number.isFinite(ounce.prev) && Number.isFinite(usd.prev) ? gram(ounce.prev, usd.prev) : null;
  return {
    USD: { value: usd.price, change: pct(usd.price, usd.prev) },
    EUR: { value: eur.price, change: pct(eur.price, eur.prev) },
    GOLD: { value: goldNow, change: pct(goldNow, goldPrev) }
  };
}

// ---- Truncgil (Turk piyasasi fiyatlari) -----------------------------------------
// Yanit alan adlari surume gore degisebildiginden dikkatli okunur.
function trNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  let s = v.replace(/[%\s₺$€]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s);
}

function pick(entry, names) {
  for (const key of Object.keys(entry)) {
    if (names.includes(key.toLowerCase())) return entry[key];
  }
  return undefined;
}

async function truncgil() {
  const data = await fetchJson('https://finans.truncgil.com/v4/today.json');
  const entries = Object.entries(data).filter(([, v]) => v && typeof v === 'object');
  const find = (keyRe, nameRe) =>
    entries.find(([k]) => keyRe.test(k))?.[1] ||
    entries.find(([, v]) => nameRe.test(String(pick(v, ['name']) ?? '')))?.[1];
  const read = (entry, label) => {
    if (!entry) throw new Error(`${label} bulunamadi`);
    const value = trNumber(pick(entry, ['selling', 'satis', 'sell']) ?? pick(entry, ['buying', 'alis', 'buy']));
    if (!Number.isFinite(value)) throw new Error(`${label} fiyati okunamadi`);
    const change = trNumber(pick(entry, ['change', 'degisim']));
    return { value, change: Number.isFinite(change) ? change : null };
  };
  return {
    USD: read(find(/^usd$/i, /^(amerikan dolar|abd dolar)/i), 'USD'),
    EUR: read(find(/^eur$/i, /^euro/i), 'EUR'),
    GOLD: read(find(/^(gra|gram[-_ ]?alt[ıi]n|gramaltin)$/i, /^gram alt/i), 'Gram altin')
  };
}

const PROVIDERS = { yahoo, truncgil };
const META = {
  USD: { label: 'USD', digits: 2 },
  EUR: { label: 'EUR', digits: 2 },
  GOLD: { label: 'ALTIN', unit: 'gr', digits: 0 }
};

export const getMarket = cached(config.market.refreshMinutes * 60000, async () => {
  const errors = [];
  for (const name of config.market.providers) {
    try {
      const quotes = await PROVIDERS[name]();
      note('market', name, `✓ Piyasa (${name}): USD ${quotes.USD.value.toFixed(2)}, EUR ${quotes.EUR.value.toFixed(2)}, altin ${Math.round(quotes.GOLD.value)}`);
      return {
        updated: new Date().toISOString(),
        provider: name,
        items: config.market.items.filter((id) => quotes[id]).map((id) => ({ id, ...META[id], ...quotes[id] }))
      };
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  const message = errors.join('; ');
  note('market', message, `✗ Piyasa: ${message}`);
  throw new Error(message);
});
