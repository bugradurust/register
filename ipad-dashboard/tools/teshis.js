// Bir haber sayfasinin (varsayilan: bundle.app/tr/gundem) icinden neyin okunabildigini raporlar.
// Kullanim: teshis.bat [adres]   -> rapor teshis-raporu.txt, sayfa teshis-sayfa.html dosyasina da yazilir.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSER_UA } from '../lib/util.js';
import { clean } from '../lib/rss.js';
import { fromAnchors, fromJson, jsonBlocks, normalizeItems, rssLinks } from '../lib/pagefeed.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv[2] || 'https://www.bundle.app/tr/gundem';
const lines = [];
const say = (s = '') => {
  console.log(s);
  lines.push(s);
};

async function finish(html) {
  if (html) await fs.writeFile(path.join(ROOT, 'teshis-sayfa.html'), html.slice(0, 600000));
  await fs.writeFile(path.join(ROOT, 'teshis-raporu.txt'), lines.join('\n') + '\n');
  console.log('\nRapor: teshis-raporu.txt (sayfanin kendisi: teshis-sayfa.html)');
}

const preview = (items) => {
  for (const i of items.slice(0, 8)) {
    const age = i.ts ? `${Math.round((Date.now() - i.ts) / 60000)} dk once` : 'tarih yok';
    say(`   - ${i.title.slice(0, 90)} | ${i.source || 'kaynak yok'} | ${age} | ozet: ${i.summary ? i.summary.length + ' krk' : 'yok'} | baglanti: ${i.link ? 'var' : 'yok'}`);
  }
};

say(`Sayfa: ${url}`);
say(`Zaman: ${new Date().toLocaleString('tr-TR')}  |  Node ${process.version}`);
let res;
let html = '';
try {
  res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
    headers: { 'user-agent': BROWSER_UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'accept-language': 'tr-TR,tr;q=0.9' }
  });
  html = await res.text();
} catch (err) {
  say(`Sayfaya ulasilamadi: ${err.message}`);
  await finish('');
  process.exit(1);
}

say(`HTTP ${res.status} ${res.statusText} | tur: ${res.headers.get('content-type')} | boyut: ${html.length} karakter`);
say(`Son adres: ${res.url}`);
say(`<title>: ${clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '(yok)')}`);
if (!res.ok || /captcha|cf-challenge|attention required|are you human/i.test(html.slice(0, 5000))) {
  say('UYARI: sayfa normal acilmamis; bot korumasi ya da hata sayfasi olabilir.');
}

const rss = rssLinks(html, url);
say(`\nRSS baglantisi: ${rss.length ? rss.join(', ') : 'yok'}`);

const blocks = jsonBlocks(html);
say(`Gomulu JSON bloklari: ${blocks.length}${html.includes('__NEXT_DATA__') ? ' (Next.js: __NEXT_DATA__ var)' : ''}`);
const jsonItems = normalizeItems(fromJson(html), url);
say(`  JSON'dan cikarilan haber: ${jsonItems.length}`);
preview(jsonItems);

const anchorItems = normalizeItems(fromAnchors(html), url);
say(`Baslik baglantilarindan cikarilan haber: ${anchorItems.length}`);
preview(anchorItems);

say(`\n<time> etiketi: ${(html.match(/<time\b/gi) || []).length}  |  <article> etiketi: ${(html.match(/<article\b/gi) || []).length}  |  <h2>/<h3>: ${(html.match(/<h[23]\b/gi) || []).length}`);
const api = [...new Set(html.match(/https?:\/\/[^"'\s\\<>)]*(api|graphql|feed|news|haber)[^"'\s\\<>)]*/gi) || [])].slice(0, 15);
say(`Sayfadaki olasi veri adresleri: ${api.length ? '\n   ' + api.join('\n   ') : 'yok'}`);

const chosen = rss.length ? 'RSS baglantisi' : jsonItems.length >= 3 ? 'sayfadaki JSON' : anchorItems.length >= 5 ? 'baslik baglantilari' : 'HICBIRI';
say(`\nSunucunun kullanacagi yontem: ${chosen}`);
if (chosen === 'HICBIRI') say('Sayfa haberleri sonradan JavaScript ile yukluyor olabilir. teshis-raporu.txt dosyasini gonderin.');
await finish(html);
