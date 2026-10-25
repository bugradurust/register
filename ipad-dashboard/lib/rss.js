// RSS/Atom ayristirma ve metin temizleme (news.js ve pagefeed.js ortak kullanir).
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

// HTML'i duz metne cevirir (etiketleri atar, karakter kodlarini cozer).
export function clean(s) {
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ');
  return decodeEntities(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function tagText(block, name) {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? clean(m[1]) : '';
}

// Popup'ta gosterilecek ozet icin uzunluk siniri; cumle ya da kelime sinirinda keser.
export function shorten(text, max = 1200) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '));
  return `${cut.slice(0, at > max * 0.6 ? at : max).trim()}…`;
}

// Yalniz http(s) adresleri kabul edilir (javascript: gibi sahte baglantilar elenir).
export function safeUrl(u, base) {
  try {
    const url = new URL(String(u).trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Ozet basligin tekrari ise ya da basligla basliyorsa temizler.
export function tidySummary(summary, title) {
  if (!summary) return '';
  let s = summary.trim();
  const t = title.trim();
  if (norm(s) === norm(t)) return '';
  if (s.toLowerCase().startsWith(t.toLowerCase())) s = s.slice(t.length).replace(/^[\s:–—\-.]+/, '');
  return s.length >= 20 ? shorten(s) : '';
}

export function parseFeed(xml, source, base) {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  const now = Date.now();
  const items = [];
  for (const block of blocks) {
    const title = tagText(block, 'title');
    if (!title) continue;
    const date = tagText(block, 'pubDate') || tagText(block, 'dc:date') || tagText(block, 'published') || tagText(block, 'updated');
    const ts = Date.parse(date);
    const href = /<link\b[^>]*\bhref=["']([^"']+)["']/i.exec(block)?.[1];
    const link = safeUrl(tagText(block, 'link') || href || tagText(block, 'guid'), base);
    const body = tagText(block, 'content:encoded') || tagText(block, 'description') || tagText(block, 'summary') || tagText(block, 'content');
    items.push({
      title,
      source,
      ts: Number.isFinite(ts) ? Math.min(ts, now) : 0,
      summary: tidySummary(body, title),
      link
    });
  }
  return items;
}
