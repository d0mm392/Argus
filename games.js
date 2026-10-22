// Spiel-Erkennung und Spiel-Infos für die Gaming-Seite.
// Erkannt wird über den Programmpfad (Steam, Epic, GOG, EA, Ubisoft, Battle.net/Blizzard, Riot, Xbox). Es wird nichts im Spiel gelesen oder eingeklinkt (Anti-Cheat).
// Infos kommen aus öffentlichen Steam-Seiten (Beschreibung, Spielerzahl, News), Tipps aus einer kleinen, von Hand gepflegten Liste.
const fs = require("fs"), path = require("path");

const PATS = [
  [/\\steamapps\\common\\([^\\]+)(?:\\|$)/i, "Steam"], [/\\Epic Games\\([^\\]+)(?:\\|$)/i, "Epic"], [/\\GOG Galaxy\\Games\\([^\\]+)(?:\\|$)/i, "GOG"], [/\\GOG Games\\([^\\]+)(?:\\|$)/i, "GOG"],
  [/\\EA Games\\([^\\]+)(?:\\|$)/i, "EA"], [/\\Origin Games\\([^\\]+)(?:\\|$)/i, "EA"], [/\\Ubisoft Game Launcher\\games\\([^\\]+)(?:\\|$)/i, "Ubisoft"], [/\\Riot Games\\([^\\]+)(?:\\|$)/i, "Riot"],
  [/\\XboxGames\\([^\\]+)(?:\\|$)/i, "Xbox"], [/\\(Overwatch|Diablo[^\\]*|World of Warcraft|StarCraft[^\\]*|Hearthstone|Call of Duty[^\\]*)(?:\\|$)/i, "Battle.net"],
];
const SKIP_NAME = /^(Epic Games Launcher|Launcher|Common|Redist|Engine|Binaries|EasyAntiCheat.*|Ubisoft Game Launcher|Riot Client|Battle\.net)$/i;
const SKIP_EXE = /(crash|report|redist|eac|easyanticheat|battleye|vc_redist|launcher|setup|unins|prereq|dxsetup|dotnet|helper|webhelper|cef|ueprereq|installer|updater)/i;

const base = (p) => String(p).split(/[\\/]/).pop();
const seen = new Map(); // Spielname -> Beginn der Sitzung
const manifestCache = new Map();

// Steam: aus dem Installordner die appid lesen (appmanifest_*.acf liegt neben „common“)
function steamApp(exePath, folder) {
  const m = exePath.match(/^(.*\\steamapps)\\common(?:\\|$)/i); if (!m) return null;
  const dir = m[1];
  if (!manifestCache.has(dir)) {
    const map = new Map();
    try { for (const f of fs.readdirSync(dir)) { const k = f.match(/^appmanifest_(\d+)\.acf$/); if (!k) continue; const txt = fs.readFileSync(path.join(dir, f), "utf8"), d = txt.match(/"installdir"\s+"([^"]+)"/i), n = txt.match(/"name"\s+"([^"]+)"/i); if (d) map.set(d[1].toLowerCase(), { appid: +k[1], name: n?.[1] }); } } catch {}
    manifestCache.set(dir, map); setTimeout(() => manifestCache.delete(dir), 10 * 60e3).unref?.();
  }
  return manifestCache.get(dir).get(folder.toLowerCase()) || null;
}


// Installierte Spiele aus den Launcher-Verzeichnissen (Epic-Manifeste, GOG-Registry): erkennt Spiele auch in eigenen Ordnern wie D:\\Spiele
let LIBS = [];
function refreshLibs() {
  if (process.platform !== "win32") return;
  const out = [];
  try {
    const dir = path.join(process.env.ProgramData || "C:\\ProgramData", "Epic", "EpicGamesLauncher", "Data", "Manifests");
    for (const f of fs.readdirSync(dir)) { if (!f.endsWith(".item")) continue; try { const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); if (j.InstallLocation && j.DisplayName) out.push({ dir: String(j.InstallLocation).toLowerCase().replace(/[\\/]+$/, ""), name: String(j.DisplayName), launcher: "Epic" }); } catch {} }
  } catch {}
  try {
    require("child_process").execFile("reg", ["query", "HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games", "/s"], { windowsHide: true, timeout: 8000 }, (err, txt) => {
      if (err) { LIBS = out; return; }
      for (const blk of String(txt).split(/\r?\n\r?\n/)) { const n = blk.match(/gameName\s+REG_SZ\s+(.+)/i), p = blk.match(/\n\s+path\s+REG_SZ\s+(.+)/i); if (n && p) out.push({ dir: p[1].trim().toLowerCase().replace(/[\\/]+$/, ""), name: n[1].trim(), launcher: "GOG" }); }
      LIBS = out;
    });
  } catch { LIBS = out; }
  LIBS = out;
}
refreshLibs(); setInterval(refreshLibs, 10 * 60e3).unref?.();

// list: Prozesse aus systeminformation ({ name, path, cpu })
function detect(list) {
  let best = null;
  for (const p of list || []) {
    const pth = String(p.path || p.command || ""); if (!pth || SKIP_EXE.test(String(p.name || ""))) continue;
    for (const [re, launcher] of PATS) {
      const m = pth.match(re); if (!m) continue;
      const folder = m[1]; if (SKIP_NAME.test(folder)) break;
      if (!best || (p.cpu || 0) > (best.cpu || 0)) best = { cpu: p.cpu || 0, folder, launcher, exe: p.name || base(pth), pth };
      break;
    }
  }
  if (!best) {
    for (const p of list || []) { const pth = String(p.path || p.command || "").toLowerCase(); if (!pth || SKIP_EXE.test(String(p.name || ""))) continue; const L = LIBS.find((l) => pth.startsWith(l.dir + "\\")); if (L && (!best || (p.cpu || 0) > (best.cpu || 0))) best = { cpu: p.cpu || 0, folder: L.name, launcher: L.launcher, exe: p.name || base(pth), pth }; }
  }
  if (!best) return byName(list);
  const app = best.launcher === "Steam" ? steamApp(best.pth, best.folder) : null;
  const name = app?.name || best.folder;
  if (!seen.has(name)) { seen.clear(); seen.set(name, Date.now()); }
  return { name, folder: best.folder, launcher: best.launcher, exe: best.exe, appid: app?.appid || null, since: seen.get(name) };
}

// Dritte Quelle, wenn Windows keinen Programmpfad herausgibt (z. B. bei Spielen mit Anti-Cheat): Unreal-Spiele heißen <Spiel>-Win64-Shipping.exe.
// Der Name wird in Wörter zerlegt („ReadyOrNotSteam-Win64-Shipping.exe“ -> „Ready Or Not“), Steam-Infos findet Argus dann über die Suche im Steam-Shop.
const SHIP = /^(.+?)[-_](?:Win64|WinGDK|Win32|WindowsNoEditor)[-_]Shipping(?:\.exe)?$/i;
function prettyExe(n) {
  let s = String(n).replace(/\.exe$/i, "").replace(/(?<=[a-z])(Steam|Epic|Game|Client|Retail)$/, "").replace(/[_]+/g, " ");
  return s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/\s+/g, " ").trim();
}
function byName(list) {
  let best = null;
  for (const p of list || []) { const m = String(p.name || "").match(SHIP); if (!m || SKIP_EXE.test(m[1])) continue; if (!best || (p.cpu || 0) > (best.cpu || 0)) best = { cpu: p.cpu || 0, exe: p.name, n: prettyExe(m[1]) }; }
  if (!best) { seen.clear(); return null; }
  if (!seen.has("exe:" + best.n)) { seen.clear(); seen.set("exe:" + best.n, Date.now()); }
  return { name: best.n, folder: best.n, launcher: "Programmname", exe: best.exe, appid: null, since: seen.get("exe:" + best.n) };
}
let lastSteam = { id: 0, err: "" };
const steamDiag = () => lastSteam;

// Zweite Quelle: Steam meldet das laufende Spiel selbst (Registry, nur Windows). Funktioniert auch, wenn Windows den Programmpfad nicht herausgibt.
const { execFile } = require("child_process");
const reg = (name) => new Promise((res) => execFile("reg", ["query", "HKCU\\Software\\Valve\\Steam", "/v", name], { timeout: 4000, windowsHide: true }, (e, out) => { const m = !e && String(out).match(new RegExp(name + "\\s+REG_\\w+\\s+(.+)")); if (e) lastSteam.err = String(e.code || e.message).slice(0, 40); res(m ? m[1].trim() : ""); }));
async function steamRunning() {
  if (process.platform !== "win32") return null;
  lastSteam = { id: 0, err: "" };
  const id = parseInt(await reg("RunningAppID"), 16) || 0; // reg gibt 0x… aus
  lastSteam.id = id;
  if (!id) return null;
  let name = null;
  try {
    const sp = (await reg("SteamPath")).replace(/\//g, "\\"), libs = new Set([path.join(sp, "steamapps")]);
    try { for (const m of fs.readFileSync(path.join(sp, "steamapps", "libraryfolders.vdf"), "utf8").matchAll(/"path"\s+"([^"]+)"/g)) libs.add(path.join(m[1].replace(/\\\\/g, "\\"), "steamapps")); } catch {}
    for (const l of libs) { try { name = fs.readFileSync(path.join(l, "appmanifest_" + id + ".acf"), "utf8").match(/"name"\s+"([^"]+)"/i)?.[1]; } catch {} if (name) break; }
  } catch {}
  if (!seen.has("steam:" + id)) { seen.clear(); seen.set("steam:" + id, Date.now()); }
  return { name: name || "Steam-Spiel " + id, folder: name || "", launcher: "Steam", exe: "", appid: id, since: seen.get("steam:" + id) };
}

const UA = { "User-Agent": "Mozilla/5.0 Argus-Desktop", Accept: "application/json" };
async function get(url, ms = 10000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: ctl.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); }
}
const strip = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

// Von Hand gepflegte Tipps, bewusst allgemein und ohne Gewähr. Schlüssel: Name in Kleinbuchstaben (enthält).
const TIPS = [
  ["ready or not", ["Verhaften statt erschießen: Verdächtige zuerst zum Aufgeben auffordern, das gibt mehr Punkte als Töten.", "Vor jeder Tür mit dem Türspiegel (Optiwand) prüfen, dann erst Stolperdraht/Keil oder Blendgranate einsetzen.", "Das Team über das Befehlsrad koordinieren: gemeinsam stapeln, dann auf ein Signal hin stürmen.", "Zivilisten und Beweismittel bringen Punkte: Beweise einsammeln, Meldung ans TOC nicht vergessen.", "Magazine und Granaten vor dem Einsatz im Ausrüstungsmenü prüfen, im Einsatz gibt es keinen Nachschub."]],
  ["counter-strike", ["Fadenkreuz auf Kopfhöhe halten und nur beim Stehen oder kurzen Antippen schießen.", "Granaten (Smoke, Flash) vor dem Push einsetzen, nicht erst danach.", "Spray-Muster der Hauptwaffe im Aufwärmen üben."]],
  ["helldivers", ["Stratagem-Codes vor dem Einsatz üben, die Eingabe sollte ohne Hinsehen sitzen.", "Nicht auf Teamschaden vergessen: Orbital-Angriffe immer mit Abstand rufen.", "Mit Kameraden Rucksack und Stratagems abstimmen."]],
  ["elden ring", ["Beim Aufleveln erst Vigor, dann den Hauptwert der Waffe.", "Spirit Ashes (Geister) helfen bei fast jedem Boss.", "Zu schwere Gegner: erst woanders erkunden und stärker zurückkommen."]],
  ["baldur", ["Vor langen Rasten speichern und Gesprächsoptionen nicht überhasten.", "Tragkraft im Auge behalten, Gegenstände im Lager ablegen."]],
  ["cyberpunk", ["Skillpunkte auf einen Hauptweg konzentrieren statt breit zu streuen.", "Vor Hauptmissionen Nebenaufträge im Gebiet erledigen, das gibt Level und Ausrüstung."]],
  ["valorant", ["Fadenkreuz nicht zu hoch und nicht zu tief, Kopfhöhe halten.", "Fähigkeiten mit dem Team abstimmen statt einzeln einzusetzen."]],
  ["minecraft", ["Früh ein Bett setzen und Fackeln mitnehmen.", "Zum Diamantensuchen etwa Höhe -58 bis -59 abbauen."]],
];
// Weitere Spiele (kurz, allgemein, ohne Gewähr)
TIPS.push(
  ["fortnite", ["Früh Höhe und Deckung sichern, Bauen erst nach Sicherheit der Position üben.", "Materialien beim Looten immer mitnehmen, Wände und Rampen entscheiden Kämpfe.", "Zone im Blick behalten und rechtzeitig rotieren."]],
  ["apex", ["Mit dem Team landen und zusammen looten, Einzelgänger sterben früh.", "Bewegung (Rutschen, Springen) ist wichtiger als Zielen allein.", "Vor jedem Kampf Schild laden, nicht währenddessen."]],
  ["league of legends", ["Minions zuletzt treffen (Last Hit) bringt mehr Gold als Kämpfe in der Lane.", "Karte im Blick: ein Blick pro zwei Sekunden verhindert Ganks.", "Wards setzen und Ziele (Drache, Herold) mit dem Team abstimmen."]],
  ["dota", ["Creeps am Ende treffen (Last Hit) und Gegner abwehren (Deny).", "Runen alle zwei Minuten kontrollieren.", "Gegenstände nach der Spielsituation kaufen, nicht nach festem Plan."]],
  ["rocket league", ["Boost nicht verschwenden, kleine Boost-Pads reichen oft.", "Rotation: nach dem Schuss zurück ins Tor-Dreieck, nicht stehen bleiben.", "Erst Ballkontrolle, dann Tempo."]],
  ["overwatch", ["Im Team spielen: Heiler schützen, Tank nicht allein lassen.", "Ultimates mit dem Team abstimmen.", "Held wechseln, wenn der Gegner dich kontert."]],
  ["rust", ["Erste Nacht: Wolle sammeln, Schlafsack, Basis klein und versteckt halten.", "Nie alles Wertvolle in einer Kiste lagern."]],
  ["grand theft auto", ["Online: Versicherung und Garage nutzen, Fahrzeuge vor Missionen sichern.", "Passiv-Modus schützt vor Spielern, kostet aber Verdienstmöglichkeiten."]],
  ["red dead", ["Pferd regelmäßig pflegen und füttern, das Bindung erhöht.", "Jagen und Verkaufen bringt früh das meiste Geld."]],
  ["the witcher", ["Vor schweren Kämpfen Tränke, Öle und Bomben vorbereiten und Monster-Schwächen im Bestiarium lesen."]],
  ["diablo", ["Beim Leveln auf Ausrüstung mit passenden Werten achten, Legendarys nicht voreilig zerlegen.", "Aspekte und Skillpunkte lieber um einen Hauptangriff bauen."]],
  ["path of exile", ["Vor dem Start einen Build-Guide wählen und beim Skillbaum bleiben.", "Gegenstände nicht beim Händler verramschen, erst Preise im Handel prüfen."]],
  ["hearts of iron", ["Produktion priorisieren, Divisionsvorlagen früh bauen und Versorgungslinien prüfen."]],
  ["civilization", ["Früh expandieren, Wissenschaft und Produktion in Balance halten.", "Nachbarn nicht alle gleichzeitig verärgern."]],
  ["stardew", ["Jeden Tag Energie aufbrauchen, aber Schlaf vor 2 Uhr nicht verpassen.", "Geschenke an Dorfbewohner zum Geburtstag sparen."]],
  ["terraria", ["Früh Haus mit Wänden und Fackeln bauen, damit NPCs einziehen.", "Vor Bossen Arena und Heiltränke vorbereiten."]],
  ["hades", ["Eine Waffe und ein Aspekt lange spielen, bis die Muster sitzen.", "Ausweichen (Dash) ist wichtiger als Schaden."]],
);
function tipsFor(name) { const n = String(name || "").toLowerCase(); const hit = TIPS.find(([k]) => n.includes(k)); return hit ? hit[1] : []; }

// Ohne eigenen Tipp-Eintrag: allgemeine Hinweise und typische Tastenbelegung nach Genre (Steam liefert die Genres)
const GENERIC = [
  [/shooter|ego|taktik/i, { tips: ["Empfindlichkeit der Maus einmal sauber einstellen und danach nicht mehr ändern.", "Fadenkreuz auf Kopfhöhe, vor Ecken vorzielen.", "Nachladen nur in Deckung, Geräusche (Schritte) mit Kopfhörer nutzen."], keys: [["WASD", "Bewegen"], ["Maus", "Zielen"], ["Linke Maustaste", "Schießen"], ["Rechte Maustaste", "Zielen/Visier"], ["R", "Nachladen"], ["Shift", "Sprinten"], ["Strg / C", "Ducken"], ["Leertaste", "Springen"], ["E / F", "Benutzen"], ["Tab", "Spielstand/Inventar"]] }],
  [/rollenspiel|rpg/i, { tips: ["Quests im Tagebuch sortieren und Nebenaufträge für Ausrüstung mitnehmen.", "Vor Bosskämpfen speichern, Tränke und Reparatur dabeihaben.", "Auf einen Hauptwert skillen statt breit zu streuen."], keys: [["WASD", "Bewegen"], ["Maus", "Kamera"], ["Linke Maustaste", "Angriff"], ["Q / E / R", "Fähigkeiten"], ["I", "Inventar"], ["J / L", "Tagebuch/Quests"], ["M", "Karte"], ["F5 / F9", "Schnellspeichern/-laden"]] }],
  [/strategie|aufbau/i, { tips: ["Früh Wirtschaft aufbauen, erst dann Armee.", "Kontrollgruppen (Strg+Zahl) für Einheiten und Gebäude anlegen.", "Karte und Minimap regelmäßig prüfen."], keys: [["Maus links", "Auswählen"], ["Maus rechts", "Befehl"], ["Strg+1…9", "Gruppe anlegen"], ["1…9", "Gruppe wählen"], ["Leertaste", "Zu letztem Ereignis"], ["Pause", "Spiel anhalten"], ["WASD / Pfeile", "Karte bewegen"]] }],
  [/renn|racing/i, { tips: ["Bremspunkte lernen: früh bremsen, spät beschleunigen.", "Mit Fahrhilfen starten und schrittweise abschalten.", "Lenkrad-/Controller-Totzone einstellen."], keys: [["W / Pfeil auf", "Gas"], ["S / Pfeil ab", "Bremse"], ["A D", "Lenken"], ["Leertaste", "Handbremse"], ["C", "Kamera wechseln"], ["Q E", "Schalten"]] }],
  [/sport|fußball|football/i, { tips: ["Training und Tutorials erst durchspielen, Steuerung sitzt dann schneller.", "Taktik und Aufstellung vor jedem Spiel prüfen."], keys: [["WASD / Stick", "Bewegen"], ["Leertaste", "Sprint/Aktion"], ["A / S / D", "Pass / Schuss / Flanke"]] }],
  [/simulation|survival|überleben|aufbau/i, { tips: ["Ressourcen früh sichern, dann Basis ausbauen.", "Regelmäßig speichern und Lagerkisten beschriften.", "Mods und Guides der Community nutzen."], keys: [["WASD", "Bewegen"], ["E", "Benutzen"], ["Tab / I", "Inventar"], ["B / Q", "Bauen"], ["Linke Maustaste", "Aktion"]] }],
  [/abenteuer|adventure|action/i, { tips: ["Umgebung genau absuchen, versteckte Gegenstände gibt es fast immer.", "Ausweichen und Blocken lernen, bevor Schaden erhöht wird.", "Schwierigkeitsgrad ruhig anpassen."], keys: [["WASD / Stick", "Bewegen"], ["Leertaste", "Springen/Ausweichen"], ["Linke Maustaste", "Angriff"], ["Rechte Maustaste", "Blocken/Zielen"], ["E", "Interagieren"], ["Esc", "Menü/Pause"]] }],
];
const UNIVERSAL = { tips: ["Grafiktreiber aktuell halten, bei Rucklern erst Schatten und Sichtweite senken.", "Hintergrundprogramme (Browser, Launcher) schließen, das spart RAM und CPU.", "Temperaturen im Blick behalten: ab 85 °C GPU lieber Lüfterkurve oder Bildrate begrenzen.", "Pausen: alle 60 bis 90 Minuten kurz aufstehen."], keys: [["Esc", "Menü/Pause"], ["Alt+Tab", "Zum Desktop (Fenstermodus: stabiler)"], ["F11 / Alt+Enter", "Vollbild umschalten"], ["Win+Shift+S", "Screenshot"]] };
// Typische Controller-Belegung nach Genre (Xbox-Namen, Argus übersetzt sie für PlayStation); je Spiel verschieden
const PADS = [
  [/renn|racing/i, [["RT / LT", "Gas / Bremse"], ["Linker Stick", "Lenken"], ["A", "Handbremse"], ["Y", "Kamera"], ["RB / LB", "Schalten"]]],
  [/sport|fußball|football/i, [["Linker Stick", "Bewegen"], ["A", "Pass"], ["B", "Schuss"], ["X", "Flanke"], ["RT", "Sprint"]]],
  [/strategie|aufbau/i, [["Linker Stick", "Zeiger"], ["A", "Auswählen"], ["B", "Abbrechen"], ["X / Y", "Menü / Befehl"], ["LB / RB", "Gruppen"]]],
  [/shooter|ego|taktik/i, [["Linker / Rechter Stick", "Bewegen / Zielen"], ["RT / LT", "Schießen / Zielen"], ["A", "Springen"], ["X", "Nachladen"], ["RB", "Granate"]]],
];
const PAD_DEFAULT = [["Linker Stick", "Bewegen"], ["Rechter Stick", "Kamera"], ["A", "Bestätigen / Springen"], ["B", "Zurück / Ausweichen"], ["X / Y", "Aktion / Benutzen"], ["Start", "Menü"]];
function padsFor(genres) { const g = (genres || []).join(" "); return (PADS.find(([re]) => re.test(g)) || [0, PAD_DEFAULT])[1]; }
function fallback(genres) {
  const g = (genres || []).join(" "); const hit = GENERIC.find(([re]) => re.test(g));
  return { tips: [...(hit ? hit[1].tips : []), ...UNIVERSAL.tips].slice(0, 6), keys: [...(hit ? hit[1].keys : []), ...UNIVERSAL.keys].slice(0, 10) };
}

const infoCache = new Map();
async function info(name, appid) {
  const key = (appid || "") + "|" + String(name || "").toLowerCase(), c = infoCache.get(key);
  if (c && Date.now() - c.t < 6 * 3600e3) return c.v;
  const out = { name, appid: appid || null, tips: tipsFor(name) };
  try {
    if (!out.appid) { const s = await get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&cc=de&l=german`); out.appid = s?.items?.[0]?.id || null; }
    if (out.appid) {
      const [d, pl, nw] = await Promise.allSettled([
        get(`https://store.steampowered.com/api/appdetails?appids=${out.appid}&cc=de&l=german`),
        get(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${out.appid}`),
        get(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${out.appid}&count=3&maxlength=240&format=json`),
      ]);
      const a = d.status === "fulfilled" ? d.value?.[out.appid]?.data : null;
      if (a) { out.title = a.name; out.desc = strip(a.short_description).slice(0, 320); out.genres = (a.genres || []).map((g) => g.description).slice(0, 4); out.meta = a.metacritic?.score || null; out.price = a.is_free ? "kostenlos" : a.price_overview?.final_formatted || null; out.release = a.release_date?.date || null; }
      if (pl.status === "fulfilled") out.players = pl.value?.response?.player_count ?? null;
      if (nw.status === "fulfilled") out.news = (nw.value?.appnews?.newsitems || []).slice(0, 3).map((n) => ({ title: strip(n.title).slice(0, 120), url: /^https:/.test(n.url || "") ? n.url : null, date: n.date ? n.date * 1000 : null }));
    }
  } catch (e) { out.error = "Steam-Daten nicht erreichbar"; }
  const fb = fallback(out.genres);
  out.pads = padsFor(out.genres);
  out.keys = fb.keys; // typische Tastenbelegung nach Genre (je Spiel verschieden)
  if (!out.tips.length) { out.tips = fb.tips; out.tipsGeneric = true; }
  infoCache.set(key, { t: Date.now(), v: out });
  return out;
}

module.exports = { detect, info, tipsFor, steamRunning, steamDiag, prettyExe, byName };
