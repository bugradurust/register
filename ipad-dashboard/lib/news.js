// Haberler: her kategori (paket) bir ya da birkac kaynagi birlestirir. Kaynak bir RSS adresi
// ya da RSS'i olmayan bir haber sayfasi (ornegin bundle.app/tr/gundem) olabilir.
import { config } from './config.js';
import { BROWSER_UA, cached, fetchText, stateLogger } from './util.js';
import { parseFeed } from './rss.js';
import { extractItems } from './pagefeed.js';

export { parseFeed };

const note = stateLogger();
const PAGE_HEADERS = {
  'user-agent': BROWSER_UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'tr-TR,tr;q=0.9,en;q=0.5'
};
const fetchPage = (url) => fetchText(url, { headers: PAGE_HEADERS });

async function fetchFeed(bundle, feed) {
  const key = `${bundle} · ${feed.name}`;
  try {
    const text = await fetchPage(feed.url);
    const isFeed = /<(rss|feed|rdf:RDF)[\s>]/i.test(text.slice(0, 3000));
    let all;
    let via = 'RSS';
    if (isFeed) all = parseFeed(text, feed.name, feed.url);
    else ({ items: all, via } = await extractItems(text, feed.url, fetchPage));
    if (!all.length) {
      throw new Error(isFeed ? 'haber bulunamadi' : 'sayfada haber bulunamadi (teshis.bat ile sayfanin yapisini inceleyin)');
    }
    for (const it of all) it.source ||= feed.name;

    // Yalniz son newsMaxAgeHours saatin haberleri. Hic tarihi okunamayan kaynakta suzulemez, oldugu gibi kalir.
    const maxAge = (config.newsMaxAgeHours || 0) * 3600000;
    const undated = all.every((i) => !i.ts);
    const now = Date.now();
    const items = !maxAge || undated ? all : all.filter((i) => i.ts && now - i.ts <= maxAge);
    const detail = !maxAge ? '' : undated ? ' (tarih okunamadı, süzülmedi)' : `, son ${config.newsMaxAgeHours} saatte ${items.length}`;
    note(key, 'ok', `✓ ${key}: ${all.length} haber (${via})${detail}`);
    return items.sort((a, b) => b.ts - a.ts).slice(0, config.newsPerSource);
  } catch (err) {
    note(key, err.message, `✗ ${key}: ${err.message} (${feed.url})`);
    return [];
  }
}

export const getNews = cached(config.newsRefreshMinutes * 60000, async () => {
  // Tum kaynaklar ayni anda indirilir; ayni adres birden cok pakette varsa bir kez.
  const downloads = new Map();
  for (const bundle of config.newsBundles) {
    for (const feed of bundle.feeds || []) {
      if (!downloads.has(feed.url)) downloads.set(feed.url, fetchFeed(bundle.name, feed));
    }
  }
  const categories = [];
  let rss = 0;
  for (const bundle of config.newsBundles) {
    if (bundle.type === 'matches') continue; // eski surumden kalan satir: maclar artik ayri bir kart
    const base = { name: bundle.name, enabled: bundle.enabled !== false };
    rss++;
    const lists = await Promise.all((bundle.feeds || []).map((feed) => downloads.get(feed.url)));
    const seen = new Set();
    const items = lists
      .flat()
      .sort((a, b) => b.ts - a.ts)
      .filter((it) => {
        const k = it.title.toLowerCase();
        return seen.has(k) ? false : seen.add(k);
      })
      .slice(0, config.itemsPerCategory);
    categories.push({ ...base, items });
  }
  if (rss && categories.every((c) => !c.items.length)) {
    throw new Error('hicbir haber kaynagina ulasilamadi');
  }
  return { updated: new Date().toISOString(), categories };
});
