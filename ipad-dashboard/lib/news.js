// Haberler: her kategori (paket) birden cok RSS kaynagini birlestirir.
import { config } from './config.js';
import { cached, fetchText, stateLogger } from './util.js';

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

export function parseFeed(xml, source) {
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

const note = stateLogger();

async function fetchFeed(bundle, feed) {
  const key = `${bundle} · ${feed.name}`;
  try {
    const items = parseFeed(await fetchText(feed.url), feed.name);
    if (!items.length) throw new Error('haber bulunamadi');
    note(key, 'ok', `✓ ${key}: ${items.length} haber`);
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
    const base = { name: bundle.name, enabled: bundle.enabled !== false };
    if (bundle.type === 'matches') {
      categories.push({ ...base, type: 'matches', items: [] });
      continue;
    }
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
  if (rss && categories.every((c) => c.type === 'matches' || !c.items.length)) {
    throw new Error('hicbir haber kaynagina ulasilamadi');
  }
  return { updated: new Date().toISOString(), categories };
});
