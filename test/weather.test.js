import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchDashboardWeather, normalizeWeather, weatherKind } from '../weather.js';

const forecast = { properties: { periods: [
  { startTime: '2026-08-30T06:00:00-04:00', isDaytime: true, temperature: 90, shortForecast: 'Mostly Sunny', probabilityOfPrecipitation: { value: 5 } },
  { startTime: '2026-08-30T18:00:00-04:00', isDaytime: false, temperature: 73, shortForecast: 'Partly Cloudy', probabilityOfPrecipitation: { value: 10 } },
  { startTime: '2026-08-31T06:00:00-04:00', isDaytime: true, temperature: 94, shortForecast: 'Chance Thunderstorms', probabilityOfPrecipitation: { value: 40 } },
  { startTime: '2026-08-31T18:00:00-04:00', isDaytime: false, temperature: 74, shortForecast: 'Showers', probabilityOfPrecipitation: { value: 60 } },
] } };
const observation = { properties: {
  timestamp: '2026-08-29T15:54:00-04:00', textDescription: 'Partly Cloudy',
  temperature: { value: 26.7 }, heatIndex: { value: 28.3 }, windChill: { value: null },
} };

describe('dashboard v2 weather adapter', () => {
  it('combines station observations with NWS point forecast periods', () => {
    const value = normalizeWeather({ forecast, observation, stationId: 'KPHF' });
    assert.equal(value.current.temperature, 80);
    assert.equal(value.current.feelsLike, 83);
    assert.equal(value.current.icon, 'partly-cloudy');
    assert.match(value.current.observedLabel, /^Observed at KPHF/);
    assert.equal(value.days[0].label, 'Sun');
    assert.equal(value.days[0].low, 73);
    assert.equal(value.days[1].icon, 'storm');
    assert.equal(value.days[1].precipitation, 60);
    assert.equal(value.source, 'National Weather Service');
  });

  it('uses the NWS point endpoints and falls back to another nearby station', async () => {
    const requests = [];
    const fetchImpl = async (url, options) => {
      requests.push({ url: String(url), options });
      const value = String(url);
      if (value.includes('/points/')) return { ok: true, json: async () => ({ properties: { forecast: 'https://example.test/forecast', observationStations: 'https://example.test/stations' } }) };
      if (value.endsWith('/forecast')) return { ok: true, json: async () => forecast };
      if (value.endsWith('/stations')) return { ok: true, json: async () => ({ features: [
        { id: 'https://api.weather.gov/stations/KBAD', properties: { stationIdentifier: 'KBAD' } },
        { id: 'https://api.weather.gov/stations/KPHF', properties: { stationIdentifier: 'KPHF' } },
      ] }) };
      if (value.includes('KBAD')) return { ok: true, json: async () => ({ properties: { timestamp: '2026-08-28T15:54:00-04:00', temperature: { value: 30 } } }) };
      return { ok: true, json: async () => observation };
    };
    const weather = await fetchDashboardWeather({ fetchImpl, now: new Date('2026-08-29T16:00:00-04:00') });
    assert.equal(weather.current.temperature, 80);
    assert.match(weather.current.observedLabel, /KPHF/);
    assert.match(requests[0].url, /^https:\/\/api\.weather\.gov\/points\/37\.2707,-76\.7075$/);
    assert.equal(requests.every(request => request.options.headers['User-Agent'].startsWith('MooreOpsDashboard/')), true);
  });

  it('maps NWS descriptions to dashboard icon families', () => {
    assert.equal(weatherKind('Sunny'), 'sun');
    assert.equal(weatherKind('Mostly Sunny'), 'partly-cloudy');
    assert.equal(weatherKind('Rain Showers'), 'rain');
    assert.equal(weatherKind('Thunderstorms'), 'storm');
  });
});
