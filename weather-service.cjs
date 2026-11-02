'use strict';
const fs = require('fs');
const UNAVAILABLE = 'Wetterdienst vorübergehend nicht erreichbar';
const PERIOD = 15 * 60e3;
function create({ api, cacheFile, settings, publish, diagnostic = () => {}, now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
  const state = { loc: null, locTs: 0, data: null, ts: 0, error: '', places: [] };
  let cached = {};
  try { cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {}
  if (cached.version === 1 && cached.state && Array.isArray(cached.state.places)) {
    Object.assign(state, cached.state, { locTs: 0 });
    if (state.data) state.error = UNAVAILABLE;
    for (const p of state.places) if (p.data) p.error = UNAVAILABLE;
  }
  const geos = new Map();
  let busy = null, timer = null, retry = 0, generation = 0, stopped = false, lastProblem = '';
  const names = () => String(settings().wxPlaces || '').split(/[\n;]+/).map(s => s.trim()).filter(Boolean).slice(0, 3);
  function save() {
    try { fs.writeFileSync(cacheFile + '.tmp', JSON.stringify({ version: 1, state })); fs.renameSync(cacheFile + '.tmp', cacheFile); } catch {}
  }
  async function cycle() {
    const revision = generation, selected = names();
    let failed = false;
    const problem = e => { failed = true; const key = e.status || e.name || 'network'; if (lastProblem !== key) { lastProblem = key; diagnostic(e); } };
    const out = [];
    for (const q of selected) {
      const old = state.places.find(p => p.q === q);
      const p = { ...old, q, name: old?.name || q, ts: old?.ts || 0, data: old?.data || null, error: '' };
      try {
        let g = geos.get(q) || old?.geo;
        if (!g) g = await api.geocode(q);
        if (!g) { p.error = `Ort „${q}“ nicht gefunden`; }
        else { geos.set(q, g); p.geo = g; p.name = g.city; p.country = g.country; p.data = await api.forecast(g.lat, g.lon); p.ts = now(); }
      } catch (e) { p.error = UNAVAILABLE; problem(e); }
      out.push(p);
    }
    if (revision === generation) state.places = out;
    try {
      if (!state.loc || now() - state.locTs > 30 * 60e3) {
        const loc = await api.locate();
        if (loc) {
          if (state.loc && (Math.abs(loc.lat - state.loc.lat) > .01 || Math.abs(loc.lon - state.loc.lon) > .01)) { state.data = null; state.ts = 0; }
          state.loc = loc; state.locTs = now();
        }
      }
      if (!state.loc) { state.error = 'Standort unbekannt'; failed = true; }
      else { state.data = await api.forecast(state.loc.lat, state.loc.lon); state.ts = now(); state.error = ''; }
    } catch (e) { state.error = UNAVAILABLE; problem(e); }
    if (!failed) lastProblem = '';
    save(); publish(state);
    if (!stopped && settings().weatherOn !== false) {
      const delay = revision !== generation ? 0 : failed && retry < 2 ? [30000, 120000][retry++] : PERIOD;
      if (!failed || delay === PERIOD) retry = 0;
      timer = schedule(() => { timer = null; poll(); }, delay); timer?.unref?.();
    }
  }
  function poll() {
    if (stopped || settings().weatherOn === false) return Promise.resolve();
    if (busy) return busy;
    if (timer) cancel(timer); timer = null;
    busy = cycle().finally(() => { busy = null; }); return busy;
  }
  function refresh() { generation++; state.locTs = 0; retry = 0; return poll(); }
  function stop() { stopped = true; if (timer) cancel(timer); }
  return { state, poll, refresh, stop };
}
module.exports = { create, UNAVAILABLE };
