// Previsão do tempo via Open-Meteo (gratuito, sem chave). Só é consultada no modo
// "Auto" e só com a permissão de localização do navegador. Coordenadas são
// arredondadas para ~1 km antes de enviar.

export const MANUAL_TEMPS = { frio: 10, fresco: 17, ameno: 22, calor: 30 };

const CACHE_KEY = 'gr.weather';
const MAX_AGE = 3 * 60 * 60 * 1000;

function readCache() {
  try {
    const w = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return w && Date.now() - w.at < MAX_AGE ? w : null;
  } catch {
    return null;
  }
}

export async function getWeather() {
  const cached = readCache();
  if (cached) return cached;

  const pos = await new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 8000,
      maximumAge: 60 * 60 * 1000,
    }),
  );
  const lat = pos.coords.latitude.toFixed(2);
  const lon = pos.coords.longitude.toFixed(2);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=auto&forecast_days=1';
  const res = await fetch(url);
  if (!res.ok) throw new Error('weather ' + res.status);
  const d = (await res.json()).daily;
  const max = d.temperature_2m_max[0];
  const min = d.temperature_2m_min[0];
  const weather = {
    temp: max * 0.6 + min * 0.4, // sensação ao longo do dia, puxada para a máxima
    max,
    min,
    rain: d.precipitation_probability_max[0] ?? 0,
    at: Date.now(),
  };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(weather));
  } catch {}
  return weather;
}
