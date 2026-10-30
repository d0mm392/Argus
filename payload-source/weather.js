// Wetter am aktuellen Standort des Laptops.
// Standort: zuerst die Windows-Ortung (WLAN/GPS, genau, braucht „Standort“ in den Windows-Einstellungen),
// sonst grob über den Internet-Anschluss (mit VPN steht dann der VPN-Ort da). Wetter von Open-Meteo, ohne Konto und Schlüssel.
const { execFile } = require("child_process");
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Argus-Desktop", Accept: "application/json" };
const METEO = process.env.JARVIS_METEO || "https://api.open-meteo.com/v1/forecast"; // Umgebungsvariablen nur für Tests
const IPGEO = process.env.JARVIS_IPGEO ? [process.env.JARVIS_IPGEO] : ["https://ipapi.co/json/", "https://ipwho.is/"];
const REVGEO = process.env.JARVIS_REVGEO || "https://api.bigdatacloud.net/data/reverse-geocode-client";
const GEOCODE = process.env.JARVIS_GEOCODE || "https://geocoding-api.open-meteo.com/v1/search";

async function get(url, ms = 12000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal });
    if (!r.ok) throw new Error(url.split("/")[2] + " antwortet mit " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// Windows-Ortungsdienst über .NET (System.Device), wartet höchstens 12 Sekunden auf eine Position
const PS = `$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Device
$w = New-Object System.Device.Location.GeoCoordinateWatcher([System.Device.Location.GeoPositionAccuracy]::High)
$w.Start($true) | Out-Null
$t = 0
while ($t -lt 120) { $l = $w.Position.Location; if ($l -and -not $l.IsUnknown) { break }; if ($w.Permission -eq 'Denied') { break }; Start-Sleep -Milliseconds 100; $t++ }
$l = $w.Position.Location
if ($l -and -not $l.IsUnknown) { [Console]::Out.Write(('{0};{1};{2}' -f $l.Latitude.ToString([cultureinfo]::InvariantCulture), $l.Longitude.ToString([cultureinfo]::InvariantCulture), [int]$l.HorizontalAccuracy)) } else { [Console]::Out.Write('none;' + $w.Permission) }
$w.Stop()`;
function windowsLocation() {
  if (process.platform !== "win32") return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS], { windowsHide: true, timeout: 20000 }, (err, out) => {
      const m = /^(-?\d+(?:\.\d+)?);(-?\d+(?:\.\d+)?);(\d+)/.exec(String(out || "").trim());
      if (err || !m) return resolve(String(out || "").startsWith("none;Denied") ? { denied: true } : null);
      resolve({ lat: +m[1], lon: +m[2], acc: +m[3], src: "windows" });
    });
  });
}
async function ipLocation() {
  for (const u of IPGEO) {
    try {
      const j = await get(u), lat = num(j.latitude ?? j.lat), lon = num(j.longitude ?? j.lon);
      if (lat != null && lon != null) return { lat, lon, city: j.city || "", country: j.country_name || j.country || "", src: "ip" };
    } catch {}
  }
  return null;
}
async function placeName(lat, lon) {
  try {
    const j = await get(`${REVGEO}?latitude=${lat}&longitude=${lon}&localityLanguage=de`);
    return { city: j.city || j.locality || j.principalSubdivision || "", country: j.countryName || "" };
  } catch { return { city: "", country: "" }; }
}
async function locate() {
  const w = await windowsLocation();
  if (w?.lat != null) { const n = await placeName(w.lat, w.lon); return { ...w, ...n }; }
  const ip = await ipLocation();
  if (ip) { if (!ip.city) Object.assign(ip, await placeName(ip.lat, ip.lon)); return { ...ip, winDenied: !!w?.denied }; }
  return null;
}

async function forecast(lat, lon) {
  const q = new URLSearchParams({
    latitude: lat.toFixed(3), longitude: lon.toFixed(3), timezone: "auto", forecast_days: "4", wind_speed_unit: "kmh",
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,is_day,precipitation",
    hourly: "temperature_2m,precipitation_probability,weather_code,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
  });
  const j = await get(`${METEO}?${q}`);
  const c = j.current || {}, h = j.hourly || {}, d = j.daily || {};
  // nächste 12 Stunden ab jetzt (Ortszeit des Standorts, utc_offset_seconds)
  const nowLocal = Date.now() + (num(j.utc_offset_seconds) || 0) * 1000, hours = [];
  for (let i = 0; i < (h.time || []).length && hours.length < 12; i++) {
    const t = Date.parse(h.time[i] + "Z"); if (t + 3600e3 <= nowLocal) continue;
    hours.push({ t: h.time[i].slice(11, 16), temp: num(h.temperature_2m?.[i]), rain: num(h.precipitation_probability?.[i]), code: num(h.weather_code?.[i]), day: h.is_day?.[i] !== 0 });
  }
  const days = (d.time || []).map((t, i) => ({ date: t, code: num(d.weather_code?.[i]), max: num(d.temperature_2m_max?.[i]), min: num(d.temperature_2m_min?.[i]), rain: num(d.precipitation_probability_max?.[i]), sunrise: d.sunrise?.[i]?.slice(11, 16), sunset: d.sunset?.[i]?.slice(11, 16) }));
  return {
    tz: j.timezone || "", cur: { temp: num(c.temperature_2m), feels: num(c.apparent_temperature), hum: num(c.relative_humidity_2m), code: num(c.weather_code), wind: num(c.wind_speed_10m), gust: num(c.wind_gusts_10m), day: c.is_day !== 0, rain: num(c.precipitation) },
    hours, days,
  };
}

// Ortsname → Koordinaten (Open-Meteo-Ortssuche), für weitere Wetterorte
async function geocode(name) {
  const j = await get(`${GEOCODE}?${new URLSearchParams({ name, count: "1", language: "de", format: "json" })}`);
  const r = j?.results?.[0]; if (!r) return null;
  return { lat: num(r.latitude), lon: num(r.longitude), city: r.name, country: r.country_code || r.country || "" };
}

module.exports = { locate, forecast, geocode };
