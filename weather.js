const DEFAULT_LOCATION = {
  latitude: 37.2707,
  longitude: -76.7075,
};

const NWS_HEADERS = {
  Accept: 'application/geo+json',
  'User-Agent': 'MooreOpsDashboard/1.0 (https://github.com/wademoore/moore-ops)',
};

function weatherKind(value) {
  if (typeof value === 'number') {
    if ([95, 96, 99].includes(value)) return 'storm';
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return 'rain';
    if ([1, 2].includes(value)) return 'partly-cloudy';
    if ([3, 45, 48, 71, 73, 75, 77, 85, 86].includes(value)) return 'cloud';
    return 'sun';
  }
  const text = String(value || '').toLowerCase();
  if (text.includes('thunder')) return 'storm';
  if (/rain|shower|drizzle/.test(text)) return 'rain';
  if (/partly|mostly sunny|mostly clear/.test(text)) return 'partly-cloudy';
  if (/cloud|overcast|fog|snow|sleet|ice/.test(text)) return 'cloud';
  return 'sun';
}

function fahrenheit(celsius) {
  return Number.isFinite(celsius) ? Math.round((celsius * 9) / 5 + 32) : null;
}

function easternDateKey(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
}

function normalizeWeather({ forecast, observation, stationId }) {
  const periods = forecast?.properties?.periods || [];
  const observed = observation?.properties || {};
  const observedDate = observed.timestamp ? new Date(observed.timestamp) : new Date();
  const todayKey = easternDateKey(observedDate);
  const daytime = periods.filter(period => period.isDaytime).slice(0, 7);
  const days = daytime.map(period => {
    const index = periods.indexOf(period);
    const night = periods.slice(index + 1).find(candidate => !candidate.isDaytime);
    const date = easternDateKey(period.startTime);
    return {
      date,
      label: date === todayKey ? 'Today' : new Date(period.startTime).toLocaleDateString('en-US', {
        weekday: 'short', timeZone: 'America/New_York',
      }),
      icon: weatherKind(period.shortForecast),
      high: Math.round(period.temperature),
      low: Number.isFinite(night?.temperature) ? Math.round(night.temperature) : null,
      precipitation: Math.max(period.probabilityOfPrecipitation?.value || 0, night?.probabilityOfPrecipitation?.value || 0),
    };
  });
  const temperature = fahrenheit(observed.temperature?.value);
  const apparent = observed.heatIndex?.value ?? observed.windChill?.value ?? observed.temperature?.value;
  return {
    current: {
      temperature,
      feelsLike: fahrenheit(apparent),
      icon: weatherKind(observed.textDescription),
      summary: observed.textDescription || 'Current conditions',
      observedLabel: `Observed at ${stationId} · ${observedDate.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
      })}`,
    },
    days,
    source: 'National Weather Service',
  };
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: NWS_HEADERS });
  if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
  return response.json();
}

async function fetchDashboardWeather({
  latitude = Number(process.env.DASHBOARD_WEATHER_LAT || DEFAULT_LOCATION.latitude),
  longitude = Number(process.env.DASHBOARD_WEATHER_LON || DEFAULT_LOCATION.longitude),
  fetchImpl = globalThis.fetch,
  now = new Date(),
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation available');
  const point = await fetchJson(`https://api.weather.gov/points/${latitude},${longitude}`, fetchImpl);
  const [forecast, stations] = await Promise.all([
    fetchJson(point.properties.forecast, fetchImpl),
    fetchJson(point.properties.observationStations, fetchImpl),
  ]);
  for (const station of (stations.features || []).slice(0, 4)) {
    try {
      const observation = await fetchJson(`${station.id}/observations/latest`, fetchImpl);
      const observedAt = new Date(observation?.properties?.timestamp).getTime();
      const age = now.getTime() - observedAt;
      if (Number.isFinite(observation?.properties?.temperature?.value) && Number.isFinite(observedAt) && age >= 0 && age <= 6 * 60 * 60 * 1000) {
        return normalizeWeather({ forecast, observation, stationId: station.properties?.stationIdentifier || station.id.split('/').pop() });
      }
    } catch {
      // Try the next nearby station when one is temporarily unavailable.
    }
  }
  throw new Error('No nearby NWS station has a current observation');
}

export { fetchDashboardWeather, normalizeWeather, weatherKind, fahrenheit, DEFAULT_LOCATION, NWS_HEADERS };
