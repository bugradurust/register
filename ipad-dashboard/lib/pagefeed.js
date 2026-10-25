// RSS'i olmayan bir haber sayfasindan (ornegin bundle.app) baslik, ozet ve zaman cikarir.
// Siteye ozel kod yoktur; sirayla genel yontemler denenir:
//   1) sayfadaki RSS/Atom baglantisi  2) sayfaya gomulu JSON (__NEXT_DATA__, ld+json ...)  3) baslik baglantilari
// Sayfa duzeni degisirse ya da JS ile sonradan yukleniyorsa bu yontemler bos donebilir;
// o durumda `teshis.bat` sayfanin gercekte ne icerdigini raporlar.
import { clean, parseFeed, safeUrl, shorten, tidySummary } from './rss.js';

const TITLE_KEYS = ['title', 'headline', 'baslik', 'heading'];
const DATE_KEYS = [
  'publishedAt', 'published_at', 'publishDate', 'publish_date', 'datePublished', 'pubDate',
  'publishedDate', 'date', 'createdAt', 'created_at', 'created', 'time', 'timestamp', 'updatedAt', 'updated_at'
];
const SOURCE_KEYS = ['source', 'sourceName', 'source_name', 'publisher', 'publisherName', 'site', 'siteName', 'provider', 'channel', 'channelName', 'brand'];
const SUMMARY_KEYS = ['summary', 'description', 'spot', 'excerpt', 'abstract', 'desc', 'shortDescription', 'lead', 'content', 'body', 'text'];
const LINK_KEYS = ['url', 'link', 'href', 'permalink', 'canonicalUrl', 'shareUrl', 'sourceUrl', 'source_url'];

const words = (s) => s.trim().split(/\s+/).length;
export const goodTitle = (s) => typeof s === 'string' && s.length >= 15 && s.length <= 260 && words(s) >= 3;

function toTs(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e11 ? v * 1000 : v; // saniye ya da milisaniye
  if (typeof v === 'string' && v.trim()) {
    if (/^\d{10,13}$/.test(v.trim())) return toTs(Number(v.trim()));
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : NaN;
  }
  return NaN;
}

const UNITS = { sn: 1000, saniye: 1000, dk: 60000, dakika: 60000, sa: 3600000, saat: 3600000, g: 86400000, gün: 86400000, gun: 86400000 };
// "5 dk", "2 sa önce" gibi goreli sureleri zamana cevirir.
function relativeTs(text) {
  const m = /(\d+)\s*(saniye|sn|dakika|dk|saat|sa|gün|gun|g)\b/i.exec(text);
  return m ? Date.now() - Number(m[1]) * UNITS[m[2].toLowerCase()] : NaN;
}

const firstString = (o, keys, ok = () => true) => {
  for (const k of keys) if (typeof o[k] === 'string' && ok(o[k])) return o[k];
  return null;
};
function nameOf(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return v.name || v.title || v.displayName || v.label || null;
  return null;
}

function walk(node, out, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 14) return;
  if (Array.isArray(node)) {
    for (const x of node) walk(x, out, depth + 1);
    return;
  }
  const title = firstString(node, TITLE_KEYS, goodTitle) || (node['@type'] === 'ListItem' ? firstString(node, ['name'], goodTitle) : null);
  if (title) {
    let ts = NaN;
    for (const k of DATE_KEYS) {
      ts = toTs(node[k]);
      if (Number.isFinite(ts)) break;
    }
    let source = null;
    for (const k of SOURCE_KEYS) {
      const n = nameOf(node[k]);
      if (typeof n === 'string' && n.length > 0 && n.length < 60) {
        source = n;
        break;
      }
    }
    out.push({
      title,
      ts,
      source,
      summary: firstString(node, SUMMARY_KEYS, (s) => s.length >= 40),
      link: firstString(node, LINK_KEYS, (s) => /^(https?:)?\/\//i.test(s) || s.startsWith('/'))
    });
  }
  for (const k of Object.keys(node)) walk(node[k], out, depth + 1);
}

// <script type="application/json">, __NEXT_DATA__ ve ld+json bloklari.
export function jsonBlocks(html) {
  const blocks = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/application\/(ld\+)?json|__NEXT_DATA__|__NUXT/i.test(m[1])) continue;
    try {
      blocks.push(JSON.parse(m[2].trim()));
    } catch {
      // bozuk blok: atla
    }
  }
  return blocks;
}

export function fromJson(html) {
  const out = [];
  for (const block of jsonBlocks(html)) walk(block, out);
  return out;
}

export function fromAnchors(html) {
  const out = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = /\bhref=["']([^"']+)["']/i.exec(m[1])?.[1];
    if (!href || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href)) continue;
    const inner = m[2];
    const heading = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i.exec(inner)?.[1];
    const text = clean(heading ?? inner);
    if (!goodTitle(text)) continue;
    const dt = /<time\b[^>]*datetime=["']([^"']+)["']/i.exec(inner)?.[1];
    let ts = dt ? toTs(dt) : NaN;
    if (!Number.isFinite(ts)) ts = relativeTs(clean(inner));
    out.push({ title: text, ts, source: null, summary: null, link: href });
  }
  return out;
}

export function rssLinks(html, baseUrl) {
  const links = [];
  for (const m of html.matchAll(/<link\b([^>]*)>/gi)) {
    if (!/type=["']application\/(rss|atom)\+xml["']/i.test(m[1])) continue;
    const href = /\bhref=["']([^"']+)["']/i.exec(m[1])?.[1];
    const url = href && safeUrl(href, baseUrl);
    if (url) links.push(url);
  }
  return links;
}

// Ham ogeleri temizler: tarihli olanlari tercih eder, tekrarlari atar, ozet ve baglantiyi duzenler.
export function normalizeItems(raw, baseUrl) {
  const now = Date.now();
  const dated = raw.filter((i) => Number.isFinite(i.ts));
  const use = dated.length >= 3 ? dated : raw;
  const seen = new Set();
  const items = [];
  for (const i of use) {
    const title = clean(i.title);
    const key = title.toLowerCase();
    if (!goodTitle(title) || seen.has(key)) continue;
    seen.add(key);
    items.push({
      title,
      source: i.source ? clean(i.source) : '',
      ts: Number.isFinite(i.ts) ? Math.min(i.ts, now) : 0,
      summary: i.summary ? tidySummary(clean(i.summary), title) : '',
      link: i.link ? safeUrl(i.link, baseUrl) : ''
    });
  }
  return items;
}

export async function extractItems(html, pageUrl, fetchOther) {
  for (const href of rssLinks(html, pageUrl)) {
    try {
      const items = parseFeed(await fetchOther(href), '', href);
      if (items.length >= 3) return { items, via: 'RSS bağlantısı' };
    } catch {
      // siradaki yontem
    }
  }
  const fromBlocks = normalizeItems(fromJson(html), pageUrl);
  if (fromBlocks.length >= 3) return { items: fromBlocks, via: 'sayfadaki JSON' };
  const fromLinks = normalizeItems(fromAnchors(html), pageUrl);
  if (fromLinks.length >= 5) return { items: fromLinks, via: 'başlık bağlantıları' };
  return { items: [], via: '' };
}

export { shorten };
