import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchDashboardWeather, normalizeWeather, weatherKind } from '../weather.js';

const fixture = {
  current: { temperature_2m: 80.4, apparent_temperature: 82.1, weather_code: 1 },
  daily: {
    time: ['2026-08-11', '2026-08-12'],
    weather_code: [1, 95],
    temperature_2m_max: [87.8, 85.2],
    temperature_2m_min: [70.3, 68.8],
    precipitation_probability_max: [5, 72],
  },
};

describe('dashboard v2 weather adapter', () => {
  it('normalizes current conditions and a seven-day-compatible daily array', () => {
    const value = normalizeWeather(fixture);
    assert.equal(value.current.temperature, 80);
    assert.equal(value.current.feelsLike, 82);
    assert.equal(value.current.icon, 'partly-cloudy');
    assert.equal(value.days[1].icon, 'storm');
    assert.equal(value.days[1].precipitation, 72);
  });

  it('requests Fahrenheit, ET, and seven forecast days', async () => {
    let requestedUrl = '';
    const weather = await fetchDashboardWeather({
      fetchImpl: async url => {
        requestedUrl = String(url);
        return { ok: true, json: async () => fixture };
      },
    });
    assert.equal(weather.days.length, 2);
    assert.match(requestedUrl, /temperature_unit=fahrenheit/);
    assert.match(requestedUrl, /timezone=America%2FNew_York/);
    assert.match(requestedUrl, /forecast_days=7/);
  });

  it('maps WMO codes to dashboard icon families', () => {
    assert.equal(weatherKind(0), 'sun');
    assert.equal(weatherKind(2), 'partly-cloudy');
    assert.equal(weatherKind(63), 'rain');
    assert.equal(weatherKind(95), 'storm');
  });
});
