const DEFAULT_LOCATION = {
  latitude: 37.2707,
  longitude: -76.7075,
};

function weatherKind(code) {
  if ([95, 96, 99].includes(code)) return 'storm';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([1, 2].includes(code)) return 'partly-cloudy';
  if ([3, 45, 48, 71, 73, 75, 77, 85, 86].includes(code)) return 'cloud';
  return 'sun';
}

function weatherSummary(code) {
  if ([95, 96, 99].includes(code)) return 'Thunderstorms';
  if ([61, 63, 65, 80, 81, 82].includes(code)) return 'Rain likely';
  if ([51, 53, 55, 56, 57, 66, 67].includes(code)) return 'Drizzle';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([45, 48].includes(code)) return 'Fog';
  if (code === 3) return 'Cloudy';
  if ([1, 2].includes(code)) return 'Partly cloudy';
  return 'Sunny';
}

function normalizeWeather(payload) {
  const daily = payload?.daily || {};
  const current = payload?.current || {};
  const days = (daily.time || []).map((date, index) => ({
    date,
    label: new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: 'America/New_York',
    }),
    icon: weatherKind(daily.weather_code?.[index]),
    high: Math.round(daily.temperature_2m_max?.[index]),
    low: Math.round(daily.temperature_2m_min?.[index]),
    precipitation: Math.round(daily.precipitation_probability_max?.[index] || 0),
  }));

  return {
    current: {
      temperature: Math.round(current.temperature_2m),
      feelsLike: Math.round(current.apparent_temperature),
      icon: weatherKind(current.weather_code),
      summary: weatherSummary(current.weather_code),
    },
    days,
    source: 'Open-Meteo',
  };
}

async function fetchDashboardWeather({
  latitude = Number(process.env.DASHBOARD_WEATHER_LAT || DEFAULT_LOCATION.latitude),
  longitude = Number(process.env.DASHBOARD_WEATHER_LON || DEFAULT_LOCATION.longitude),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation available');
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,apparent_temperature,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    temperature_unit: 'fahrenheit',
    timezone: 'America/New_York',
    forecast_days: '7',
  });
  const response = await fetchImpl(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
  return normalizeWeather(await response.json());
}

export { fetchDashboardWeather, normalizeWeather, weatherKind, weatherSummary, DEFAULT_LOCATION };
