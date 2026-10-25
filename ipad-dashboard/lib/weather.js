import { config } from './config.js';
import { cached, fetchJson, log } from './util.js';

// Konum onceligi: config'teki koordinat > sehir adi > "auto" (PC'nin IP adresinden bulunur).
// iPad'in GPS'i kullanilamaz: Safari konum iznini yalniz HTTPS sayfalara verir.
const hasCoords = Number.isFinite(config.latitude) && Number.isFinite(config.longitude);
const isAuto = !config.city || config.city.toLowerCase() === 'auto';
const useIp = isAuto && !hasCoords;
const IP_REFRESH_MS = 6 * 3600000;

async function geocode(name, count = 1) {
  const qs = new URLSearchParams({ name, count: String(count), language: 'tr', format: 'json' });
  const data = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${qs}`);
  return data.results || [];
}

async function lookupByIp() {
  const sources = ['https://ipwho.is/', 'https://get.geojs.io/v1/ip/geo.json', 'https://ipapi.co/json/'];
  const errors = [];
  for (const url of sources) {
    try {
      const d = await fetchJson(url);
      if (d.success === false || d.error || !d.city || d.latitude == null || d.longitude == null) {
        throw new Error('konum bilgisi yok');
      }
      const latitude = Number(d.latitude);
      const longitude = Number(d.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('gecersiz koordinat');
      return { name: d.city, latitude, longitude };
    } catch (err) {
      errors.push(`${new URL(url).hostname}: ${err.message}`);
    }
  }
  throw new Error(`IP adresinden konum bulunamadi (${errors.join('; ')}). config.json -> city alanina sehir adini yazin`);
}

// IP servisleri "Istanbul" gibi ASCII isim verir; yakindaki Turkce yazimi ("İstanbul") varsa onu kullan.
async function turkishName(found) {
  try {
    const cos = Math.cos((found.latitude * Math.PI) / 180);
    const hit = (await geocode(found.name, 5)).find(
      (r) => Math.hypot(r.latitude - found.latitude, (r.longitude - found.longitude) * cos) < 0.8
    );
    return hit ? hit.name : found.name;
  } catch {
    return found.name;
  }
}

let place = null;
let placeAt = 0;
async function resolvePlace() {
  if (place && (!useIp || Date.now() - placeAt < IP_REFRESH_MS)) return place;
  try {
    let next;
    if (hasCoords) {
      next = { name: isAuto ? '' : config.city, latitude: config.latitude, longitude: config.longitude };
    } else if (useIp) {
      const found = await lookupByIp();
      next = { ...found, name: await turkishName(found) };
    } else {
      const hit = (await geocode(config.city))[0];
      if (!hit) throw new Error(`"${config.city}" bulunamadi (config.json -> city)`);
      next = { name: hit.name, latitude: hit.latitude, longitude: hit.longitude };
    }
    if (useIp && next.name !== place?.name) {
      log(`📍 Konum IP adresinden bulundu: ${next.name} (yanlissa config.json -> city alanina sehir adini yazin)`);
    }
    place = next;
    placeAt = Date.now();
  } catch (err) {
    if (!place) throw err;
    placeAt = Date.now() - IP_REFRESH_MS + 600000; // eski konumla devam et, 10 dk sonra tekrar dene
  }
  return place;
}

export const getWeather = cached(config.weatherRefreshMinutes * 60000, async () => {
  const { name, latitude, longitude } = await resolvePlace();
  const qs = new URLSearchParams({
    latitude,
    longitude,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'auto',
    wind_speed_unit: 'kmh',
    forecast_days: '7'
  });
  const d = await fetchJson(`https://api.open-meteo.com/v1/forecast?${qs}`);
  return {
    updated: new Date().toISOString(),
    location: name,
    current: {
      temp: Math.round(d.current.temperature_2m),
      feels: Math.round(d.current.apparent_temperature),
      humidity: Math.round(d.current.relative_humidity_2m),
      wind: Math.round(d.current.wind_speed_10m),
      code: d.current.weather_code,
      isDay: d.current.is_day === 1
    },
    sunrise: d.daily.sunrise[0].slice(11, 16),
    sunset: d.daily.sunset[0].slice(11, 16),
    days: d.daily.time.map((date, i) => ({
      date,
      code: d.daily.weather_code[i],
      max: Math.round(d.daily.temperature_2m_max[i]),
      min: Math.round(d.daily.temperature_2m_min[i]),
      rain: d.daily.precipitation_probability_max[i]
    }))
  };
});
