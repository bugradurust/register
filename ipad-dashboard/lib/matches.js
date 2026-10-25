// Takip edilen takimlarin (varsayilan: Galatasaray, Fenerbahce, Besiktas) bu haftaki maclari.
// Veri: ESPN'in herkese acik skor servisi (anahtar gerekmez).
//
// ESPN tarih araligini (dates=A-B) kaldirdi, 400 donuyor; yalniz tek gun (dates=YYYYMMDD) calisiyor.
// Bu yuzden her lig icin hafta gun gun sorgulanir. Sonuclar gun gun onbellege alinir: biten gunler
// uzun, mac gunu kisa sure tutulur; sik yenilemede yalniz o gunun istegi tekrarlanir.
// Hafta her yenilemede bugunun tarihinden yeniden hesaplanir, yani pazartesi 00:00'dan sonra
// pano kendiliginden yeni haftanin maclarina gecer.
import { config } from './config.js';
import { cached, fetchJson, stateLogger } from './util.js';

const note = stateLogger();
const DAY = 86400000;
const DEAD_MS = 6 * 3600000; // 400/404 veren lig bu sure atlanir (yanlis kod ya da servis degisikligi)
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

// "Fenerbahçe", "Fenerbahce", "BEŞİKTAŞ" hepsi ayni anahtara iner.
const norm = (s) =>
  String(s ?? '')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const mondayOf = (d) => {
  const monday = addDays(d, -((d.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
};

// Bu haftanin pazartesi 00:00'i ile (weeksAhead kadar sonraki hafta dahil) bitisi, PC'nin yerel saatiyle.
function weekRange() {
  const monday = mondayOf(new Date());
  return { from: monday, to: addDays(monday, 7 * (1 + (config.matches.weeksAhead || 0))) };
}

// undefined: mac okunamadi (beklenmedik bicim), null: takip edilen takimlardan degil, nesne: mac.
function parseEvent(ev, league, teams) {
  const comp = ev.competitions?.[0];
  const comps = comp?.competitors || [];
  let home = comps.find((c) => c.homeAway === 'home');
  let away = comps.find((c) => c.homeAway === 'away');
  if ((!home || !away) && comps.length === 2) [home, away] = [...comps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!home || !away || !Number.isFinite(Date.parse(ev.date))) return undefined;

  const nameOf = (c) => c.team?.displayName || c.team?.shortDisplayName || c.team?.name || c.team?.location || '?';
  const mine = (c) => {
    const names = [c.team?.displayName, c.team?.shortDisplayName, c.team?.name, c.team?.location].map(norm);
    return teams.find((t) => names.some((n) => n.includes(t.key)))?.name ?? null;
  };
  const homeMine = mine(home);
  const awayMine = mine(away);
  if (!homeMine && !awayMine) return null;

  const status = ev.status || comp.status || {};
  const type = status.type || {};
  let state = type.state === 'in' || type.state === 'post' ? type.state : 'pre';
  let minute = '';
  let noteText = '';
  if (/POSTPONED|CANCEL|SUSPEND|ABANDON/i.test(type.name || '')) {
    state = 'off';
    noteText = /POSTPONED/i.test(type.name) ? 'Ertelendi' : 'İptal / durduruldu';
  } else if (state === 'in') {
    minute = /HALF/i.test(type.name || '') && !/FIRST|SECOND/i.test(type.name) ? 'Devre arası' : status.displayClock || '';
  }
  const score = (c) => (c.score === undefined || c.score === null || c.score === '' ? null : Number(c.score));
  return {
    id: `${league.id}:${ev.id}`,
    ts: Date.parse(ev.date),
    league: league.name,
    home: homeMine ?? nameOf(home),
    away: awayMine ?? nameOf(away),
    homeTracked: !!homeMine,
    awayTracked: !!awayMine,
    state,
    minute,
    note: noteText,
    homeScore: score(home),
    awayScore: score(away)
  };
}

// ---- gun gun onbellek ---------------------------------------------------------------
const days = new Map(); // "tur.1:20261025" -> { expires, total, unparsed, matches }
const dead = new Map(); // lig kodu -> atlama baslangici
const leagueStatus = new Map(); // lig kodu -> 'ok' | hata iletisi

// Bir gunluk sonucun ne kadar sure taze sayilacagi.
function ttlFor(entry, day) {
  const { liveRefreshMinutes, idleRefreshMinutes } = config.matches;
  const live = liveRefreshMinutes * 60000;
  const idle = idleRefreshMinutes * 60000;
  const now = Date.now();
  const ms = entry.matches;
  if (ms.some((m) => m.state === 'in' || (m.state === 'pre' && m.ts <= now && now - m.ts < 3 * 3600000))) return live;
  const next = Math.min(...ms.filter((m) => m.state === 'pre' && m.ts > now).map((m) => m.ts));
  if (Number.isFinite(next)) return Math.max(live, Math.min(idle, next - now - 60000));
  return addDays(day, 1).getTime() <= now ? 6 * 3600000 : idle; // gecmis gun degismez
}

async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    })
  );
  return out;
}

// true: yuklendi, false: gecici hata (sonra yeniden denenir), 'skip': lig atlaniyor
async function loadDay({ league, day, key }, teams) {
  if (dead.has(league.id) && Date.now() - dead.get(league.id) < DEAD_MS) return 'skip';
  try {
    const data = await fetchJson(`${BASE}/${league.id}/scoreboard?dates=${ymd(day)}`);
    const events = Array.isArray(data.events) ? data.events : [];
    const matches = [];
    let unparsed = 0;
    for (const ev of events) {
      const m = parseEvent(ev, league, teams);
      if (m === undefined) unparsed++;
      else if (m) matches.push(m);
    }
    const entry = { total: events.length, unparsed, matches };
    entry.expires = Date.now() + ttlFor(entry, day);
    days.set(key, entry);
    leagueStatus.set(league.id, 'ok');
    note(`lg:${league.id}`, 'ok', `✓ Maçlar · ${league.name}: kaynak çalışıyor`);
    return true;
  } catch (err) {
    if (/HTTP (400|404)/.test(err.message)) dead.set(league.id, Date.now());
    leagueStatus.set(league.id, err.message);
    note(`lg:${league.id}`, err.message, `✗ Maçlar · ${league.name} (${league.id}): ${err.message}`);
    return false;
  }
}

// Mac varsa ve baslamaya yakinsa sik, yoksa seyrek yenile. Eksik gun varsa 2 dakika sonra tekrar dene.
function refreshMs(value) {
  const { liveRefreshMinutes, idleRefreshMinutes } = config.matches;
  const now = Date.now();
  const live = value.matches.some((m) => m.state === 'in' || (m.state === 'pre' && m.ts <= now && now - m.ts < 3 * 3600000));
  let ms = liveRefreshMinutes * 60000;
  if (!live) {
    const nextKick = Math.min(...value.matches.filter((m) => m.state === 'pre' && m.ts > now).map((m) => m.ts));
    const untilKick = Number.isFinite(nextKick) ? nextKick - now - 60000 : Infinity;
    ms = Math.max(ms, Math.min(idleRefreshMinutes * 60000, untilKick));
  }
  // Hafta degisince (pazartesi 00:00) beklemeden yeni haftaya gec.
  ms = Math.min(ms, addDays(mondayOf(new Date()), 7).getTime() - now + 5000);
  return value.partial ? Math.min(ms, 120000) : ms;
}

export const getMatches = cached(refreshMs, async () => {
  const cfg = config.matches;
  const teams = cfg.teams.map((name) => ({ name, key: norm(name) }));
  const week = weekRange();
  const now = Date.now();

  // Haftanin bir gun oncesi ve sonrasi da taranir: ESPN gunleri farkli saat dilimine gore sayabilir.
  const nDays = Math.round((week.to - week.from) / DAY);
  const dayList = [];
  for (let i = -1; i <= nDays; i++) dayList.push(addDays(week.from, i));

  const jobs = [];
  const used = new Set();
  for (const league of cfg.leagues) {
    for (const day of dayList) {
      const key = `${league.id}:${ymd(day)}`;
      used.add(key);
      const entry = days.get(key);
      if (!entry || now >= entry.expires) jobs.push({ league, day, key });
    }
  }
  const results = await pool(jobs, 6, (job) => loadDay(job, teams));
  const failed = results.filter((r) => r === false).length;
  for (const key of days.keys()) if (!used.has(key)) days.delete(key); // eski haftalar

  const byId = new Map();
  let scanned = 0;
  let unparsed = 0;
  let working = 0;
  for (const league of cfg.leagues) {
    let any = false;
    for (const day of dayList) {
      const entry = days.get(`${league.id}:${ymd(day)}`);
      if (!entry) continue;
      any = true;
      scanned += entry.total;
      unparsed += entry.unparsed;
      for (const m of entry.matches) if (m.ts >= week.from.getTime() && m.ts < week.to.getTime()) byId.set(m.id, m);
    }
    if (any) working++;
  }
  const statuses = Object.fromEntries(leagueStatus);
  if (!working) {
    throw new Error(`hicbir lig kaynagina ulasilamadi (${Object.entries(statuses).map(([id, s]) => `${id}: ${s}`).join('; ') || 'yanit yok'})`);
  }

  const matches = [...byId.values()].sort((a, b) => a.ts - b.ts);
  const summary = `${matches.length} maç (${working}/${cfg.leagues.length} lig çalışıyor, ${scanned} maç tarandı)`;
  note('matches', summary, `${matches.length ? '✓' : 'ℹ'} Maçlar: ${summary}${matches.length ? '' : '. Bu hafta takip edilen takımların maçı görünmüyor'}`);
  if (scanned > 0 && unparsed === scanned) {
    note('shape', 'bad', '⚠ Maçlar: ESPN yanıtı beklenen biçimde değil (takımlar okunamadı), servis değişmiş olabilir');
  }
  return {
    updated: new Date().toISOString(),
    weekStart: ymd(week.from),
    matches,
    partial: failed > 0,
    debug: { leagues: statuses, scanned, unparsed }
  };
});
