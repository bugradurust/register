// Fenerbahce Beko'nun (varsayilan) basketbol maclari: Basketbol Super Ligi ve EuroLeague, bu hafta.
// Veri: SofaScore'un herkese acik gunluk mac listesi; olmazsa TheSportsDB. Anahtar gerekmez.
// Futbolla ayni sekilde gun gun sorgulanir ve gun gun onbellege alinir.
import { config } from './config.js';
import { BROWSER_UA, cached, fetchJson, stateLogger } from './util.js';
import { addDays, norm, pool, refreshMs, ttlFor, weekRange, ymd } from './matches.js';

const note = stateLogger();
const DOWN_MS = 10 * 60000; // tamamen cevap vermeyen kaynak bu sure atlanir
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Turnuva adi istenen ligle eslesirse gosterilecek lig adini, yoksa null dondurur.
function competitionOf(name) {
  const cfg = config.basketball;
  const n = norm(name);
  if (!n || cfg.exclude.some((x) => n.includes(norm(x)))) return null;
  const hit = cfg.competitions.find((c) => c.match.some((m) => n.includes(norm(m))));
  return hit ? hit.name : null;
}

const isTeam = (name) => norm(name).includes(norm(config.basketball.team));

function periodText(desc) {
  const d = String(desc || '');
  const q = /(\d)(?:st|nd|rd|th)?\s*(?:quarter|period)|\bq(\d)\b/i.exec(d);
  if (/half/i.test(d)) return 'Devre arası';
  if (/overtime|\bot\b/i.test(d)) return 'Uzatma';
  if (q) return `${q[1] || q[2]}. periyot`;
  return '';
}

function build(id, ts, league, home, away, state, minute, noteText, hs, as) {
  const mineHome = isTeam(home);
  const mineAway = isTeam(away);
  if (!mineHome && !mineAway) return null;
  const label = config.basketball.teamName;
  return {
    id,
    ts,
    league,
    home: mineHome ? label : home,
    away: mineAway ? label : away,
    homeTracked: mineHome,
    awayTracked: mineAway,
    state,
    minute,
    note: noteText,
    homeScore: hs,
    awayScore: as
  };
}

const num = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// ---- SofaScore -------------------------------------------------------------------
const SOFA_HEADERS = { 'user-agent': BROWSER_UA, accept: 'application/json', referer: 'https://www.sofascore.com/', origin: 'https://www.sofascore.com' };

function parseSofa(ev) {
  const home = ev.homeTeam?.name;
  const away = ev.awayTeam?.name;
  if (!home || !away || !Number.isFinite(ev.startTimestamp)) return null;
  const league = competitionOf([ev.tournament?.uniqueTournament?.name, ev.tournament?.name, ev.season?.name].filter(Boolean).join(' | '));
  if (!league) return null;
  const type = ev.status?.type;
  let state = type === 'inprogress' ? 'in' : type === 'finished' ? 'post' : 'pre';
  let noteText = '';
  if (/cancel|postpone|suspend|abandon|interrupt/i.test(`${type} ${ev.status?.description}`)) {
    state = 'off';
    noteText = /postpone/i.test(`${type} ${ev.status?.description}`) ? 'Ertelendi' : 'İptal / durduruldu';
  }
  return build(
    `s${ev.id}`, ev.startTimestamp * 1000, league, home, away, state,
    state === 'in' ? periodText(ev.status?.description) : '', noteText,
    num(ev.homeScore?.current ?? ev.homeScore?.display), num(ev.awayScore?.current ?? ev.awayScore?.display)
  );
}

async function sofaDay(day) {
  const d = await fetchJson(`https://api.sofascore.com/api/v1/sport/basketball/scheduled-events/${isoDay(day)}`, { headers: SOFA_HEADERS });
  return (d.events || []).map(parseSofa).filter(Boolean);
}

// ---- TheSportsDB (yedek; canli skor vermez) ---------------------------------------
function parseTsdb(ev) {
  const league = competitionOf(ev.strLeague);
  if (!league || !ev.strHomeTeam || !ev.strAwayTeam) return null;
  const stamp = ev.strTimestamp || (ev.dateEvent && `${ev.dateEvent}T${ev.strTime || '00:00:00'}`);
  const ts = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(stamp || '') ? stamp : `${stamp}Z`);
  if (!Number.isFinite(ts)) return null;
  const status = String(ev.strStatus || '');
  const hs = num(ev.intHomeScore);
  const as = num(ev.intAwayScore);
  let state = 'pre';
  let noteText = '';
  if (/finish|^ft$|final|after/i.test(status)) state = 'post';
  else if (/postpone|cancel|abandon/i.test(status)) {
    state = 'off';
    noteText = /postpone/i.test(status) ? 'Ertelendi' : 'İptal / durduruldu';
  } else if (hs !== null && as !== null && Date.now() - ts < 3 * 3600000 && Date.now() > ts) state = 'in';
  return build(`t${ev.idEvent}`, ts, league, ev.strHomeTeam, ev.strAwayTeam, state, '', noteText, hs, as);
}

async function tsdbDay(day) {
  const d = await fetchJson(`https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${isoDay(day)}&s=Basketball`);
  return (d.events || []).map(parseTsdb).filter(Boolean);
}

const PROVIDERS = { sofascore: sofaDay, thesportsdb: tsdbDay };
const days = new Map(); // "sofascore:2026-11-05" -> { expires, matches }
const downUntil = new Map(); // kaynak -> yeniden denenecegi zaman
const lastWhy = new Map(); // kaynak -> son hata nedeni

export const getBasketball = cached(refreshMs, async () => {
  const week = weekRange();
  const now = Date.now();
  const nDays = Math.round((week.to - week.from) / 86400000);
  const dayList = [];
  for (let i = -1; i <= nDays; i++) dayList.push(addDays(week.from, i));
  const errors = []; // "kaynak: ileti" (tekrarsiz)
  const problems = new Map(); // kaynak -> iletiler

  for (const name of config.basketball.providers) {
    const fetchDay = PROVIDERS[name];
    if (!fetchDay) continue;
    if ((downUntil.get(name) || 0) > now) {
      errors.push(`${name}: ${lastWhy.get(name) || 'son denemede cevap vermedi'}`);
      continue;
    }
    const jobs = [];
    for (const day of dayList) {
      const entry = days.get(`${name}:${isoDay(day)}`);
      if (!entry || now >= entry.expires) jobs.push(day);
    }
    const results = await pool(jobs, 4, async (day) => {
      try {
        const matches = await fetchDay(day);
        const entry = { matches };
        entry.expires = Date.now() + ttlFor(entry, day);
        days.set(`${name}:${isoDay(day)}`, entry);
        return true;
      } catch (err) {
        if (!problems.has(name)) problems.set(name, new Set());
        problems.get(name).add(err.message);
        return false;
      }
    });
    const have = dayList.filter((day) => days.has(`${name}:${isoDay(day)}`));
    if (!have.length) {
      downUntil.set(name, Date.now() + DOWN_MS);
      const why = [...(problems.get(name) || ['cevap yok'])].join(', ');
      lastWhy.set(name, why);
      errors.push(`${name}: ${why}`);
      note(`bb:${name}`, why, `✗ Basketbol · ${name}: ${why}`);
      continue;
    }
    downUntil.delete(name);

    const byId = new Map();
    for (const day of have) {
      for (const m of days.get(`${name}:${isoDay(day)}`).matches) {
        if (m.ts >= week.from.getTime() && m.ts < week.to.getTime()) byId.set(m.id, m);
      }
    }
    const matches = [...byId.values()].sort((a, b) => a.ts - b.ts);
    note('bb:summary', `${name}:${matches.length}`, `${matches.length ? '✓' : 'ℹ'} Basketbol (${name}): ${matches.length} maç${matches.length ? '' : ', bu hafta Fenerbahçe maçı görünmüyor'}`);
    const keep = new Set(dayList.map((d) => `${name}:${isoDay(d)}`));
    for (const key of days.keys()) if (key.startsWith(`${name}:`) && !keep.has(key)) days.delete(key); // eski haftalar
    return {
      updated: new Date().toISOString(),
      weekStart: ymd(week.from),
      matches,
      partial: results.some((r) => r === false),
      debug: { provider: name, errors: [...problems].map(([k, v]) => `${k}: ${[...v].join(', ')}`) }
    };
  }
  throw new Error(`hicbir basketbol kaynagina ulasilamadi (${errors.join('; ')})`);
});
