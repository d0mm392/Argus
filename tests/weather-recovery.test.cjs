'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { create, UNAVAILABLE } = require('../weather-service.cjs');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-weather-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let clock = 1000000, mode = 'ok', active = 0, maximum = 0, calls = 0;
  const timers = [], errors = [], config = { weatherOn: true, wxPlaces: 'Berlin;Bonn' };
  const data = { cur: { temp: 18, code: 0 }, hours: [], days: [] };
  const api = {
    locate: async () => ({ lat: 52, lon: 13, city: 'Berlin' }),
    geocode: async city => ({ lat: 52, lon: 13, city }),
    forecast: async () => {
      active++; maximum = Math.max(maximum, active); calls++;
      await new Promise(r => setImmediate(r)); active--;
      if (mode !== 'ok') { const e = new Error(mode); if (mode === '503') e.status = 503; else e.name = mode; throw e; }
      return data;
    }
  };
  const options = { api, cacheFile: path.join(dir, 'cache.json'), settings: () => config,
    publish: () => {}, diagnostic: e => errors.push(e), now: () => clock,
    schedule: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, cancel: timer => { timer.cancelled = true; } };
  const service = create(options); t.after(service.stop);
  return { service, options, config, timers, errors, data, mode: x => { mode = x; clock += 2000000; }, stats: () => ({ maximum, calls }) };
}
for (const mode of ['503', 'TimeoutError', 'TypeError']) test(`${mode}: cache, increasing bounded retries, no overlap, recovery`, async t => {
  const f = fixture(t); await f.service.poll();
  const ts = f.service.state.ts; f.mode(mode);
  await Promise.all(Array.from({ length: 20 }, () => f.service.poll()));
  assert.equal(f.stats().maximum, 1); assert.equal(f.stats().calls, 6);
  assert.equal(f.service.state.error, UNAVAILABLE); assert.equal(f.service.state.ts, ts);
  assert.equal(f.service.state.data.cur.temp, 18);
  assert(f.service.state.places.every(p => p.error === UNAVAILABLE && p.ts === ts));
  assert.equal(f.timers.at(-1).ms, 30000);
  await f.service.poll(); assert.equal(f.timers.at(-1).ms, 120000);
  await f.service.poll(); assert.equal(f.timers.at(-1).ms, 900000);
  assert.equal(f.errors.length, 1);
  const restarted = create(f.options); t.after(restarted.stop);
  assert.equal(restarted.state.data.cur.temp, 18); assert.equal(restarted.state.error, UNAVAILABLE);
  assert.equal(restarted.state.places[0].q, 'Berlin');
  f.mode('ok'); await f.service.poll();
  assert.equal(f.service.state.error, ''); assert(f.service.state.ts > ts);
  assert(f.service.state.places.every(p => !p.error)); assert.equal(f.config.wxPlaces, 'Berlin;Bonn');
});
test('without cache: clear error and settings changes while polling retained', async t => {
  const f = fixture(t); f.mode('503');
  const pending = f.service.poll(); f.config.wxPlaces = 'Hamburg'; f.service.refresh(); await pending;
  assert.equal(f.service.state.data, null); assert.equal(f.service.state.error, UNAVAILABLE);
  assert.equal(f.timers.at(-1).ms, 0);
  f.mode('ok'); await f.service.poll(); assert.deepEqual(f.service.state.places.map(p => p.q), ['Hamburg']);
});
test('real HTTP 503, malformed response, offline and recovery; forecast parameters', async t => {
  let mode = '503', query;
  const server = http.createServer((req, res) => {
    query = new URL(req.url, 'http://localhost').searchParams;
    if (mode === '503') { res.writeHead(503); res.end('{}'); }
    else if (mode === 'offline') req.socket.destroy();
    else { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(mode === 'bad' ? {} : { current: { temperature_2m: 20, weather_code: 0 } })); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => server.close());
  process.env.JARVIS_METEO = `http://127.0.0.1:${server.address().port}/forecast`;
  delete require.cache[require.resolve('../weather')]; const api = require('../weather');
  t.after(() => { delete process.env.JARVIS_METEO; delete require.cache[require.resolve('../weather')]; });
  await assert.rejects(api.forecast('52.1', '13.4'), e => e.status === 503);
  assert.equal(query.get('latitude'),'52.100'); assert.equal(query.get('wind_speed_unit'),'kmh'); assert.equal(query.get('forecast_days'),'4');
  mode='bad'; await assert.rejects(api.forecast(52,13), /keine aktuellen Daten/);
  mode='offline'; await assert.rejects(api.forecast(52,13));
  mode='ok'; assert.equal((await api.forecast(52,13)).cur.temp,20);
  await assert.rejects(api.forecast(null,13), /koordinaten/i);
});
test('real HTTP timeout aborts stalled request including body', async t => {
  const server = http.createServer((req,res) => { res.writeHead(200, {'Content-Type':'application/json'}); res.write('{'); });
  await new Promise(r => server.listen(0,'127.0.0.1',r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  process.env.JARVIS_METEO=`http://127.0.0.1:${server.address().port}`;
  delete require.cache[require.resolve('../weather')]; const api=require('../weather');
  t.after(() => { delete process.env.JARVIS_METEO; delete require.cache[require.resolve('../weather')]; });
  const start=Date.now(); await assert.rejects(api.forecast(52,13), e => e.name === 'AbortError');
  assert(Date.now()-start >= 11000 && Date.now()-start < 16000);
});
