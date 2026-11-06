// Fenerbahce Beko'nun (varsayilan) basketbol maclari, bu hafta.
// Veri: EuroLeague'in resmi, herkese acik API'si (anahtar gerekmez). Gercek yanit biciminde dogrulandi.
// Turkiye Basketbol Super Ligi icin anahtarsiz, herkese acik bir kaynak bulunamadigindan su an yalniz EuroLeague gosterilir.
import { config } from './config.js';
import { cached, fetchJson, stateLogger } from './util.js';
import { refreshMs, weekRange, ymd } from './matches.js';

const note = stateLogger();
const API = 'https://api-live.euroleague.net/v2/competitions/E/seasons';
const LIVE_WINDOW_MS = 3 * 3600000; // baslamis ama "played" olmamis mac bu sure canli sayilir

// EuroLeague sezonu Temmuz'da baslar: Kasim 2026 -> E2026, Mart 2027 -> yine E2026.
const seasonCode = (d) => `E${d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1}`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

function parseGame(g) {
  const ts = Date.parse(g.utcDate);
  const home = g.local?.club;
  const away = g.road?.club;
  if (!Number.isFinite(ts) || !home || !away) return null;
  const code = config.basketball.euroleagueTeamCode;
  const homeMine = home.code === code;
  const awayMine = away.code === code;
  if (!homeMine && !awayMine) return null;

  let state = g.played ? 'post' : 'pre';
  let noteText = '';
  const status = String(g.gameStatus || '');
  if (!g.played && /postpone|cancel|suspend/i.test(status)) {
    state = 'off';
    noteText = /postpone/i.test(status) ? 'Ertelendi' : 'İptal / durduruldu';
  } else if (!g.played && Date.now() >= ts && Date.now() - ts < LIVE_WINDOW_MS) {
    state = 'in'; // API canli durum vermez; baslama saatinden itibaren oynaniyor sayilir
  }
  let hs = num(g.local?.score);
  let as = num(g.road?.score);
  if (state === 'pre' || (state === 'in' && !hs && !as)) hs = as = null; // henuz skor yok
  const label = config.basketball.teamName;
  return {
    id: `e${g.identifier || g.id}`,
    ts,
    league: 'EuroLeague',
    home: homeMine ? label : home.abbreviatedName || home.name,
    away: awayMine ? label : away.abbreviatedName || away.name,
    homeTracked: homeMine,
    awayTracked: awayMine,
    state,
    minute: '',
    note: noteText,
    homeScore: hs,
    awayScore: as
  };
}

export const getBasketball = cached(refreshMs, async () => {
  const week = weekRange();
  const code = config.basketball.euroleagueTeamCode;
  let data;
  try {
    data = await fetchJson(`${API}/${seasonCode(new Date())}/games?teamCode=${encodeURIComponent(code)}`);
  } catch (err) {
    note('bb:err', err.message, `✗ Basketbol (EuroLeague): ${err.message}`);
    throw new Error(`EuroLeague verisine ulasilamadi (${err.message})`);
  }
  const games = Array.isArray(data.data) ? data.data : [];
  const matches = games
    .map(parseGame)
    .filter((m) => m && m.ts >= week.from.getTime() && m.ts < week.to.getTime())
    .sort((a, b) => a.ts - b.ts);
  const summary = `${matches.length} maç (${games.length} maç tarandı)`;
  note('bb:summary', summary, `${matches.length ? '✓' : 'ℹ'} Basketbol (EuroLeague): ${summary}${matches.length ? '' : ', bu hafta Fenerbahçe EuroLeague maçı görünmüyor'}`);
  return {
    updated: new Date().toISOString(),
    weekStart: ymd(week.from),
    matches,
    partial: false,
    debug: { provider: 'euroleague', season: seasonCode(new Date()), scanned: games.length }
  };
});
