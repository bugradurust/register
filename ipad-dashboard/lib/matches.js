// Takip edilen takimlarin (varsayilan: Galatasaray, Fenerbahce, Besiktas) bu haftaki maclari.
// Veri: ESPN'in herkese acik skor servisi (anahtar gerekmez).
import { config } from './config.js';
import { cached, fetchJson, stateLogger } from './util.js';

const note = stateLogger();
const DAY = 86400000;

// "Fenerbahçe", "Fenerbahce", "BEŞİKTAŞ" hepsi ayni anahtara iner.
const norm = (s) =>
  String(s ?? '')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

// Pazartesi 00:00 - sonraki pazartesi 00:00 (PC'nin yerel saatiyle).
function currentWeek() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const next = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
  return { from: monday, to: next };
}

function parseEvent(ev, league, teams) {
  const comp = ev.competitions?.[0];
  const home = comp?.competitors?.find((c) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c) => c.homeAway === 'away');
  if (!home || !away) return null;
  const mine = (c) => {
    const names = [c.team?.displayName, c.team?.shortDisplayName, c.team?.name].map(norm);
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
  const score = (c) => (c.score === undefined || c.score === '' ? null : Number(c.score));
  return {
    id: ev.id,
    ts: Date.parse(ev.date),
    league: league.name,
    home: homeMine ?? home.team?.displayName ?? '?',
    away: awayMine ?? away.team?.displayName ?? '?',
    homeTracked: !!homeMine,
    awayTracked: !!awayMine,
    state,
    minute,
    note: noteText,
    homeScore: score(home),
    awayScore: score(away)
  };
}

async function loadLeague(league, week, teams) {
  const from = new Date(week.from.getTime() - DAY);
  const to = new Date(week.to.getTime() + DAY);
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.id}/scoreboard?dates=${ymd(from)}-${ymd(to)}&limit=300`;
  try {
    const data = await fetchJson(url);
    note(league.id, 'ok', `✓ Maçlar · ${league.name}: kaynak çalışıyor`);
    return (data.events || []).map((ev) => parseEvent(ev, league, teams)).filter(Boolean);
  } catch (err) {
    note(league.id, err.message, `✗ Maçlar · ${league.name} (${league.id}): ${err.message}`);
    return null;
  }
}

// Mac varsa ve baslamaya yakinsa sik, yoksa seyrek yenile.
function refreshMs(value) {
  const { liveRefreshMinutes, idleRefreshMinutes } = config.matches;
  const now = Date.now();
  const live = value.matches.some((m) => m.state === 'in' || (m.state === 'pre' && m.ts <= now && now - m.ts < 3 * 3600000));
  if (live) return liveRefreshMinutes * 60000;
  const nextKick = Math.min(...value.matches.filter((m) => m.state === 'pre' && m.ts > now).map((m) => m.ts));
  const untilKick = Number.isFinite(nextKick) ? nextKick - now - 60000 : Infinity;
  return Math.max(liveRefreshMinutes * 60000, Math.min(idleRefreshMinutes * 60000, untilKick));
}

export const getMatches = cached(refreshMs, async () => {
  const cfg = config.matches;
  const teams = cfg.teams.map((name) => ({ name, key: norm(name) }));
  const week = currentWeek();
  const lists = (await Promise.all(cfg.leagues.map((l) => loadLeague(l, week, teams)))).filter(Boolean);
  if (!lists.length) throw new Error('hicbir lig kaynagina ulasilamadi');
  const byId = new Map();
  for (const m of lists.flat()) {
    if (m.ts >= week.from.getTime() && m.ts < week.to.getTime()) byId.set(m.id, m);
  }
  const matches = [...byId.values()].sort((a, b) => a.ts - b.ts);
  const summary = `${matches.length} maç (${ymd(week.from)} haftası)`;
  note('matches', summary, `✓ Maçlar: ${summary}`);
  return { updated: new Date().toISOString(), weekStart: ymd(week.from), matches };
});
