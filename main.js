// Argus Desktop: kleines, immer sichtbares Fenster mit der Neuronen-Kugel.
const { app, desktopCapturer, BrowserWindow, WebContentsView, Tray, Menu, ipcMain, screen, globalShortcut, session, nativeImage, shell, Notification, powerMonitor, dialog, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
// Linux als AppImage: ohne setuid-Helfer startet der Chromium-Sandbox-Prozess oft nicht (Ubuntu 24.04 und neuer sperren ihn); darum dort ohne ihn.
if (process.platform === "linux" && process.env.APPIMAGE) app.commandLine.appendSwitch("no-sandbox");
const http = require("http");
const os = require("os");
const { spawn, execFile } = require("child_process");
const Anthropic = require("@anthropic-ai/sdk");
const { SystemWatch, setSensorFile } = require("./system");
const actions = require("./actions");
const selfimprove = require("./selfimprove");
const uiMode = require("./app/ui-mode");
let uiStart = { mode: "klassisch", fallback: false }; // vom Programmstart festgelegt, gilt bis zum nächsten Neustart
process.env.JARVIS_INDEX = process.env.JARVIS_INDEX || path.join(app.getPath("userData"), "dateiindex.txt"); // vor files.js setzen
process.env.ARGUS_USERDATA = app.getPath("userData"); // für die Schutzprüfung in files.js (0.58.21), auch im MCP-Server
// Umzug des Gedächtnisordners (Benutzerordner\Jarvis-Gedaechtnis → Argus-Gedaechtnis). Geht das nicht (Datei offen), bleibt der alte in Gebrauch
try { const o = path.join(os.homedir(), "Jarvis-Gedaechtnis"), n = path.join(os.homedir(), "Argus-Gedaechtnis"); if (!process.env.JARVIS_MEMORY && fs.existsSync(o) && !fs.existsSync(n)) fs.renameSync(o, n); } catch {}
const memory = require("./memory");
const files = require("./files");
const report = require("./report");
const news = require("./news");
const foreman = require("./foreman");
const mining = require("./mining");
const trade = require("./trade");
const portal = require("./portal");
const fmdash = require("./foremandash");
const iob = require("./iobroker");
const weather = require("./weather");
const strata = require("./strata");
const social = require("./social");
const dcbot = require("./dcbot");
const steamdl = require("./steamdl");
const LOOKS = {"clocks": ["Uhr", [["", "Standard"], ["gross", "Groß, schlicht"], ["analog", "Analog"], ["zifferblatt", "Zifferblatt mit Zahlen"], ["3d", "3D-Uhr"], ["mechanisch", "Mechanisch"], ["futuristisch", "Futuristisch"]]], "wx": ["Wetter", [["", "Standard"], ["gross", "Groß, schlicht"], ["kompakt", "Kompakt (nur jetzt)"], ["glas", "Durchsichtig, weiße Schrift"]]], "notes": ["Notizen", [["", "Standard"], ["schlicht", "Durchsichtig, schlicht"], ["gelb", "Haftnotiz"], ["linien", "Liniertes Papier"]]], "sys": ["Systemwache", [["", "Standard"], ["glas", "Durchsichtig, weiße Schrift"], ["schlank", "Schlank, ohne Rahmen"], ["kachel", "Kacheln"]]]}; // Design-Varianten je Fenster (Namen müssen zu app/js/14i-designs.js und style.css passen)
let netRx = 0; // aktuelle Empfangsrate des Netzwerks in Byte/s (aus der Systemwache)

if (!app.requestSingleInstanceLock()) app.quit();

// Fenster kann beim Beenden oder Neuladen schon zerstört sein, während Timer noch laufen
const alive = () => !!win && !win.isDestroyed();
function sendUI(ch, ...args) { if (alive() && !win.webContents.isDestroyed()) win.webContents.send(ch, ...args); }
let discordSocial = null;
let discordUiOrigin = "";
function trustedDiscordFrame(contents, frame) {
  try { const url = new URL(frame.url); return contents === win?.webContents && frame === win.webContents.mainFrame && url.origin === discordUiOrigin && url.pathname === "/"; } catch { return false; }
}
function startDiscordSocial() {
  discordSocial = require("./app/discord-social").create({safeStorage,
    authPath:path.join(app.getPath("userData"),"discord-social-auth.bin"),
    helperPath:app.isPackaged?path.join(process.resourcesPath,"discord-social","argus-discord-social.exe"):(process.env.ARGUS_DISCORD_HELPER||path.join(__dirname,"discord-runtime","argus-discord-social.exe")),
    onChange:state=>{if(alive()&&trustedDiscordFrame(win.webContents,win.webContents.mainFrame))sendUI("discord-social",state)}});
  discordSocial.restore();
}
for(const [channel,method] of [["state","snapshot"],["connect","connect"],["cancel","cancel"],["disconnect","disconnect"]])ipcMain.handle("discord-social-"+channel,async event=>{
  if(!trustedDiscordFrame(event.sender,event.senderFrame))return null;
  return discordSocial?await discordSocial[method]():{available:false,status:"disconnected",account:null,friends:[],error:"runtime-unavailable"};
});
// Unerwartete Fehler ins Log schreiben statt den Nutzer mit einem Fehlerfenster zu stören
function logError(e) {
  try { fs.appendFileSync(path.join(app.getPath("userData"), process.env.ARGUS_OLD_DATA ? "jarvis-error.log" : "argus-error.log"), `${new Date().toISOString()} ${e?.stack || e}\n`); } catch {}
}
const crash = require("./crash");
// Fehlerberichte (siehe crash.js): bleiben lokal, bis der Nutzer selbst einen Bericht sendet. Geheimnisse werden vorher entfernt.
crash.init(app.getPath("userData"), path.join(app.getPath("userData"), process.env.ARGUS_OLD_DATA ? "jarvis-error.log" : "argus-error.log"), () => {
  if (typeof config === "undefined" || !config) return [];
  return [config.iobPass, config.iobUser, config.iobUrl, config.steamKey, config.dcBotToken, config.anthropicApiKey, config.aiKey, config.foremanKey, config.steamId, ...(config.foremanAccounts || []).flatMap((a) => [a?.key, a?.client]),
    ...String(config.mineAddr || "").split(/[\s,;=:]+/).filter((w) => w.length > 20)];
});
process.on("uncaughtException", (e) => { logError(e); crash.add("Fehler im Hauptprozess", e?.message || String(e), e?.stack || ""); });

// ---------- Einstellungen ----------
const CONFIG_PATH = path.join(app.getPath("userData"), process.env.ARGUS_OLD_DATA ? "jarvis-config.json" : "argus-config.json"); // Umzug siehe boot.js
// Grafik-Kompatibilität (Option): ohne Grafikkarten-Beschleunigung, gegen Durchflackern des Desktops bei manchen Treibern.
// Muss vor dem Start feststehen, darum direkt aus der Datei gelesen
try { if (JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")).gfxSafe === true) app.disableHardwareAcceleration(); } catch {}
const DEFAULTS = {
  gfxSafe: false,
  uiMode: "klassisch", uiReduceTransparency: false, // Oberfläche: Apple-Modus nur nach ausdrücklichem Wechsel (app/ui-mode.js)
  anthropicApiKey: "",
  aiProv: "openai", aiBase: "", aiModel: "", aiKey: "", // weitere KIs (ChatGPT, Gemini, Mistral, Groq, OpenRouter, eigener Server) über die OpenAI-kompatible Schnittstelle
  claudeModel: "claude-opus-5-5",
  effort: "low",
  ollamaUrl: "http://127.0.0.1:11434",
  ollamaModel: "",
  backend: "auto", // auto = Claude über dein Abo (Claude Code), sonst lokale KI, sonst Claude per API-Key, sonst Demo
  gpuUse: "voll", // Grafikkarte für die lokale KI: voll, sparsam, aus
  claudeCodeModel: "sonnet", // Modell für Claude Code: sonnet (schnell) oder opus (gründlicher)
  corner: "bottom-right",
  size: 320,
  labelScale: 1, // Größe der Aktivitäts-Beschriftungen
  ballScale: 1,  // Größe der Kugel im aufgeklappten Panel
  themeHue: 205,       // Grundfarbe (Farbton 0–360)
  themeRegions: "bunt", // "bunt" oder "thema" (alle Hirnregionen in der Grundfarbe)
  voiceEngine: "jarvis", voiceFallback: "retry", donateUrl: "", lang: "de", portalOn: false, portalUrl: "", fmDashOn: false, iobOn: false, iobUrl: "", iobUser: "", iobPass: "", iobPick: [], iobWrite: false, iobAll: true, voiceId: "thorsten-high", voiceRobot: false, voiceServer: "", voiceServerModel: "", voiceServerVoice: "", briefOn: false, briefTime: "08:00", briefLen: "short", briefParts: { weather: true, btc: true, mining: true, update: true, headlines: true }, briefLast: "", customPages: [], autoFit: true, tradeOn: true, tradeCur: "usd", tradeEvery: 60, tradeStock: "yahoo", tradeFng: true, tradeDom: true, tradeHalv: true, tradeWatch: null, tradePort: [], finnhubKey: "", design: "klassisch", designSet: true, designBlk: true, designType: true, designBtn: "", // "jarvis" (Piper) oder "windows"
  panelW: 0, panelH: 0, // Größe des aufgeklappten Panels (0 = automatisch)
  panelBox: null,
  hiddenApps: [], // Programme, deren Symbol nicht an der Kugel erscheinen soll
  opacity: { ball: 1, labels: 1, badges: 1, apps: 1, ai: 1, panel: 1, news: 1 }, // Transparenz je Bereich        // selbst gezogene Lage und Größe des Panels
  // Anzeigen über der Kugel: an/aus und Farbe (Farbton 0–359, -1 = automatisch)
  widgets: { ai: { on: true }, aiClaude: { on: true }, aiLocal: { on: true }, strata: { on: true }, cpuTemp: { on: true, hue: -1 }, gpuTemp: { on: true, hue: -1 }, cpuClock: { on: true, hue: -1 }, gpuClock: { on: true, hue: -1 }, fans: { on: true, hue: -1 }, btc: { on: true, hue: -1 }, weather: { on: true, hue: -1 }, steam: { on: false, hue: -1 }, discord: { on: false, hue: -1 }, apps: { on: true }, friends: { on: true } },
  tempScale: 1,  // Größe der Temperatur-Anzeigen
  appScale: 1,   // Größe der Programm-Symbole
  systemWatch: true,
  systemAlertsVoice: false,
  autostart: false,
  voiceOutput: true,
  micOnStart: true,
  wakeWords: ["hallo claude", "hey claude", "hallo argus"],
  memoryOn: true,          // Gespräche im Gedächtnisordner speichern und bei Antworten nutzen
  claudeDesktopLink: true, // Gedächtnis und Dateisuche auch in der Claude-Desktop-App anbieten
  newsOn: true,            // Lagebild-Fenster mit Kurs, News und Auffälligkeiten
  newsCats: { btc: true, alerts: true, krypto: true, tech: true },
  newsOnTop: false,
  newsBox: null,           // Lage und Größe des Lagebild-Fensters
  newsDock: null,          // am Panel angedockt: { side, off }
  dockFx: true,            // Tropfen-Effekt beim An- und Abdocken
  btcCur: "USD",
  viz: { cores: true, heat: true, rings: false, apps: true }, pins: {}, micFloat: true, // Auslastung in der Kugel: Kerne als Neuronen, Glut nach Temperatur, Ringe für CPU/GPU/RAM
  taskbarOn: false, taskbarShow: "nie", hiddenFans: [], afterHide: "mini", miniPos: null, taskbarFront: false, btnShape: "kapsel", btnLook: "standard", btnTiltX: 0, btnTiltY: 0, btnTiltFollow: false, btnTiltK: 24, gaugeTiltX: 0, gaugeTiltY: 0, twAlpha: 100, twFeather: 0, twRound: 14, twVideoOnly: false, twOnTop: false, twMode: "panel", twEmbedSize: "m", twBox: null, twLast: null, twOpen: "", palette: "", loadShimmer: true, ytAlpha: 100, ytFeather: 0, ytRound: 14, flashK: 1, flashT: 0.5, onTop: "kugel",   // Vordergrund: "immer", "kugel" (nur die kleine Kugel, Panel wie ein normales Fenster), "nie"
  wakeFront: true,  // bei "Hallo Claude" oder einer Antwort kurz nach vorn holen
  autoOpen: true,   // Panel bei Fragen automatisch aufklappen
  steamOn: true, steamKey: "", steamId: "",   // Steam-Freunde: eigener Web-API-Schlüssel und Profil
  userName: "", userInfo: "", setupDone: false, crashReport: true, mirrorQ: 1280, procKill: true, quickOn: false, quickItems: [], quickSize: 44, quickLabels: true, mirrorOn: false, mirrorMatch: "discord", mirrorFps: 15, ballLabels: "aktiv", bgShoot: 1, micId: "", spkId: "", friendsSplit: false, friendsHold: 3, // Wer Argus benutzt (Anrede, ein Satz über sich für die KI); setupDone: Einrichtung beim ersten Start erledigt
  discordOn: true, discordServers: "", // Discord: Server-IDs mit eingeschaltetem Widget
  discordVoiceOnly: true,  // Discord: nur Leute im Sprachkanal zeigen
  dcOnlyMarked: false,  // Discord: nur selbst markierte Personen zeigen (Discord gibt die eigene Freundesliste nicht heraus)
  dcMarked: [],
  discordAlsoOnline: false,  // zusätzlich Leute zeigen, die nur online sind (kein Sprachkanal)
  holeOn: false, holeCorner: "br", holeW: 360, holeH: 260, holeRound: 16, holeRadii: null, holeX: null, holeY: null, holeEdit: false, menuAlpha: 96, // Aussparung in einer Ecke, damit Discord-Popup und Co. nicht überdeckt werden
  friendsStill: true, // Freundeslisten starr (kein leichtes Schweben)
  notesPages: null, notesCur: "", // Notiz-Seiten [{id,name,folder,text}], aktuelle Seite
  miningOn: true, // Mining-Rubrik (Blöcke, Seite, Einstellungen, Abfragen) insgesamt ein/aus
  dcJoinBot: true, // „Beitreten“ in der Freundesliste verschiebt per Bot, statt Discord zu öffnen
  discordAuto: true, discordUser: "", // Name automatisch aus der angemeldeten Discord-App lesen
  discordName: "",  // eigener Name auf den Servern, damit Argus erkennt, in welchem Sprachkanal man sitzt
  strataOn: false, strataDir: "", strataArgs: "--no-browser", strataUrl: "", // Strata (große lokale KI) per Knopf; Ordner leer = automatisch suchen
  foremanOn: false, fmEvOn: true, fmView: "blaettern", look3d: false, foremanClient: "", foremanKey: "", foremanAccounts: [], foremanPx: {}, // Farm-Daten aus Foreman, mehrere Konten [{name, client, key}] (Schlüssel nur lokal)
  strataIdleMin: 20, // Strata nach so vielen Minuten ohne Frage beenden (0 = nie)
  aiShare: "ausgewogen", strataWake: true, barMode: "normal", fpsIdle: 15, fpsMax: 60, reportOn: true, reportHour: 8, reportKeep: 14, reportShown: "", reportNotify: true, claudeAsk: true, oceanNotify: true, payoutNotify: true, notifyPanel: true, notifyWin: true, notifySound: true, pages: {}, page: "Start", liteMode: "auto", ollamaOff: false, ollamaOffChecked: 0, pagesOn: true, mineOrb: true, pageFriends: false, mineView: "kacheln", mOverInit: false, mFxInit: false, mineFx: {}, oceanInTotal: true, profLast: "", layoutProfiles: {}, // gespeicherte Anordnungen („Arbeit“, „Zocken“ …)
  wxPlaces: "", // weitere Wetterorte, einer pro Zeile (höchstens 3)
  hiddenBlocks: [], // im Panel ausgeblendete Fenster (Anordnen-Modus ×)
  weatherOn: true, // Wetter am Standort des Laptops (Windows-Ortung, sonst Internet-Anschluss)
  mineOn: false, mineAddr: "", // Mining-Block: OCEAN-Auszahlungsadresse (öffentlich, nur lesen) und Bitcoin-Netz
  clocksOn: true, clocks: [], // Weltuhren; die eigene Ortszeit steht immer vorn
  gamingOn: true, ballOn: true, statusOn: true, miniMore: false, look3dK: 35, uiFont: "", uiScale: 100, structK: 100, edgeK: 3, nodeK: 100, gameMode: false, snapGuides: true, // gameMode: Animationen pausieren, solange ein Programm im Vollbild läuft; snapGuides: Ausrichtlinien beim Ziehen
  dcBotToken: "", dcIcons: true, steamDl: true, mediaOn: true, mediaBrowser: false, cpuHotC: 100, gpuHotC: 88, warnDiskGB: 10, warnRamPct: 92, warnCpuPct: 90, warnInet: true, fmNotify: true, fmMinerUrl: "https://dashboard.foreman.mn/dashboard/miners/{id}/details/", aiLogOn: false, // mediaOn: „Läuft gerade“-Anzeige // steamDl: Steam-Downloads in der Systemwache zeigen
  sysBox: { w: 0, h: 0, align: "l" }, pillOff: null, ballOff: { x: 0, y: 0 }, panelLayout: null, // ballOff/panelLayout: Anordnung im Panel // pillOff: Verschiebung/Größe der Status-Anzeige (klein/Panel) // Größe der Systemwache im Panel (0 = automatisch)          // eigener Discord-Bot (nur lokal gespeichert): Kamera, Stream, Stumm, private Kanäle
  extraVoice: [],          // private Sprachkanäle {name, g, c}, die das Widget nicht zeigt
  voiceOverlay: false, overlayCorner: "oben-links", overlayMode: "streamkit", // streamkit = zeigt, wer spricht; einfach = eigene Liste // kleines Overlay mit den Leuten im eigenen Sprachkanal
  coins: ["BTC"], // Kurse neben der Kugel und im Lagebild
  bgFx: { mode: "partikel", amount: 1 }, // Hintergrund im Panel: aus, partikel, sterne, wetter
  winColor: { h: 219, s: 54, l: 5, follow: false }, // Farbe des Fensters um die Kugel (Panel, Einstellungen, Freundesliste)
  friendsBox: { w: 180, h: 0, scale: 1 },            // Breite, Höhe (0 = automatisch) und Schriftgröße der Freundesliste
  shape: "kugel", shapeRand: 0, pulseStyle: "punkte", nodeStyle: "punkt", aura: "aus", breath: false, shape2d: false, shapeRim: true, glow: 1, scales: {}, // Form der Visualisierung, Rand, Glühen, Größe einzelner Anzeigen
  friendsFold: {},   // eingeklappte Bereiche der Freundesliste
  ytAdblock: false,   // zusätzlich Werbelisten (Ghostery), aus: verursachte schwarzes Bild
  winStyle: {},       // Stil je Fenster: { id: { a: Deckkraft %, wt: weiße Schrift, font, dots, bars } }
  looks: {},          // Design je Fenster: { clocks, wx, notes, sys } → Variante (leer = Standard)
  ytZoom: 0,          // Seitenzoom im YouTube-Fenster (Strg + Mausrad), Zoomstufe wie im Browser
  ytNoAds: true, // legacy filter intent; migrated to the integrated network filter
  sensors: true,     // eigene Temperaturmessung (LibreHardwareMonitorLib + PawnIO-Treiber)
  sensorsAsked: false,
  updateUrl: "",     // Adresse, unter der neue Versionen liegen (latest.yml)
  updateChannel: "stabil", // stabil: nur freigegebene Versionen (Zweig „stable“), test: jeder neue Bau (Zweig „updates“)
  sway: "schweben",                                  // Anzeigen: schweben, leicht, fest
  notesOn: false, notesText: "", venomRoam: false, spin: 1, density: 1, skin: "", ytBox: null, ytLast: null, ytOpen: "", ytVideoOnly: true, ytVo2: false, ytOnTop: false, ytMode: "panel", ytEmbedSize: "m", // YouTube im Panel eingebettet oder als eigenes Fenster                       // YouTube-Fenster
};
let config = { ...DEFAULTS };
function loadConfig() {
  let had = false, raw = {};
  try { raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); config = { ...DEFAULTS, ...raw }; openSecrets(config); had = true; }
  catch { config = { ...DEFAULTS }; }
  // 0.27: Argus für mehrere Nutzer. Wer schon eine Installation von vor 0.27 hat, ist der bisherige einzige Nutzer:
  // Einrichtung gilt als erledigt, Anrede und Beschreibung bleiben wie bisher (früher fest im Code)
  if (had && config.multiUser !== 1) {
    config.setupDone = true; config.multiUser = 1;
    if (!("mineOn" in raw)) config.mineOn = true; // bisherige Vorgaben behalten
    if (!("clocks" in raw)) config.clocks = [{ n: "Deutschland", tz: "Europe/Berlin" }];
  }
  if (!had) config.multiUser = 1;
  if (config.holeFollow) { config.holeFollow = false; config.holeOn = false; } // 0.52.0: „folgt dem Programm“ entfernt, nur noch die feste Aussparung
  delete config.holeFollow; delete config.holeApps; delete config.holeLast;
  if (!config.taskbarShowMig) { config.taskbarShow = config.taskbarOn ? "verdeckt" : "nie"; config.taskbarShowMig = 1; }
  if (had && config.twVoMig !== 1) { config.twVideoOnly = false; config.twVoMig = 1; } // 0.49.4: Twitch zeigt Kopfzeile und Rahmen, „Nur Video“ per ▣ einschalten
  config.widgets = mergeWidgets(config.widgets);
  if (!Array.isArray(config.foremanAccounts)) config.foremanAccounts = [];
  // 0.33.2: Update-Kanäle. des Nutzers bestehende Installation bleibt auf „test“ (bekommt jeden Bau), alle anderen auf „stabil“
  if (had && !("miningOn" in raw)) config.miningOn = !!(String(config.mineAddr || "").trim() || (config.foremanAccounts || []).length || config.foremanKey); // 0.35: Mining-Rubrik nur, wo schon ein Mining-Konto eingetragen ist (kein Mining-Popup mehr bei Leuten ohne Mining)
  if (had && !("updateChannel" in raw)) config.updateChannel = "stabil";
  if (/d0mm392\/jarvis\/updates/i.test(config.updateUrl || "")) config.updateUrl = ""; // 0.30: alte Repo-Adresse als eigene Update-Adresse → Standard (Argus, alt als Rückfall)
  if (!config.ytVo2) { config.ytVideoOnly = true; config.ytVo2 = true; } // 0.29.3: „Nur Video“ ist Standard (Nutzerwunsch: nur das Video sehen)
  if (!config.foremanAccounts.length && config.foremanClient && config.foremanKey) config.foremanAccounts = [{ name: "Farm 1", client: config.foremanClient, key: config.foremanKey }]; // Einzelkonto aus 0.28.1 übernehmen
  // 0.17: Ringe standardmäßig aus, auch für bestehende Einstellungen (einmalig, danach entscheidet der Nutzer selbst)
  if (config.vizRingsOff !== 1) { config.viz = { ...DEFAULTS.viz, ...(config.viz || {}), rings: false }; config.vizRingsOff = 1; }
  if (!config.pins || typeof config.pins !== "object") config.pins = {};
  // 0.19: schwebende Steam-/Discord-Anzeigen standardmäßig aus (Nutzerwunsch: überflüssig neben der Freundesliste)
  if (config.socialBadgesOff !== 1) { config.widgets.steam = { ...config.widgets.steam, on: false }; config.widgets.discord = { ...config.widgets.discord, on: false }; config.socialBadgesOff = 1; }
  // 0.58.17: Ruhe-Bildrate von 30 auf 15 (Nutzer: CPU im Leerlauf zu hoch, die Kugel-Animation belegte rund einen Kern); wer einen anderen Wert gewählt hat, behält ihn
  if (!config.fpsIdleMig) { if (config.fpsIdle === 30) config.fpsIdle = 15; config.fpsIdleMig = 1; }
  // 0.24.3: Sprachkanal-Overlay standardmäßig aus (Nutzerwunsch: unerwünscht, die Freundesliste zeigt den Kanal schon)
  if (config.overlayOff !== 1) { config.voiceOverlay = false; config.overlayOff = 1; }
  // 0.24.8: Lagebild liegt nicht mehr über allen Programmen, sondern kommt mit Argus nach vorn (Nutzerwunsch)
  if (config.newsTopOff !== 1) { config.newsOnTop = false; config.newsTopOff = 1; }
  // 0.24.8: YouTube zeigte mit Werbeblocker nur ein schwarzes Bild (YouTube sperrt den Player bei erkannten Blockern) → aus, in den Einstellungen wieder einschaltbar
  if (config.ytAbOff !== 1) { config.ytAdblock = false; config.ytAbOff = 1; }
  if (!Array.isArray(config.extraVoice)) config.extraVoice = [];
  config.holeEdit = false; // Platzieren der Aussparung nie über einen Neustart hinweg aktiv lassen
  if (!Array.isArray(config.notesPages) || !config.notesPages.length) { // Notizen aus der Sicherungskopie zurückholen, falls die Einstellungen sie nicht mehr haben
    try { const b = JSON.parse(fs.readFileSync(path.join(path.dirname(CONFIG_PATH), "notizen-backup.json"), "utf8")); if (Array.isArray(b.notesPages) && b.notesPages.length) { config.notesPages = b.notesPages; config.notesCur = b.notesCur || ""; } } catch {}
  }
  if (!config.notesByPage) {
    try { const backup = JSON.parse(fs.readFileSync(path.join(path.dirname(CONFIG_PATH), "notizen-seiten-backup.json"), "utf8"));
      if (backup.notesByPage && backup.pageIds) Object.assign(config, backup);
    } catch {}
  }
  Object.assign(config, require("./app/notes-store").migrate(config, () => require("crypto").randomUUID()));
  Object.assign(config, require("./app/youtube-settings").migrate(config));
  Object.assign(config, require("./app/appearance").migrate(config));
  memory.setUser?.(config.userName);
  saveConfig();
}
function mergeWidgets(w) {
  const out = {};
  for (const [k, d] of Object.entries(DEFAULTS.widgets)) out[k] = { ...d, ...(w && typeof w[k] === "object" ? w[k] : {}) };
  return out;
}
// Zugangsdaten (API-Keys, Bot-Token, Foreman-Schlüssel) liegen verschlüsselt in der Konfigurationsdatei: Windows-Verschlüsselung (DPAPI),
// an das Windows-Konto gebunden. Im Speicher stehen sie im Klartext, auf der Platte nur als „enc1:…“. Nichts davon verlässt den PC.
const ENC = "enc1:", SEALED = ["iobPass", "steamKey", "dcBotToken", "anthropicApiKey", "aiKey", "foremanKey", "finnhubKey"];
const canSeal = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };
const seal = (v) => (typeof v === "string" && v && !v.startsWith(ENC) && canSeal() ? ENC + safeStorage.encryptString(v).toString("base64") : v);
const unseal = (v) => { if (typeof v !== "string" || !v.startsWith(ENC)) return v; try { return safeStorage.decryptString(Buffer.from(v.slice(ENC.length), "base64")); } catch { return ""; } };
function openSecrets(c) {
  for (const k of SEALED) if (c[k]) c[k] = unseal(c[k]);
  if (Array.isArray(c.foremanAccounts)) c.foremanAccounts = c.foremanAccounts.map((a) => (a && a.key ? { ...a, key: unseal(a.key) } : a));
}
// Speichern gebündelt: Verschieben, Regler und Größenänderung lösen sonst bei jedem Ereignis ein
// synchrones Schreiben samt Verschlüsselung der Schlüssel aus und lassen das Fenster ruckeln
let cfgTimer = null;
function writeConfigNow() {
  clearTimeout(cfgTimer); cfgTimer = null;
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  const out = { ...config };
  for (const k of SEALED) if (out[k]) out[k] = seal(out[k]);
  if (Array.isArray(out.foremanAccounts)) out.foremanAccounts = out.foremanAccounts.map((a) => (a && a.key ? { ...a, key: seal(a.key) } : a));
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(out, null, 2));
}
function saveConfig() { if (cfgTimer) return; cfgTimer = setTimeout(() => { try { writeConfigNow(); } catch {} }, 300); }
{ const realExit = app.exit.bind(app); app.exit = (c) => { try { if (cfgTimer) writeConfigNow(); } catch {} realExit(c); }; }

// Anrede des Nutzers aus der Einrichtung; ohne Namen neutral
const userName = () => String(config.userName || "").trim().slice(0, 40);
const rules = (name) => {
  const u = userName() || "der Nutzer", U = userName() || "Der Nutzer";
  return `Du bist ${name}, der Sprachassistent in der Argus-Desktop-App${userName() ? " von " + userName() : ""}. ` +
  (config.userInfo ? `Über ${u}: ${String(config.userInfo).trim().slice(0, 500)} ` : "") +
  "Antworte auf Deutsch in der du-Form, direkt und ehrlich, in höchstens vier kurzen Sätzen, weil die Antwort vorgelesen wird. " +
  "Kein Markdown, keine Listen, keine Emojis. Die Antwort ist zeitkritisch: beginne sofort mit der sichtbaren Antwort. " +
  "Wenn du etwas nicht sicher weißt, sag das, statt zu raten. " +
  "Die Selbstverbesserung von Argus ist in dieser Version aus Sicherheitsgründen abgeschaltet. Biete sie nicht an, erkläre ihre Befehle nicht und behaupte nie, Code geändert zu haben. " +
  "Argus hat ein Gedächtnis: Alle Gespräche werden gespeichert, und \"Merk dir: …\" speichert eine Notiz. Steht unten ein Abschnitt Gedächtnis, ist das echt gespeichert und du darfst dich darauf beziehen. Erfinde nie frühere Gespräche. " +
  `Fragt ${u} nach dem Gedächtnis, erkläre den Befehl "Merk dir: …", statt zu sagen, dass das nicht geht. Argus kann außerdem Programme, Webseiten und Ordner öffnen ("Öffne Brave"). ` +
  "Du selbst kannst nichts starten, ausführen oder an Claude Code weitergeben. Behaupte nie, dass du etwas startest, versuchst oder durchführst. " +
  "Dateien und Ordner auf dem PC sucht Argus selbst, nicht du: Sagt der Nutzer etwas wie \"Such den Ordner Diablo\" oder \"Öffne ihn\", passiert das ohne dich. Landet so etwas trotzdem bei dir, hat Argus nichts gefunden oder den Satz nicht verstanden: Sag das ehrlich und schlag vor: \"Such Diablo\" oder \"Such Diablo in D\". Sag nie \"Bitte einen Moment\" und kündige nie eine Suche an, die du nicht selbst ausführst.";
};

// Systemprompt plus aktueller Zustand des PCs, damit Fragen wie "Läuft alles?" beantwortbar sind
// Wer gerade antwortet: sonst erfindet das Modell bei „Bist du Strata?“ eine falsche Geschichte (Nutzerwunsch, 20.10.)
function engineNote(kind) {
  const team = "Argus arbeitet im Team: schwere Fragen beantwortet Claude (über das Abo des Nutzers), kurze die lokale KI. Lokale KI ist Strata, ein großes Sprachmodell (Qwen3.8-Flash-Next), das auf diesem PC läuft (127.0.0.1:8080), sofern es eingeschaltet ist; Ollama wird nicht mehr genutzt.";
  if (kind === "strata") return `\n\nTechnik (wahr, nicht abweichen): Du bist Argus, und diese Antwort erzeugt gerade Strata, also das lokale Sprachmodell (${strata.snapshot().model || "Qwen3.8-Flash-Next"}) auf diesem PC. Fragt der Nutzer, ob Strata da ist oder ob du Strata nutzt: Ja, er spricht gerade mit Strata. ${team} Erfinde keine weiteren technischen Details.`;
  if (String(kind).startsWith("ext:")) return `\n\nTechnik (wahr): Du bist Argus, diese Antwort kommt von ${kind.slice(4)} (externe KI über den Zugang des Nutzers). ${team}`;
  if (kind === "ollama") return `\n\nTechnik (wahr): Du bist Argus, diese Antwort kommt von der kleinen lokalen KI (Ollama) auf diesem PC. ${team}`;
  return `\n\nTechnik (wahr): Du bist Argus, diese Antwort kommt von Claude. ${team} Strata ist ${strata.running() ? "gerade eingeschaltet" : "gerade aus"}.`;
}
function systemPrompt(name = "Claude", question = "", kind = "") {
  let RULES = rules(name);
  if (config.memoryOn !== false) try { RULES += memory.contextFor(question); } catch (e) { logError(e); }
  if (/steam|discord|online|zockt|spielt|freunde/i.test(question || "")) RULES += socialSummary();
  if (/wetter|regen|schnee|sonne|temperatur|grad|draußen|draussen|kalt|warm|wind|gewitter|schirm|jacke/i.test(question || "")) RULES += weatherSummary();
  if (/bitcoin|btc|kurs|krypto|news|nachricht|neuigkeit|difficulty|hashrate|hashprice|mining|miner|pool|ocean|worker|geb(ü|ue)hr|markt|fear|greed/i.test(question || "")) RULES += marketSummary();
  RULES += engineNote(kind || (name === "Claude" ? "claude" : ""));
  const snap = watch?.data.ts ? watch.summary() : "";
  return snap ? RULES + "\n\nLive gemessener Zustand dieses Windows-PCs (nur nutzen, wenn danach gefragt wird oder etwas kritisch ist):\n" + snap : RULES;
}

// ---------- Lokaler Webserver für die Oberfläche und das Sprachmodell ----------
const APP_DIR = path.join(__dirname, "app");
const VOSK_JS = path.join(__dirname, "node_modules", "vosk-browser", "dist", "vosk.js");
const MODEL_DIR = path.join(app.getPath("userData"), "voice");
const MODEL_TGZ = path.join(MODEL_DIR, "model.tar.gz");
const MODEL_ZIP_URL = process.env.JARVIS_MODEL_URL || "https://alphacephei.com/vosk/models/vosk-model-small-de-0.15.zip";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".gz": "application/gzip" };

// ---------- Werkzeuge, die Claude Code über argus-mcp.js aufrufen kann ----------
let serverPort = 0;
const TOOL_TOKEN = require("crypto").randomBytes(24).toString("hex"); // nur Claude Code (von Argus gestartet) kennt den Schlüssel
function handleTool(req, res, name) {
  const reply = (code, text) => { res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" }); res.end(text); };
  if (req.method !== "POST" || req.headers["x-jarvis-token"] !== TOOL_TOKEN) return reply(403, "verboten");
  let body = "";
  req.on("data", (c) => { body += c; if (body.length > 200000) req.destroy(); });
  req.on("end", async () => {
    let a = {}; try { a = JSON.parse(body || "{}"); } catch {}
    try {
      if (name === "lokale_ki") {
        const local = await localPick();
        if (!local) return reply(503, "Die lokale KI ist gerade nicht bereit.");
        sendUI("ai-who", { who: "local", label: (local.kind === "strata" ? "Strata" : "Lokale KI") + " hilft Claude" });
        if (local.kind === "strata") {
          try { const t = await strata.ask("Du bist Strata, die lokale KI auf diesem PC, und hilfst Claude. Antworte knapp und sachlich auf Deutsch.", [{ role: "user", content: String(a.prompt || "") }], () => {}); return reply(200, t || ""); }
          catch (e) { return reply(502, e?.message || "Strata antwortet nicht"); } finally { sendUI("ai-who", { who: "claude", label: "Claude" }); }
        }
        const r = await fetch(config.ollamaUrl + "/api/generate", { method: "POST", body: JSON.stringify({ model: local.model, prompt: String(a.prompt || ""), stream: false, ...gpuOpts({ num_ctx: 8192, temperature: 0.4 }) }) });
        sendUI("ai-who", { who: "claude", label: "Claude" });
        if (!r.ok) return reply(502, "Ollama antwortet mit " + r.status);
        return reply(200, (await r.json()).response || "");
      }
      if (name === "systemstatus") {
        const d = watch?.data || {};
        const extra = [d.cpuGHz && `CPU-Takt ${d.cpuGHz} GHz`, d.gpuGHz && `GPU-Takt ${d.gpuGHz} GHz`, d.fans?.length && "Lüfter: " + d.fans.map((f) => `${f.name} ${f.val} ${f.unit}`).join(", "),
          d.apps?.length && "Laufende Programme: " + d.apps.map((x) => x.name).join(", ")].filter(Boolean);
        return reply(200, (watch ? watch.summary() : "Systemwache aus") + (extra.length ? "\n- " + extra.join("\n- ") : ""));
      }
      if (name === "oeffnen") return reply(200, (await actions.run(String(a.befehl || ""))) || "Das habe ich nicht als Befehl erkannt.");
      reply(404, "Unbekanntes Werkzeug");
    } catch (e) { reply(500, "Fehler: " + (e.message || e)); }
  });
}
// MCP-Konfiguration für Claude Code: startet argus-mcp.js mit Argus.exe als reinem Node, ohne Fenster
function mcpConfigFile(dir) {
  const f = path.join(dir, "argus-mcp.json");
  fs.writeFileSync(f, JSON.stringify({ mcpServers: { argus: { command: process.execPath, args: [path.join(__dirname, "argus-mcp.js")],
    env: { ELECTRON_RUN_AS_NODE: "1", JARVIS_PORT: String(serverPort), JARVIS_TOKEN: TOOL_TOKEN, JARVIS_INDEX: process.env.JARVIS_INDEX, JARVIS_MEMORY: memory.DIR(), ARGUS_USERDATA: process.env.ARGUS_USERDATA } } } }));
  return f;
}
const JARVIS_TOOLS = ["lokale_ki", "strata_fragen", "systemstatus", "oeffnen", "gedaechtnis_suchen", "gedaechtnis_verlauf", "gedaechtnis_merken", "dateien_suchen", "datei_lesen"].map((t) => "mcp__argus__" + t).join(",");

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let url; try { url = decodeURIComponent(req.url.split("?")[0]); } catch { res.writeHead(400); return res.end(); }
      if (url.startsWith("/api/tool/")) return handleTool(req, res, url.slice(10));
      let file;
      if (url === "/" || url === "/index.html") file = path.join(APP_DIR, "index.html");
      else if (url === "/vosk.js") file = VOSK_JS;
      else if (url === "/model.tar.gz") file = MODEL_TGZ;
      else file = path.join(APP_DIR, path.normalize(url).replace(/^([\\/])+/, ""));
      if (!file.startsWith(APP_DIR) && file !== VOSK_JS && file !== MODEL_TGZ) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end(); }
        if (file === path.join(APP_DIR, "index.html")) data = Buffer.from(uiMode.markHtml(data.toString("utf8"), uiStart.mode)); // Oberfläche vor dem ersten Zeichnen
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve((serverPort = server.address().port)));
  });
}

// Sprachmodell (Vosk, Deutsch, ca. 45 MB) einmalig laden und als tar.gz ablegen
let voiceState = { ready: false, text: "Prüfe Sprachmodell…" };
function setVoice(state) { voiceState = state; sendUI("voice-status", state); }
async function ensureVoiceModel() {
  if (fs.existsSync(MODEL_TGZ)) return setVoice({ ready: true, text: "Sprachmodell bereit" });
  try {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
    setVoice({ ready: false, text: "Lade Sprachmodell (einmalig, ca. 45 MB)…" });
    const res = await fetch(MODEL_ZIP_URL);
    if (!res.ok) throw new Error("Download fehlgeschlagen: " + res.status);
    const total = Number(res.headers.get("content-length")) || 0;
    const chunks = []; let got = 0, lastPct = -1;
    for await (const chunk of res.body) {
      chunks.push(chunk); got += chunk.length;
      const pct = total ? Math.floor((got / total) * 100) : 0;
      if (pct !== lastPct && pct % 5 === 0) { lastPct = pct; setVoice({ ready: false, text: `Lade Sprachmodell… ${pct}%` }); }
    }
    setVoice({ ready: false, text: "Entpacke Sprachmodell…" });
    const AdmZip = require("adm-zip");
    const tar = require("tar");
    const staging = path.join(MODEL_DIR, "staging");
    fs.rmSync(staging, { recursive: true, force: true });
    new AdmZip(Buffer.concat(chunks)).extractAllTo(staging, true);
    const inner = fs.readdirSync(staging).find((d) => fs.statSync(path.join(staging, d)).isDirectory());
    fs.renameSync(path.join(staging, inner), path.join(staging, "model"));
    await tar.c({ gzip: true, file: MODEL_TGZ + ".part", cwd: staging, portable: true }, ["model"]);
    fs.renameSync(MODEL_TGZ + ".part", MODEL_TGZ);
    fs.rmSync(staging, { recursive: true, force: true });
    setVoice({ ready: true, text: "Sprachmodell bereit" });
  } catch (e) {
    setVoice({ ready: false, error: true, text: "Sprachmodell nicht geladen: " + e.message });
  }
}

// ---------- KI-Anbindung ----------
async function ollamaModels() {
  try {
    const res = await fetch(config.ollamaUrl + "/api/tags", { signal: AbortSignal.timeout(1500) });
    const data = await res.json();
    return (data.models || []).map((m) => m.name);
  } catch { return []; }
}
// ---------- Claude über des Nutzers Abo: ruft die Claude-Code-Kommandozeile auf, kein API-Key, keine Extrakosten ----------
let ccPath, ccBlockedUntil = 0, ccWhy = "";
function findClaudeCode() {
  if (ccPath !== undefined) return ccPath;
  const home = os.homedir(), appData = process.env.APPDATA || "", exts = process.platform === "win32" ? [".exe", ".cmd"] : [""];
  const cands = [path.join(home, ".local", "bin", "claude"), path.join(appData, "npm", "claude"), path.join(home, ".claude", "local", "claude")];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) if (dir) cands.push(path.join(dir, "claude"));
  for (const c of cands) for (const e of exts) if (fs.existsSync(c + e)) return (ccPath = c + e);
  return (ccPath = null);
}
const ccUsable = () => !!findClaudeCode() && Date.now() > ccBlockedUntil;
function askClaudeCode(messages, onText) {
  return new Promise((resolve, reject) => {
    const exe = findClaudeCode();
    const env = { ...process.env }; delete env.ANTHROPIC_API_KEY; // sonst rechnet Claude Code über den API-Key ab statt über das Abo
    const work = path.join(app.getPath("userData"), "claude-work"); fs.mkdirSync(work, { recursive: true });
    const args = ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--model", config.claudeCodeModel || "sonnet",
      "--mcp-config", mcpConfigFile(work), "--allowedTools", JARVIS_TOOLS];
    const viaShell = /\.cmd$/i.test(exe); // npm-Installation: claude.cmd braucht die Shell, Pfad in Anführungszeichen wegen Leerzeichen
    const p = spawn(viaShell ? `"${exe}"` : exe, args, { cwd: work, env, windowsHide: true, shell: viaShell });
    const history = messages.slice(0, -1).slice(-8).map((m) => (m.role === "user" ? (userName() || "Nutzer") + ": " : "Du: ") + m.content).join("\n");
    const last = messages[messages.length - 1]?.content || "";
    p.stdin.end(systemPrompt("Argus", last, "claude") + "\n\nDu hast Werkzeuge von Argus: lokale_ki (die lokale KI auf diesem PC, für zweite Meinungen, Zusammenfassungen, Entwürfe und private Daten), " +
      "systemstatus (aktuelle Messwerte des PCs), oeffnen (Programme, Webseiten, Ordner, Dateien öffnen), gedaechtnis_suchen und gedaechtnis_verlauf (alle früheren Gespräche), gedaechtnis_merken, " +
      "dateien_suchen (Dateien auf allen Laufwerken nach Namen oder Inhalt) und datei_lesen (Textdateien lesen, Ordner auflisten). Du kannst Dateien nur finden, lesen und öffnen, nicht ändern oder löschen. Nutze sie, wenn sie die Antwort besser machen, sonst antworte direkt. Andere Werkzeuge nicht verwenden." +
      (history ? "\n\nBisheriges Gespräch:\n" + history : "") + "\n\n" + (userName() || "Der Nutzer") + " sagt jetzt: " + last);
    let buf = "", out = "", err = "", done = false;
    const timer = setTimeout(() => { p.kill(); finish(new Error("Claude antwortet nicht (Zeitlimit)")); }, 120000);
    const finish = (e, text) => { if (done) return; done = true; clearTimeout(timer); e ? reject(e) : resolve(text); };
    p.stdout.on("data", (chunk) => {
      buf += chunk; const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        let j; try { j = JSON.parse(line); } catch { continue; }
        const d = j.type === "stream_event" && j.event?.type === "content_block_delta" ? j.event.delta : null;
        if (j.type === "stream_event" && j.event?.type === "message_start") out = ""; // neue Runde nach einem Werkzeugaufruf
        if (d?.type === "text_delta") { out += d.text; onText(out); }
        if (j.type === "assistant") for (const c of j.message?.content || []) if (c.type === "tool_use") { const n = String(c.name || "").replace(/^mcp__\w+__/, ""); aiLog("Claude " + (TOOL_DE[n] || "nutzt " + n) + (c.input?.query || c.input?.q ? ` („${String(c.input.query || c.input.q).slice(0, 50)}“)` : ""), "tool"); }
        if (j.type === "result") { const u = j.usage || {}, tok = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); if (tok) aiLog(`Claude: ${j.num_turns || 1} Runde(n), ${tok.toLocaleString("de-DE")} Tokens`, "use"); }
        if (j.type === "assistant" && !out) { out = (j.message?.content || []).filter((c) => c.type === "text").map((c) => c.text).join(""); if (out) onText(out); }
        else if (j.type === "result") {
          if (j.is_error) return finish(new Error(j.result || j.subtype || "Fehler"));
          finish(null, j.result || out);
        }
      }
    });
    p.stderr.on("data", (c) => { err += c; });
    p.on("error", (e) => finish(e));
    p.on("close", (code) => finish(code ? new Error((err || "Claude Code beendet mit Code " + code).trim().slice(0, 300)) : null, out));
  });
}
// Fehler von Claude Code einordnen: Anmeldung fehlt, Limit erreicht oder offline. Dann vorübergehend lokal antworten.
function blockClaudeCode(e) {
  const m = String(e?.message || e);
  if (/log ?in|logged|authenticat|api key|unauthor/i.test(m)) { ccWhy = "Claude Code ist nicht angemeldet: einmal \"claude\" in der Konsole starten und anmelden"; ccBlockedUntil = Date.now() + 5 * 60e3; }
  else if (/limit|usage|quota|rate/i.test(m)) { ccWhy = "Abo-Limit erreicht, lokale KI springt ein"; ccBlockedUntil = Date.now() + 30 * 60e3; }
  else { ccWhy = "Claude gerade nicht erreichbar, lokale KI springt ein"; ccBlockedUntil = Date.now() + 3 * 60e3; }
  sendUI("notice", ccWhy);
}

// Team-Modus: kurze Alltagsfragen beantwortet die lokale KI sofort, anspruchsvolle Aufgaben übernimmt Claude
const HARD = /(erklär|warum|wieso|weshalb|analys|vergleich|schreib|formulier|übersetz|code|programmier|skript|script|berechn|rechne|plan|strategie|zusammenfass|bewert|recherch|mail|brief|empfiehl|empfehl|optimier|verbesser|fehler|problem|lös|hashrate|rentab|frag claude|claude soll)/i;
// Was nur Claude kann (Netz, Code, Selbstverbesserung). Dateien suchen/lesen, Programme öffnen, Systemwerte, Gedächtnis kann Strata selbst (strataAgent)
const WEBCODE = /(recherch|google|internet|im netz|online such|aktuell|news|nachricht|code|programmier|skript|script|verbesser dich)/i;
const LOCALTOOLS = /(such|finde|datei|ordner|öffne|oeffne|starte|schließ|lies|zeig|wo ist|wo liegt|systemstatus|temperatur|auslastung|gedächtnis|merk dir)/i;
// Ansprache entscheidet zuerst: „Strata, …“ / „Lokal(e KI) …“ = nur Strata; „Claude, …“ / „frag Claude …“ = Claude (gilt als Erlaubnis)
const toStrata = (t) => /^\s*(?:(?:hey|hallo|ok|okay|gut|so|und|also)[\s,]+)*(?:strata|lokal(?:e)?(?:\s+ki)?)\b/i.test(t);
const toClaude = (t) => /^\s*(?:(?:hey|hallo|ok|okay|gut|so|und|also)[\s,]+)*claude\b|frag(?:e)?\s+(?:mal\s+)?claude|claude\s+soll|mit claude/i.test(t);
// aiShare: „claude“ = wie bisher (alles Anspruchsvolle an Claude), „ausgewogen“ = Alltag und lokale Aufgaben an Strata,
// „strata“ = alles an Strata, Claude nur, wenn Strata es braucht oder du es sagst. Spart Claude-Kontingent.
const needsClaude = (text) => {
  const share = config.aiShare || "ausgewogen", words = text.trim().split(/\s+/).length;
  if (toStrata(text)) return false;
  if (toClaude(text)) return true;
  if (share === "strata") return false;
  if (WEBCODE.test(text)) return true;
  if (share === "ausgewogen") return !LOCALTOOLS.test(text) && (/(analys|strategie|rentab|bewert|plan|optimier|fehler|problem|lös)/i.test(text) || words > 40);
  return LOCALTOOLS.test(text) || HARD.test(text) || words > 14;
};
async function localPick() {
  if (strata.running()) { const m = strata.snapshot().model; return { kind: "strata", who: "local", label: "Strata · " + m, model: m }; } // eingeschaltet geht Strata vor
  if (config.ollamaOff) return null;
  const models = await ollamaModels(), want = localModel();
  const model = models.find((m) => m === want || m === want + ":latest") || (config.ollamaModel ? null : models[0]);
  return model ? { kind: "ollama", who: "local", label: "Lokale KI · " + model, model } : null;
}
let pendingClaude = null;
const AI_PRESETS = {
  openai: { name: "ChatGPT", base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  gemini: { name: "Gemini", base: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash" },
  mistral: { name: "Mistral", base: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  groq: { name: "Groq", base: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  openrouter: { name: "OpenRouter", base: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  custom: { name: "Eigener Server", base: "http://127.0.0.1:1234/v1", model: "" },
};
function aiPreset() { const p = AI_PRESETS[config.aiProv] || AI_PRESETS.openai; return { name: p.name, base: String(config.aiBase || p.base).replace(/\/+$/, ""), model: config.aiModel || p.model, local: /^https?:\/\/(127\.0\.0\.1|localhost)/i.test(config.aiBase || p.base) }; }
async function pickBackend(text = "", skipAbo = false, forceClaude = false) {
  const key = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "";
  const mode = config.backend;
  if (mode === "openai") { const p = aiPreset(); return config.aiKey || p.local ? { kind: "openai", who: "claude", label: p.name + (p.model ? " · " + p.model : ""), p } : { kind: "demo", who: "demo", label: "Demo-Modus · " + p.name + ": API-Key fehlt" }; }
  const abo = !skipAbo && (mode === "auto" || mode === "abo") && ccUsable() ? { kind: "abo", who: "claude", label: "Claude · dein Abo (" + (config.claudeCodeModel || "sonnet") + ")" } : null;
  const local = mode === "auto" || mode === "ollama" || mode === "abo" ? await localPick() : null;
  if (forceClaude && abo) return abo;
  if (mode === "auto" && abo && local) {
    if (!text) return { kind: "team", who: "team", label: "Team · Claude + " + local.model };
    return needsClaude(text) ? abo : local;
  }
  // Strata ist aus (Leerlauf), die Frage ist aber Strata-Sache: Strata starten und kurz warten (ca. 20 s), statt Claude zu nehmen (strataWake)
  if ((mode === "auto" || mode === "abo") && !local && text && config.strataWake !== false && (config.aiShare || "ausgewogen") !== "claude" && !needsClaude(text) && strata.findDir?.()) {
    if (strata.snapshot().state !== "lädt") { config.strataOn = true; saveConfig(); strata.start().catch(logError); }
    sendUI("notice", "Strata startet, einen Moment …"); strataUsed = Date.now();
    for (let i = 0; i < 40 && !strata.running() && strata.snapshot().state === "lädt"; i++) await new Promise((r) => setTimeout(r, 1500));
    const l2 = await localPick(); if (l2) return l2;
  }
  if (abo) return abo;
  if (local) return local;
  if ((mode === "auto" || mode === "claude") && key) return { kind: "claude", who: "claude", label: "Claude · " + config.claudeModel, key };
  const why = localState.phase === "pull" ? "Lokale KI lädt noch" : localState.phase === "missing" ? "Lokale KI nicht eingerichtet" : "keine KI eingerichtet";
  return { kind: "demo", who: "demo", label: "Demo-Modus · " + why };
}
// Wer ist gerade erreichbar? Für die kleine Anzeige an der Kugel
async function aiStatus() {
  const local = config.backend === "claude" || config.backend === "none" ? null : await localPick();
  return { claude: config.backend === "openai" ? !!(config.aiKey || aiPreset().local) : (config.backend === "auto" || config.backend === "abo") && ccUsable(), claudeFound: !!findClaudeCode(), claudeWhy: ccWhy,
    extName: config.backend === "openai" ? aiPreset().name : "", apiKey: config.backend === "claude" && !!(config.anthropicApiKey || process.env.ANTHROPIC_API_KEY), local: local ? local.model : null, localText: localState.text, mode: config.backend,
    share: config.aiShare || "ausgewogen", strataWake: config.strataWake !== false && !!strata.findDir?.(), localKind: local?.kind || "" };
}
async function pushAiStatus() { try { sendUI("ai-status", await aiStatus()); } catch {} }

// ---------- Stimme: Piper (lokal, natürliche deutsche Männerstimme "Thorsten") ----------
const PIPER_DIR = path.join(app.getPath("userData"), "piper");
const PIPER_ZIP_URL = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip";
const VOICE_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/de/de_DE/";
// Piper-Stimmen (alle lokal, CPU). id = Dateiname im Stimmen-Ordner; ältere Installationen haben thorsten-high schon.
const VOICES = [
  { id: "thorsten-high", label: "Thorsten (männlich, beste Qualität)", gender: "m", mb: 110, url: "thorsten/high/de_DE-thorsten-high.onnx" },
  { id: "thorsten-medium", label: "Thorsten (männlich, schlank)", gender: "m", mb: 63, url: "thorsten/medium/de_DE-thorsten-medium.onnx" },
  { id: "thorsten_emotional-medium", label: "Thorsten emotional (männlich, lebendiger)", gender: "m", mb: 77, url: "thorsten_emotional/medium/de_DE-thorsten_emotional-medium.onnx" },
];
const voiceDef = (id) => VOICES.find((v) => v.id === id) || VOICES[0];
const voiceFileOf = (id) => path.join(PIPER_DIR, voiceDef(id).id + ".onnx");
const voiceHas = (id) => fs.existsSync(voiceFileOf(id)) && fs.existsSync(voiceFileOf(id) + ".json");
let piperReady = false;
const piperExe = () => path.join(PIPER_DIR, "piper", process.platform === "win32" ? "piper.exe" : "piper");
// Programm (einmal) und eine Stimme herunterladen; onPct meldet 0-100 für die Anzeige in Einstellungen/Assistent
let runtimeP = null; // das Sprach-Programm wird nur einmal geladen, auch wenn mehrere Stimmen gleichzeitig kommen
function ensureRuntime(onPct) {
  if (fs.existsSync(piperExe())) return Promise.resolve();
  return runtimeP ||= (async () => {
    const zip = path.join(PIPER_DIR, "piper.zip");
    await download(PIPER_ZIP_URL, zip, onPct);
    new (require("adm-zip"))(zip).extractAllTo(PIPER_DIR, true);
    fs.rmSync(zip, { force: true });
  })().finally(() => { runtimeP = null; });
}
async function installVoice(id, onPct = () => {}) {
  const v = voiceDef(id); fs.mkdirSync(PIPER_DIR, { recursive: true });
  await ensureRuntime((p) => onPct(Math.round(p * 0.2)));
  const f = voiceFileOf(v.id);
  await download(VOICE_BASE + v.url + ".json", f + ".json", () => {});
  await download(VOICE_BASE + v.url, f + ".part", (p) => onPct(20 + Math.round(p * 0.8)));
  fs.renameSync(f + ".part", f);
  onPct(100);
}
async function ensurePiper() {
  const ok = () => fs.existsSync(piperExe()) && voiceHas(config.voiceId);
  if (ok()) { piperReady = true; return sendUI("tts-ready", true); }
  if (process.platform !== "win32" || config.voiceEngine === "windows" || config.voiceEngine === "server") return;
  try { await installVoice(config.voiceId); piperReady = ok(); sendUI("tts-ready", piperReady); }
  catch (e) { console.warn("Piper nicht verfügbar:", e.message || e); }
}
// Text → WAV. Text geht als JSON mit \u-Escapes rein, damit Umlaute unter Windows sicher ankommen.
function synthesize(text, id) {
  const vf = voiceFileOf(id || config.voiceId);
  if (!fs.existsSync(piperExe()) || !fs.existsSync(vf)) return Promise.resolve(null);
  const out = path.join(os.tmpdir(), `jarvis-tts-${process.pid}-${Date.now()}.wav`);
  const line = JSON.stringify({ text, output_file: out }).replace(/[\u007f-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  return new Promise((resolve, reject) => {
    const p = spawn(piperExe(), ["--model", vf, "--json-input", "--output_file", out, "--length_scale", "1.06", "--sentence_silence", "0.22"],
      { cwd: path.dirname(piperExe()), windowsHide: true });
    let err = ""; p.stderr?.on("data", (d) => { if (err.length < 400) err += d; });
    p.on("error", reject);
    p.on("exit", (c) => {
      if (c !== 0 || !fs.existsSync(out)) return reject(new Error("Piper beendet mit " + c + (err ? ": " + err.trim().slice(-200) : "")));
      const buf = fs.readFileSync(out); fs.rm(out, () => {}); resolve(buf);
    });
    p.stdin.end(line + "\n");
  });
}

// ---------- Lokale KI über Ollama: installieren, Modell laden, warm halten ----------
const GB = 1024 ** 3;
const OLLAMA_SETUP_URL = "https://ollama.com/download/OllamaSetup.exe";
let localState = { phase: "check", text: "Prüfe lokale KI…", pct: null }, localBusy = false;
// 7B-Modell bei genug Arbeitsspeicher, sonst das kleinere 3B-Modell. Beide sprechen gut Deutsch.
// Grafikkarte für die lokale KI: voll (schnell), sparsam (halbes Modell auf der GPU, Speicher wird schnell wieder frei) oder aus (nur CPU)
function gpuOpts(options = {}) {
  if (config.gpuUse === "sparsam") return { keep_alive: "5m", options: { ...options, num_gpu: 14 } };
  if (config.gpuUse === "aus") return { keep_alive: "10m", options: { ...options, num_gpu: 0 } };
  return { keep_alive: "30m", options };
}
function localModel() { return config.ollamaModel || (os.totalmem() >= 15 * GB ? "qwen2.5:7b" : "qwen2.5:3b"); }
function setLocal(phase, text, pct = null) {
  localState = { phase, text, pct };
  sendUI("local-ai", localState);
  if (phase === "ready" || phase === "missing" || phase === "error") pushAiStatus();
  tray?.setContextMenu(trayMenu());
}
async function ollamaUp() {
  try { return (await fetch(config.ollamaUrl + "/api/version", { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}
// Läuft bei jedem Start und alle 20 s, solange die KI nicht bereit ist. Alles automatisch:
// Ollama finden und starten, sonst installieren, auf neue Version prüfen, Modell laden und aktuell halten.
let installTried = false, updateChecked = false, modelRefreshed = false;
async function ensureLocalAI(manual = false) {
  // Ollama abgeschaltet (z. B. Strata ersetzt es): nichts starten, nichts installieren
  if (config.ollamaOff) return setLocal("off", strata.running() ? "Lokale KI: Strata" : "Ollama ist aus. Lokale Fragen beantwortet Strata, wenn es läuft, sonst Claude.");
  if (!manual && !config.setupDone) return; // neue Nutzer wählen in der Einrichtung, ob die lokale KI (Download mehrerer GB) kommt
  if (localBusy || !(config.backend === "auto" || config.backend === "ollama")) return;
  if (manual) installTried = false;
  localBusy = true;
  try {
    // Einmalig: ein von älteren Argus-Versionen gestartetes Ollama ließ Konsolenfenster aufblitzen. Neu starten, diesmal versteckt.
    if (process.platform === "win32" && config.ollamaHiddenFix !== 1 && (await ollamaUp())) {
      config.ollamaHiddenFix = 1; saveConfig();
      await new Promise((r) => execFile("taskkill", ["/F", "/T", "/IM", "ollama.exe"], { windowsHide: true }, () => r()));
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!(await ollamaUp()) && startOllama()) {
      setLocal("start", "Starte lokale KI…");
      await waitForOllama(20);
    }
    if (!(await ollamaUp())) {
      if (installTried || process.platform !== "win32") return setLocal("missing", "Lokale KI nicht gefunden.");
      installTried = true;
      await runOllamaInstaller("Installiere lokale KI (Ollama)");
      if (!(await waitForOllama(60))) throw new Error("Ollama startet nach der Installation nicht");
    }
    if (!updateChecked) { updateChecked = true; await updateOllamaIfOld(); }
    const want = localModel();
    if (!(await ollamaModels()).some((m) => m === want || m === want + ":latest")) { await pullModel(want); modelRefreshed = true; }
    setLocal("warm", "Lokale KI startet…");
    // Modell in den Speicher laden und 30 Minuten dort halten, damit die erste Antwort schnell kommt
    await fetch(config.ollamaUrl + "/api/generate", { method: "POST", body: JSON.stringify({ model: want, prompt: "", ...gpuOpts() }) });
    setLocal("ready", "Lokale KI bereit · " + want);
    if (!modelRefreshed) { modelRefreshed = true; refreshModel(want); }
  } catch (e) {
    setLocal("error", "Lokale KI: " + (e.message || e));
  } finally { localBusy = false; }
}

// Ollama abgeschaltet: laufende Ollama-Prozesse beenden, damit sie keinen Speicher belegen (Programm bleibt, wie es ist)
function stopOllama() {
  if (process.platform !== "win32") return;
  for (const im of ["ollama app.exe", "ollama.exe", "ollama_llama_server.exe"]) execFile("taskkill", ["/F", "/T", "/IM", im], { windowsHide: true }, () => {});
}
// Ollama auf dem PC suchen: Standard-Installationsorte, dann PATH
function findOllama() {
  const win32 = process.platform === "win32";
  const roots = [
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Ollama"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Ollama"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Ollama"),
  ];
  for (const r of roots) {
    const gui = path.join(r, "ollama app.exe"), cli = path.join(r, "ollama.exe");
    if (fs.existsSync(gui) || fs.existsSync(cli)) return { gui: fs.existsSync(gui) ? gui : null, cli: fs.existsSync(cli) ? cli : null };
  }
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    const cli = dir && path.join(dir, win32 ? "ollama.exe" : "ollama");
    if (cli && fs.existsSync(cli)) return { gui: null, cli };
  }
  return null;
}
// Unsichtbar starten
function startOllama() {
  const o = findOllama();
  if (!o) return false;
  // Nicht "detached": sonst hat Ollama keine (unsichtbare) Konsole, und jeder KI-Prozess, den es startet,
  // öffnet ein eigenes Konsolenfenster. So erben sie die versteckte Konsole. Ollama läuft trotzdem weiter, wenn Argus endet.
  const opts = { stdio: "ignore", windowsHide: true };
  // Den Server direkt starten: die Ollama-App öffnet in neuen Versionen ein Fenster
  if (o.cli) spawn(o.cli, ["serve"], opts).unref(); else spawn(o.gui, [], opts).unref();
  return true;
}
async function waitForOllama(seconds) {
  for (let i = 0; i < seconds; i++) { if (await ollamaUp()) return true; await new Promise((r) => setTimeout(r, 1000)); }
  return ollamaUp();
}
async function runOllamaInstaller(what) {
  const exe = path.join(app.getPath("temp"), "OllamaSetup.exe");
  await download(OLLAMA_SETUP_URL, exe, (pct) => setLocal("install", `${what}: Download ${pct} %`, pct));
  setLocal("install", `${what}…`);
  await new Promise((res, rej) => {
    const p = spawn(exe, ["/SILENT", "/NORESTART", "/SUPPRESSMSGBOXES", "/CLOSEAPPLICATIONS"], { windowsHide: true });
    p.on("error", rej);
    p.on("exit", (c) => (c === 0 ? res() : rej(new Error("Installer beendet mit Code " + c))));
  });
  fs.rm(exe, { force: true }, () => {});
  if (!(await ollamaUp())) startOllama();
}
// Installierte Ollama-Version mit der neuesten auf GitHub vergleichen und bei Bedarf still aktualisieren
const versionNewer = (a, b) => {
  const pa = a.split(/[.-]/).map(Number), pb = b.split(/[.-]/).map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
};
async function updateOllamaIfOld() {
  if (process.platform !== "win32") return;
  try {
    const cur = (await (await fetch(config.ollamaUrl + "/api/version", { signal: AbortSignal.timeout(2000) })).json()).version;
    const rel = await (await fetch("https://api.github.com/repos/ollama/ollama/releases/latest", { headers: { "User-Agent": "Argus" }, signal: AbortSignal.timeout(6000) })).json();
    const latest = (rel.tag_name || "").replace(/^v/, "");
    config.ollamaVersion = cur; config.ollamaLatest = latest; saveConfig();
    if (!cur || !latest || !versionNewer(latest, cur)) return;
    await runOllamaInstaller(`Aktualisiere Ollama ${cur} → ${latest}`);
    await waitForOllama(60);
  } catch (e) {
    console.warn("Ollama-Update übersprungen:", e.message || e); // offline o. ä.: mit der vorhandenen Version weitermachen
  }
}
// Modell im Hintergrund auf den neuesten Stand bringen (lädt nur geänderte Teile, KI bleibt nutzbar)
async function refreshModel(name) {
  try {
    const res = await fetch(config.ollamaUrl + "/api/pull", { method: "POST", body: JSON.stringify({ model: name, stream: true }) });
    const dec = new TextDecoder(); let buf = "", updating = false, last = 0;
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const j = JSON.parse(line);
        if (j.total > 50e6 && j.completed < j.total && Date.now() - last > 1000) {
          updating = true; last = Date.now();
          setLocal("update", `Aktualisiere lokale KI: ${Math.floor((j.completed / j.total) * 100)} %`, null);
        }
      }
    }
    if (updating) setLocal("ready", "Lokale KI aktualisiert · " + name);
  } catch { /* Update ist optional */ }
}
async function pullModel(name) {
  setLocal("pull", `Lade lokale KI ${name}… (einmalig, mehrere GB)`, 0);
  const res = await fetch(config.ollamaUrl + "/api/pull", { method: "POST", body: JSON.stringify({ model: name, stream: true }) });
  if (!res.ok) throw new Error("Download fehlgeschlagen (" + res.status + ")");
  const dec = new TextDecoder(); let buf = "", last = 0;
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const j = JSON.parse(line);
      if (j.error) throw new Error(j.error);
      if (j.total && j.completed && Date.now() - last > 700) {
        last = Date.now();
        const pct = Math.floor((j.completed / j.total) * 100);
        setLocal("pull", `Lade lokale KI ${name}: ${pct} % von ${(j.total / GB).toFixed(1)} GB`, pct);
      }
    }
  }
}
let downloadsActive = 0; // laufende Downloads (Sprachpakete, lokale KI); ein Oberflächenwechsel wartet darauf
async function download(url, file, onPct) {
  downloadsActive++; try { await downloadFile(url, file, onPct); } finally { downloadsActive--; }
}
async function downloadFile(url, file, onPct) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Download fehlgeschlagen (" + res.status + ")");
  const total = Number(res.headers.get("content-length")) || 0, out = fs.createWriteStream(file);
  let got = 0, last = -1;
  for await (const chunk of res.body) {
    got += chunk.length;
    if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
    const pct = total ? Math.floor((got / total) * 100) : 0;
    if (pct !== last) { last = pct; onPct(pct); }
  }
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
}
async function askClaude(b, messages, onText) {
  const client = new Anthropic({ apiKey: b.key });
  const stream = client.beta.messages.stream({
    model: config.claudeModel,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: config.effort },
    system: systemPrompt("Claude", messages[messages.length - 1]?.content),
    messages,
  });
  stream.on("text", (_delta, snapshot) => onText(snapshot));
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") throw { code: "refusal", message: "Claude hat die Anfrage abgelehnt." };
  return final.content.filter((c) => c.type === "text").map((c) => c.text).join("");
}

// Weitere KIs über die OpenAI-kompatible Schnittstelle (Chat-Completions mit Streaming)
async function askOpenAI(b, messages, onText) {
  const p = b.p, last = messages[messages.length - 1]?.content;
  const res = await fetch(p.base + "/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", ...(config.aiKey ? { Authorization: "Bearer " + config.aiKey } : {}) },
    body: JSON.stringify({ model: p.model, stream: true, messages: [{ role: "system", content: systemPrompt(p.name, last, "ext:" + p.name) }, ...messages] }),
  });
  if (!res.ok) { let d = ""; try { d = (await res.text()).slice(0, 200); } catch {} throw { code: "ext", message: `${p.name} antwortet mit ${res.status}${res.status === 401 ? " (API-Key falsch?)" : res.status === 404 ? " (Modellname oder Adresse falsch?)" : ""} ${d}`.trim() }; }
  const dec = new TextDecoder(); let buf = "", out = "";
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop();
    for (const line of lines) {
      const m = /^data:\s*(.*)$/.exec(line.trim()); if (!m || m[1] === "[DONE]") continue;
      try { const t = JSON.parse(m[1]).choices?.[0]?.delta?.content; if (t) { out += t; onText(out); } } catch {}
    }
  }
  return out;
}

async function askOllama(b, messages, onText) {
  const res = await fetch(config.ollamaUrl + "/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: b.model, stream: true, ...gpuOpts({ num_ctx: 4096, temperature: 0.6 }),
      messages: [{ role: "system", content: systemPrompt("Argus", messages[messages.length - 1]?.content, "ollama") }, ...messages],
    }),
  });
  if (!res.ok) throw { code: "ollama", message: "Ollama antwortet mit " + res.status };
  const dec = new TextDecoder(); let buf = "", out = "";
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const j = JSON.parse(line);
      if (j.message?.content) { out += j.message.content; onText(out); }
    }
  }
  return out;
}

async function askDemo(messages, onText) {
  await new Promise((r) => setTimeout(r, 1800));
  const q = messages[messages.length - 1].content;
  const text = config.backend === "none"
    ? "Argus läuft gerade ohne KI. Befehle wie Programme öffnen, Dateien suchen oder Timer klappen trotzdem. Eine KI richtest du jederzeit unter Einstellungen, KI ein (Einrichtung erneut starten)."
    : ["pull", "install", "warm", "start"].includes(localState.phase)
    ? "Die lokale KI wird gerade eingerichtet. " + localState.text + ". Frag mich gleich nochmal."
    : "Ich laufe im Demo-Modus, weil die lokale KI noch nicht läuft. " + localState.text + " Deine Frage war: " + q;
  let out = "";
  for (const w of text.split(" ")) { out += (out ? " " : "") + w; onText(out); await new Promise((r) => setTimeout(r, 40)); }
  return out;
}

function errorText(e) {
  if (e instanceof Anthropic.AuthenticationError) return { code: "auth", message: "Der API-Key wird abgelehnt. Prüf ihn in den Einstellungen." };
  if (e instanceof Anthropic.RateLimitError) return { code: "rate_limited", message: "Zu viele Anfragen. Warte kurz." };
  if (e instanceof Anthropic.APIConnectionError) return { code: "offline", message: "Keine Verbindung zu Claude. Bist du online?" };
  if (e instanceof Anthropic.APIError) return { code: "api", message: "Claude-Fehler " + (e.status || "") + ": " + e.message };
  return { code: e?.code || "unknown", message: e?.message || String(e) };
}

ipcMain.handle("backend-info", async () => { const b = await pickBackend(); return { kind: b.kind, label: b.label }; });
// ---------- Eigene Temperaturmessung: LibreHardwareMonitorLib + PawnIO-Treiber (vom Nutzer freigegeben) ----------
// Einmalig mit Admin-Abfrage: Treiber installieren und Messdienst als geplante Aufgabe eintragen. Danach startet Argus ihn ohne Nachfrage.
const SENSOR_SRC = path.join(__dirname, "sensors");
const SENSOR_DST = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Jarvis-Sensoren") : "";
const sensorOut = () => path.join(app.getPath("userData"), "sensoren.json");
let sensorState = "aus";
const readTxt = (p) => { try { return fs.readFileSync(p, "utf8").trim(); } catch { return null; } };
function sensorsInstalled() { const v = readTxt(path.join(SENSOR_SRC, "version.txt")); return !!v && v === readTxt(path.join(SENSOR_DST, "version.txt")); }
function sensorPush() { sendUI("sensor-status", sensorState); }
function startSensors() {
  if (process.platform !== "win32" || !fs.existsSync(SENSOR_SRC)) return;
  setSensorFile(sensorOut());
  if (config.sensors === false) { sensorState = "aus"; return; }
  if (sensorsInstalled()) {
    execFile("schtasks", ["/Run", "/TN", "Jarvis Sensoren"], { windowsHide: true }, (e) => { sensorState = e ? "fehler: Messdienst startet nicht, bitte neu einrichten" : "laeuft"; sensorPush(); });
    return;
  }
  // Neue Version des Messdiensts mit dem Update: einmal neu einrichten (eine Admin-Abfrage), ohne dass der Nutzer klicken muss
  const oldVer = readTxt(path.join(SENSOR_DST, "version.txt"));
  if (!config.sensorsAsked || oldVer) { config.sensorsAsked = true; saveConfig(); setupSensors(); } else { sensorState = "bereit"; sensorPush(); }
}
function setupSensors() {
  if (process.platform !== "win32" || sensorState === "einrichten") return;
  const log = sensorOut() + ".setup.log"; try { fs.unlinkSync(log); } catch {}
  sensorState = "einrichten"; sensorPush();
  const q = (p) => p.replace(/'/g, "''");
  const cmd = `Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','"${q(path.join(SENSOR_SRC, "setup.ps1"))}"','-Out','"${q(sensorOut())}"')`;
  execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], { windowsHide: true }, (e) => {
    if (e) { sensorState = "fehler: Admin-Abfrage abgelehnt"; sensorPush(); return; }
    let n = 0;
    const t = setInterval(() => {
      const r = readTxt(log); n++;
      if (!r && n < 120) return;
      clearInterval(t);
      sensorState = r === "ok" ? "laeuft" : r || "fehler: keine Rückmeldung von der Einrichtung";
      sensorPush(); if (r === "ok") watch?.pollTemps?.();
    }, 1000);
  });
}
ipcMain.handle("sensor-status", () => sensorState);
ipcMain.on("sensor-setup", () => { config.sensors = true; saveConfig(); setupSensors(); });

ipcMain.handle("game-info", (_e, name, appid) => require("./games").info(String(name || "").slice(0, 120), Number.isFinite(appid) ? appid : null).catch(() => ({ name, error: "Keine Daten" })));
ipcMain.handle("get-config", () => ({ uiMode: uiStart.mode, uiConfigured: uiMode.normalize(config.uiMode), uiFallback: uiStart.fallback, uiReduceTransparency: !!config.uiReduceTransparency, pageLooks: config.pageLooks && typeof config.pageLooks === "object" ? config.pageLooks : {}, nodeStyle: ["punkt", "ring", "leucht", "stern"].includes(config.nodeStyle) ? config.nodeStyle : "punkt", aura: ["aus", "weich", "stark"].includes(config.aura) ? config.aura : "aus", breath: !!config.breath, pulseStyle: ["punkte", "funken", "komet", "blitz", "welle", "licht"].includes(config.pulseStyle) ? config.pulseStyle : "punkte", iobOn: !!config.iobOn, iobUrl: config.iobUrl || "", iobUser: config.iobUser || "", hasIobPass: !!config.iobPass, iobPick: Array.isArray(config.iobPick) ? config.iobPick : [], iobWrite: !!config.iobWrite, iobAll: config.iobAll !== false, shapeRand: +config.shapeRand || 0, fmDashOn: !!config.fmDashOn, aiProv: config.aiProv, aiBase: config.aiBase, aiModel: config.aiModel, hasAiKey: !!config.aiKey, ballOn: config.ballOn, menuAlpha: config.menuAlpha, taskbarOn: config.taskbarShow !== "nie", taskbarShow: config.taskbarShow, hiddenFans: config.hiddenFans, afterHide: config.afterHide, taskbarFront: config.taskbarFront, twAlpha: config.twAlpha, twFeather: config.twFeather, twRound: config.twRound, twVideoOnly: config.twVideoOnly, twOnTop: config.twOnTop, twMode: config.twMode, twEmbedSize: config.twEmbedSize, gaugeTiltX: config.gaugeTiltX, gaugeTiltY: config.gaugeTiltY, btnTiltX: config.btnTiltX, btnTiltY: config.btnTiltY, btnTiltFollow: config.btnTiltFollow, btnTiltK: config.btnTiltK, btnShape: config.btnShape, btnLook: config.btnLook, palette: config.palette, loadShimmer: config.loadShimmer, ytAlpha: config.ytAlpha, ytFeather: config.ytFeather, ytRound: config.ytRound, flashK: config.flashK, flashT: config.flashT, statusOn: config.statusOn, miniMore: config.miniMore, look3dK: config.look3dK, uiFont: config.uiFont, uiScale: config.uiScale, structK: config.structK, edgeK: config.edgeK, nodeK: config.nodeK, steamOnX: config.steamOn, gamingOn: config.gamingOn, holeX: config.holeX, holeY: config.holeY, holeEdit: config.holeEdit, holeOn: config.holeOn, holeCorner: config.holeCorner, holeW: config.holeW, holeH: config.holeH, holeRound: config.holeRound, holeRadii: config.holeRadii, friendsStill: config.friendsStill, ytFilterState, ytBackgroundAlpha: config.ytBackgroundAlpha ?? 100, ytFrame: config.ytFrame !== false, ytShadow: !!config.ytShadow, ytFilterOn: config.ytFilterOn !== false, uiSkin: "classic", reduceAnimations: !!config.reduceAnimations, backgroundPresentation: config.backgroundPresentation === "eco" ? "eco" : "fluid", notesScopeVersion: config.notesScopeVersion, pageIds: config.pageIds, notesByPage: config.notesByPage, notesPages: config.notesPages, notesCur: config.notesCur, miningOn: config.miningOn, dcJoinBot: config.dcJoinBot, quickOn: config.quickOn, quickSize: config.quickSize, quickLabels: config.quickLabels, mirrorOn: config.mirrorOn, mirrorMatch: config.mirrorMatch, mirrorFps: config.mirrorFps, mirrorQ: config.mirrorQ, procKill: config.procKill, ballLabels: config.ballLabels, bgShoot: config.bgShoot, micId: config.micId, spkId: config.spkId, friendsSplit: config.friendsSplit, friendsHold: config.friendsHold, updateChannel: config.updateChannel, crashReport: config.crashReport, barMode: config.barMode, fpsIdle: config.fpsIdle, fpsMax: config.fpsMax, reportOn: config.reportOn, reportHour: config.reportHour, reportKeep: config.reportKeep, reportNotify: config.reportNotify, claudeAsk: config.claudeAsk, oceanNotify: config.oceanNotify, payoutNotify: config.payoutNotify, notifyPanel: config.notifyPanel, notifyWin: config.notifyWin, notifySound: config.notifySound, aiShare: config.aiShare, strataWake: config.strataWake, strata: strata.snapshot(), strataDir: config.strataDir, strataArgs: config.strataArgs, userName: config.userName, userInfo: config.userInfo, setupDone: config.setupDone, weatherOn: config.weatherOn, weather: wx, mineOn: config.mineOn, mineAddr: config.mineAddr, strataIdleMin: config.strataIdleMin, foremanOn: config.foremanOn, fmEvOn: config.fmEvOn, fmView: config.fmView, look3d: config.look3d, foremanPx: config.foremanPx, foremanAccts: fmAccts().map((a) => ({ name: a.name, client: a.client, hasKey: !!a.key })), farm: farmSt, expandedNow: expanded, ollamaOff: config.ollamaOff, pages: config.pages, page: config.page, liteMode: config.liteMode, pagesOn: config.pagesOn, mineOrb: config.mineOrb, pageFriends: config.pageFriends, mineView: config.mineView, mOverInit: config.mOverInit, mFxInit: config.mFxInit, mineFx: config.mineFx, oceanInTotal: config.oceanInTotal, profLast: config.profLast, layoutProfiles: config.layoutProfiles, wxPlaces: config.wxPlaces, hiddenBlocks: config.hiddenBlocks, mining: mine, clocksOn: config.clocksOn, clocks: config.clocks, gameMode: config.gameMode, snapGuides: config.snapGuides, blockFont: config.blockFont, chatH: config.chatH, dockFx: config.dockFx, setZoom: config.setZoom, extraVoice: config.extraVoice, friendsFold: config.friendsFold, ytAdblock: config.ytAdblock, ytNoAds: config.ytNoAds, ytVideoOnly: config.ytVideoOnly, notesOn: config.notesOn, notesText: config.notesText, venomRoam: config.venomRoam, gfxSafe: config.gfxSafe, mediaBrowser: config.mediaBrowser, cpuHotC: config.cpuHotC, warnDiskGB: config.warnDiskGB, warnRamPct: config.warnRamPct, warnCpuPct: config.warnCpuPct, warnInet: config.warnInet, gpuHotC: config.gpuHotC, fmNotify: config.fmNotify, fmMinerUrl: config.fmMinerUrl, aiLogOn: config.aiLogOn, spin: config.spin, density: config.density, skin: config.skin, sensors: config.sensors, shape: config.shape, shape2d: config.shape2d, shapeRim: config.shapeRim, glow: config.glow, scales: config.scales, updateUrl: config.updateUrl, version: app.getVersion(), overlayMode: config.overlayMode, ytMode: config.ytMode, ytEmbedSize: config.ytEmbedSize, sway: config.sway, discordVoiceOnly: config.discordVoiceOnly, discordAlsoOnline: config.discordAlsoOnline, dcOnlyMarked: config.dcOnlyMarked, dcMarked: config.dcMarked, looks: config.looks, winStyle: config.winStyle, discordName: config.discordName, voiceOverlay: config.voiceOverlay, overlayCorner: config.overlayCorner, winColor: config.winColor, friendsBox: config.friendsBox, ytOnTop: config.ytOnTop, fileIndex: fileIndexInfo(), viz: config.viz, pins: config.pins, micFloat: config.micFloat, onTop: config.onTop, wakeFront: config.wakeFront, autoOpen: config.autoOpen, steamOn: config.steamOn, hasSteamKey: !!config.steamKey, hasDcBot: !!config.dcBotToken, steamDl: config.steamDl, mediaOn: config.mediaOn, dcIcons: config.dcIcons, sysBox: config.sysBox, pillOff: config.pillOff, ballOff: config.ballOff, panelLayout: config.panelLayout, dcBot: dcbot.snapshot(), steamId: config.steamId, discordOn: config.discordOn, discordServers: config.discordServers, newsOn: config.newsOn, newsCats: config.newsCats, newsOnTop: config.newsOnTop, btcCur: config.btcCur, coins: config.coins, bgFx: config.bgFx, market, memoryOn: config.memoryOn, claudeDesktopLink: config.claudeDesktopLink, memoryDir: memory.DIR(), hiddenApps: config.hiddenApps, opacity: config.opacity, gpuUse: config.gpuUse, widgets: config.widgets, claudeCodeModel: config.claudeCodeModel, claudeCode: !!findClaudeCode(), themeHue: config.themeHue, themeRegions: config.themeRegions, voiceEngine: config.voiceEngine, voiceFallback: config.voiceFallback, donateUrl: config.donateUrl, lang: config.lang, portalOn: config.portalOn, portalUrl: config.portalUrl, briefOn: config.briefOn, briefTime: config.briefTime, briefLen: config.briefLen, briefParts: config.briefParts, customPages: config.customPages, autoFit: config.autoFit, tradeOn: config.tradeOn, tradeCur: config.tradeCur, tradeEvery: config.tradeEvery, tradeStock: config.tradeStock, tradeFng: config.tradeFng, tradeDom: config.tradeDom, tradeHalv: config.tradeHalv, tradeWatch: config.tradeWatch, tradePort: config.tradePort, hasFinnhubKey: !!config.finnhubKey, design: config.design, designSet: config.designSet, designBlk: config.designBlk, designType: config.designType, designBtn: config.designBtn,
  autostart: config.autostart, backend: config.backend, ollamaModel: config.ollamaModel || localModel(), hasApiKey: !!config.anthropicApiKey,
  ballScale: config.ballScale, labelScale: config.labelScale, tempScale: config.tempScale, appScale: config.appScale, wakeWords: config.wakeWords, voiceOutput: config.voiceOutput, voiceId: config.voiceId, voiceRobot: config.voiceRobot, micOnStart: config.micOnStart, systemAlertsVoice: config.systemAlertsVoice, voice: voiceState, system: watch?.data.ts ? withIcons(watch.data) : null }));
// Kurz-Lagebild für die KI, nur echte abgerufene Werte
function marketSummary() {
  const q = market.btc, lines = [], n = mine.net;
  for (const a of farmSt?.accounts || []) { const fm = a.miners; if (a.hidden || !fm?.length) continue; if (a.pxOff) { lines.push(`Farm laut Foreman (${a.name}): Pickaxe offline, ${fm.length} Miner ohne Verbindung`); continue; } const on = fm.filter((m) => m.on === true), ts = fm.map((m) => m.temp).filter((v) => v != null), hot = [...fm].filter((m) => m.temp != null).sort((x, y) => y.temp - x.temp)[0];
    lines.push(`Farm laut Foreman (${a.name}): ${on.length} von ${fm.length} Minern online` + (ts.length ? `, Temperatur Ø ${Math.round(ts.reduce((x, y) => x + y, 0) / ts.length)} °C, heißester ${hot.name} ${Math.round(hot.temp)} °C` : "") + (fm.some((m) => m.on === false) ? `, offline: ${fm.filter((m) => m.on === false).slice(0, 10).map((m) => m.name).join(", ")}` : "")); }
  for (const p of mine.pools) if (p?.hr) lines.push(`Eigenes Mining (OCEAN${mine.pools.length > 1 ? ", Adresse " + p.label : ""}): ${fmtHash(p.hr.m10)} (10 min), ${fmtHash(p.hr.h3)} (3 h), ${fmtHash(p.hr.h24)} (24 h)` + (p.workers ? `, Worker ${p.workers.filter((w) => w.on === true).length} von ${p.workers.length} online` : "") + (p.unpaid != null ? `, unbezahlt ${Math.round(p.unpaid * 1e8)} sats` : ""));
  if (n?.adj) lines.push(`Difficulty-Anpassung in ${n.adj.remainingBlocks} Blöcken: ${n.adj.change?.toFixed(2)} %` + (n.hashprice?.usd ? `, Hashprice ${n.hashprice.usd.toFixed(1)} USD/PH/Tag` : "") + (n.fees ? `, Gebühren ${n.fees.fast} sat/vB schnell` : ""));
  if (q?.usd) lines.push(`Bitcoin: ${Math.round(q.usd.price)} USD` + (q.eur ? ` / ${Math.round(q.eur.price)} EUR` : "") + (typeof q.usd.change === "number" ? `, ${q.usd.change.toFixed(1)} % in 24 h` : "") + ` (Quelle ${q.source}, ${new Date(q.ts).toLocaleTimeString("de-DE")})`);
  for (const a of market.alerts || []) lines.push(a.title + " (" + a.source + ")");
  for (const n of [...(market.krypto || []).slice(0, 5), ...(market.tech || []).slice(0, 5)]) lines.push(`${n.cat === "tech" ? "Tech" : "Krypto"}-News: ${n.title} (${n.source})`);
  return lines.length ? "\n\nAktuelles Lagebild aus Argus (echt abgerufen):\n- " + lines.join("\n- ") : "";
}
function socialSummary() {
  const l = [];
  if (market.steam?.online) l.push("Steam-Freunde online: " + (market.steam.online.map((f) => f.name + (f.game ? " spielt " + f.game : " (" + f.state + ")")).join(", ") || "keiner"));
  for (const sv of market.discord?.servers || []) if (!sv.error) l.push(`Discord-Server ${sv.server}, ${sv.count} online: ` + sv.online.slice(0, 30).map((m) => m.name + (m.voice ? " im Sprachkanal " + m.voice : m.game ? " spielt " + m.game : "")).join(", "));
  return l.length ? "\n\nWer gerade online ist (echt abgerufen):\n- " + l.join("\n- ") : "";
}
// Jedes Gespräch ins Gedächtnis (Ordner Argus-Gedaechtnis im Benutzerordner)
function remember(user, answer, who) { if (config.memoryOn !== false) try { memory.logTurn(user, answer, who); } catch (e) { logError(e); } }
ipcMain.on("open-memory", () => { fs.mkdirSync(memory.DIR(), { recursive: true }); shell.openPath(memory.DIR()); });
// ---------- Strata mit Werkzeugen: sucht, liest, öffnet und schaut selbst nach, ohne Claude ----------
// Werkzeug-Aufruf als Text (<werkzeug>{…}</werkzeug>), damit es mit jedem Strata-Server klappt, auch ohne Function-Calling
const STRATA_TOOLS = {
  dateien_suchen: { d: "Dateien/Ordner auf allen Laufwerken nach Namen suchen. args: {suchbegriff, inhalt?: true für Suche im Dateiinhalt}",
    run: async (a) => { const r = a.inhalt ? await files.searchContent(String(a.suchbegriff || ""), 15) : await files.search(String(a.suchbegriff || ""), 15); return r.length ? r.join("\n") : "Nichts gefunden."; } },
  datei_lesen: { d: "Textdatei lesen oder Ordner auflisten. args: {pfad}", run: async (a) => String(files.read(String(a.pfad || ""))).slice(0, 12000) },
  oeffnen: { d: "Programm, Webseite, Ordner oder Datei öffnen. args: {befehl} wie der Nutzer es sagen würde, z. B. \"Öffne Discord\", \"Öffne C:\\\\Pfad\\\\Datei.zip\"",
    run: async (a) => { const p = String(a.befehl || ""); if (/^[a-z]:[\\/]/i.test(p) && fs.existsSync(p)) return (await actions.openGuarded(p)) || "Geöffnet: " + p; return (await actions.run(p)) || "Nicht erkannt."; } },
  systemstatus: { d: "Aktuelle Messwerte des PCs (CPU, GPU, RAM, Temperaturen, Programme). args: {}", run: async () => (watch ? watch.summary() : "Systemwache aus") },
  gedaechtnis_suchen: { d: "Frühere Gespräche und Notizen durchsuchen. args: {suchbegriff}", run: async (a) => { const r = memory.search(String(a.suchbegriff || ""), 8); return r.length ? r.join("\n\n") : "Nichts im Gedächtnis."; } },
  gedaechtnis_merken: { d: "Etwas dauerhaft merken (nur wenn der Nutzer es will). args: {notiz}", run: async (a) => (memory.remember(String(a.notiz || "")) ? "Gemerkt." : "Ging nicht.") },
  claude_fragen: { d: "Nur wenn du es wirklich nicht selbst kannst (Internet, aktuelle Infos, Programmieren, schwierige Analyse): Claude um Hilfe bitten. Der Nutzer wird vorher gefragt. args: {grund}", run: null },
};
async function strataAgent(last, messages, onText) {
  const tools = Object.entries(STRATA_TOOLS).map(([n, t]) => `- ${n}: ${t.d}`).join("\n");
  const sys = systemPrompt("Argus", last, "strata") + `\n\nDu hast Werkzeuge auf diesem PC. Brauchst du eines, antworte NUR mit genau einer Zeile:\n<werkzeug>{"name": "…", "args": {…}}</werkzeug>\nDanach bekommst du das Ergebnis und antwortest dem Nutzer kurz auf Deutsch. Erfinde keine Ergebnisse, nutze das Werkzeug. Werkzeuge:\n${tools}`;
  const msgs = [...messages];
  for (let round = 0; round < 4; round++) {
    let held = "";
    const text = await strata.ask(sys, msgs, (t) => { held = t; if (!/^\s*<w/i.test(t) && !/^\s*<$/.test(t)) onText(t); });
    const m = /<werkzeug>\s*([\s\S]*?)\s*(?:<\/werkzeug>|$)/i.exec(text);
    if (!m) return text || held;
    let call; try { call = JSON.parse(m[1]); } catch { try { call = JSON.parse(m[1].replace(/'/g, '"')); } catch { return text.replace(m[0], "").trim() || "Das habe ich nicht verstanden."; } }
    const tool = STRATA_TOOLS[call?.name];
    if (call?.name === "claude_fragen") return { needClaude: String(call.args?.grund || "") };
    if (!tool) { msgs.push({ role: "assistant", content: m[0] }, { role: "user", content: `Ergebnis: Werkzeug ${call?.name} gibt es nicht.` }); continue; }
    aiLog(`Strata nutzt ${call.name}`, "tool"); sendUI("ai-who", { who: "local", label: "Strata · " + (TOOL_DE[call.name] || call.name) });
    let res; try { res = await tool.run(call.args || {}); } catch (e) { res = "Fehler: " + (e.message || e); }
    msgs.push({ role: "assistant", content: m[0] }, { role: "user", content: "Ergebnis von " + call.name + ":\n" + String(res).slice(0, 12000) + "\n\nAntworte jetzt dem Nutzer (oder nutze noch ein Werkzeug)." });
  }
  return "Ich bin nach mehreren Schritten nicht weitergekommen.";
}
// KI-Verlauf: was die KI gerade tut (welche KI, Werkzeuge, Dauer, Verbrauch), die letzten 60 Schritte, für den Block „KI-Verlauf“
const aiHist = [];
function aiLog(t, kind = "") { const e = [Date.now(), String(t).slice(0, 200), kind]; aiHist.push(e); if (aiHist.length > 60) aiHist.shift(); sendUI("ai-log", e); }
ipcMain.handle("ai-hist", () => aiHist);
const farmKwh = (k) => { const b = report.build(k); const v = (b?.farms || []).filter((f) => f.kwh != null); return v.length ? v.reduce((a, f) => a + f.kwh, 0) : null; };
ipcMain.handle("energy-get", () => ({ today: farmKwh(report.dayKey()), yesterday: farmKwh(report.yesterday()) }));
ipcMain.handle("report-get", (_e, k) => report.build(k || report.yesterday()) || report.build(report.dayKey()));
ipcMain.handle("report-days", () => report.days());
const TOOL_DE = { lokale_ki: "fragt die lokale KI", systemstatus: "liest die Systemwerte", oeffnen: "öffnet etwas", gedaechtnis_suchen: "durchsucht das Gedächtnis", gedaechtnis_verlauf: "liest frühere Gespräche", gedaechtnis_merken: "merkt sich etwas", dateien_suchen: "sucht Dateien", datei_lesen: "liest eine Datei", WebSearch: "sucht im Internet", WebFetch: "liest eine Webseite" };
ipcMain.on("ask", async (event, { id, messages }) => {
  const send = (ch, payload) => { if (!event.sender.isDestroyed()) event.sender.send(ch, { id, ...payload }); };
  try {
    let last = messages[messages.length - 1]?.content || "";
    // Rückfrage „Soll ich Claude fragen?“ beantwortet: ja = mit der gemerkten Frage zu Claude, nein = fallen lassen
    let allowClaude = toClaude(last);
    if (pendingClaude && Date.now() - pendingClaude.t < 10 * 60e3) {
      const p0 = pendingClaude; pendingClaude = null;
      if (/^\s*(ja|jo|jep|ok|okay|klar|gerne?|mach(?:\s+das)?|los|yes|bitte|frag(?:\s+ihn)?)\b/i.test(last)) { messages = p0.messages; last = messages[messages.length - 1]?.content || ""; allowClaude = true; }
      else if (/^\s*(nein|nee|ne|nö|lass|nicht)\b/i.test(last)) return send("ask-done", { text: "Okay, dann frage ich Claude nicht." });
    }
    let b = allowClaude ? await pickBackend(last, false, true) : await pickBackend(last);
    // Claude kostet Abo-Kontingent: ohne ausdrückliche Ansage erst nachfragen (Einstellung „Vor Claude fragen“)
    const askFirst = (why) => { pendingClaude = { messages, t: Date.now() }; const t = (why ? why + " " : "") + "Dafür würde ich Claude fragen, das kostet Abo-Kontingent. Soll ich? (ja / nein)"; aiLog("Wartet auf dein OK für Claude", "start"); sendUI("ai-who", { who: null }); return send("ask-done", { text: t }); };
    if ((b.kind === "abo" || b.kind === "claude") && !allowClaude && config.claudeAsk !== false && strata.findDir?.()) return askFirst("");
    const t0 = Date.now(), q = last.length > 60 ? last.slice(0, 60) + "…" : last;
    aiLog(`Frage „${q}“ → ${b.label}`, "start");
    const onText = (text) => send("ask-delta", { text });
    sendUI("ai-who", { who: b.who, label: b.label });
    if (b.kind === "abo") {
      try { const text = await askClaudeCode(messages, onText); sendUI("ai-who", { who: null }); remember(last, text, "Claude"); aiLog(`Fertig nach ${((Date.now() - t0) / 1000).toFixed(1)} s, ${text.length} Zeichen`, "done"); return send("ask-done", { text }); }
      catch (e) { aiLog("Claude-Abo nicht nutzbar: " + (e.message || e), "err"); blockClaudeCode(e); pushAiStatus(); b = await pickBackend(last, true); aiLog("Weiter mit " + b.label, "start"); sendUI("ai-who", { who: b.who, label: b.label }); }
    }
    const text = b.kind === "claude" ? await askClaude(b, messages, onText)
      : b.kind === "openai" ? await askOpenAI(b, messages, onText)
      : b.kind === "ollama" ? await askOllama(b, messages, onText)
      : b.kind === "strata" ? (strataUsed = Date.now(), await strataAgent(last, messages, onText).finally(() => { strataUsed = Date.now(); }))
      : await askDemo(messages, onText);
    if (text && typeof text === "object" && "needClaude" in text) return askFirst("Das schaffe ich allein nicht gut" + (text.needClaude ? ` (${text.needClaude})` : "") + ".");
    sendUI("ai-who", { who: null });
    if (b.kind !== "demo") remember(last, text, b.kind === "claude" ? "Claude" : b.kind === "openai" ? b.p.name : "Lokal");
    aiLog(`Fertig nach ${((Date.now() - t0) / 1000).toFixed(1)} s, ${text.length} Zeichen`, "done");
    send("ask-done", { text });
  } catch (e) {
    aiLog("Fehler: " + (e.message || e), "err");
    sendUI("ai-who", { who: null });
    send("ask-error", errorText(e));
  }
});

// ---------- Fenster ----------
const MARGIN = 12, MIN_SIZE = 200, MAX_SIZE = 900;
// Fenstergröße folgt config.size (Breite der kleinen Kugel)
function sizes() {
  const wa = alive() && viewReady ? screen.getDisplayMatching(win.getBounds()).workArea : startArea();
  const s = Math.max(MIN_SIZE, Math.min(MAX_SIZE, config.size, wa.height - 2 * MARGIN));
  return {
    compact: { width: Math.round(s), height: Math.round(s * 1.08) },
    expanded: {
      width: Math.round(Math.min(wa.width - 2 * MARGIN, config.panelW || Math.max(560, s * 1.6))),
      height: Math.round(Math.min(wa.height - 2 * MARGIN, config.panelH || Math.min(s + 480, Math.round(Math.min(wa.width - 2 * MARGIN, config.panelW || Math.max(560, s * 1.6)) * 1.7)))),
    },
  };
}
let watch = null;
let win = null, tray = null, expanded = false;

function nearestCorner() {
  if (!alive() || shrinkTimer) return config.corner;
  const b = win.getBounds(), d = screen.getDisplayMatching(b).workArea;
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  return (cy < d.y + d.height / 2 ? "top" : "bottom") + "-" + (cx < d.x + d.width / 2 ? "left" : "right");
}
// Bildschirm vor dem ersten Anzeigen: der, auf dem Argus zuletzt war (lastView.at), nicht einfach der Hauptbildschirm
const startArea = () => { const at = config.lastView?.at; return at && Number.isFinite(at.x) ? screen.getDisplayNearestPoint(at).workArea : screen.getPrimaryDisplay().workArea; };
function place(corner, size, area) {
  const d = area || (alive() && viewReady ? screen.getDisplayMatching(win.getBounds()).workArea : startArea());
  const x = corner.endsWith("left") ? d.x + MARGIN : d.x + d.width - size.width - MARGIN;
  const y = corner.startsWith("top") ? d.y + MARGIN : d.y + d.height - size.height - MARGIN;
  return { x: Math.round(x), y: Math.round(y), ...size };
}
// Windows ignoriert setBounds bei nicht skalierbaren, transparenten Fenstern oft. Darum das
// Fenster für den Moment freigeben und danach wieder sperren.
// Größenwechsel ohne Fenster-Animation (die flackert unter Windows): Beim Vergrößern wächst das
// Fenster sofort und die Kugel darin weich nach. Beim Verkleinern schrumpft erst die Kugel, dann das Fenster.
// Aussparung: eine Ecke des Argus-Fensters wird herausgeschnitten, dort liegt dann ein anderes Programm (z. B. das Discord-Popup mit den Kameras)
// ungestört darüber, auch wenn man auf Argus klickt. Nur wenn das Panel offen ist.
let lastShape = "";
// Aussparung folgt dem Programm: ein kleiner Dauer-Prozess meldet das vorderste Fenster (nur lesend, nur solange „Folgen“ an ist)
function applyShape() {
  if (!alive() || typeof win.setShape !== "function") return;
  try {
    const b = win.getContentBounds(), W = b.width, H = b.height;
    if (!config.holeOn || config.holeEdit || !expanded || W < 500 || H < 400) { if (lastShape) { win.setShape([]); lastShape = ""; } return; } // ohne Aussparung gar keine Form: ein „volles Rechteck“ in DIP wird unter Windows mit Skalierung (z. B. 150 %) als Pixel gelesen und schneidet das Fenster rechts und unten ab
    let hw, hh, hx, hy;
    {
      hw = Math.max(80, Math.min(W - 200, Math.round(config.holeW || 360))); hh = Math.max(80, Math.min(H - 200, Math.round(config.holeH || 260)));
      const c = config.holeCorner || "br";
      // Ohne gesetzte Position sitzt die Aussparung in der Ecke; sonst frei an holeX/holeY (linke obere Ecke)
      const fx = c.endsWith("r") ? W - hw : 0, fy = c.startsWith("b") ? H - hh : 0;
      hx = Math.max(0, Math.min(W - hw, Math.round(Number.isFinite(config.holeX) ? config.holeX : fx))); hy = Math.max(0, Math.min(H - hh, Math.round(Number.isFinite(config.holeY) ? config.holeY : fy)));
    }
    // Fenster minus abgerundetes Rechteck: Zeile für Zeile berechnet, gleiche Nachbarzeilen werden zu einem Rechteck zusammengefasst
    // vier Ecken einzeln (oben links, oben rechts, unten rechts, unten links); ohne eigene Werte gilt holeRound für alle
    const base = Number.isFinite(config.holeRound) ? config.holeRound : 16, cap = Math.floor(Math.min(hw, hh) / 2);
    const rad = [0, 1, 2, 3].map((i) => Math.max(0, Math.min(60, cap, Math.round(Array.isArray(config.holeRadii) && Number.isFinite(config.holeRadii[i]) ? config.holeRadii[i] : base))));
    const key = [W, H, hw, hh, hx, hy, ...rad].join();
    if (key === lastShape) return;
    const inset = (r, d) => (d >= r ? 0 : Math.ceil(r - Math.sqrt(Math.max(0, r * r - (r - d - 0.5) ** 2))));
    const rects = []; let run = null;
    const flush = () => { if (run) { if (run.a > 0) rects.push({ x: 0, y: run.y, width: run.a, height: run.n }); if (run.b < W) rects.push({ x: run.b, y: run.y, width: W - run.b, height: run.n }); run = null; } };
    for (let y = 0; y < H; y++) {
      let a = W, b = W; // außerhalb der Aussparung: ganze Breite ist Fenster (a = b = W → linkes Rechteck deckt alles)
      if (y >= hy && y < hy + hh) { const dt = y - hy, db = hy + hh - 1 - y; a = hx + Math.max(inset(rad[0], dt), inset(rad[3], db)); b = hx + hw - Math.max(inset(rad[1], dt), inset(rad[2], db)); }
      if (run && run.a === a && run.b === b) run.n++; else { flush(); run = { y, a, b, n: 1 }; }
    }
    flush();
    win.setShape(rects); lastShape = key;
  } catch (e) { logError(e); }
}
let shrinkTimer = null, boundsCheckT = null, lastBoundsW = 0, lastBoundsH = 0;
let panelDrag = null; // läuft gerade ein Ziehen an Panel-Kante oder -Ecke
// Bei gemischter Skalierung (z. B. 100 % und 150 % auf zwei Bildschirmen) rechnet Windows die Größe beim ersten setBounds mit dem Maßstab des alten Bildschirms:
// das Fenster bleibt dann kleiner als die Oberfläche (Inhalt rechts abgeschnitten, Vergrößern und Maximieren wirkungslos). Zweimal setzen: erst Lage, dann Größe
function putBounds(b) { win.setBounds(b); win.setBounds(b); }
let lastSF = 0;
function setBoundsNow(b) {
  if (!alive()) return;
  if (!lastBoundsW || Math.abs(lastBoundsW - b.width) > 1 || Math.abs(lastBoundsH - b.height) > 1) setTimeout(applyShape, 60);
  lastBoundsW = b.width; lastBoundsH = b.height;
  if (panelDrag) return putBounds(b); // während des Ziehens bleibt das Fenster dauerhaft veränderbar
  win.setResizable(true); win.setMinimumSize(1, 1);
  putBounds(b);
  win.setResizable(false);
  // Windows übernimmt die Größe bei durchsichtigen Fenstern manchmal nicht (schnelles Auf-/Zuklappen ließ das Panel abgeschnitten zurück): prüfen und nachsetzen
  clearTimeout(boundsCheckT);
  let tries = 0;
  const verify = () => {
    if (!alive() || panelDrag) return;
    const c = win.getBounds();
    if (Math.abs(c.width - b.width) <= 6 && Math.abs(c.height - b.height) <= 6) {
      // Fenstermaß stimmt: noch prüfen, ob die Oberfläche genauso groß ist (sonst hat Windows die Größe mit falschem Maßstab angewendet)
      if (tries === 0 && viewReady) win.webContents.executeJavaScript("[innerWidth, innerHeight]").then((r) => { const cb = win.getContentBounds(); if (alive() && !panelDrag && Array.isArray(r) && (Math.abs(r[0] - cb.width) > 8 || Math.abs(r[1] - cb.height) > 8)) { win.setResizable(true); win.setMinimumSize(1, 1); putBounds(b); win.setResizable(false); } }).catch(() => {});
      return;
    }
    win.setResizable(true); win.setMinimumSize(1, 1); putBounds(b); win.setResizable(false);
    if (++tries < 3) boundsCheckT = setTimeout(verify, 200);
  };
  boundsCheckT = setTimeout(verify, 200);
}
let viewReady = false, restoreAt = null, lvTimer = null; // letzte Ansicht (Panel offen, Vollbild, auf welchem Bildschirm) überlebt Neustart und Update
let progQuiet = 0; // bis dahin sind Moved-Ereignisse vom eigenen Setzen der Größe, nicht vom Ziehen
let winMode = "normal"; // nur im Panel: "normal", "max" (Arbeitsbereich) oder "full" (ganzer Bildschirm)
function applyBounds(corner, animate = true) {
  if (!alive()) return;
  const disp = restoreAt ? screen.getDisplayNearestPoint(restoreAt) : screen.getDisplayMatching(win.getBounds()); restoreAt = null;
  // „ganz groß“ lässt die Taskleiste frei (Nutzerwunsch: sonst kommt sie auch beim Runterfahren mit der Maus nicht mehr hoch)
  const b = expanded && (winMode === "max" || winMode === "full") ? bigBox(disp.workArea)
    : expanded && panelBoxOk() ? fitOnScreen(config.panelBox)
    : place(corner, expanded ? sizes().expanded : sizes().compact, disp.workArea);
  const cur = win.getBounds();
  if (viewReady) { const lv = { exp: expanded, mode: expanded ? winMode : "normal", at: { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) } }, o = config.lastView;
    if (!o || o.exp !== lv.exp || o.mode !== lv.mode || o.at?.x !== lv.at.x || o.at?.y !== lv.at.y) { config.lastView = lv; clearTimeout(lvTimer); lvTimer = setTimeout(() => saveConfig(), 400); } }
  sendUI("layout", { corner, size: config.size, expanded, mode: expanded ? winMode : "normal" });
  clearTimeout(shrinkTimer); shrinkTimer = null;
  if (animate && !expanded && (b.width < cur.width || b.height < cur.height)) shrinkTimer = setTimeout(() => { shrinkTimer = null; setBoundsNow(b); }, 280);
  else setBoundsNow(b);
}
// Ganz groß mit angedocktem Lagebild: das Panel lässt dessen Streifen frei, das Lagebild füllt ihn über die volle Höhe bzw. Breite
// Automatisch ausgeblendete Taskleiste: Arbeitsbereich = ganzer Bildschirm, ein Fenster bis zum Rand fängt dann die Maus ab und die Leiste kommt nicht mehr hoch. Deshalb 3 px Rand lassen.
function edgeSafe(wa) {
  try { const d = screen.getDisplayMatching(wa).bounds; if (d.x === wa.x && d.y === wa.y && d.width === wa.width && d.height === wa.height) return { x: wa.x + 3, y: wa.y + 3, width: wa.width - 6, height: wa.height - 6 }; } catch {}
  return wa;
}
function bigBox(wa) { wa = edgeSafe(wa);
  const d = config.newsDock, nb = config.newsBox;
  if (!d || !newsAlive() || !nb) return wa;
  const w = Math.min(Math.round(nb.width), Math.round(wa.width * 0.45)), h = Math.min(Math.round(nb.height), Math.round(wa.height * 0.45));
  if (d.side === "left") return { ...wa, x: wa.x + w, width: wa.width - w };
  if (d.side === "right") return { ...wa, width: wa.width - w };
  if (d.side === "top") return { ...wa, y: wa.y + h, height: wa.height - h };
  return { ...wa, height: wa.height - h };
}
// Selbst verschobenes/gezogenes Panel merken, solange es noch auf einem Bildschirm liegt
function panelBoxOk() {
  const p = config.panelBox;
  if (!p || !(p.width >= 380 && p.height >= 420) || p.height / p.width > 2.2) return false; // zu schmal und hoch (altes Einrasten am Rand) gilt als ungültig
  return screen.getAllDisplays().some((d) => { const a = d.workArea; return p.x < a.x + a.width - 60 && p.x + p.width > a.x + 60 && p.y >= a.y - 10 && p.y < a.y + a.height - 60; });
}
// Panel immer ganz auf einen Bildschirm holen (Nutzerwunsch: Panel hing halb links draußen, Bedienelemente unerreichbar)
function fitOnScreen(p) {
  let a = screen.getDisplayMatching({ x: Math.round(p.x), y: Math.round(p.y), width: Math.round(p.width), height: Math.round(p.height) }).workArea;
  a = edgeSafe(a);
  const width = Math.min(Math.round(p.width), a.width), height = Math.min(Math.round(p.height), a.height);
  return { width, height, x: Math.max(a.x, Math.min(a.x + a.width - width, Math.round(p.x))), y: Math.max(a.y, Math.min(a.y + a.height - height, Math.round(p.y))) };
}
function rescueWindow() { // Tray: „Fenster zurückholen“
  if (!alive()) return;
  config.panelBox = null; config.panelW = 0; config.panelH = 0; winMode = "normal";
  if (config.holeOn) { config.holeOn = false; try { lastShape = "x"; applyShape(); } catch {} } // eine verirrte Aussparung kann das Fenster klein wirken lassen
  saveConfig();
  if (!win.isVisible()) win.show();
  setExpanded(true); win.focus();
}
function stopAnim() { clearTimeout(shrinkTimer); shrinkTimer = null; }
// Kleines Wiederherstellen-Fenster nach dem Ausblenden: runder Knopf, Klick holt Argus zurück, Ziehen verschiebt ihn (Position wird gemerkt)
let miniWin = null;
function hideMini() { if (miniWin && !miniWin.isDestroyed()) miniWin.close(); miniWin = null; }
function showMini() {
  if (miniWin && !miniWin.isDestroyed()) return;
  const wa = screen.getPrimaryDisplay().workArea, mp = config.miniPos, ok = mp && screen.getAllDisplays().some((d) => mp.x >= d.bounds.x && mp.x < d.bounds.x + d.bounds.width - 20 && mp.y >= d.bounds.y && mp.y < d.bounds.y + d.bounds.height - 20);
  miniWin = new BrowserWindow({ width: 68, height: 68, x: ok ? mp.x : wa.x + wa.width - 88, y: ok ? mp.y : wa.y + wa.height - 88, frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, show: false, focusable: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false } });
  const hue = Math.round(Number(config.themeHue ?? 205)) || 205;
  const html = `<body style="margin:0;background:transparent;overflow:hidden;user-select:none"><style>
#b{position:relative;margin:4px;width:60px;height:60px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;
background:radial-gradient(circle at 34% 28%,hsl(${hue} 100% 88%) 0,hsl(${hue} 90% 62%) 22%,hsl(${hue} 80% 36%) 58%,hsl(${hue} 85% 14%) 100%);
box-shadow:0 0 14px hsl(${hue} 100% 60% / .55),inset -5px -7px 12px hsl(${hue} 90% 8% / .75),inset 3px 3px 8px hsl(${hue} 100% 92% / .45);border:1px solid hsl(${hue} 100% 85% / .5);transition:transform .15s}
#b:hover{transform:scale(1.07)}#b::before{content:"";position:absolute;left:12px;top:6px;width:26px;height:14px;border-radius:50%;background:radial-gradient(ellipse,rgba(255,255,255,.75),rgba(255,255,255,0) 70%);transform:rotate(-24deg)}
#b span{position:relative;font:600 11px/1 Bahnschrift,"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;letter-spacing:.14em;text-indent:.14em;color:#fff;text-shadow:0 1px 3px rgba(0,10,30,.9),0 0 8px hsl(${hue} 100% 70% / .8)}
</style><div id=b title="Argus zurückholen"><span>ARGUS</span></div><script>const {ipcRenderer}=require("electron");let d=null,mv=false;b.onmousedown=e=>{d={x:e.screenX,y:e.screenY};mv=false;};window.onmousemove=e=>{if(!d)return;if(Math.abs(e.screenX-d.x)+Math.abs(e.screenY-d.y)>4)mv=true;if(mv){ipcRenderer.send("mini-move",e.screenX-34,e.screenY-34);}};window.onmouseup=()=>{if(d&&!mv)ipcRenderer.send("mini-restore");d=null;};</script></body>`;
  miniWin.setAlwaysOnTop(true, "floating"); miniWin.setMenuBarVisibility?.(false);
  miniWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  miniWin.once("ready-to-show", () => { if (miniWin && !miniWin.isDestroyed()) miniWin.showInactive(); });
  miniWin.on("closed", () => { miniWin = null; });
}
ipcMain.on("mini-restore", () => { setExpanded(true); });
ipcMain.on("mini-move", (_e, x, y) => { if (miniWin && !miniWin.isDestroyed()) { miniWin.setPosition(Math.round(x), Math.round(y)); config.miniPos = { x: Math.round(x), y: Math.round(y) }; saveConfig(); } });
// Nach dem Einblenden die YouTube-/Twitch-Flächen wieder anzeigen: beim Ausblenden wurden sie versteckt, die Oberfläche meldet ihre Lage aber nur bei Änderung. Ein 1-px-Anstoß zwingt das Neuzeichnen (sonst bleibt die Fläche schwarz).
function reshowViews() {
  if (!alive() || !expanded || !win.isVisible()) return;
  for (const [v, r, set] of [[ytView, ytRect, (x) => { ytShown = x; }], [twView, twRect, (x) => { twShown = x; }]]) {
    if (!v || !r) continue;
    try {
      const nb = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
      v.setBounds({ ...nb, width: nb.width + 1 }); v.setVisible(true); set(true); try { v.webContents.invalidate(); } catch {}
      setTimeout(() => { try { v.setBounds(nb); } catch {} }, 60);
    } catch {}
  }
}
function setExpanded(on, focus = true) {
  if (!alive()) return;
  // Kein Mini-Widget mehr: Panel offen oder Argus ausgeblendet (Tray, Strg+Umschalt+J)
  if (!on) {
    if (ytView) { ytView.setVisible(false); ytShown = false; }
    if (twView) { twView.setVisible(false); twShown = false; }
    if (config.afterHide === "taskbar" && process.platform === "win32") {
      // In der Taskleiste minimieren (Klick auf den Eintrag holt Argus zurück); klappt es nicht, wie „klein“ ausblenden
      try { win.setSkipTaskbar(false); win.setMinimizable(true); win.minimize(); } catch {}
      setTimeout(() => { if (alive() && !win.isMinimized()) { win.hide(); showMini(); } }, 300);
      return;
    }
    win.hide(); if (config.afterHide !== "tray") showMini(); return;
  }
  hideMini();
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  // Beim Aufklappen zählt, wo die Kugel sitzt; beim Zuklappen kehrt sie in ihre Ecke zurück
  const corner = on ? nearestCorner() : config.corner;
  expanded = on;
  if (!on) winMode = "normal";
  applyBounds(corner);
  sendUI("expanded", expanded);
  if (ytView && !expanded) { ytView.setVisible(false); ytShown = false; }
  if (twView && !expanded) { twView.setVisible(false); twShown = false; }
  if (expanded && focus) win.focus();
  applyTop();
}
// Wann Argus über anderen Fenstern liegt; "attention" gilt, solange Argus angesprochen wird oder antwortet
let attention = false;
// Taskleiste vor Argus: Argus ist „immer oben“ und verdeckt eine automatisch ausblendende Taskleiste. Berührt die Maus den Bildschirmrand, nimmt Argus die Vordergrund-Stellung kurz zurück (nur wenn eingeschaltet; Abfrage alle 300 ms)
let edgeT = null, edgeLow = false, edgeLeft = 0;
function edgeWatch() {
  clearInterval(edgeT); edgeT = null;
  if (edgeLow) { edgeLow = false; applyTop(); }
  if (!config.taskbarFront || process.platform !== "win32") return;
  edgeT = setInterval(() => {
    if (!alive() || !expanded || !win.isVisible()) return;
    const p = screen.getCursorScreenPoint(), b = screen.getDisplayNearestPoint(p).bounds;
    const near = p.x <= b.x + 2 || p.y <= b.y + 2 || p.x >= b.x + b.width - 3 || p.y >= b.y + b.height - 3;
    if (near) { edgeLeft = Date.now() + 1500; if (!edgeLow) { edgeLow = true; win.setAlwaysOnTop(false); syncNews(); } }
    else if (edgeLow && Date.now() > edgeLeft) { edgeLow = false; applyTop(); }
  }, 300);
}
function applyTop() {
  if (edgeLow) return;
  if (!alive()) return;
  const m = config.onTop || "kugel";
  // Kompatibilitätsmodus: aufgeklapptes Panel bleibt oben (sonst verschwand es beim Klick auf den Desktop)
  const on = attention || m === "immer" || (m === "kugel" && !expanded) || (config.gfxSafe === true && m !== "nie" && expanded);
  win.setAlwaysOnTop(on, "floating"); syncNews();
  // Liegt das Panel hinter anderen Fenstern, braucht es einen Taskleisteneintrag, sonst ist es nicht auffindbar
  try { const ts = config.taskbarShow; win.setSkipTaskbar(!(expanded && (ts === "immer" || (ts === "verdeckt" && !on)))); } catch {} // Standard: nie in der Taskleiste (Nutzerwunsch); auf Wunsch nur, wenn das Panel hinter anderen Fenstern liegt
}
// Lagebild verhält sich wie das Hauptfenster: gleiche Vordergrund-Stellung, weg und wieder da mit Argus ("immer im Vordergrund" erzwingt sie zusätzlich)
function syncNews() {
  if (!newsAlive()) return;
  try {
    const show = !!config.newsOn && alive() && win.isVisible() && !win.isMinimized();
    if (!show) { if (newsWin.isVisible()) newsWin.hide(); return; }
    newsWin.setAlwaysOnTop(win.isAlwaysOnTop() || config.newsOnTop === true, "floating");
    if (!newsWin.isVisible()) newsWin.showInactive();
  } catch {}
}
ipcMain.on("attention", (_e, on) => {
  if (!alive() || config.wakeFront === false || attention === !!on) return;
  attention = !!on;
  if (attention) { if (!win.isVisible()) win.showInactive(); win.moveTop(); }
  applyTop();
});
let saveTimer = null;
function setSize(size, animate = true) {
  config.size = Math.round(Math.max(MIN_SIZE, Math.min(MAX_SIZE, size)));
  clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveConfig(); tray?.setContextMenu(trayMenu()); }, 400);
  applyBounds(nearestCorner(), animate);
}
function setCorner(corner) {
  config.corner = corner; saveConfig();
  applyBounds(corner);
}

let backgroundPresentationController;
async function createWindow(port) {
  win = new BrowserWindow({
    ...place(config.corner, sizes().compact),
    frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false,
    resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: config.onTop !== "nie", show: false, title: "Argus", icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  applyTop();
  win.setVisibleOnAllWorkspaces(true);
  win.once("ready-to-show", () => {
    win.showInactive();
    // wie vor dem Beenden/Update: Panel wieder offen, gleicher Modus, gleicher Bildschirm
    const lv = config.lastView || {}; // frische Installation: noch keine letzte Ansicht gespeichert
    if (alive()) { winMode = ["max", "full"].includes(lv.mode) ? lv.mode : "normal"; if (lv.at) restoreAt = lv.at; expanded = true; applyTop(); applyBounds(config.corner, false); sendUI("expanded", true); }
    viewReady = true;
  });
  win.on("moved", () => {
    if (!alive()) return;
    try { const sf = screen.getDisplayMatching(win.getBounds()).scaleFactor; if (lastSF && sf !== lastSF && expanded && winMode === "normal") setBoundsNow(win.getBounds()); lastSF = sf; } catch {}
    if (!expanded) { config.corner = nearestCorner(); const b = win.getBounds(); config.lastView = { ...(config.lastView || {}), exp: false, mode: "normal", at: { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) } }; }
    else if (winMode === "max") {
      // Aus dem Vollbild weggezogen: wieder normale Größe unter dem Mauszeiger, Ränder zum Größe-Ändern wieder da
      const c = screen.getCursorScreenPoint(), wa = screen.getDisplayNearestPoint(c).workArea, b = win.getBounds();
      const bgx = bigBox(wa); // auch das gewollte Maß mit Platz für ein angedocktes Lagebild gilt als "nicht weggezogen"
      if (Date.now() < progQuiet || (Math.abs(b.x - wa.x) <= 2 && Math.abs(b.y - wa.y) <= 2 && Math.abs(b.width - wa.width) <= 2) || (Math.abs(b.x - bgx.x) <= 2 && Math.abs(b.y - bgx.y) <= 2 && Math.abs(b.width - bgx.width) <= 2)) return;
      const pb = panelBoxOk() ? config.panelBox : { width: sizes().expanded.width, height: sizes().expanded.height };
      winMode = "normal";
      config.panelBox = { width: pb.width, height: pb.height, x: Math.round(c.x - pb.width / 2), y: Math.max(wa.y, c.y - 20) };
      applyTop(); applyBounds(config.corner, false);
    }
    else if (winMode === "normal") {
      // Wie bei Windows: an den oberen Rand gezogen = Vollbild im Arbeitsbereich, an den linken/rechten Rand = halber Bildschirm
      const c = screen.getCursorScreenPoint(), wa = screen.getDisplayNearestPoint(c).workArea;
      if (c.y <= wa.y + 2) { winMode = "max"; applyTop(); applyBounds(config.corner, false); return; }
      // Am linken/rechten Rand gibt es bewusst kein Einrasten auf den halben Bildschirm mehr: auf einem hochkant gestellten Monitor wurde das Panel dadurch schmal und hoch
      const b = win.getBounds(), f = fitOnScreen(b); // nach dem Loslassen ganz auf den Bildschirm zurückholen
      if (f.x !== b.x || f.y !== b.y || f.width !== b.width || f.height !== b.height) setBoundsNow(f);
      config.panelBox = f; // Panel an der Leiste verschoben
    }
    saveConfig();
  });
  win.on("move", () => { followDock(); }); win.on("resize", () => { followDock(); applyShape(); });
  // Angedockt sind Panel und Lagebild ein Fenster: holt man eins nach vorn, kommt das andere mit
  win.on("blur", () => { blurAt = Date.now(); });
  for (const ev of ["show", "hide", "minimize", "restore"]) win.on(ev, () => setTimeout(syncNews, 50));
  win.on("focus", () => { if (config.newsDock && expanded && newsAlive() && !config.newsOnTop) newsWin.moveTop(); });
  // Windows verwirft die Fensterform beim Ausblenden/Einblenden: Aussparung danach neu setzen (Einblenden über Tray oder Strg+Umschalt+J)
  win.on("show", () => { if (config.holeOn) { lastShape = "x"; applyShape(); setTimeout(() => { lastShape = "x"; applyShape(); }, 250); } setTimeout(reshowViews, 200); });
  // Bildschirmwechsel, Skalierung oder Fernwartung (AnyDesk) ändern die Maße: Fenstergröße danach neu anwenden
  let dmT = null; screen.on("display-metrics-changed", () => { if (!alive() || !viewReady) return; clearTimeout(dmT); dmT = setTimeout(() => { if (alive()) applyBounds(config.corner, false); }, 500); });
  win.on("restore", () => { if (!expanded || !win.isVisible()) setExpanded(true); });
  win.on("closed", () => { stopAnim(); hideMini(); clearInterval(moveTimer); win = null; });
  // Oberfläche abgestürzt: für den Fehlerbericht merken und neu laden
  win.webContents.on("render-process-gone", (_e, d) => {
    if (d?.reason === "clean-exit") return;
    crash.add("Oberfläche abgestürzt", `${d?.reason} (Code ${d?.exitCode})`);
    setTimeout(() => { if (alive()) win.webContents.reload(); }, 1500);
  });
  discordUiOrigin = `http://127.0.0.1:${port}`;
  await win.loadURL(discordUiOrigin + "/").catch((e) => console.warn("UI laden fehlgeschlagen:", e.message));
  sendUI("voice-status", voiceState);
  sendUI("layout", { corner: config.corner, size: config.size, expanded });
  watchCursor();
}

// Mauszeiger über dem Fenster melden. Im Ziehbereich liefert Windows dem Fenster keine
// Mausbewegungen, darum fragt der Hauptprozess die Zeigerposition selbst ab.
function watchCursor() {
  let inside = false;
  setInterval(() => {
    if (!alive() || !win.isVisible()) return;
    const p = screen.getCursorScreenPoint(), b = win.getBounds();
    const now = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    if (now || inside) sendUI("cursor", now ? { x: p.x - b.x, y: p.y - b.y } : null);
    inside = now;
  }, 16);
}

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "assets", "tray.png"));
  tray = new Tray(icon);
  tray.setToolTip("Argus");
  tray.setContextMenu(trayMenu());
  tray.on("click", toggleVisible);
}
// ---------- Updates ----------
// Installierte Version (Setup) holt sich neue Versionen selbst von der Update-Adresse (latest.yml + Setup-Datei), lädt sie im Hintergrund
// und installiert beim nächsten Beenden oder sofort auf Wunsch. Die entpackte Zip-Version kann sich nicht selbst aktualisieren.
let updState = { text: "", ready: false }, updTimer = null, updater = null;
function updaterOk() { return app.isPackaged && process.platform === "win32" && fs.existsSync(path.join(process.resourcesPath, "app-update.yml")); }
function setupUpdater() {
  if (!updaterOk()) { updState.text = process.platform === "linux" ? "Unter Linux gibt es noch keine automatische Aktualisierung. Neue Versionen kommen als AppImage-Datei." : process.platform === "darwin" ? "Auf dem Mac gibt es noch keine automatische Aktualisierung (die App ist nicht signiert). Neue Versionen kommen als ZIP-Datei." : app.isPackaged ? "Updates gibt es nur in der installierten Version (Setup)." : ""; return; }
  try { updater = require("electron-updater").autoUpdater; } catch (e) { logError(e); return; }
  updater.autoDownload = true; updater.autoInstallOnAppQuit = true;
  updater.on("checking-for-update", () => { updState.text = "Suche nach Updates…"; });
  updater.on("update-not-available", () => { updState.text = "Argus ist aktuell (" + app.getVersion() + ")."; });
  updater.on("update-available", (i) => { updState.text = "Lade Version " + i.version + "…"; });
  updater.on("download-progress", (p) => { updState.text = "Lade Update: " + Math.round(p.percent) + " %"; });
  updater.on("update-downloaded", (i) => {
    updState = { text: "Version " + i.version + " ist geladen und wird beim Beenden installiert.", ready: true, version: i.version };
    sendUI("notice", `Update auf Version ${i.version} ist bereit. Es wird beim nächsten Beenden installiert, oder sofort über „Jetzt aktualisieren“ in den Einstellungen.`);
    tray?.setContextMenu(trayMenu());
  });
  updater.on("error", (e) => { updState.text = "Update-Prüfung fehlgeschlagen: " + String(e?.message || e).split("\n")[0].slice(0, 160); });
  checkUpdates();
  // Nur beim Start prüfen (Nutzerwunsch): kein Zeitgeber; manuell über Einstellungen oder Tray-Menü
}
// Neue Versionen liegen im Zweig „updates“ von dem Repo d0mm392/Argus (früher d0mm392/jarvis; latest.yml + Setup).
// Ein eigener Eintrag in den Einstellungen geht vor. Antwortet die Adresse nicht, wird die alte Repo-Adresse versucht.
// Kanal „stabil“ liest den Zweig „stable“ (nur freigegebene Versionen), „test“ den Zweig „updates“ (jeder Bau)
const UPDATE_URLS_TEST = ["https://raw.githubusercontent.com/d0mm392/Argus/updates", "https://raw.githubusercontent.com/d0mm392/jarvis/updates"];
const UPDATE_URLS_STABLE = ["https://raw.githubusercontent.com/d0mm392/Argus/stable"];
function checkUpdates(alt = 0) {
  if (!updater) return false;
  const UPDATE_URLS = config.updateChannel === "test" ? UPDATE_URLS_TEST : UPDATE_URLS_STABLE;
  const own = (config.updateUrl || "").trim(), url = (own || UPDATE_URLS[alt]).replace(/\/+$/, "");
  updState.text = "Suche nach Updates…";
  try { updater.setFeedURL({ provider: "generic", url, channel: "latest" }); updater.requestHeaders = { "Cache-Control": "no-cache", Pragma: "no-cache" }; updater.checkForUpdates().catch((e) => {
    if (!own && alt + 1 < UPDATE_URLS.length) return checkUpdates(alt + 1);
    updState.text = "Update-Prüfung fehlgeschlagen: " + String(e?.message || e).slice(0, 160); }); return true; }
  catch (e) { updState.text = "Update-Prüfung fehlgeschlagen: " + e.message; return false; }
}
ipcMain.handle("update-status", () => ({ ...updState, version: app.getVersion(), installed: updaterOk() }));
ipcMain.handle("update-check", () => { checkUpdates(); return { ...updState, version: app.getVersion(), installed: updaterOk() }; });
// Oberflächenwechsel: gleiche Prüfung für Einstellungen und Tray, danach regulär beenden (before-quit/will-quit: Speichern, Notizen beim Schließen, eigene Prozesse) und einmal neu starten
let uiRelaunching = false;
function switchUi(target) {
  const busy = [localBusy && "die Einrichtung der lokalen KI", /^Lade/.test(updState.text || "") && "ein Update-Download", downloadsActive > 0 && "ein Download", strata.snapshot().state === "lädt" && "der Start von Strata"];
  const c = uiMode.switchCheck(String(target || ""), uiMode.normalize(config.uiMode), busy); if (!c.ok || uiRelaunching) return c.ok ? { ok: false, text: "Der Neustart ist bereits vorgemerkt. Falls Argus noch läuft, bitte über das Tray-Menü beenden." } : c;
  const prev = config.uiMode; config.uiMode = uiMode.normalize(target);
  try { writeConfigNow(); } catch (e) { config.uiMode = prev; logError(e); return { ok: false, text: "Die Einstellungen ließen sich nicht speichern. Es wurde nicht neu gestartet." }; }
  uiRelaunching = true; // höchstens ein vorgemerkter Neustart; wird das Beenden abgebrochen, führt das nächste Beenden ihn aus
  app.relaunch(); app.quit(); return { ok: true };
}
ipcMain.handle("ui-mode-switch", (_e, target) => switchUi(target));
ipcMain.on("ui-ready", () => { if (uiStart.mode === "apple") uiMode.confirmStart(app.getPath("userData")); });
ipcMain.on("update-install", () => { if (updater && updState.ready) { app.isQuitting = true; crash.clean(); updater.quitAndInstall(true, true); } });
function trayMenu() {
  const corner = (label, key) => ({ label, type: "radio", checked: config.corner === key, click: () => setCorner(key) });
  const size = (label, px) => ({ label, type: "radio", checked: Math.abs(config.size - px) < 30, click: () => setSize(px) });
  return Menu.buildFromTemplate([
    ...(updState.ready ? [{ label: `Auf Version ${updState.version} aktualisieren und neu starten`, click: () => { app.isQuitting = true; crash.clean(); updater.quitAndInstall(true, true); } }, { type: "separator" }] : []),
    { label: "Ein-/Ausblenden", click: toggleVisible },
    { label: "Fenster zurückholen (mittig, Standardgröße)", click: rescueWindow },
    { label: "Kugel ein-/ausblenden", click: () => alive() && win.webContents.send("ctx-action", { a: "tog", v: "ball" }) },
    { type: "separator" },
    localState.phase === "ready"
      ? { label: "Lokale KI: " + localModel(), enabled: false }
      : { label: ["pull", "install", "start", "warm", "update"].includes(localState.phase) ? localState.text : "Lokale KI erneut suchen", enabled: !localBusy, click: () => ensureLocalAI(true) },
    { type: "separator" },
    { label: "Vergrößern", click: () => setSize(config.size * 1.2) },
    { label: "Verkleinern", click: () => setSize(config.size / 1.2) },
    { label: "Größe  (oder Strg + Mausrad, oder Ecke ziehen)", submenu: [size("Klein", 240), size("Mittel", 320), size("Groß", 440), size("Sehr groß", 600), size("Riesig", 800)] },
    { label: "Ecke", submenu: [corner("Oben links", "top-left"), corner("Oben rechts", "top-right"), corner("Unten links", "bottom-left"), corner("Unten rechts", "bottom-right")] },
    { label: "Mit Windows starten", type: "checkbox", checked: config.autostart, click: (i) => { config.autostart = i.checked; saveConfig(); applyAutostart(); } },
    { label: "Einstellungen öffnen (API-Key)", click: () => shell.openPath(CONFIG_PATH) },
    { label: "Einstellungen neu laden", click: () => { loadConfig(); win?.webContents.reload(); } },
    ...(uiStart.mode === "apple" || config.uiMode === "apple" ? [{ label: "Oberfläche: Klassisch wiederherstellen", click: () => { const r = switchUi("klassisch"); if (!r.ok) dialog.showMessageBox({ type: "info", title: "Argus", message: r.text }).catch(() => {}); } }] : []), // geht auch, wenn die Oberfläche nicht lädt
    { type: "separator" },
    { label: "Beenden", click: () => app.quit() },
  ]);
}
// Ein-/Ausblenden (Tray, Strg+Umschalt+J): Ist Argus offen, aber verdeckt (z. B. hinter einem maximierten Programm), holt der Aufruf es nach vorn statt es zu verstecken. Der Klick aufs Tray nimmt Argus den Fokus, daher zählt auch ein Fokusverlust vor weniger als 0,5 s als „war vorn“.
let blurAt = 0;
function toggleVisible() {
  if (!alive()) return;
  if (!win.isVisible() || win.isMinimized()) return setExpanded(true);
  const front = win.isFocused() || Date.now() - blurAt < 500;
  if (front) setExpanded(false);
  else { win.show(); win.moveTop(); win.focus(); if (config.onTop === "nie" || config.onTop === "kugel") { win.setAlwaysOnTop(true, "floating"); setTimeout(() => alive() && applyTop(), 800); } reshowViews(); }
}
function applyAutostart() {
  if (process.platform === "linux") { // Linux kennt setLoginItemSettings nicht: Starter in ~/.config/autostart
    try {
      const f = path.join(os.homedir(), ".config", "autostart", "argus.desktop");
      if (config.autostart && app.isPackaged) {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, `[Desktop Entry]\nType=Application\nName=Argus\nExec="${process.env.APPIMAGE || process.execPath}"${process.env.APPIMAGE ? "" : " --no-sandbox"}\nX-GNOME-Autostart-enabled=true\n`);
      } else fs.rmSync(f, { force: true });
    } catch (e) { logError(e); }
    return;
  }
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!config.autostart });
}

let lastToggle = 0;
ipcMain.on("toggle-expanded", () => { const n = Date.now(); if (n - lastToggle < 450) return; lastToggle = n; setExpanded(true); }); // zwei schnelle Klicks auf die Kugel sollen nicht auf- und gleich wieder zuklappen
// Rechtsklick ins Fenster: Menü mit Einstellungen und den wichtigsten Schaltern (geht auch, wenn die Kopfleiste nicht erreichbar ist)
// Rechtsklick-Menü im Argus-Stil: eigenes kleines Fenster (auch neben der kleinen Kugel nutzbar). Die Einträge kommen als Menü-Vorlage
// und werden hier in einfache Daten verwandelt; Aktionen laufen über die gemerkten click-Funktionen.
let menuWin = null, menuClicks = new Map(), menuReady = null, subWin = null, subReady = null, menuSubs = new Map(), subOpen = 0, menuVars = {}, menuKeep = new Set();
function closeSubMenu() { subOpen = 0; if (subWin && !subWin.isDestroyed()) subWin.close(); subWin = null; subReady = null; }
function closeStyledMenu() { closeSubMenu(); if (menuWin && !menuWin.isDestroyed()) menuWin.close(); menuWin = null; }
// Untermenü als zweites, eigenes Fenster neben dem Hauptmenü (wie bei Windows-Menüs); y = Oberkante des Eintrags im Hauptmenü
function openSubMenu(sid, y, keyboard = false) {
  if (!menuWin || menuWin.isDestroyed()) return;
  if (sid === subOpen) { if (keyboard && subWin && !subWin.isDestroyed()) subWin.focus(); return; }
  closeSubMenu(); const items = menuSubs.get(sid); if (!items) return;
  subOpen = sid;
  const mb = menuWin.getBounds(), wa = screen.getDisplayNearestPoint({ x: mb.x, y: mb.y }).workArea;
  const sw = new BrowserWindow({ x: mb.x + mb.width - 6, y: mb.y + Math.round(y) - 6, width: 220, height: 60, frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false, resizable: false, skipTaskbar: true, show: false, alwaysOnTop: true, focusable: true, title: "Argus Untermenü",
    webPreferences: { preload: path.join(__dirname, "preload-menu.js"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  subWin = sw; sw.setAlwaysOnTop(true, "screen-saver"); sw.setMenuBarVisibility?.(false);
  sw.on("closed", () => { if (subWin === sw) { subWin = null; subOpen = 0; } });
  sw.on("blur", () => setTimeout(() => { if (menuWin && !menuWin.isDestroyed() && !menuWin.isFocused() && !(subWin && !subWin.isDestroyed() && subWin.isFocused())) closeStyledMenu(); }, 120));
  subReady = (cw, ch) => {
    if (!sw || sw.isDestroyed()) return;
    const W = Math.min(Math.max(200, cw), 420), H = Math.min(ch, wa.height - 16), b = menuWin.getBounds();
    let x = b.x + b.width - 6; if (x + W > wa.x + wa.width - 4) x = Math.max(wa.x, b.x - W + 6); // kein Platz rechts: links daneben
    const yy = Math.max(wa.y, Math.min(b.y + Math.round(y) - 6, wa.y + wa.height - H - 4));
    sw.setBounds({ x, y: yy, width: W, height: H }); if (!sw.isVisible()) { if (keyboard) { sw.show(); sw.focus(); } else sw.showInactive(); }
  };
  sw.loadFile(path.join(__dirname, "app", "menu.html")).then(() => { if (!sw.isDestroyed()) sw.webContents.send("menu-show", { items, vars: menuVars, sub: true, ui: uiStart.mode }); }).catch(() => closeSubMenu());
}
// Spendenlink: nur ein vom Nutzer eingetragener https-Link wird geöffnet, sonst Hinweis, wo man ihn einträgt
function openDonate() {
  const u = String(config.donateUrl || "").trim();
  if (/^https:\/\/[^\s]+$/i.test(u)) shell.openExternal(u).catch(() => {});
  else if (alive()) win.webContents.send("notice", "Noch kein Spendenlink hinterlegt: Einstellungen → System → Spenden.");
}
ipcMain.on("open-donate", () => openDonate());
// Tagesbriefing (briefing.js): Text aus den schon geladenen Daten, Karte und Sprache im Panel
const briefing = require("./briefing");
function briefData() {
  const c = config, cur = c.btcCur === "eur" ? "eur" : "usd", d = { name: c.userName, hour: new Date().getHours(), cur, btc: market.btc, wx: wx.data };
  const accts = (farmSt?.accounts || []).filter((a) => !a.hidden && a.miners?.length && !a.pxOff);
  if (accts.length) { const all = accts.flatMap((a) => a.miners); d.farm = { total: all.length, on: all.filter((m) => m.on === true).length }; d.events = (farmEvents(30) || []).filter((e) => Date.now() - e[0] <= 864e5); }
  const days = (mine.pools || []).map((p) => p.day).filter((v) => typeof v === "number");
  if (days.length) d.mineDay = days.reduce((x, y) => x + y, 0);
  try { const st = updState; if (st?.ready) d.update = "Argus Version " + (st.version || "") + " ist bereit"; } catch {}
  d.news = [...(market.krypto || []), ...(market.tech || [])];
  return d;
}
// Schlagzeilen frisch holen (Welt, Krypto, Tech), höchstens 8 s warten; sonst gelten die schon geladenen
async function briefNews(d) {
  try { const f = await Promise.race([news.feeds(["welt", "krypto", "tech"]), new Promise((_r, j) => setTimeout(() => j(new Error("Zeit")), 8000))]); d.news = [...(f.welt || []), ...(f.krypto || []), ...(f.tech || [])]; } catch {}
}
async function briefNow() { const d = briefData(); if (config.briefParts?.headlines !== false) await briefNews(d); return briefing.build(d, { len: config.briefLen, parts: Object.keys(briefing.PARTS.reduce((o, k) => (config.briefParts?.[k] !== false && (o[k] = 1), o), {})) }); }
ipcMain.handle("brief-build", () => briefNow());
setInterval(() => {
  if (!config.briefOn || !alive()) return;
  const n = new Date(), today = n.toLocaleDateString("sv-SE"), [h, m] = String(config.briefTime || "08:00").split(":").map(Number);
  if (config.briefLast === today || n.getHours() * 60 + n.getMinutes() < (h || 0) * 60 + (m || 0)) return;
  config.briefLast = today; saveConfig(); briefNow().then((b) => sendUI("brief", b)).catch(() => {});
}, 60e3);
ipcMain.handle("portal-data", () => portal.data());
ipcMain.handle("portal-login", () => portal.login());
ipcMain.handle("iob-data", () => iob.data());
ipcMain.handle("iob-tree", () => iob.tree());
ipcMain.handle("iob-group", (_e, k) => (typeof k === "string" ? iob.group(k) : []));
ipcMain.handle("iob-browse", (_e, q) => iob.browse(q));
ipcMain.handle("iob-set", (_e, id, val) => (typeof id === "string" && ["boolean", "number", "string"].includes(typeof val) ? iob.setState(id, val) : { ok: false }));
ipcMain.handle("fmdash-data", () => fmdash.data());
ipcMain.handle("fmdash-login", () => fmdash.login());
ipcMain.handle("trade-data", () => trade.fetchAll(config).catch(() => ({ ts: Date.now(), q: {}, m: {}, err: "Kurse konnten nicht geladen werden." })));
// Menütexte auf Englisch (Einstellung „Sprache“); Einträge mit Namen (z. B. „Notizblock“ ausblenden) über Muster
const MENU_EN = {"2D-Darstellung (flach)":"2D display (flat)","Alle einblenden":"Show all","Alles in der Grundfarbe":"Everything in the base color","Alles markieren":"Select all","Anordnung zurücksetzen":"Reset arrangement","Anzeigen":"Displays","Argus unterstützen (Spenden)":"Support Argus (donate)","Aufleuchten der Aktivität":"Activity flash","Aus":"Off","Ausblenden  (Strg+Umschalt+J holt mich zurück)":"Hide  (Ctrl+Shift+J brings me back)","Ausschneiden":"Cut","Aussparung aktiv":"Cut-out active","Aussparung neu anordnen …":"Rearrange cut-out …","Beenden":"Quit","Beschriftungen":"Labels","Beschriftungen ausblenden":"Hide labels","Blau":"Blue","CPU blau, GPU grün, RAM lila":"CPU blue, GPU green, RAM purple","Cyan":"Cyan","Darstellung":"Style","Discord-Freunde":"Discord friends","Drehtempo":"Spin speed","Einfügen":"Paste","Einrichten …":"Set up …","Einstellungen":"Settings","Etwas kleiner":"Slightly smaller","Farbe":"Color","Fenster":"Windows","Fenster zurückholen (mittig, Standardgröße)":"Recover window (centered, default size)","Form":"Shape","Freundesliste":"Friends list","Freundesliste anzeigen":"Show friends list","Gerade":"Straight","Glühen":"Glow","Gold":"Gold","Groß":"Large","Größe":"Size","Grün":"Green","Klein":"Small","Kopieren":"Copy","Kugel":"Orb","Kugel einblenden":"Show orb","Kugel entfernen":"Remove orb","Langsam":"Slow","Last-Anzeige ausblenden":"Hide load display","Layout":"Layout","Limette":"Lime","Material":"Material","Messwerte":"Readings","Mini-Widget: alle Anzeigen":"Mini widget: all displays","Musik-Player einblenden":"Show music player","Nach Updates suchen":"Check for updates","Nach hinten":"Tilted back","Nach hinten legen":"Send to back","Nach links gedreht":"Turned left","Nach rechts gedreht":"Turned right","Nach vorn":"Tilted forward","Nach vorn holen":"Bring to front","Neigung (3D)":"Tilt (3D)","Normal":"Normal","Notizblock":"Notepad","Nur eine":"Only one","Orange":"Orange","Pink":"Pink","Profil laden":"Load profile","Rand der Form":"Shape outline","Regionen bunt":"Regions colorful","Regionen in der Grundfarbe":"Regions in the base color","Rot":"Red","Schnell":"Fast","Schwach":"Weak","Sehr groß":"Very large","Skin":"Skin","Stark":"Strong","Statusanzeige (Leerlauf …)":"Status display (idle …)","Statusanzeige ausblenden":"Hide status display","Steam-Freunde":"Steam friends","Steht":"Still","Strata-Knopf":"Strata button","Strata-Knopf ausblenden":"Hide Strata button","Türkis":"Teal","Violett":"Violet","Weitere Einstellungen …":"More settings …","Wenig":"Little","Wer antwortet („Claude · Lokal“)":"Who answers (“Claude · Local”)","Wie bisher (bis zu 3)":"As before (up to 3)","„Claude · Lokal“ ausblenden":"Hide “Claude · Local”","Aktiv":"Active","Anordnen":"Arrange","Anordnen beenden":"Stop arranging","Beschriftung":"Label","Button":"Button","Statusanzeige":"Status display","Claude · Lokal":"Claude · Local","Laufende Programme":"Running programs","… davon „Claude“":"… of which “Claude”","… davon „Lokal“":"… of which “Local”","Fenster zurückholen":"Recover window","Neigung":"Tilt"};
const MENU_RE = [[/^„(.*)“ ausblenden$/, "Hide “$1”"], [/^Anzeige „(.*)“ ausblenden$/, "Hide display “$1”"], [/^Einblenden: (.*)$/, "Show: $1"], [/^Lüfter „(.*)“ einblenden$/, "Show fan “$1”"], [/^(.*) \(keine Daten\)$/, "$1 (no data)"]];
const mt = (x) => { if (config.lang !== "en" || typeof x !== "string") return x; if (MENU_EN[x]) return MENU_EN[x]; for (const [re, to] of MENU_RE) if (re.test(x)) return x.replace(re, to).replace(/“([^”]*)”/g, (m, n) => "“" + (MENU_EN[n] || n) + "”"); return x; };
function showStyledMenu(t, vars, title) {
  closeStyledMenu(); menuClicks = new Map(); menuSubs = new Map(); menuKeep = new Set(); let n = 0, sn = 0;
  const roles = { cut: () => win.webContents.cut(), copy: () => win.webContents.copy(), paste: () => win.webContents.paste(), selectAll: () => win.webContents.selectAll() };
  const conv = (list) => list.filter((x) => x.visible !== false).map((x) => {
    if (x.type === "separator") return { type: "separator" };
    const o = { label: mt(String(x.label || "")), checked: x.type === "checkbox" || x.type === "radio" ? !!x.checked : false, enabled: x.enabled !== false, danger: !!x.danger };
    if (x.submenu && x.enabled !== false) { o.sid = ++sn; menuSubs.set(o.sid, conv(x.submenu)); } else { o.id = ++n; if (x.type === "checkbox" || x.type === "radio") { o.keep = x.type; menuKeep.add(o.id); } menuClicks.set(o.id, x.click || (x.role && roles[x.role]) || (() => {})); }
    return o;
  });
  const okVars = {}; for (const [k, v] of Object.entries(vars && typeof vars === "object" ? vars : {})) if (/^--[a-z-]{2,14}$/.test(k) && typeof v === "string" && v.length < 200 && !/[;{}<>]|url\(/i.test(v)) okVars[k] = v;
  vars = okVars; menuVars = okVars;
  const items = conv(t); if (title) items.unshift({ type: "title", label: mt(String(title)).slice(0, 60) });
  const pt = screen.getCursorScreenPoint(), disp = screen.getDisplayNearestPoint(pt), wa = disp.workArea;
  menuWin = new BrowserWindow({ x: pt.x, y: pt.y, width: 260, height: 80, frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false, resizable: false, skipTaskbar: true, show: false, alwaysOnTop: true, title: "Argus Menü",
    webPreferences: { preload: path.join(__dirname, "preload-menu.js"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  const w = menuWin; w.setAlwaysOnTop(true, "screen-saver"); w.setMenuBarVisibility?.(false);
  w.on("blur", () => setTimeout(() => { if (menuWin === w && !w.isDestroyed() && !w.isFocused() && !(subWin && !subWin.isDestroyed() && subWin.isFocused())) closeStyledMenu(); }, 120));
  w.on("closed", () => { if (menuWin === w) menuWin = null; });
  menuReady = (cw, ch) => { // an den Mauszeiger setzen, aber ganz auf dem Bildschirm
    if (!w || w.isDestroyed()) return;
    const W = Math.min(Math.max(200, cw), 420), H = Math.min(ch, wa.height - 16);
    w.setBounds({ x: Math.max(wa.x, Math.min(pt.x, wa.x + wa.width - W - 4)), y: Math.max(wa.y, Math.min(pt.y, wa.y + wa.height - H - 4)), width: W, height: H });
    if (!w.isVisible()) { w.show(); w.focus(); }
  };
  w.loadFile(path.join(__dirname, "app", "menu.html")).then(() => { if (!w.isDestroyed()) w.webContents.send("menu-show", { items, vars, ui: uiStart.mode }); }).catch(() => closeStyledMenu());
}
ipcMain.on("menu-size", (e, cw, ch) => {
  if (!Number.isFinite(cw) || !Number.isFinite(ch)) return;
  if (menuWin && e.sender === menuWin.webContents) menuReady?.(cw, ch); else if (subWin && !subWin.isDestroyed() && e.sender === subWin.webContents) subReady?.(cw, ch);
});
ipcMain.on("menu-sub", (e, sid, y, keyboard) => { if (!menuWin || e.sender !== menuWin.webContents) return; if (Number.isInteger(sid) && sid > 0 && Number.isFinite(y)) openSubMenu(sid, y, keyboard === true); else closeSubMenu(); });
ipcMain.on("menu-back", e => { if (!subWin || e.sender !== subWin.webContents) return; closeSubMenu(); if (menuWin && !menuWin.isDestroyed()) { menuWin.focus(); menuWin.webContents.send("menu-return"); } });
ipcMain.on("menu-pick", (e, id) => { if (!menuWin || (e.sender !== menuWin.webContents && !(subWin && !subWin.isDestroyed() && e.sender === subWin.webContents))) return; const fn = menuClicks.get(id); if (!menuKeep.has(id)) closeStyledMenu(); try { fn?.(); } catch (err) { logError(err); } });
ipcMain.on("menu-close", (e) => { if ((menuWin && e.sender === menuWin.webContents) || (subWin && !subWin.isDestroyed() && e.sender === subWin.webContents)) closeStyledMenu(); });
ipcMain.on("ctx-menu", (e, s = {}) => {
  if (!alive() || e.sender !== win.webContents) return;
  if (s.edit) {
    Menu.buildFromTemplate([{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { type: "separator" }, { role: "selectAll" }]).popup({ window: win });
    return;
  }
  const act = (a, v, open) => () => { if (open && !expanded) { setExpanded(true); setTimeout(() => alive() && win.webContents.send("ctx-action", { a, v }), 450); } else win.webContents.send("ctx-action", { a, v }); };
  const t = [];
  if (s.sel) t.push({ role: "copy", label: "Kopieren" }, { type: "separator" });
  const tg = s.target, fl = s.flags || {};
  // Rechtsklick AUF ein Element: nur dessen eigene Einstellungen und Ausblenden (Kugel, Buttons, Anzeigen, Fenster)
  const o = s.opts || {}, okId = (x) => typeof x === "string" && /^[a-z0-9_-]{1,24}$/.test(x);
  const pairs = (a) => (Array.isArray(a) ? a.filter((q) => Array.isArray(q) && okId(q[0]) && typeof q[1] === "string").slice(0, 40).map(([k, l]) => [k, String(l).slice(0, 44)]) : []);
  const near = (arr, v) => { let b = 0; arr.forEach(([x], i) => { if (Math.abs(x - v) < Math.abs(arr[b][0] - v)) b = i; }); return b; };
  const set = (k, v) => act("ctxset", { k, v });
  const levels = (k, cur, list) => { const i = near(list, Number(cur) || 0); return list.map(([x, l], j) => ({ label: l, type: "radio", checked: i === j, click: set(k, x) })); };
  if (fl.undo) t.push({ label: "Vorherige Position", click: act("undo") }, { type: "separator" });
  const more = () => t.push({ type: "separator" }, { label: "Weitere Einstellungen …", click: act("settings", null, true) });
  if (tg?.kind === "ball") {
    t.push({ label: "2D-Darstellung (flach)", type: "checkbox", checked: !!o.flat, click: set("flat", !o.flat) });
    t.push({ label: "Form", submenu: pairs(o.shapes).map(([k, l]) => ({ label: l, type: "radio", checked: o.shape === k, click: set("shape", k) })) });
    t.push({ label: "Farbe", submenu: [
      ...[["Blau", 210], ["Cyan", 185], ["Türkis", 165], ["Grün", 140], ["Limette", 75], ["Gold", 45], ["Orange", 25], ["Rot", 355], ["Pink", 320], ["Violett", 275]].map(([l, h]) => ({ label: l, type: "radio", checked: Math.abs(((Number(o.hue) || 0) - h + 540) % 360 - 180) < 8, click: set("hue", h) })),
      { type: "separator" },
      { label: "Regionen bunt", type: "radio", checked: o.regions === "bunt", click: set("regions", "bunt") },
      { label: "Regionen in der Grundfarbe", type: "radio", checked: o.regions === "thema", click: set("regions", "thema") }] });
    t.push({ label: "Glühen", submenu: levels("glow", o.glow, [[0, "Aus"], [0.5, "Schwach"], [1, "Normal"], [1.8, "Stark"]]) });
    t.push({ label: "Drehtempo", submenu: levels("spin", o.spin, [[0, "Steht"], [0.5, "Langsam"], [1, "Normal"], [2, "Schnell"]]) });
    t.push({ label: "Aufleuchten der Aktivität", submenu: levels("flash", o.flash, [[0, "Aus"], [0.4, "Wenig"], [1, "Normal"], [1.8, "Stark"]]) });
    t.push({ label: "Beschriftungen", submenu: [["aktiv", "Wie bisher (bis zu 3)"], ["eine", "Nur eine"], ["aus", "Aus"]].map(([k, l]) => ({ label: l, type: "radio", checked: o.labels === k, click: set("labels", k) })) });
    t.push({ label: "Neuronen-Stil", submenu: [["punkt", "Punkte (Standard)"], ["ring", "Ringe"], ["leucht", "Leuchtkugeln"], ["stern", "Sterne"]].map(([k, l]) => ({ label: l, type: "radio", checked: (o.nodeStyle || "punkt") === k, click: set("nodestyle", k) })) });
    t.push({ label: "Aura", submenu: [["aus", "Aus"], ["weich", "Weich"], ["stark", "Stark"]].map(([k, l]) => ({ label: l, type: "radio", checked: (o.aura || "aus") === k, click: set("aura", k) })) });
    t.push({ label: "Atmen (langsames Pulsieren)", type: "checkbox", checked: !!o.breath, click: set("breath", !o.breath) });
    t.push({ label: "Aktivität", submenu: [["punkte", "Punkte (Standard)"], ["funken", "Funken"], ["komet", "Kometen"], ["blitz", "Blitze"], ["welle", "Wellen"], ["licht", "Lichtfluss"]].map(([k, l]) => ({ label: l, type: "radio", checked: (o.pulse || "punkte") === k, click: set("pulse", k) })) });
    // Das Menü kennt nur eine Untermenü-Ebene: Struktur-Einstellungen stehen darum einzeln hier
    t.push({ type: "separator" },
      { label: "Struktur: Linien", submenu: levels("struct", o.structK, [[0, "Aus"], [50, "Dünn"], [100, "Normal"], [160, "Kräftig"], [250, "Sehr kräftig"]]) },
      { label: "Struktur: Verbindungen je Punkt", submenu: levels("edgek", o.edgeK, [[2, "2"], [3, "3"], [4, "4"], [5, "5"], [6, "6"]]) },
      { label: "Struktur: Punktgröße", submenu: levels("nodek", o.nodeK, [[50, "Sehr klein"], [75, "Klein"], [100, "Normal"], [150, "Groß"], [220, "Sehr groß"]]) },
      { label: "Struktur: Dichte", submenu: levels("dens", o.dens, [[0.5, "Locker"], [1, "Normal"], [1.5, "Dicht"], [2, "Sehr dicht"]]) },
      { label: "Struktur: 3D-Tiefe", submenu: levels("look3d", o.look3dK, [[0, "Aus"], [35, "Normal"], [70, "Stark"], [100, "Maximal"]]) },
      { label: "Rand der Form", type: "checkbox", checked: o.rim !== false, click: set("rim", o.rim === false) });
    t.push({ type: "separator" }, { label: fl.ball === false ? "Kugel einblenden" : "Kugel ausblenden", danger: fl.ball !== false, click: act("tog", "ball") });
    more(); return showStyledMenu(t, s.vars, "Kugel");
  }
  if (tg?.kind === "temp" && typeof tg.key === "string") {
    t.push({ label: "Form", submenu: pairs(o.bshapes).map(([k, l]) => ({ label: l, type: "radio", checked: o.bshape === k, click: set("bshape", k) })) });
    t.push({ label: "Material", submenu: pairs(o.blooks).map(([k, l]) => ({ label: l, type: "radio", checked: o.blook === k, click: set("blook", k) })) });
    t.push({ type: "separator" }, { label: `„${String(tg.name || "").slice(0, 30)}“ ausblenden`, danger: true, click: act("hidetemp", tg.key) });
    more(); return showStyledMenu(t, s.vars, "Button");
  }
  if (tg?.kind === "rings") {
    t.push({ label: "Darstellung", submenu: pairs(o.ringStyles).map(([k, l]) => ({ label: l, type: "radio", checked: o.ringStyle === k, click: set("ringstyle", k) })) });
    t.push({ label: "Größe", submenu: levels("ringsize", o.ringSize, [[0.6, "Klein"], [0.85, "Etwas kleiner"], [1, "Normal"], [1.3, "Groß"], [1.7, "Sehr groß"]]) });
    t.push({ label: "Neigung (3D)", submenu: [["Gerade", [0, 0]], ["Nach hinten", [35, 0]], ["Nach vorn", [-35, 0]], ["Nach links gedreht", [0, -35]], ["Nach rechts gedreht", [0, 35]]].map(([l, v]) => ({ label: l, type: "radio", checked: Math.abs((o.tiltX || 0) - v[0]) < 8 && Math.abs((o.tiltY || 0) - v[1]) < 8, click: set("ringtilt", v) })) });
    t.push({ label: "Farbe", submenu: [{ label: "CPU blau, GPU grün, RAM lila", type: "radio", checked: !o.ringMono, click: set("ringmono", false) }, { label: "Alles in der Grundfarbe", type: "radio", checked: !!o.ringMono, click: set("ringmono", true) }] });
    { const w = (config.winStyle || {}).rings || {}; t.push({ label: "Transparenz", submenu: [100, 90, 80, 70, 60, 50, 40, 30, 20].map((a) => ({ label: a === 100 ? "Deckend (100 %)" : a + " %", type: "radio", checked: (w.op ?? 100) === a, click: act("ws", { id: "rings", k: "op", v: a }) })) }); }
    t.push({ type: "separator" }, { label: "Last-Anzeige ausblenden", danger: true, click: set("ringoff", true) });
    more(); return showStyledMenu(t, s.vars, "CPU · GPU · RAM");
  }
  if (tg?.kind === "lbl") {
    t.push({ label: "Beschriftungen", submenu: [["aktiv", "Wie bisher (bis zu 3)"], ["eine", "Nur eine"], ["aus", "Aus"]].map(([k, l]) => ({ label: l, type: "radio", checked: o.labels === k, click: set("labels", k) })) });
    t.push({ type: "separator" }, { label: "Beschriftungen ausblenden", danger: true, click: set("labels", "aus") });
    more(); return showStyledMenu(t, s.vars, String(tg.name || "Beschriftung").slice(0, 30));
  }
  if (tg?.kind === "pill") { t.push({ label: "Statusanzeige ausblenden", danger: true, click: act("tog", "status") }); more(); return showStyledMenu(t, s.vars, "Statusanzeige"); }
  if (tg?.kind === "who") { t.push({ label: "„Claude · Lokal“ ausblenden", danger: true, click: act("tog", "ai") }); more(); return showStyledMenu(t, s.vars, "Claude · Lokal"); }
  if (tg?.kind === "strata") { t.push({ label: "Strata-Knopf ausblenden", danger: true, click: act("tog", "strata") }); more(); return showStyledMenu(t, s.vars, "Strata"); }
  if (tg?.kind === "blk" && typeof tg.id === "string") {
    if (["tMkt", "tWatch", "tPort"].includes(tg.id)) t.push({ label: "Krypto hinzufügen", click: act("tradeadd", "c") }, { label: "Aktie hinzufügen", click: act("tradeadd", "s") }, { label: "Position im Portfolio", click: act("tradeadd", "pos") }, { label: "Trading-Einstellungen", click: act("settings", null, true) }, { type: "separator" });
    if (LOOKS[tg.id]) { const cur = (config.looks || {})[tg.id] || ""; t.push({ label: "Design", submenu: LOOKS[tg.id][1].map(([k, l]) => ({ label: l, type: "radio", checked: cur === k, click: act("look", { id: tg.id, v: k }) })) }, { type: "separator" }); }
    { // Stil je Fenster: Deckkraft in Prozent, Textfarbe, Schrift (gilt für jedes Fenster und die Freundeslisten)
      const w = (config.winStyle || {})[tg.id] || {}, set = (k, v) => act("ws", { id: tg.id, k, v });
      t.push({ label: "Hintergrund", submenu: [101, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0].map((a) => ({ label: a === 101 ? "Voll deckend (100 %)" : a === 100 ? "Standard (leicht durchscheinend)" : a === 0 ? "Durchsichtig (0 %)" : a + " %", type: "radio", checked: a === 101 ? w.a === 100 : a === 100 ? w.a == null : w.a === a, click: set("a", a) })) },
        { label: "Textfarbe", submenu: [{ label: "Standard", type: "radio", checked: !w.wt, click: set("wt", false) }, { label: "Weiß", type: "radio", checked: !!w.wt, click: set("wt", true) }] },
        { label: "Schrift", submenu: [["", "Standard"], ...["Segoe UI", "Bahnschrift", "Calibri", "Verdana", "Tahoma", "Trebuchet MS", "Georgia", "Consolas", "Cascadia Mono", "Courier New", "Arial"].map((f) => [f, f])].map(([f, l]) => ({ label: l, type: "radio", checked: (w.font || "") === f, click: set("font", f) })) });
      if (tg.id === "sys") t.push({ label: "Punkte vor Programmen", submenu: [["", "Farbig"], ["weiss", "Weiß"], ["aus", "Aus"]].map(([k, l]) => ({ label: l, type: "radio", checked: (w.dots || "") === k, click: set("dots", k) })) },
        { label: "Balken", submenu: [["", "Farbig"], ["weiss", "Weiß"]].map(([k, l]) => ({ label: l, type: "radio", checked: (w.bars || "") === k, click: set("bars", k) })) });
      t.push({ type: "separator" });
    }
    if (/^friends/.test(tg.id)) { more(); return showStyledMenu(t, s.vars, String(tg.name || "Fenster").slice(0, 30)); }
    t.push({ label: "Nach vorn holen", click: act("blkfront", tg.id) }, { label: "Nach hinten legen", click: act("blkback", tg.id) }, { type: "separator" }, { label: `„${String(tg.name || "").slice(0, 30)}“ ausblenden`, danger: true, click: act("hideblk", tg.id) });
    more(); return showStyledMenu(t, s.vars, String(tg.name || "Fenster").slice(0, 30));
  }
  // Menü auf freier Fläche: nach Aufgaben gebündelt, jeder Eintrag nur an einer Stelle
  const btns = Array.isArray(s.buttons) ? s.buttons.filter((b) => Array.isArray(b) && /^[A-Za-z0-9]{2,16}$/.test(b[0]) && typeof b[1] === "string").slice(0, 40) : [];
  const hf = Array.isArray(s.hfans) ? s.hfans.filter((n) => typeof n === "string").slice(0, 16) : [];
  const own = ["ai", "aiClaude", "aiLocal", "strata", "friends", "apps"], by = Object.fromEntries(btns.map((b) => [b[0], b]));
  const wchk = (k, label) => by[k] ? { label, type: "checkbox", checked: !!by[k][2], click: act("setw", { k, flip: true }) } : null;
  t.push({ label: "Einstellungen", click: act("settings", null, true) });
  const pgl = Array.isArray(s.flags?.pageList) ? s.flags.pageList.filter((x) => typeof x === "string").slice(0, 12) : [];
  if (expanded && pgl.length) t.push({ label: "Seite", submenu: [...pgl.map((n) => ({ label: String(n).slice(0, 20), type: "checkbox", checked: n === s.flags.page, click: act("gopage", n) })), { type: "separator" }, { label: "Neue Seite …", click: act("newpage") }, ...(s.flags.custom ? [{ label: "Seite umbenennen …", click: act("renamepage") }, { label: "Seite löschen …", danger: true, click: act("delpage") }] : [])] });
  if (expanded && uiStart.mode !== "apple") t.push({ label: s.arrange ? "Anordnen beenden" : "Anordnen", click: act("arrange") }); // Apple-Modus: Raster statt freier Anordnung
  t.push({ type: "separator" });
  t.push({ label: "Anzeigen", submenu: [
    { label: "Kugel", type: "checkbox", checked: fl.ball !== false, click: act("tog", "ball") },
    { label: "Statusanzeige (Leerlauf …)", type: "checkbox", checked: fl.status !== false, click: act("tog", "status") },
    { label: "Wer antwortet („Claude · Lokal“)", type: "checkbox", checked: fl.ai !== false, click: act("tog", "ai") },
    wchk("aiClaude", "… davon „Claude“"), wchk("aiLocal", "… davon „Lokal“"),
    { label: "Strata-Knopf", type: "checkbox", checked: fl.strata !== false, click: act("tog", "strata") },
    wchk("apps", "Laufende Programme"),
    { label: "Mini-Widget: alle Anzeigen", type: "checkbox", checked: !!fl.mini, click: act("tog", "mini") },
  ].filter(Boolean) });
  // Messwerte (Buttons): ohne Daten bleibt ein Eintrag ausgegraut und ist nur zum Ausschalten wählbar
  const meas = btns.filter((b) => !own.includes(b[0]));
  if (meas.length || hf.length) t.push({ label: "Messwerte", submenu: [
    ...meas.map(([k, l0, on, av]) => ({ label: String(({ btc: "Kurse (Bitcoin und gewählte Coins)", weather: "Wetter-Anzeige an der Kugel", steam: "Steam-Zähler an der Kugel", discord: "Discord-Zähler an der Kugel" })[k] || l0).slice(0, 44) + (!on && av === false ? " (keine Daten)" : ""), type: "checkbox", checked: !!on, enabled: !!on || av !== false, click: act("setw", { k, flip: true }) })),
    ...(hf.length ? [{ type: "separator" }, ...hf.map((n) => ({ label: "Lüfter „" + n.slice(0, 30) + "“ einblenden", click: act("showfan", n) }))] : []),
  ] });
  t.push({ label: "Freundesliste", submenu: [
    { label: "Freundesliste anzeigen", type: "checkbox", checked: fl.friends !== false, click: act("tog", "friends") },
    { label: "Steam-Freunde", type: "checkbox", checked: !!fl.steam, click: act("tog", "steam") },
    { label: "Discord-Sprachkanäle", type: "checkbox", checked: !!fl.discord, click: act("tog", "discord") },
    { type: "separator" }, { label: "Einrichten …", click: act("settings", null, true) },
  ] });
  t.push({ label: "Darstellung im Hintergrund", submenu: [
    { label: "Energiesparend", type: "radio", checked: config.backgroundPresentation === "eco", click: () => { config.backgroundPresentation = "eco"; saveConfig(); backgroundPresentationController?.setMode("eco"); } },
    { label: "Flüssig", type: "radio", checked: config.backgroundPresentation !== "eco", click: () => { config.backgroundPresentation = "fluid"; saveConfig(); backgroundPresentationController?.setMode("fluid"); } }
  ] });
  const hid = Array.isArray(s.hidden) ? s.hidden.filter((h) => Array.isArray(h) && typeof h[0] === "string" && typeof h[1] === "string").slice(0, 20) : [];
  t.push({ label: "Fenster", submenu: [
    { label: "Notizblock", type: "checkbox", checked: !!config.notesOn, click: act("notes", null, true) },
    { label: "YouTube", type: "checkbox", checked: !!ytView, click: act("yt", null, true) },
    { label: "Twitch", type: "checkbox", checked: !!(twAlive() || twView), click: act("tw", null, true) },
    ...(s.media ? [{ label: "Musik-Player einblenden", click: act("media") }] : []),
    ...(expanded && hid.length ? [{ type: "separator" }, ...hid.map(([id, n]) => ({ label: "Einblenden: " + n, click: act("unhide", id) })), ...(hid.length > 1 ? [{ label: "Alle einblenden", click: act("unhide", "*") }] : [])] : []),
  ] });
  if (expanded) {
    const profs = Array.isArray(s.profs) ? s.profs.filter((n) => typeof n === "string").slice(0, 10) : [];
    t.push({ label: "Profil laden", enabled: profs.length > 0, submenu: profs.length ? profs.map((n) => ({ label: n, click: act("profile", n) })) : undefined });
  }
  const skins = Array.isArray(s.skins) ? s.skins.filter((n) => typeof n === "string").slice(0, 30) : [];
  if (skins.length) t.push({ label: "Skin", submenu: skins.map((n) => ({ label: n, type: "radio", checked: config.skin === n, click: act("skin", n) })) });
  if (expanded) t.push({ label: "Layout", submenu: [
    { label: "Anordnung zurücksetzen", click: act("reset") },
    ...(process.platform !== "darwin" ? [{ type: "separator" }, { label: "Aussparung aktiv", type: "checkbox", checked: !!config.holeOn, click: act("holetoggle") }, { label: "Aussparung neu anordnen …", click: act("holeplace") }] : []),
  ] });
  t.push({ type: "separator" },
    { label: "Fenster zurückholen (mittig, Standardgröße)", click: rescueWindow },
    { label: "Nach Updates suchen", click: () => { checkUpdates(); win.webContents.send("notice", "Suche nach Updates …"); } },
    { label: "Argus unterstützen (Spenden)", click: () => openDonate() },
    { label: "Ausblenden  (Strg+Umschalt+J holt mich zurück)", click: toggleVisible },
    { label: "Beenden", click: () => app.quit() });
  showStyledMenu(t, s.vars, s.title);
});
ipcMain.on("resize-by", (_e, factor) => setSize(config.size * factor));
// Ziehen am Griff folgt der Maus direkt, ohne Animation
ipcMain.on("set-size", (_e, px) => { if (Number.isFinite(px)) setSize(px, false); });
ipcMain.on("setup-local", () => ensureLocalAI(true));
// Einrichtung: PC-Ausstattung für die Empfehlung der lokalen KI (RAM, Kerne, Grafikkarte mit Speicher)
ipcMain.handle("pc-info", async () => {
  const out = { ramGB: Math.round(os.totalmem() / GB), cores: os.cpus().length, cpu: (os.cpus()[0]?.model || "").trim(), gpu: "", vramGB: 0, strataDir: strata.findDir?.() || "", claudeCode: !!findClaudeCode() };
  if (process.platform !== "win32") return out;
  const run = (cmd, args) => new Promise((r) => execFile(cmd, args, { windowsHide: true, timeout: 6000 }, (e, so) => r(e ? "" : String(so || ""))));
  const nv = (await run("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])).split(/\r?\n/)[0];
  if (nv && nv.includes(",")) { const [n, m] = nv.split(","); out.gpu = n.trim(); out.vramGB = Math.round(Number(m) / 1024) || 0; }
  else out.gpu = (await run("powershell.exe", ["-NoProfile", "-Command", "(Get-CimInstance Win32_VideoController | Select-Object -First 1).Name"])).trim();
  return out;
});
// Einrichtung: Strata-Ordner auswählen (prüft, ob dort Strata liegt)
ipcMain.handle("pick-folder", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Strata-Ordner wählen", properties: ["openDirectory"] });
  const dir = r.canceled ? "" : r.filePaths[0] || "";
  return { dir, ok: !!dir && ["START-HERE.bat", "Strata-Start.cmd"].some((f) => fs.existsSync(path.join(dir, f))) };
});
let strataUsed = Date.now(), strataPrev = "aus";
function unloadOllama() { fetch((config.ollamaUrl || "http://127.0.0.1:11434") + "/api/generate", { method: "POST", body: JSON.stringify({ model: localModel(), keep_alive: 0 }) }).catch(() => {}); }
// Einstellungen sichern und laden (ohne Schlüssel und Tokens, die bleiben nur auf diesem PC)
const SECRET_KEYS = ["iobPass", "steamKey", "dcBotToken", "anthropicApiKey", "aiKey", "foremanKey", "finnhubKey"];
ipcMain.handle("settings-export", async () => {
  const r = await dialog.showSaveDialog(win, { title: "Argus-Einstellungen sichern", defaultPath: path.join(app.getPath("documents"), "Argus-Einstellungen.json"), filters: [{ name: "Argus-Einstellungen", extensions: ["json"] }] });
  if (r.canceled || !r.filePath) return { ok: false };
  const out = { jarvis: app.getVersion(), saved: new Date().toISOString() };
  for (const k of Object.keys(SETTABLE)) if (!SECRET_KEYS.includes(k) && config[k] !== undefined) out[k] = config[k];
  out.foremanAccounts = fmAccts().map((a) => ({ name: a.name, client: a.client })); // ohne Schlüssel
  fs.writeFileSync(r.filePath, JSON.stringify(out, null, 2)); return { ok: true, file: r.filePath };
});
ipcMain.handle("settings-import", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Argus-Einstellungen laden", properties: ["openFile"], filters: [{ name: "Argus-Einstellungen", extensions: ["json"] }] });
  if (r.canceled || !r.filePaths?.[0]) return { ok: false };
  let j; try { j = JSON.parse(fs.readFileSync(r.filePaths[0], "utf8")); } catch { return { ok: false, error: "Datei ist keine Argus-Sicherung." }; }
  let n = 0;
  for (const [k, v] of Object.entries(j || {})) if (SETTABLE[k] && !SECRET_KEYS.includes(k) && typeof v === SETTABLE[k] && v !== null) { config[k] = v; n++; }
  if (Array.isArray(j?.foremanAccounts)) { const keys = new Map(fmAccts().map((a) => [a.client, a.key])); config.foremanAccounts = cleanAccts(j.foremanAccounts.map((a) => ({ ...a, key: keys.get(String(a?.client || "")) || "" }))); n++; }
  if (!n) return { ok: false, error: "In der Datei stehen keine Argus-Einstellungen." };
  config.widgets = mergeWidgets(config.widgets); saveConfig();
  setTimeout(() => { crash.clean(); app.relaunch(); app.exit(0); }, 600); // sauber neu starten, damit alles die neuen Werte nimmt
  return { ok: true, n };
});
// Ein/Aus-Knopf für Strata; der Zustand bleibt gemerkt, beim nächsten Argus-Start wird Strata wieder geladen, wenn er an war
ipcMain.handle("strata-toggle", async () => {
  const s = strata.snapshot(), on = s.state === "an" || s.state === "lädt";
  config.strataOn = !on; saveConfig();
  return on ? strata.stop() : strata.start();
});
// Fensterknöpfe im Panel
ipcMain.on("win-mode", (_e, mode) => {
  if (!alive()) return;
  if (mode === "min") return win.hide(); // in den Tray, zurück per Tray-Klick oder Strg+Umschalt+J
  if (!expanded) setExpanded(true);
  winMode = winMode === mode ? "normal" : mode; // gleicher Knopf nochmal = zurück
  progQuiet = Date.now() + 1200;
  applyTop();
  applyBounds(config.corner, false);
  win.focus();
});
ipcMain.on("quit", () => app.quit());
// Einstellungen aus der Oberfläche speichern (nur bekannte Schlüssel)
const SETTABLE = { uiReduceTransparency: "boolean", pageLooks: "object", nodeStyle: "string", aura: "string", breath: "boolean", pulseStyle: "string", iobOn: "boolean", iobUrl: "string", iobUser: "string", iobPass: "string", iobPick: "object", iobWrite: "boolean", iobAll: "boolean", shapeRand: "number", fmDashOn: "boolean", aiProv: "string", aiBase: "string", aiModel: "string", aiKey: "string", ballOn: "boolean", menuAlpha: "number", taskbarOn: "boolean", taskbarShow: "string", hiddenFans: "object", afterHide: "string", miniPos: "object", taskbarFront: "boolean", btnShape: "string", btnLook: "string", btnTiltX: "number", btnTiltY: "number", btnTiltFollow: "boolean", btnTiltK: "number", gaugeTiltX: "number", gaugeTiltY: "number", twAlpha: "number", twFeather: "number", twRound: "number", twVideoOnly: "boolean", twOnTop: "boolean", twMode: "string", twEmbedSize: "string", palette: "string", loadShimmer: "boolean", ytBackgroundAlpha: "number", ytFrame: "boolean", ytShadow: "boolean", ytFilterOn: "boolean", ytAlpha: "number", ytFeather: "number", ytRound: "number", flashK: "number", flashT: "number", statusOn: "boolean", miniMore: "boolean", look3dK: "number", uiFont: "string", uiScale: "number", structK: "number", edgeK: "number", nodeK: "number", gamingOn: "boolean", quickOn: "boolean", quickSize: "number", quickLabels: "boolean", mirrorOn: "boolean", mirrorMatch: "string", mirrorFps: "number", mirrorQ: "number", procKill: "boolean", ballLabels: "string", bgShoot: "number", micId: "string", spkId: "string", friendsSplit: "boolean", friendsHold: "number", updateChannel: "string", crashReport: "boolean", barMode: "string", fpsIdle: "number", fpsMax: "number", reportOn: "boolean", reportHour: "number", reportKeep: "number", reportNotify: "boolean", claudeAsk: "boolean", oceanNotify: "boolean", payoutNotify: "boolean", notifyPanel: "boolean", notifyWin: "boolean", notifySound: "boolean", aiShare: "string", strataWake: "boolean", strataDir: "string", strataArgs: "string", userName: "string", userInfo: "string", setupDone: "boolean", weatherOn: "boolean", mineOn: "boolean", mineAddr: "string", strataIdleMin: "number", foremanOn: "boolean", fmEvOn: "boolean", fmView: "string", look3d: "boolean", foremanPx: "object", layoutProfiles: "object", pages: "object", page: "string", liteMode: "string", ollamaOff: "boolean", pagesOn: "boolean", mineOrb: "boolean", pageFriends: "boolean", mineView: "string", mOverInit: "boolean", mFxInit: "boolean", mineFx: "object", oceanInTotal: "boolean", profLast: "string", wxPlaces: "string", hiddenBlocks: "object", clocksOn: "boolean", clocks: "object", gameMode: "boolean", snapGuides: "boolean", blockFont: "object", chatH: "number", dockFx: "boolean", setZoom: "number", themeHue: "number", themeRegions: "string", voiceEngine: "string", voiceFallback: "string", donateUrl: "string", lang: "string", portalOn: "boolean", voiceRobot: "boolean", portalUrl: "string", voiceServer: "string", voiceServerModel: "string", voiceServerVoice: "string", briefOn: "boolean", briefTime: "string", briefLen: "string", briefParts: "object", customPages: "object", autoFit: "boolean", tradeOn: "boolean", tradeCur: "string", tradeEvery: "number", tradeStock: "string", tradeFng: "boolean", tradeDom: "boolean", tradeHalv: "boolean", tradeWatch: "object", tradePort: "object", finnhubKey: "string", design: "string", designSet: "boolean", designBlk: "boolean", designType: "boolean", designBtn: "string", voiceOutput: "boolean", micOnStart: "boolean",
  holeX: "number", holeY: "number", holeEdit: "boolean", holeOn: "boolean", holeCorner: "string", holeW: "number", holeH: "number", holeRound: "number", holeRadii: "object", friendsStill: "boolean", reduceAnimations: "boolean", backgroundPresentation: "string", pageIds: "object", notesByPage: "object", notesPages: "object", notesCur: "string", miningOn: "boolean", dcJoinBot: "boolean", systemAlertsVoice: "boolean", venomRoam: "boolean", gfxSafe: "boolean", mediaBrowser: "boolean", cpuHotC: "number", warnDiskGB: "number", warnRamPct: "number", warnCpuPct: "number", warnInet: "boolean", gpuHotC: "number", fmNotify: "boolean", fmMinerUrl: "string", aiLogOn: "boolean", autostart: "boolean", memoryOn: "boolean", claudeDesktopLink: "boolean", newsOn: "boolean", newsCats: "object", newsOnTop: "boolean", btcCur: "string", coins: "object", bgFx: "object", shape: "string", shapeRim: "boolean", shape2d: "boolean", glow: "number", scales: "object", updateUrl: "string", sensors: "boolean", ytAdblock: "boolean", ytNoAds: "boolean", ytZoom: "number", looks: "object", winStyle: "object", ytVideoOnly: "boolean", notesOn: "boolean", notesText: "string", spin: "number", density: "number", skin: "string", friendsFold: "object", extraVoice: "object", sway: "string", discordVoiceOnly: "boolean", discordAlsoOnline: "boolean", dcOnlyMarked: "boolean", dcMarked: "object", discordName: "string", discordAuto: "boolean", voiceOverlay: "boolean", overlayMode: "string", ytEmbedSize: "string", overlayCorner: "string", winColor: "object", friendsBox: "object", ytOnTop: "boolean", viz: "object", pins: "object", micFloat: "boolean", onTop: "string", wakeFront: "boolean", autoOpen: "boolean", steamOn: "boolean", steamKey: "string", dcBotToken: "string", dcIcons: "boolean", steamDl: "boolean", mediaOn: "boolean", sysBox: "object", pillOff: "object", ballOff: "object", panelLayout: "object", steamId: "string", discordOn: "boolean", discordServers: "string", wakeWords: "object", widgets: "object", hiddenApps: "object", opacity: "object", claudeCodeModel: "string", gpuUse: "string", backend: "string", ollamaModel: "string", anthropicApiKey: "string" };
function writeNotesBackup() {
  const f = path.join(path.dirname(CONFIG_PATH), "notizen-seiten-backup.json");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + ".tmp", JSON.stringify({ notesByPage: config.notesByPage, pageIds: config.pageIds, notesLegacyBackup: config.notesLegacyBackup, notesScopeVersion: config.notesScopeVersion }));
  fs.renameSync(f + ".tmp", f);
}
ipcMain.on("notes-flush", (event, snapshot) => {
  event.returnValue = false;
  if (!alive() || event.sender !== win.webContents) return;
  try { event.returnValue = require("./app/notes-persistence").flush(config, snapshot, writeNotesBackup, writeConfigNow); }
  catch (error) { console.warn("Notizen-Abschluss fehlgeschlagen:", error.code || "write"); }
});
ipcMain.handle("set-config", (_e, patch) => {
  if (patch && typeof patch.updateUrl === "string" && patch.updateUrl.trim() && !/^https:\/\//i.test(patch.updateUrl.trim())) delete patch.updateUrl; // Update-Adresse nur verschlüsselt (https)
  for (const [k, v] of Object.entries(patch || {})) if (SETTABLE[k] && typeof v === SETTABLE[k] && v !== null) config[k] = k === "widgets" ? { ...config.widgets, ...v } : v;
  if ("widgets" in patch) { config.widgets = mergeWidgets(config.widgets); if (watch) { watch.appsOn = config.widgets.apps.on; if (watch.appsOn) watch.pollApps().then(() => watch.emit()).catch(() => {}); } }
  saveConfig();
  if ("notesByPage" in patch || "pageIds" in patch) {
    try { writeNotesBackup(); } catch (e) { console.warn("Notizen-Seitensicherung fehlgeschlagen:", e.code || "write"); }
  }
  if ("notesPages" in patch) { // zweite Kopie der Notizen neben der Einstellungsdatei: geht eine kaputt, bleibt die andere
    try { const f = path.join(path.dirname(CONFIG_PATH), "notizen-backup.json"); fs.writeFileSync(f + ".tmp", JSON.stringify({ notesPages: config.notesPages, notesCur: config.notesCur })); fs.renameSync(f + ".tmp", f); } catch {}
  }
  if ("backgroundPresentation" in patch) backgroundPresentationController?.setMode(config.backgroundPresentation);
  if ("portalOn" in patch) portal.setOn(config.portalOn);
  if ("fmDashOn" in patch) fmdash.setOn(config.fmDashOn);
  if (["iobOn", "iobUrl", "iobUser", "iobPass", "iobPick", "iobWrite", "iobAll"].some((k) => k in patch)) iob.set({ on: !!config.iobOn, url: config.iobUrl, user: config.iobUser, pass: unseal(config.iobPass) || "", write: !!config.iobWrite, all: config.iobAll !== false, pick: (Array.isArray(config.iobPick) ? config.iobPick : []).filter((p) => p && typeof p.id === "string").slice(0, 60) });
  if ("portalUrl" in patch) portal.rehost();
  if ("backend" in patch || "claudeCodeModel" in patch) setTimeout(pushAiStatus, 300);
  if ("claudeDesktopLink" in patch) linkClaudeDesktop();
  if ("newsOn" in patch) config.newsOn ? openNews() : closeNews();
  if ("onTop" in patch || "taskbarOn" in patch || "taskbarShow" in patch) applyTop();
  if ("taskbarFront" in patch) edgeWatch();
  if ("newsOnTop" in patch) syncNews();
  if ("opacity" in patch && newsAlive()) newsWin.setOpacity(Math.max(0.2, config.opacity.news ?? 1));
  if ("newsCats" in patch) { pollFeeds(); pollAlerts(); }
  if (["steamOn", "steamKey", "steamId", "discordOn", "discordServers", "discordName", "voiceOverlay", "discordVoiceOnly", "discordAlsoOnline", "extraVoice"].some((k) => k in patch)) pollSocial();
  if ("dcBotToken" in patch || "discordOn" in patch) startDcBot();
  if ("mediaOn" in patch) { if (config.mediaOn === false) { stopMedia(); if (alive()) win.webContents.send("media", { on: false }); } else { mediaTry = 0; startMedia(); } }
  if ("overlayCorner" in patch) placeOverlay();
  if ("overlayMode" in patch) updateOverlay();
  if ("coins" in patch) pollPrice().then(pollHist);
  if ("widgets" in patch && config.widgets?.btc?.on !== false && !market.btc) pollPrice().then(pollHist); // Bitcoin-Anzeige eingeschaltet: Kurs sofort holen
  if (("themeHue" in patch || "winColor" in patch) && newsAlive()) pushMarket(); // Lagebild färbt sich mit
  if ("ytVideoOnly" in patch && ytView) ytTrackNow(ytView.webContents);
  if ("ytFilterOn" in patch) { if (config.ytFilterOn) ytAdblock(); else { if (ytBlocker) { ytBlocker.disableBlockingInSession(session.fromPartition("persist:youtube")); ytBlocker = null; } ytFilterStatus("off"); } }
  if (["holeOn", "holeW", "holeH", "holeRound", "holeRadii", "holeCorner", "holeX", "holeY", "holeEdit"].some((k) => k in patch)) { lastShape = "x"; applyShape(); }
  if ("sensors" in patch) { if (patch.sensors) startSensors(); else { sensorState = "aus"; sensorPush(); execFile("schtasks", ["/End", "/TN", "Jarvis Sensoren"], { windowsHide: true }, () => {}); } }
  if ("updateUrl" in patch || "updateChannel" in patch) checkUpdates();
  if ("ytBackgroundAlpha" in patch || "ytFrame" in patch || "ytShadow" in patch || "ytRound" in patch || "winColor" in patch || "themeHue" in patch) ytAlphaAll();
  if ("twAlpha" in patch || "twFeather" in patch || "twRound" in patch || "winColor" in patch || "themeHue" in patch) twAlphaAll();
  if ("twVideoOnly" in patch) { if (twView) twTrackNow(twView.webContents); if (twAlive()) twTrackNow(twWin.webContents); }
  if ("twOnTop" in patch && twAlive()) twWin.setAlwaysOnTop(!!config.twOnTop, "floating");
  if ("newsCats" in patch || "btcCur" in patch || "themeHue" in patch) pushMarket();
  if ("autostart" in patch) applyAutostart();
  if ("userName" in patch) { config.userName = String(config.userName).trim().slice(0, 40); memory.setUser?.(config.userName); }
  if ("userInfo" in patch) config.userInfo = String(config.userInfo).slice(0, 500);
  if (("weatherOn" in patch || "wxPlaces" in patch) && config.weatherOn) { wx.locTs = 0; pollWeather(true); }
  if ("foremanPx" in patch) pollFarm();
  if ("gfxSafe" in patch) restartSoon(800);
  if (["cpuHotC", "gpuHotC", "warnDiskGB", "warnRamPct", "warnCpuPct", "warnInet"].some((k) => k in patch) && watch) watch.limits = { cpu: config.cpuHotC, gpu: config.gpuHotC, diskGB: config.warnDiskGB, ramPct: config.warnRamPct, cpuPct: config.warnCpuPct, inet: config.warnInet }; // Grafikmodus gilt erst nach Neustart
  if ("foremanOn" in patch) { farmSt = null; farmPrev = {}; for (const k in farmConf) delete farmConf[k]; pollFarm(); }
  if ("aiShare" in patch || "strataWake" in patch || "claudeAsk" in patch) pushAiStatus();
  if ("miningOn" in patch) { pollFarm(); }
  if ("mineAddr" in patch || "mineOn" in patch || "miningOn" in patch) { mine.pools = []; mine.pool = null; mine.st = {}; pollPool(); pollNet(); }
  if ("backend" in patch) { ccBlockedUntil = 0; ccPath = undefined; }
  if (patch.ollamaOff === true) stopOllama();
  if ("backend" in patch || "ollamaModel" in patch || "ollamaOff" in patch) { modelRefreshed = false; installTried = false; ensureLocalAI(true); }
  tray?.setContextMenu(trayMenu());
  return true;
});
// Befehle wie "öffne Brave" oder "öffne gamestar.de" direkt ausführen
// ---------- Selbstverbesserung: seit 0.58.20 abgeschaltet (selfimprove.js), Befehle werden abgelehnt ----------
function restartSoon(ms = 6000) { setTimeout(() => { crash.clean(); app.relaunch(); app.exit(0); }, ms); }
function selfResult(r) { sendUI("self-improve", r); if (r.restart) restartSoon(); return r.text; }
function handleSelf(cmd) {
  const r = selfimprove.respond(cmd);
  return ["improve", "check", "explain"].includes(cmd.kind) ? r.text : selfResult(r);
}
ipcMain.handle("self-apply", () => selfResult(selfimprove.respond({ kind: "apply" })));
ipcMain.handle("self-discard", () => { const { ok, text } = selfimprove.discard(); return selfResult({ ok, text }); });
ipcMain.handle("self-offer", () => null);
ipcMain.on("open-changelog", () => {
  // Gibt es noch keine Verbesserung, die Datei mit kurzer Erklärung anlegen, damit sich trotzdem etwas öffnet
  const f = selfimprove.CHANGELOG();
  if (!fs.existsSync(f)) fs.writeFileSync(f, "# Selbst-Verbesserungen von Argus\n\nDie Selbstverbesserung ist in dieser Version aus Sicherheitsgründen abgeschaltet.\n");
  shell.openPath(f);
});
let prevAction = "";
// Laufendes Programm in den Vordergrund holen (statt es noch einmal zu starten); false = kein Fenster gefunden
ipcMain.handle("focus-app", (_e, key) => new Promise((resolve) => {
  if (process.platform !== "win32" || !/^[\w .-]{1,60}$/.test(String(key || ""))) return resolve(false);
  const ps = "Add-Type 'using System;using System.Runtime.InteropServices;public class AW{[DllImport(\"user32.dll\")]public static extern bool ShowWindow(IntPtr h,int c);[DllImport(\"user32.dll\")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport(\"user32.dll\")]public static extern bool IsIconic(IntPtr h);}';" +
    "$p = Get-Process -Name '" + String(key) + "' -ErrorAction SilentlyContinue | ? { $_.MainWindowHandle -ne 0 } | select -First 1;" +
    "if (-not $p) { 'none'; exit }; $h = $p.MainWindowHandle; if ([AW]::IsIconic($h)) { [AW]::ShowWindow($h, 9) | Out-Null }; [AW]::SetForegroundWindow($h) | Out-Null; 'ok'";
  execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { timeout: 8000, windowsHide: true }, (err, out) => resolve(!err && /ok/.test(String(out))));
}));
ipcMain.handle("action", async (_e, text) => { try { const prev = prevAction; prevAction = text; const self = selfimprove.classify(text, prev, { stage: selfimprove.stageState() }); if (self) return handleSelf(self);
  const mem = memory.parse(text); if (mem) { const r = memory.run(mem); remember(text, r, "Argus"); return r; }
  const did = await actions.run(text); if (did) remember(text, did, "Argus"); return did; } catch (e) { return "Das hat nicht geklappt: " + (e.message || e); } });
// Argus-Stimme (Piper): bei Fehler einmal erneut versuchen und den Grund ins Fehlerprotokoll schreiben, statt still auf die Windows-Stimme zu fallen
// Eigener lokaler Sprachserver (OpenAI-kompatibel: POST /v1/audio/speech), z. B. für stärkere Stimmen auf einer Grafikkarte. Nur Adressen im eigenen Rechner oder Heimnetz.
const localUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.hostname) || x.hostname.endsWith(".local")); } catch { return false; } };
async function serverTts(text) {
  const u = String(config.voiceServer || ""); if (!localUrl(u)) throw new Error("Sprachserver-Adresse fehlt oder ist nicht lokal");
  // Adresse endet auf /tts: einfache Form {text, voice, engine, speed}; sonst OpenAI-kompatibel (/v1/audio/speech)
  const simple = /\/tts\/?$/.test(u), url = simple ? u.replace(/\/+$/, "") : u.replace(/\/+$/, "") + "/v1/audio/speech";
  const body = simple ? { text, voice: config.voiceServerVoice || "default", engine: config.voiceServerModel || undefined, speed: 1, robot: !!config.voiceRobot }
    : { model: config.voiceServerModel || "tts-1", input: text, voice: config.voiceServerVoice || "default", response_format: "wav" };
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error("Sprachserver antwortet mit " + r.status);
  return Buffer.from(await r.arrayBuffer());
}
ipcMain.handle("tts", async (_e, text, id) => {
  if ((config.voiceEngine === "server" && !id) || id === "server") { try { return await serverTts(text); } catch (e) { logError(new Error("Sprachserver: " + (e.message || e))); if (id === "server") return null; /* läuft der Server nicht, spricht die Argus-Stimme (Piper) */ try { const w = await synthesize(text, undefined); if (w) return w; } catch {} return null; } }
  if (config.voiceEngine === "windows" && !id) return null;
  const vid = typeof id === "string" && VOICES.some((v) => v.id === id) ? id : undefined;
  for (let i = 0; i < 2; i++) { try { const w = await synthesize(text, vid); if (w) return w; break; } catch (e) { logError(new Error("Argus-Stimme: " + (e.message || e))); await new Promise((r) => setTimeout(r, 400)); } }
  return null;
});
const voiceRows = () => VOICES.map((v) => ({ id: v.id, label: v.label, gender: v.gender, mb: v.mb, installed: voiceHas(v.id), active: v.id === config.voiceId }));
// Stimmen des lokalen Sprachservers (GET /voices) für die Auswahl in den Einstellungen
ipcMain.handle("voice-server-voices", async () => {
  const u = String(config.voiceServer || ""); if (!localUrl(u)) return [];
  try { const r = await fetch(new URL(u).origin + "/voices", { signal: AbortSignal.timeout(3000) }); const j = await r.json(); return (Array.isArray(j) ? j : []).slice(0, 40).map((v) => ({ id: String(v.id || "").slice(0, 60), label: String(v.label || v.id || "").slice(0, 80) })).filter((v) => v.id); } catch { return []; }
});
ipcMain.handle("voice-list", () => ({ server: { url: config.voiceServer || "", model: config.voiceServerModel || "", voice: config.voiceServerVoice || "", active: config.voiceEngine === "server" }, dir: PIPER_DIR, runtime: fs.existsSync(piperExe()), win: process.platform === "win32", voices: voiceRows(), current: config.voiceId, robot: !!config.voiceRobot }));
ipcMain.handle("voice-install", async (_e, id) => {
  if (!VOICES.some((v) => v.id === id)) return { ok: false, error: "unbekannte Stimme" };
  if (process.platform !== "win32") return { ok: false, error: "Die Argus-Stimme gibt es bisher nur unter Windows." };
  try { await installVoice(id, (p) => sendUI("voice-progress", { id, pct: p })); piperReady = fs.existsSync(piperExe()) && voiceHas(config.voiceId); return { ok: true }; }
  catch (e) { try { fs.rmSync(voiceFileOf(id) + ".part", { force: true }); } catch {} return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle("voice-remove", (_e, id) => {
  if (!VOICES.some((v) => v.id === id)) return false;
  for (const x of ["", ".json", ".part"]) { try { fs.rmSync(voiceFileOf(id) + x, { force: true }); } catch {} }
  if (id === config.voiceId) piperReady = false;
  return true;
});
ipcMain.handle("voice-use", (_e, id) => {
  if (id === "server") { if (!localUrl(config.voiceServer)) return false; config.voiceEngine = "server"; saveConfig(); return true; }
  if (!VOICES.some((v) => v.id === id) || !voiceHas(id)) return false;
  config.voiceId = id; config.voiceEngine = "jarvis"; piperReady = fs.existsSync(piperExe()); saveConfig(); return true;
});
ipcMain.handle("tts-state", () => ({ ready: piperReady, win: process.platform === "win32" }));
// Panel am Rand größer/kleiner ziehen; die angedockte Ecke bleibt stehen
ipcMain.on("set-panel-size", (_e, w, h) => {
  if (!win || !expanded || !Number.isFinite(w) || !Number.isFinite(h)) return;
  // 0 setzt auf automatische Größe zurück
  config.panelW = w > 0 ? Math.round(Math.max(380, w)) : 0; config.panelH = h > 0 ? Math.round(Math.max(420, h)) : 0;
  if (w <= 0) config.panelBox = null;
  applyBounds(config.corner, false);
  clearTimeout(saveTimer); saveTimer = setTimeout(saveConfig, 400);
});
ipcMain.on("set-panel-bounds", (_e, x, y, w, h) => {
  if (!alive() || !expanded || winMode !== "normal" || ![x, y, w, h].every(Number.isFinite)) return;
  const b = { x: Math.round(x), y: Math.round(y), width: Math.round(Math.max(380, w)), height: Math.round(Math.max(420, h)) };
  stopAnim(); setBoundsNow(b);
  config.panelBox = b;
  clearTimeout(saveTimer); saveTimer = setTimeout(saveConfig, 400);
});
// Panel an Kante/Ecke ziehen: der Hauptprozess folgt dem Mauszeiger selbst (bis 120 Mal pro Sekunde).
// Kein Umweg über die Oberfläche, darum kein Ruckeln und kein Zittern an der linken/oberen Kante.
ipcMain.on("panel-resize-start", (_e, k) => {
  if (!alive() || !expanded || winMode !== "normal" || typeof k !== "string") return;
  stopAnim();
  const b0 = win.getBounds(), c0 = screen.getCursorScreenPoint(), MINW = 380, MINH = 420;
  win.setResizable(true); win.setMinimumSize(1, 1);
  let last = "";
  clearInterval(panelDrag?.timer);
  panelDrag = { timer: setInterval(() => {
    if (!alive()) return endPanelDrag();
    const c = screen.getCursorScreenPoint(), dx = c.x - c0.x, dy = c.y - c0.y;
    let { x, y, width: w, height: h } = b0;
    if (k.includes("e")) w = Math.max(MINW, b0.width + dx);
    if (k.includes("s")) h = Math.max(MINH, b0.height + dy);
    if (k.includes("w")) { w = Math.max(MINW, b0.width - dx); x = b0.x + b0.width - w; }
    if (k.includes("n")) { h = Math.max(MINH, b0.height - dy); y = b0.y + b0.height - h; }
    const key = [x, y, w, h].join();
    if (key === last) return;
    last = key; putBounds({ x, y, width: w, height: h });
  }, 8) };
});
function endPanelDrag() {
  if (!panelDrag) return;
  clearInterval(panelDrag.timer); panelDrag = null;
  if (!alive()) return;
  win.setResizable(false);
  if (expanded && winMode === "normal") { config.panelBox = win.getBounds(); saveConfig(); }
}
ipcMain.on("panel-resize-end", endPanelDrag);
ipcMain.on("set-scale", (_e, key, v) => {
  if (!["labelScale", "tempScale", "ballScale", "appScale"].includes(key) || !Number.isFinite(v)) return;
  config[key] = Math.max(0.6, Math.min(2.5, v));
  clearTimeout(saveTimer); saveTimer = setTimeout(saveConfig, 400);
});

// Verschieben per Ziehen an der Kugel: Fenster folgt dem Mauszeiger, bis losgelassen wird
let moveTimer = null;
ipcMain.on("move-start", () => {
  if (!alive()) return;
  stopAnim();
  const c = screen.getCursorScreenPoint(), b = win.getBounds(), off = { x: c.x - b.x, y: c.y - b.y };
  clearInterval(moveTimer);
  moveTimer = setInterval(() => {
    if (!alive()) { clearInterval(moveTimer); moveTimer = null; return; }
    const p = screen.getCursorScreenPoint(); win.setPosition(p.x - off.x, p.y - off.y);
  }, 1000 / 60);
});
ipcMain.on("move-end", () => { clearInterval(moveTimer); moveTimer = null; config.corner = nearestCorner(); saveConfig(); });
// Leere, durchsichtige Fensterfläche lässt Klicks zum Desktop durch
ipcMain.on("click-through", (_e, on) => win?.setIgnoreMouseEvents(!!on, { forward: true }));
ipcMain.handle("local-ai", () => localState);
ipcMain.handle("ai-status", () => aiStatus());
ipcMain.on("set-expanded", (_e, on, focus) => setExpanded(!!on, !!focus));
ipcMain.on("open-settings", () => shell.openPath(CONFIG_PATH));

// Programm-Symbole aus der .exe holen (einmal pro Programm, dann aus dem Speicher)
const iconCache = new Map();
function withIcons(data) {
  const apps = (data.apps || []).map((a) => {
    if (!iconCache.has(a.path)) {
      iconCache.set(a.path, null);
      app.getFileIcon(a.path, { size: "normal" }).then((img) => { if (!img.isEmpty()) iconCache.set(a.path, img.toDataURL()); }).catch(() => {});
    }
    return { key: a.key, name: a.name, icon: iconCache.get(a.path) };
  });
  return { ...data, apps };
}

app.whenReady().then(async () => {
  loadConfig(); // zuerst: ioBroker, Foreman-Dashboard und Portal lesen ihre Schalter aus der Konfiguration
  uiStart = uiMode.decideStart(app.getPath("userData"), config.uiMode); // Startsicherung des Apple-Modus, siehe app/ui-mode.js
  if (uiStart.fallback) { config.uiMode = "klassisch"; try { writeConfigNow(); } catch (e) { logError(e); } }
  startDiscordSocial();
  try { iob.init({ on: !!config.iobOn, url: config.iobUrl, user: config.iobUser, pass: unseal(config.iobPass) || "", write: !!config.iobWrite, all: config.iobAll !== false, pick: (Array.isArray(config.iobPick) ? config.iobPick : []).filter((p) => p && typeof p.id === "string").slice(0, 60) }, () => sendUI("iob", iob.data())); } catch {}
  try { fmdash.init(require("electron"), config.fmDashOn, (x) => { try { fs.writeFileSync(path.join(app.getPath("userData"), "foreman-dashboard-beispiel.json"), JSON.stringify(x, null, 1).slice(0, 3000)); } catch {} }); } catch {}
  try { portal.init(require("electron"), config.portalOn, (s) => { try { fs.writeFileSync(path.join(app.getPath("userData"), "portal-typen-beispiel.json"), JSON.stringify(s, null, 1).slice(0, 4000)); } catch {} }, () => config.portalUrl); } catch {}
  setTimeout(edgeWatch, 3000);
  if (process.platform === "win32") app.setAppUserModelId("de.jarvis.desktop");
  if (config.autostart) try { applyAutostart(); } catch (e) { logError(e); } // Autostart-Eintrag auf die aktuelle Programmdatei (nach dem Umzug Argus.exe)
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "media"));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === "media");
  // Fremde Seiten (YouTube, Twitch, StreamKit) dürfen weder Kamera, Mikrofon, Standort noch Benachrichtigungen verlangen
  for (const part of ["persist:youtube", "persist:twitch", "persist:streamkit"]) { const ss = session.fromPartition(part); ss.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "fullscreen" || perm === "clipboard-sanitized-write")); ss.setPermissionCheckHandler((_wc, perm) => perm === "fullscreen" || perm === "clipboard-sanitized-write"); }
  const port = await startServer();
  await createWindow(port);
  buildTray();
  applyAutostart();
  setupUpdater();
  if (config.setupDone) startSensors();
  win?.on("session-end", () => { quitting = true; }); // Windows fährt herunter: zählt wie Beenden
  // war YouTube beim Beenden offen, wieder öffnen (an der gemerkten Stelle), im Panel oder als eigenes Fenster
  setTimeout(() => { try { if (config.ytOpen === "panel") ytEmbedShow(""); if (config.twOpen === "panel") twEmbedShow(""); else if (config.twOpen === "win") openTwitch(""); } catch (e) { logError(e); } }, 3000);
  strata.init(() => config, (s) => {
    if (s.state === "an" && strataPrev !== "an") { strataUsed = Date.now(); unloadOllama(); } // Strata übernimmt: kleines Modell aus dem Grafikspeicher werfen
    strataPrev = s.state; sendUI("strata", s); pushAiStatus();
  });
  // Autostopp: läuft Strata und wurde lange nichts gefragt, beenden und den Arbeitsspeicher freigeben
  setInterval(() => {
    const m = Number(config.strataIdleMin) || 0;
    if (m > 0 && strata.running() && Date.now() - strataUsed > m * 60e3) {
      config.strataOn = false; saveConfig();
      strata.stop().then(() => sendUI("notice", `Strata nach ${m} Minuten ohne Frage beendet, Arbeitsspeicher wieder frei.`)).catch(logError);
    }
  }, 60e3);
  setInterval(() => strata.check(), 15e3); setTimeout(() => (config.strataOn ? strata.start() : strata.check()), 6000); // neue Nutzer entscheiden in der Einrichtung (Admin-Abfrage)
  startDcBot();
  startMedia();
  // Steam-Downloads alle 5 Sekunden aus den Spieldateien lesen, an die Systemwache
  let dlSig = "";
  setInterval(async () => {
    if (config.steamDl === false) return;
    const l = await steamdl.poll().catch(() => []);
    // Steam schreibt Fortschritt und Tempo nur selten ins Protokoll: läuft ein Download, zeigt die echte Netzwerk-Empfangsrate das aktuelle Tempo
    const lv = l.find((d) => d.active && d.phase === "lädt");
    if (lv && netRx > 200 * 1024) lv.rate = netRx;
    const sig = JSON.stringify(l);
    if (sig !== dlSig) { dlSig = sig; if (alive()) win.webContents.send("steam-dl", l); }
  }, 5000);
  globalShortcut.register("CommandOrControl+Shift+J", () => { if (!alive()) return; toggleVisible(); });
  ensureVoiceModel();
  setInterval(pushAiStatus, 15000); setTimeout(pushAiStatus, 2500);
  if (config.systemWatch) {
    watch = new SystemWatch((data) => { netRx = (data?.net?.rxKBs || 0) * 1024; sendUI("system", withIcons(data)); });
    watch.limits = { cpu: config.cpuHotC, gpu: config.gpuHotC, diskGB: config.warnDiskGB, ramPct: config.warnRamPct, cpuPct: config.warnCpuPct, inet: config.warnInet };
    watch.appsOn = config.widgets.apps.on;
    watch.start();
  }
  // 0.31.5: Ollama nicht installiert, Strata aber da → Ollama gilt als bewusst entfernt (Strata ersetzt es) und wird nicht nachinstalliert
  // 0.31.6: Strata installiert → Ollama aus (Strata ersetzt es; 0.31.4 hatte das gerade entfernte Ollama noch einmal nachinstalliert). In den Einstellungen wieder einschaltbar
  if (config.ollamaOffChecked !== 2) { config.ollamaOffChecked = 2; try { if (process.platform === "win32" && strata.findDir()) config.ollamaOff = true; } catch {} saveConfig(); }
  if (config.ollamaOff) stopOllama();
  // Lokale KI vorbereiten und alle 20 s nachsehen, ob Ollama inzwischen da ist (z. B. selbst installiert)
  ensureLocalAI();
  ensurePiper();
  setInterval(() => { if (["missing", "error", "check"].includes(localState.phase)) ensureLocalAI(); }, 20000);
  // Dateiverzeichnis aller Laufwerke im Hintergrund bauen, danach alle 12 Stunden erneuern
  const reindex = () => files.build({ onDone: (n, e) => { if (n > 0) console.log("Dateiverzeichnis: " + n + " Einträge"); if (e) logError(e); } });
  setTimeout(reindex, 8000); setInterval(reindex, 3600e3);
  linkClaudeDesktop();
  startMarket();
});

// ---------- Lagebild: Bitcoin-Kurs, News, Auffälligkeiten ----------
const market = { btc: null, coins: {}, hists: {}, btcError: "", hist: [], tech: [], krypto: [], alerts: [], errors: [], steam: null, discord: null };
let newsWin = null;
const newsAlive = () => newsWin && !newsWin.isDestroyed();
const marketWanted = () => config.newsOn || config.widgets.btc?.on !== false;
function pushMarket() {
  sendUI("market", market);
  if (newsAlive()) newsWin.webContents.send("market", { ...market, cats: { ...config.newsCats, steam: false, discord: false } /* Freunde stehen jetzt neben der Kugel */, cur: config.btcCur, hue: config.themeHue, win: config.winColor, coinSel: coinList() });
}
// Kurse: Bitcoin immer, dazu die in den Einstellungen gewählten Coins. Alle 3 Minuten Kurs, alle 15 Minuten echter 24-h-Verlauf
const coinList = () => [...new Set(["BTC", ...(Array.isArray(config.coins) ? config.coins : [])])].filter((x) => news.COINS[x]);
async function pollPrice() {
  if (!marketWanted()) return;
  const r = await news.coins(coinList());
  market.btcError = r.coins.BTC ? "" : r.error || "kein Kurs";
  for (const [sym, q] of Object.entries(r.coins)) {
    market.coins[sym] = q;
    const h = (market.hists[sym] ||= []);
    if (q.usd?.price) h.push([q.ts, q.usd.price]);
    while (h.length && h[0][0] < Date.now() - 864e5) h.shift();
  }
  for (const k of Object.keys(market.coins)) if (!coinList().includes(k)) { delete market.coins[k]; delete market.hists[k]; }
  if (r.coins.BTC) market.btc = r.coins.BTC;
  syncBtcHist(); pushMarket();
}
const histTs = {};
async function pollHist() {
  if (!marketWanted()) return;
  let got = false;
  for (const sym of coinList()) {
    if (Date.now() - (histTs[sym] || 0) < 14 * 60e3) continue;
    const a = await news.history(sym); if (!a?.length) continue;
    histTs[sym] = Date.now(); got = true;
    market.hists[sym] = [...a, ...(market.hists[sym] || []).filter((x) => x[0] > a[a.length - 1][0])];
  }
  if (got) { syncBtcHist(); pushMarket(); }
}
// Verlauf für Lagebild und alte Anzeigen: [Zeit, USD, EUR] (EUR über das aktuelle Verhältnis)
function syncBtcHist() { const q = market.coins.BTC, k = q?.usd?.price && q?.eur?.price ? q.eur.price / q.usd.price : null; market.hist = (market.hists.BTC || []).map(([t, u]) => [t, u, k ? u * k : null]); }
// ---------- Wetter am Standort ----------
// Standort alle 30 Minuten neu (unterwegs), Wetter alle 15 Minuten. Nach dem Aufwachen aus dem Standby sofort.
// Dazu bis zu 3 feste Orte (Einstellungen → Mining → Wetter), die Anzeige wechselt zwischen allen.
const wx = { loc: null, locTs: 0, data: null, ts: 0, error: "", places: [] };
const geoCache = {};
let wxBusy = false;
const wxPlaceNames = () => String(config.wxPlaces || "").split(/[\n;]+/).map((x) => x.trim()).filter(Boolean).slice(0, 3);
async function pollPlaces() {
  const out = [];
  for (const q of wxPlaceNames()) {
    const prev = wx.places.find((x) => x.q === q), o = { q, name: q, ts: 0, data: null, error: "" };
    try {
      if (!(q in geoCache)) geoCache[q] = await weather.geocode(q);
      const g = geoCache[q];
      if (!g) { o.error = `Ort „${q}“ nicht gefunden`; delete geoCache[q]; }
      else { Object.assign(o, { name: g.city, country: g.country }); o.data = await weather.forecast(g.lat, g.lon); o.ts = Date.now(); }
    } catch (e) { o.error = "Wetter nicht erreichbar"; if (prev?.data) { o.data = prev.data; o.ts = prev.ts; } logError(e); }
    out.push(o);
  }
  wx.places = out;
}
async function pollWeather() {
  if (config.weatherOn === false || wxBusy) return;
  wxBusy = true;
  try {
    await pollPlaces().catch(logError);
    if (!wx.loc || Date.now() - wx.locTs > 30 * 60e3) { const l = await weather.locate(); if (l) { wx.loc = l; wx.locTs = Date.now(); } }
    if (!wx.loc) { wx.error = "Standort unbekannt"; return; }
    wx.data = await weather.forecast(wx.loc.lat, wx.loc.lon); wx.ts = Date.now(); wx.error = "";
  } catch (e) { wx.error = "Wetter nicht erreichbar"; logError(e); }
  finally { wxBusy = false; sendUI("weather", wx); }
}
function weatherSummary() {
  const c = wx.data?.cur; if (!c || !wx.loc) return "";
  const d = wx.data.days?.[0], n = wx.data.days?.[1];
  return `\n\nWetter am aktuellen Standort ${wx.loc.city || "(unbekannter Ort)"}${wx.loc.country ? ", " + wx.loc.country : ""} (Open-Meteo, ${new Date(wx.ts).toLocaleTimeString("de-DE")}): ${c.temp} °C, gefühlt ${c.feels} °C, Wettercode ${c.code}, Wind ${c.wind} km/h, Luftfeuchte ${c.hum} %` +
    (d ? `. Heute ${d.min} bis ${d.max} °C, Regenrisiko ${d.rain} %` : "") + (n ? `. Morgen ${n.min} bis ${n.max} °C, Regenrisiko ${n.rain} %, Code ${n.code}` : "") +
    wx.places.filter((x) => x.data?.cur).map((x) => { const c2 = x.data.cur, d2 = x.data.days?.[0]; return `. In ${x.name}: ${c2.temp} °C, Code ${c2.code}` + (d2 ? `, heute ${d2.min} bis ${d2.max} °C, Regenrisiko ${d2.rain} %` : ""); }).join("") +
    ". (WMO-Codes: 0 klar, 1-3 bewölkt, 45/48 Nebel, 51-67 Regen, 71-77 Schnee, 80-82 Schauer, 95-99 Gewitter)";
}

// ---------- Mining: eigener OCEAN-Pool und Bitcoin-Netz ----------
// Mehrere Wallets (eine pro Zeile, optional „Name = Adresse“), pool = erste, für Kurzfassungen
const mine = { pools: [], pool: null, net: null, st: {} };
const shortAddr = (a) => a.slice(0, 6) + "…" + a.slice(-4);
function wallets() {
  const out = [];
  for (const line of String(config.mineAddr || "").split(/[\n,;]+/)) {
    // „Farm A: bc1…“, „Farm A = bc1…“, „Farm A bc1…“ oder nur die Adresse: die Adresse ist das gültige Wort, der Rest der Name
    const words = line.trim().split(/[\s=:]+/).filter(Boolean), addr = words.find((x) => mining.validAddr(x));
    if (!addr || out.some((w) => w.addr === addr)) continue;
    const label = line.replace(addr, "").replace(/[=:]/g, " ").trim().replace(/\s+/g, " ");
    out.push({ addr, label: label.slice(0, 24) || shortAddr(addr) });
  }
  return out.slice(0, 5);
}
const fmtHash = (h) => { if (h == null) return "–"; const u = ["H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"]; let i = 0; while (h >= 1000 && i < u.length - 1) { h /= 1000; i++; } return h.toFixed(h >= 100 ? 0 : h >= 10 ? 1 : 2) + " " + u[i]; };
const pushMine = () => sendUI("mining", mine);
async function pollPool() {
  const ws = config.mineOn === false || config.miningOn === false ? [] : wallets();
  if (!ws.length) { if (mine.pools.length) { mine.pools = []; mine.pool = null; pushMine(); } return; }
  const before = mine.pools;
  mine.pools = await Promise.all(ws.map(async (w) => {
    const prev = before.find((x) => x.addr === w.addr);
    try {
      const p = await mining.pool(w.addr); p.addr = w.addr; p.label = w.label;
      if (p.error && prev) return { ...prev, label: w.label, error: p.error };
      if (p.sample) { try { fs.writeFileSync(path.join(app.getPath("userData"), "ocean-worker-beispiel.json"), p.sample); } catch {} delete p.sample; }
      mineAlarm(prev, p, ws.length > 1 ? w.label + ": " : "");
      if (p.workers?.length) report.record((w.label || "OCEAN") + " · OCEAN", p.workers);
      recordMine(p, ws.length > 1 ? w.label + ": " : "");
      return p;
    } catch (e) { logError(e); return prev || { addr: w.addr, label: w.label, ts: Date.now(), error: "OCEAN nicht erreichbar" }; }
  }));
  mine.pool = mine.pools[0]; pushMine();
}
async function pollNet() {
  if (config.mineOn === false || config.miningOn === false) return;
  try { const n = await mining.network(); mine.net = n.error && mine.net ? { ...mine.net, error: n.error } : n; pushMine(); } catch (e) { logError(e); }
}
// ---------- Foreman: Farm je Miner, mehrere Konten (je Client-ID ein Schlüssel) ----------
let farmSt = null, farmPrev = {}, farmSampled = false, farmGen = 0;
const fmAccts = () => (config.foremanAccounts || []).filter((a) => a && a.client);
function cleanAccts(list) {
  return (Array.isArray(list) ? list : []).slice(0, 8).map((a, i) => ({ name: String(a?.name || "").trim().slice(0, 30) || `Farm ${i + 1}`, client: String(a?.client || "").replace(/\D/g, "").slice(0, 12), key: String(a?.key || "").trim().slice(0, 200) })).filter((a) => a.client);
}
// Konten speichern: leerer Schlüssel = bisherigen Schlüssel dieser Client-ID behalten
ipcMain.handle("foreman-accounts", (_e, list) => {
  const keys = new Map(fmAccts().map((a) => [a.client, a.key]));
  config.foremanAccounts = cleanAccts((Array.isArray(list) ? list : []).map((a) => ({ ...a, key: String(a?.key || "").trim() || keys.get(String(a?.client || "").replace(/\D/g, "")) || "" })));
  config.foremanClient = ""; config.foremanKey = ""; saveConfig();
  farmSt = null; farmPrev = {}; for (const k in farmConf) delete farmConf[k]; pollFarm();
  return config.foremanAccounts.map((a) => ({ name: a.name, client: a.client, hasKey: !!a.key }));
});
// „Verbindung testen“ in den Einstellungen: leerer Schlüssel = gespeicherten dieser Client-ID nehmen
ipcMain.handle("foreman-test", async (_e, a) => {
  const client = String(a?.client || "").replace(/\D/g, ""), key = String(a?.key || "").trim() || fmAccts().find((x) => x.client === client)?.key || "";
  if (!client) return { ok: false, text: "Client-ID fehlt." };
  if (!key) return { ok: false, text: "Schlüssel fehlt." };
  const f = await foreman.farm(client, key, true);
  if (f.error) return { ok: false, text: f.error };
  const sites = splitSites({ client, name: "" }, f), on = (l) => l.filter((m) => m.on === true).length;
  const txt = sites.length > 1 ? sites.map((x) => `${x.pxName}: ${x.pxOff ? `Pickaxe offline (${x.miners.length} Miner)` : `${on(x.miners)} / ${x.miners.length} online`}`).join(" · ") : `${f.miners.length} Miner, ${on(f.miners)} online`;
  return { ok: true, text: `Verbunden. ${txt}` + (f.note ? ". Hashrate fehlt in der Antwort." : "") };
});
// Ein Foreman-Konto kann mehrere Pickaxes (Standorte) haben, z. B. VR und CH: die Miner tragen die Pickaxe-Nummer,
// daraus werden eigene Anlagen, einzeln benennbar und ausblendbar (config.foremanPx). Pickaxe ohne einen Miner online = Pickaxe offline.
const pxAlarm = {};
// Häufigster Buchstaben-Anfang der Miner-Namen (z. B. „ABC“ in Farm A, „XYZ“ in Farm B), wenn er für die meisten gilt
function minerPrefix(ms) {
  const c = {}; for (const m of ms) { const p = (/^[A-Za-z]{2,}/.exec(String(m.name || "")) || [""])[0].toUpperCase(); if (p) c[p] = (c[p] || 0) + 1; }
  const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return best && best[1] >= ms.length * 0.6 ? best[0] : "";
}
// Mehrere Pickaxes in einem Konto: „auto“ fasst sie zu einem Standort zusammen, wenn die Miner überall gleich benannt sind
// (Farm A: drei Pickaxes, alle ABC…), sonst getrennt (Farm B: zwei Standorte). In den Einstellungen umstellbar (foremanPx["client:*"].mode)
function splitSites(acc, f) {
  let groups = new Map(); for (const m of f.miners || []) { const k = m.px || ""; (groups.get(k) || groups.set(k, []).get(k)).push(m); }
  const pxCount = groups.size, mode = config.foremanPx?.[`${acc.client}:*`]?.mode || "auto";
  let merge = mode === "merge";
  if (mode === "auto" && groups.size > 1) { const ps = [...groups.values()].map(minerPrefix); merge = ps.every((p) => p && p === ps[0]); }
  if (merge && groups.size > 1) {
    const pxs = [...groups.keys()], all = [...groups.values()].flat(), allOff = pxs.every((px) => f.pickaxes?.[px]?.on === false);
    return [{ ...f, key: acc.client, client: acc.client, px: "", pxName: "", name: acc.name, miners: all, hidden: false, pxOff: allOff || (all.length >= 3 && !all.some((m) => m.on === true) && !f.error), pxVer: "", pxCount, pxMode: mode, merged: true }];
  }
  const multi = groups.size > 1, order = [...groups.keys()].sort((a, b) => Number(a) - Number(b)); // Nummerierung stabil nach Pickaxe-Nummer
  const pfx = new Map([...groups].map(([k, ms]) => [k, minerPrefix(ms)])), uniq = (k) => { const p = pfx.get(k); return p && [...pfx.values()].filter((x) => x === p).length === 1 ? p : ""; };
  return [...(groups.size ? groups : new Map([["", []]]))].sort((a, b) => b[1].length - a[1].length).map(([px, ms]) => {
    const key = multi ? `${acc.client}:${px}` : acc.client, pc = config.foremanPx?.[`${acc.client}:${px}`] || {}, info = f.pickaxes?.[px] || {};
    const pxName = (pc.name || info.name || (multi ? uniq(px) : "") || (px ? `Standort ${order.indexOf(px) + 1}` : "")).slice(0, 30); // ohne Namen: Anfang der Miner-Namen (ABC …) oder durchnummeriert, umbenennen in den Einstellungen
    const pxOff = info.on === false || (ms.length >= 3 && !ms.some((m) => m.on === true) && !f.error);
    return { ...f, key, client: acc.client, px, pxName, name: multi ? `${acc.name} · ${pxName}` : acc.name, miners: ms, hidden: !!(multi && pc.hidden), pxOff, pxVer: info.version || "", pxCount, pxMode: mode };
  });
}
async function pollFarm() {
  const list = fmAccts(), gen = ++farmGen; // nur die jüngste Abfrage zählt (Einstellungen können währenddessen geändert werden)
  if (!config.foremanOn || config.miningOn === false || !list.length) { if (farmSt) { farmSt = null; sendUI("farm", null); } return; }
  try {
    const old = farmSt?.accounts || [];
    const per = await Promise.all(list.map(async (acc) => {
      if (!acc.key) return [{ name: acc.name, key: acc.client, client: acc.client, error: "Kein API-Schlüssel eingetragen." }];
      const f = await foreman.farm(acc.client, acc.key);
      if (f.sample) { if (!farmSampled) { farmSampled = true; try { fs.writeFileSync(path.join(app.getPath("userData"), "foreman-beispiel.json"), f.sample); } catch {} } delete f.sample; }
      const was = old.filter((a) => a.client === acc.client && a.miners);
      if (f.error && was.length) return was.map((a) => ({ ...a, error: f.error }));
      if (f.error) return [{ name: acc.name, key: acc.client, client: acc.client, error: f.error }];
      const sites = splitSites(acc, f);
      for (const st of sites) { if (st.miners) fmdash.apply(st.miners); fmdash.tag(st); }
      for (const st of sites) {
        if (st.hidden) continue;
        const lbl = list.length > 1 || sites.length > 1 ? st.name : "";
        // Pickaxe weg: eine Meldung statt tausender Miner-Ausfälle; Miner-Wächter erst wieder, wenn sie zurück ist
        const pa = (pxAlarm[st.key] ||= { off: st.pxOff, first: true });
        if (st.pxOff !== pa.off && !pa.first) { const t = st.pxOff ? `Pickaxe ${st.pxName || ""} offline, ${st.miners.length} Miner ohne Verbindung` : `Pickaxe ${st.pxName || ""} wieder verbunden`; farmEvent((lbl ? lbl + ": " : "") + t, st.pxOff); notify("farm", "Argus · Farm", (lbl ? lbl + ": " : "") + t); }
        pa.off = st.pxOff; pa.first = false;
        if (st.pxOff) delete farmConf[st.key]; else farmAlarm(null, st, lbl, st.key);
        st.hist = recordFarm(st.key, st.miners);
        report.record(st.name || acc.name, st.miners, !!st.pxOff);
      }
      return sites;
    }));
    if (gen !== farmGen) return;
    const accounts = per.flat(), all = accounts.filter((a) => !a.hidden && !a.pxOff).flatMap((a) => a.miners || []);
    farmSt = { ts: Date.now(), accounts, events: farmEvents(), eventsAll: farmEvents(30), hist: accounts.filter((a) => !a.hidden).length > 1 && all.length ? recordFarm("_gesamt", all) : null };
    sendUI("farm", farmSt);
  } catch (e) { logError(e); }
}
// Ereignisse von Foreman (Datei farm-ereignisse.json): Ausfälle, Rückkehr, Pickaxe weg/da, Hitze; die letzten 5 stehen im Farm-Block
let fev = null, fevSave = null;
function farmEvent(t, bad, names) {
  if (!fev) farmEvents();
  const now = Date.now(); fev.push([now, String(t).slice(0, 160), bad ? 1 : 0, ...(names?.length ? [names.slice(0, 20).map(String)] : [])]); // Miner-Namen: Klick öffnet sie in Foreman fev = fev.filter((x) => now - x[0] <= 7 * 864e5).slice(-30);
  clearTimeout(fevSave); fevSave = setTimeout(() => { try { fs.writeFileSync(path.join(app.getPath("userData"), "farm-ereignisse.json"), JSON.stringify(fev)); } catch (e) { logError(e); } }, 3000);
}
function farmEvents(n = 5) {
  if (!fev) { try { fev = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "farm-ereignisse.json"), "utf8")); if (!Array.isArray(fev)) fev = []; } catch { fev = []; } }
  return fev.slice(-n).reverse();
}
// Wächter: Miner geht offline oder wird heiß (ab 90 °C), Entwarnung bei Rückkehr
// Bestätigter Zustand je Miner: erst wenn er zwei Abfragen hintereinander gleich ist, gilt er (gegen Fehlalarm bei kurzen Aussetzern).
// Je Anlage höchstens eine Meldung pro Art und Abfrage, bei vielen Minern als Sammelmeldung.
const farmConf = {};
function farmAlarm(_prev, f, acc = "", client = "") {
  if (!f.miners) return;
  const st = (farmConf[client] ||= { first: true, m: new Map() }), off = [], back = [], hot = [];
  for (const m of f.miners) {
    const k = String(m.id ?? m.name), c = st.m.get(k) || { on: m.on, pend: null, n: 0, hot: m.temp >= 90 };
    if (m.on != null && m.on !== c.on) { if (c.pend === m.on) c.n++; else { c.pend = m.on; c.n = 1; } if (c.n >= 2) { if (!st.first && c.on != null) (m.on ? back : off).push(m.name); c.on = m.on; c.pend = null; c.n = 0; } }
    else { c.pend = null; c.n = 0; }
    const h = m.temp >= 90; if (h && !c.hot && !st.first) hot.push(`${m.name} ${Math.round(m.temp)} °C`); c.hot = h;
    st.m.set(k, c);
  }
  st.first = false;
  const say = (t, bad = true, names) => { farmEvent((acc ? acc + ": " : "") + t, bad, names); notify("farm", "Argus · Farm" + (acc ? " " + acc : ""), (acc ? acc + ": " : "") + t); };
  const names = (l) => l.length > 5 ? `${l.slice(0, 5).join(", ")} und ${l.length - 5} weitere` : l.join(", ");
  if (off.length) say(off.length === 1 ? `Miner offline: ${off[0]}` : `${off.length} Miner offline: ${names(off)}`, true, off);
  if (back.length) say(back.length === 1 ? `Wieder online: ${back[0]}` : `${back.length} Miner wieder online: ${names(back)}`, false, back);
  if (hot.length) say(`Miner heiß: ${names(hot)}`, true, hot.map((h) => h.replace(/ \d+ °C$/, "")));
}
// Farm-Verlauf (Datei farm-verlauf.json): je Anlage alle 5 Minuten Hashrate (SHA-256) und Miner online, 24 h
let fhist = null, fhSave = null;
function recordFarm(key, ms) {
  if (!fhist) { try { fhist = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "farm-verlauf.json"), "utf8")); } catch { fhist = {}; } }
  const now = Date.now(), a = (fhist[key] ||= []);
  if (ms && (!a.length || now - a[a.length - 1][0] >= 295e3)) a.push([now, Math.round(ms.reduce((x, m) => x + (m.on !== false && m.algo !== "scrypt" && m.hr ? m.hr : 0), 0) / 1e9), ms.filter((m) => m.on === true).length, ms.length]);
  fhist[key] = a.filter((x) => now - x[0] <= 24 * 36e5);
  clearTimeout(fhSave); fhSave = setTimeout(() => { try { fs.writeFileSync(path.join(app.getPath("userData"), "farm-verlauf.json"), JSON.stringify(fhist)); } catch (e) { logError(e); } }, 5000);
  return fhist[key].map((x) => [x[1] * 1e9, x[2], x[3], x[0]]); // Hashrate, online, gesamt, Zeitpunkt
}
// Verlauf je Wallet (Datei mining-verlauf.json): Hashrate alle 5 Minuten für 24 h, Ertrag aus dem Anstieg von „unbezahlt“,
// fällt „unbezahlt“ deutlich, hat OCEAN ausgezahlt
let mhist = null, mhSave = null;
const mhFile = () => path.join(app.getPath("userData"), "mining-verlauf.json");
function recordMine(p, pre = "") {
  if (!mhist) { try { mhist = JSON.parse(fs.readFileSync(mhFile(), "utf8")); } catch { mhist = {}; } }
  const now = Date.now(), a = (mhist[p.addr] ||= { pts: [], earn: [], unpaid: null, since: now });
  const v = p.hr?.m10 ?? p.hr?.m1;
  if (v != null && (!a.pts.length || now - a.pts[a.pts.length - 1][0] >= 295e3)) a.pts.push([now, v]);
  a.pts = a.pts.filter((x) => now - x[0] <= 24 * 36e5);
  if (p.unpaid != null) {
    const u = Math.round(p.unpaid * 1e8);
    if (a.unpaid != null && u > a.unpaid) a.earn.push([now, u - a.unpaid]);
    else if (a.unpaid != null && u < a.unpaid - 1000) {
      const t = `${pre}OCEAN hat ausgezahlt: rund ${(a.unpaid - u).toLocaleString("de-DE")} sats`;
      notify("payout", "Argus · Mining", t);
    }
    a.unpaid = u;
  }
  a.earn = a.earn.filter((x) => now - x[0] <= 7 * 864e5);
  p.hist = a.pts.map((x) => x[1]); p.day = a.earn.filter((x) => now - x[0] <= 864e5).reduce((s2, x) => s2 + x[1], 0); p.dayH = Math.min(24, (now - a.since) / 36e5);
  clearTimeout(mhSave); mhSave = setTimeout(() => { try { fs.writeFileSync(mhFile(), JSON.stringify(mhist)); } catch (e) { logError(e); } }, 5000);
}
// Wächter: Worker fällt aus oder Hashrate bricht ein (10-Minuten-Wert unter 60 % vom 3-Stunden-Schnitt, zweimal hintereinander)
// Benachrichtigungen an einer Stelle: Art an/aus (Einstellungen → Benachrichtigungen), Hinweis im Panel und/oder Windows-Meldung
const NOTIFY_KEY = { report: "reportNotify", farm: "fmNotify", ocean: "oceanNotify", payout: "payoutNotify" };
function notify(kind, title, body, silent) {
  if (config[NOTIFY_KEY[kind]] === false) return;
  if (config.notifyPanel !== false) sendUI("notice", body);
  try { if (config.notifyWin !== false && Notification.isSupported()) new Notification({ title, body, silent: silent ?? config.notifySound === false }).show(); } catch {}
}
function mineAlarm(prev, p, pre = "") {
  const st = mine.st[p.addr] ||= { low: 0, alarm: "" };
  const say = (t0) => notify("ocean", "Argus · Mining", pre + t0);
  const offNow = (p.workers || []).filter((w) => w.on === false).map((w) => w.name), onBefore = new Set((prev?.workers || []).filter((w) => w.on === true).map((w) => w.name));
  const dropped = offNow.filter((n) => onBefore.has(n));
  if (dropped.length) say(`Worker offline: ${dropped.join(", ")}`);
  const back = (p.workers || []).filter((w) => w.on === true && prev?.workers?.some((x) => x.name === w.name && x.on === false)).map((w) => w.name);
  if (back.length) say(`Wieder online: ${back.join(", ")}`);
  const ref = p.hr?.h3, cur = p.hr?.m10;
  st.low = ref > 0 && cur != null && cur < ref * 0.6 ? st.low + 1 : 0;
  if (st.low === 2 && st.alarm !== "low") { st.alarm = "low"; say(`Hashrate eingebrochen: ${fmtHash(cur)} statt ${fmtHash(ref)} im 3-Stunden-Schnitt`); }
  else if (st.low === 0 && st.alarm === "low" && ref > 0 && cur >= ref * 0.85) { st.alarm = ""; say(`Hashrate wieder normal: ${fmtHash(cur)}`); }
}
async function pollFeeds() {
  const cats = ["tech", "krypto"].filter((c) => config.newsCats[c] !== false);
  if (!config.newsOn || !cats.length) return;
  try { const f = await news.feeds(cats); Object.assign(market, f); pushMarket(); } catch (e) { logError(e); }
}
async function pollAlerts() {
  if (!config.newsOn || config.newsCats.alerts === false) return;
  try { market.alerts = await news.alerts(market.btc); pushMarket(); } catch (e) { logError(e); }
}
// Wer ist online (Steam-Freunde, Discord-Server), alle 2 Minuten
async function pollSocial() {
  const [st, dc] = await Promise.all([
    config.steamOn !== false && (config.steamKey || config.steamId) ? social.steam(config.steamKey, config.steamId) : null,
    config.discordOn !== false && config.discordServers ? social.discord(config.discordServers) : null,
  ]);
  market.steam = st; market.discord = dc; pushMarket(); skSync(); updateOverlay();
}
// Discord alle 30 Sekunden abfragen, damit Freundesliste und Overlay mitbekommen, wer in den Sprachkanal kommt oder geht
async function pollDiscordFast() {
  if (config.discordOn === false || !config.discordServers) return;
  market.discord = await social.discord(config.discordServers); pushMarket(); skSync(); updateOverlay();
}

// ---------- Discord StreamKit unsichtbar im Hintergrund: echte Namen und wer gerade spricht ----------
// Das Server-Widget kürzt manche Namen („d…“) und kennt keine Sprecher. StreamKit liest beides aus dem laufenden Discord-Client.
const skWins = new Map(); // Kanal-ID -> { win, guild, members, t, sig }
let skNeedsAuth = false, skSentSig = "";
// ---------- „Läuft gerade“: Musik-App über die Windows-Mediensteuerung (Apple Music bevorzugt) ----------
let mediaProc = null, mediaTry = 0, mediaArt = "", mediaArtKey = "";
const artCache = new Map();
async function itunesArt(title, artist) {
  const q = `${artist || ""} ${title}`.replace(/\s+/g, " ").trim().slice(0, 120), k = q.toLowerCase();
  if (artCache.has(k)) return artCache.get(k);
  let url = "";
  for (const entity of ["song", "podcast"]) {
    try {
      const r = await fetch(`https://itunes.apple.com/search?country=de&limit=1&entity=${entity}&term=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(6000) });
      const j = await r.json(), a = j.results?.[0]?.artworkUrl100 || j.results?.[0]?.artworkUrl600;
      if (a) { url = a.replace(/\/\d+x\d+bb\./, "/300x300bb."); break; }
    } catch {}
  }
  artCache.set(k, url); return url;
}
const mediaCmdFile = () => path.join(app.getPath("userData"), "media-cmd.txt");
function startMedia() {
  if (process.platform !== "win32" || config.mediaOn === false || mediaProc) return;
  const ps = path.join(__dirname, "media", "media.ps1");
  if (!fs.existsSync(ps)) return;
  mediaProc = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps, "-Cmd", mediaCmdFile()], { windowsHide: true });
  let buf = "";
  mediaProc.stdout.on("data", (d) => {
    buf += d.toString("utf8"); let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      mediaTry = 0;
      // YouTube in Argus oder im Browser: Player nur, wenn gewünscht (Nutzerwunsch: soll nicht bei jedem Video aufploppen)
      if (config.mediaBrowser !== true && /argus|jarvis|electron|chrome|brave|msedge|edge|firefox|opera|vivaldi/i.test(m.app || "")) m = { on: false };
      if (m.art !== undefined) mediaArt = m.art; else m.art = mediaArt;
      if (alive()) win.webContents.send("media", m);
      // Kein Cover von Windows (Apple Music liefert oft keins): im öffentlichen iTunes-Katalog nachsehen
      // Nur für Musik-Apps: bei Browsern (YouTube in Brave …) findet der Musikkatalog sonst irgendein fremdes Bild
      if (m.on && m.art === "" && m.title && /apple|itunes|spotify|music|tidal|deezer|amazon/i.test(m.app || "")) {
        const key = m.title + "|" + (m.artist || "");
        if (key !== mediaArtKey) { mediaArtKey = key; itunesArt(m.title, m.artist).then((u) => { if (u && mediaArtKey === key) { mediaArt = u; if (alive()) win.webContents.send("media", { ...m, art: u }); } }); }
      }
    }
  });
  mediaProc.on("exit", () => { mediaProc = null; if (config.mediaOn !== false && mediaTry < 5) setTimeout(startMedia, 3000 * 2 ** mediaTry++); });
}
function stopMedia() { if (mediaProc) { const p = mediaProc; mediaProc = null; mediaTry = 9; try { p.kill(); } catch {} } }
ipcMain.on("media-cmd", (_e, c) => { if (["play", "next", "prev"].includes(c) || /^vol:(0(\.\d+)?|1(\.0+)?)$/.test(c)) try { fs.writeFileSync(mediaCmdFile(), c); } catch {} });
app.on("will-quit", stopMedia);
app.on("will-quit", () => crash.clean()); // sauber beendet: keine „unerwartet beendet“-Meldung beim nächsten Start
app.on("child-process-gone", (_e, d) => { if (d?.type === "GPU" && !["clean-exit", "killed"].includes(d.reason)) { crash.add("Grafikprozess abgestürzt", `${d.reason} (Code ${d.exitCode})`); setTimeout(() => sendUI("gpu-reset"), 1500); } });
ipcMain.on("ui-error", (_e, msg, stack) => crash.add("Fehler in der Oberfläche", String(msg || "").slice(0, 500), String(stack || "").slice(0, 3000)));
ipcMain.handle("crash-get", (_e, manual) => {
  if (manual) crash.add("Bericht vom Nutzer", "Manuell erstellter Bericht. Beschreibe kurz, was passiert ist:", crash.lastLog());
  else if (config.crashReport === false) return null;
  return crash.build({ version: require("./package.json").version, backend: config.backend, gpu: watch?.data?.gpuName || "" });
});
ipcMain.handle("crash-send", (_e, title, text) => { crash.archive(title, text, "gesendet"); shell.openExternal(crash.issueUrl(String(title || "Fehlerbericht"), String(text || ""))); crash.clear(); return true; });
ipcMain.handle("crash-dismiss", (_e, ignore, title, text) => { if (typeof text === "string" && text.trim()) crash.archive(title, text, "nicht gesendet"); crash.clear(!!ignore); return true; });
ipcMain.handle("crash-archive", (_e, title, text, state) => crash.archive(String(title || ""), String(text || ""), String(state || "")));
ipcMain.handle("crash-list", () => crash.history());
ipcMain.handle("crash-view", (_e, id) => crash.view(String(id || "")));
ipcMain.handle("crash-del", (_e, id) => crash.remove(String(id || "")));

// ---------- Eigener Discord-Bot: Kamera, Stream, Stumm/Taub, private Kanäle ----------
let botSnap = { status: "aus", guilds: [] }, botT = null, selfTriedFor = "";
// Eigenen Discord-Namen automatisch erkennen (angemeldete Discord-App auf diesem PC); schlägt es fehl, bleibt der Name aus den Einstellungen
async function detectDiscordSelf() {
  const id = dcbot.appId(); selfTriedFor = id;
  if (config.discordAuto === false) return;
  let me = null; try { me = await require("./discord-self").detectSelf(id); } catch {}
  if (!me) { selfTriedFor = ""; return; }
  if (normName(config.discordName) === normName(me.name) && config.discordUser === me.username) return;
  config.discordName = me.name; config.discordUser = me.username; saveConfig();
  if (alive()) win.webContents.send("discord-self", me);
}
function startDcBot() {
  dcbot.start(config.discordOn !== false ? config.dcBotToken : "", (snap) => {
    botSnap = snap; clearTimeout(botT);
    // kurz sammeln, beim Verbinden kommen viele Ereignisse auf einmal
    botT = setTimeout(() => { if (alive()) win.webContents.send("voice-bot", botSnap); skSync(); updateOverlay(); }, 250);
    if (dcbot.appId() && dcbot.appId() !== selfTriedFor) detectDiscordSelf();
  });
}

function skChannels() {
  const out = [];
  for (const g of botSnap.guilds) for (const c of g.ch) out.push({ guild: g.id, channelId: c.id });
  for (const sv of market.discord?.servers || []) {
    if (sv.error) continue;
    for (const id of new Set(sv.online.filter((m) => m.voice && m.voiceId).map((m) => m.voiceId))) out.push({ guild: sv.id, channelId: id });
  }
  for (const v of config.extraVoice || []) if (v?.g && v?.c && !out.some((o) => o.channelId === v.c)) out.push({ guild: v.g, channelId: v.c });
  return out.filter((o, i) => out.findIndex((x) => x.channelId === o.channelId) === i).slice(0, 8);
}
function skSync() {
  const want = config.discordOn !== false && config.overlayMode !== "einfach" ? skChannels() : [];
  const keep = new Set(want.map((c) => c.channelId));
  for (const [id, s] of skWins) if (!keep.has(id)) { if (!s.win.isDestroyed()) s.win.destroy(); skWins.delete(id); }
  for (const c of want) {
    if (skWins.has(c.channelId)) continue;
    const w = new BrowserWindow({ show: false, width: 320, height: 640, webPreferences: { partition: "persist:streamkit", backgroundThrottling: false } });
    w.webContents.setAudioMuted(true);
    w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    w.loadURL(overlayUrl({ guild: c.guild, channelId: c.channelId })).catch(() => {});
    skWins.set(c.channelId, { win: w, guild: c.guild, members: null, t: 0, sig: "" });
  }
}
const SK_SCRAPE = `(() => {
  const cls = (e) => (typeof e.className === "string" ? e.className : e.getAttribute?.("class") || "");
  let rows = [...document.querySelectorAll("[class]")].filter((e) => /voice_?state/i.test(cls(e)) && !/voice_?states/i.test(cls(e)));
  if (!rows.length) rows = [...document.querySelectorAll("li")].filter((l) => l.querySelector("img"));
  if (!rows.length) return { auth: !!document.querySelector("button, a") && /authori|autoris|connect|verbind|anmelden|log ?in/i.test(document.body ? document.body.innerText : "") };
  return { members: rows.map((r) => {
    const n = [...r.querySelectorAll("[class]")].find((e) => /name/i.test(cls(e)) && e.textContent.trim()) || r;
    const all = cls(r) + " " + [...r.querySelectorAll("[class]")].map(cls).join(" ");
    return { name: n.textContent.trim(), avatar: (r.querySelector("img") || {}).src || "", speaking: /speaking/i.test(all) };
  }) };
})()`;
function liveVoice() {
  const ch = {};
  for (const [id, s] of skWins) if (s.members && Date.now() - s.t < 6000) ch[id] = s.members;
  return { auth: skNeedsAuth, ch };
}
setInterval(async () => {
  if (!skWins.size) { if (skSentSig !== "") { skSentSig = ""; skNeedsAuth = false; win?.webContents.send("voice-live", liveVoice()); } return; }
  let auth = false;
  for (const [, s] of skWins) {
    if (s.win.isDestroyed()) continue;
    try {
      const r = await s.win.webContents.executeJavaScript(SK_SCRAPE, true);
      if (r?.auth) auth = true;
      if (r?.members) { s.members = r.members; s.t = Date.now(); }
    } catch {}
  }
  skNeedsAuth = auth;
  const lv = liveVoice(), sig = JSON.stringify(lv);
  if (sig !== skSentSig) { skSentSig = sig; if (win && !win.isDestroyed()) win.webContents.send("voice-live", lv); }
}, 400);
// Einmalig in Discord erlauben, dass StreamKit mitlesen darf
ipcMain.on("streamkit-auth", () => {
  const first = [...skWins.values()][0];
  const w = new BrowserWindow({ width: 520, height: 720, title: "Discord StreamKit freischalten", autoHideMenuBar: true, webPreferences: { partition: "persist:streamkit" } });
  w.loadURL(first ? first.win.webContents.getURL() : "https://streamkit.discord.com/overlay").catch(() => {});
  w.on("closed", () => { for (const [, s] of skWins) if (!s.win.isDestroyed()) s.win.webContents.reload(); });
});

// ---------- Overlay: wer sitzt mit dem Nutzer im Sprachkanal ----------
// Das Server-Widget verrät Sprachkanal und Spiel, aber nicht, wer spricht oder die Kamera an hat.
let ovWin = null;
const ovAlive = () => ovWin && !ovWin.isDestroyed();
const normName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
function myVoice() {
  const me = normName(config.discordName); if (!me) return null;
  for (const sv of market.discord?.servers || []) {
    if (sv.error) continue;
    const raw = String(config.discordName).trim().toLowerCase();
    const self = sv.online.find((m) => m.voice && m.name.trim().toLowerCase() === raw) || sv.online.find((m) => m.voice && normName(m.name) === me)
      || (me.length >= 3 ? sv.online.find((m) => m.voice && normName(m.name).startsWith(me)) : null);
    if (self) return { server: sv.server, guild: sv.id, channelId: self.voiceId, channel: self.voice, people: sv.online.filter((m) => m.voice === self.voice) };
  }
  // Der Bot kennt auch private Kanäle und den echten Benutzernamen
  for (const g of botSnap.guilds) for (const c of g.ch) {
    if (c.people.some((p) => p.user.toLowerCase() === String(config.discordName).trim().toLowerCase() || normName(p.name) === me))
      return { server: g.name, guild: g.id, channelId: c.id, channel: c.name, people: c.people.map((p) => ({ name: p.name, avatar: p.avatar, voice: c.name, voiceId: c.id })) };
  }
  // Widget kürzt den Namen? Dann über die echten Namen aus StreamKit finden
  for (const [id, s] of skWins) {
    if (!s.members?.some((m) => m.name.trim().toLowerCase() === String(config.discordName).trim().toLowerCase() || normName(m.name) === me)) continue;
    for (const sv of market.discord?.servers || []) {
      const any = sv.error ? null : sv.online.find((m) => m.voiceId === id);
      if (any) return { server: sv.server, guild: sv.id, channelId: id, channel: any.voice, people: sv.online.filter((m) => m.voiceId === id) };
    }
  }
  return null;
}
function placeOverlay() {
  if (!ovAlive()) return;
  const wa = screen.getPrimaryDisplay().workArea, [w, h] = ovWin.getSize(), c = config.overlayCorner || "oben-links";
  ovWin.setPosition(c.endsWith("rechts") ? wa.x + wa.width - w - 12 : wa.x + 12, c.startsWith("unten") ? wa.y + wa.height - h - 12 : wa.y + 12);
}
// Discord StreamKit (offizielles Discord-Overlay für Streamer) zeigt den Kanal live und hebt hervor, wer gerade spricht.
// Es verbindet sich mit der laufenden Discord-App; beim ersten Mal fragt Discord dort einmal nach der Erlaubnis.
const STREAMKIT_CSS = `body{background:transparent!important;margin:0!important;overflow:hidden!important}
[class*=voice_states]{padding:6px 8px!important;margin:0!important}
[class*=voice_state]{height:30px!important;margin-bottom:4px!important}
[class*=voice_avatar]{width:26px!important;height:26px!important;border-radius:50%!important;border:2px solid transparent!important;transition:border-color .15s,box-shadow .15s}
[class*=wrapper_speaking]{border-color:#3ecf8e!important;box-shadow:0 0 10px #3ecf8e!important}
[class*=voice_username] span,[class*=name]{font-family:"Segoe UI",system-ui,sans-serif!important;font-size:13px!important;font-weight:600!important;color:#e6eef8!important;background:rgba(10,16,28,.85)!important;border-radius:6px!important;padding:2px 6px!important;text-shadow:none!important}`;
function overlayUrl(v) {
  if (config.overlayMode === "einfach" || !v.guild || !v.channelId) return `http://127.0.0.1:${serverPort}/overlay.html`;
  return `https://streamkit.discord.com/overlay/voice/${encodeURIComponent(v.guild)}/${encodeURIComponent(v.channelId)}?icon=true&online=true&logo=white&text_color=%23e6eef8&text_size=13&text_outline_color=%23000000&text_outline_size=0&text_shadow_color=%23000000&text_shadow_size=0&bg_color=%230a1220&bg_opacity=0.9&bg_shadow_color=%23000000&bg_shadow_size=0&invite_code=&limit_speaking=false&small_avatars=false&hide_names=false&fade_chat=0`;
}
function updateOverlay() {
  const v = config.voiceOverlay !== false ? myVoice() : null;
  if (!v) { if (ovAlive()) ovWin.close(); return; }
  const url = overlayUrl(v), streamkit = /^https:/.test(url);
  const h = Math.min(460, (streamkit ? 16 : 44) + v.people.length * (streamkit ? 34 : 30));
  if (ovAlive() && ovWin.jarvisUrl !== url) { ovWin.close(); ovWin = null; }
  if (!ovAlive()) {
    // Nicht transparent: so rendert Windows die Schrift scharf (ClearType); transparente Fenster wirken weich
    ovWin = new BrowserWindow({ width: 240, height: h, frame: false, transparent: false, backgroundColor: "#0a1220", resizable: false, focusable: false, skipTaskbar: true, show: false, hasShadow: false,
      alwaysOnTop: true, title: "Argus Sprachkanal", webPreferences: { preload: path.join(__dirname, "preload-news.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, partition: "persist:streamkit" } });
    ovWin.jarvisUrl = url;
    ovWin.setAlwaysOnTop(true, "screen-saver"); ovWin.setIgnoreMouseEvents(true); // liegt über Spielen im Fenstermodus, Klicks gehen durch
    ovWin.on("closed", () => { ovWin = null; });
    ovWin.webContents.on("dom-ready", () => { if (streamkit) ovWin.webContents.insertCSS(STREAMKIT_CSS).catch(() => {}); });
    ovWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    ovWin.once("ready-to-show", () => { placeOverlay(); ovWin.showInactive(); if (!streamkit) ovWin.webContents.send("market", { voice: myVoice(), hue: config.themeHue }); });
    ovWin.loadURL(url).catch((e) => logError(e));
  } else {
    ovWin.setSize(240, h); placeOverlay();
    if (!streamkit) ovWin.webContents.send("market", { voice: v, hue: config.themeHue });
  }
}

// ---------- YouTube-Fenster ----------
// YouTube remains in the Argus-owned WebContentsView with its existing session.

// Integrated Electron playback with a regular filter; no warning-hiding preload.
const ytPrefs = () => ({ backgroundThrottling: false, partition: "persist:youtube", contextIsolation: true, nodeIntegration: false, sandbox: true });
const YT_CSS = "ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, ytd-companion-slot-renderer, ytd-action-companion-ad-renderer, ytd-banner-promo-renderer, ytd-statement-banner-renderer, ytd-promoted-video-renderer, #masthead-ad, #player-ads, .ytp-ad-overlay-container, .ytp-ad-image-overlay, ytd-rich-item-renderer:has(ytd-ad-slot-renderer), ytd-rich-section-renderer:has(ytd-statement-banner-renderer), ytd-reel-video-renderer:has(.ytd-ad-slot-renderer) { display: none !important; }";
// Radius clips the native view; background opacity belongs only to the Argus frame.
function ytAlphaApply(wc) {
  if (!ytView || wc !== ytView.webContents || wc.isDestroyed()) return;
  const appearance = require("./app/youtube-settings").preferences(config);
  ytView.setBorderRadius(appearance.radius);
  ytView.setBackgroundColor("#000000"); // Actual video/webpage stays opaque; only the Argus frame background changes.
}
// Strg + Mausrad: Seitenzoom wie im Browser (Stufen von 0,5× bis 3×), gilt für das eigene und das eingebettete YouTube-Fenster
function ytZoomHook(wc) {
  const apply = () => { try { wc.setZoomLevel(Number(config.ytZoom) || 0); } catch {} };
  wc.on("dom-ready", apply);
  wc.on("zoom-changed", (_e, dir) => {
    const z = Math.max(-3.8, Math.min(3, Math.round(((Number(config.ytZoom) || 0) + (dir === "in" ? 0.5 : -0.5)) * 2) / 2));
    config.ytZoom = z; saveConfig(); apply(); if (ytView) { try { ytView.webContents.setZoomLevel(z); } catch {} }
  });
}
function ytAlphaAll() { if (ytView) ytAlphaApply(ytView.webContents); }
function ytNoAdsCss(wc) { wc.on("dom-ready", () => { if (config.ytFilterOn !== false) wc.insertCSS(YT_CSS).catch(() => {}); wc.insertCSS(YT_VO_CSS).catch(() => {}); ytAlphaApply(wc); ytTrackNow(wc); }); ytTrack(wc); }
// „Nur Video“: auf Wiedergabeseiten alles außer dem Player ausblenden, Hintergrund durchsichtig (Klasse jv-vo am <html>)
const YT_VO_CSS = `html.jv-vo, html.jv-vo body, html.jv-vo ytd-app, html.jv-vo #content, html.jv-vo ytd-page-manager, html.jv-vo ytd-watch-flexy, html.jv-vo #columns, html.jv-vo #primary, html.jv-vo #player, html.jv-vo #full-bleed-container, html.jv-vo #player-full-bleed-container { background: #000 !important; }
html.jv-vo #masthead-container, html.jv-vo #secondary, html.jv-vo #below, html.jv-vo #chat-container, html.jv-vo tp-yt-app-drawer, html.jv-vo ytd-mini-guide-renderer, html.jv-vo #guide, #cinematics, #cinematic-container, #cinematics-container, html.jv-vo .ytp-gradient-top, html.jv-vo .ytp-gradient-bottom { display: none !important; }
html.jv-vo body { overflow: hidden !important; }
html.jv-vo #movie_player { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; max-width: none !important; margin: 0 !important; z-index: 3000 !important; background: #000 !important; border-radius: 0 !important; }
html.jv-vo #movie_player .html5-video-container, html.jv-vo #movie_player video { position: absolute !important; left: 0 !important; top: 0 !important; width: 100vw !important; height: 100vh !important; object-fit: contain !important; background: #000 !important; }`;
// Letzte Sitzung merken (Video und Stelle), damit YouTube nach Schließen oder Neustart dort weitermacht
let ytSaveT = 0;
async function ytTrackNow(wc) {
  if (!wc || wc.isDestroyed()) return;
  let u; try { u = new URL(wc.getURL()); } catch { return; }
  if (!/youtube\.com$/i.test(u.hostname)) return;
  const watch = u.pathname === "/watch" || u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/live/");
  try {
    const t = await wc.executeJavaScript(`(() => { document.documentElement.classList.toggle("jv-vo", ${!!config.ytVideoOnly} && ${watch}); window.dispatchEvent(new Event("resize")); const v = document.querySelector("#movie_player video, video"); return v ? Math.floor(v.currentTime || 0) : 0; })()`, true);
    u.searchParams.delete("t"); const url = u.toString(), prev = config.ytLast;
    if (prev?.url !== url || Math.abs((prev?.t || 0) - t) >= 5) { config.ytLast = { url, t: watch ? t : 0 }; if (Date.now() - ytSaveT > 15e3 || prev?.url !== url) { ytSaveT = Date.now(); saveConfig(); } }
  } catch {}
}
function ytTrack(wc) {
  const iv = setInterval(() => { if (wc.isDestroyed()) return clearInterval(iv); ytTrackNow(wc); }, 5000);
  wc.on("did-navigate-in-page", () => setTimeout(() => ytTrackNow(wc), 800));
  wc.on("destroyed", () => clearInterval(iv));
}
const ytResumeUrl = () => { const l = config.ytLast; if (!l?.url) return "https://www.youtube.com/"; try { const u = new URL(l.url); if (l.t > 5) u.searchParams.set("t", l.t + "s"); return u.toString(); } catch { return "https://www.youtube.com/"; } };
const YT_HOST = /(^|\.)(youtube\.com|youtu\.be|google\.com|googlevideo\.com|ytimg\.com|accounts\.google\.[a-z.]+|gstatic\.com)$/i;
// YouTube im Panel: eigene Ansicht über der Fläche, die die Oberfläche dafür freihält (unten links über der Statuszeile)
let ytView = null, ytRect = null, ytShown = null;
function ytViewMake() {
  if (ytView) return ytView;
  ytView = new WebContentsView({ webPreferences: ytPrefs() }); ytShown = null;
  try { ytView.setBackgroundColor("#000000"); } catch {} // deckend: durchsichtige Videoflächen im transparenten Fenster färben das Bild unter Windows ein (lila/grüner Schleier, Streifen)
  const wc = ytView.webContents; ytNoAdsCss(wc); ytZoomHook(wc);
  wc.setUserAgent(wc.getUserAgent().replace(/\s(Electron|Argus[^\s]*)\/\S+/g, ""));
  const external = (u) => { try { const url = new URL(u); return url.protocol !== "https:" || !YT_HOST.test(url.hostname); } catch { return true; } };
  wc.setWindowOpenHandler(({ url }) => { if (!external(url)) wc.loadURL(url).catch(() => {}); return { action: "deny" }; });
  wc.on("will-navigate", (e, u) => { if (external(u)) { e.preventDefault(); sendUI("notice", "Dieser externe Link wird nicht als YouTube-Popup geoeffnet."); } });
  wc.on("page-title-updated", (_e, t) => sendUI("yt-title", t.replace(/ - YouTube$/, "")));
  win.contentView.addChildView(ytView);
  return ytView;
}
async function ytEmbedShow(query) {
  if (!alive()) return;
  await Promise.race([ytAdblock(), new Promise((r) => setTimeout(r, 8000))]); // höchstens 8 s auf die Listen warten
  if (!expanded) setExpanded(true);
  const v = ytViewMake();
  if (query || !v.webContents.getURL()) v.webContents.loadURL(require("./app/youtube-settings").target(query, ytResumeUrl())).catch((e) => { if (e.errno !== -3) sendUI("notice", "YouTube konnte nicht geladen werden (" + (e.code || "Netzwerk") + ")."); });
  sendUI("yt-embed", { on: true });
  if (config.ytOpen !== "panel") { config.ytOpen = "panel"; saveConfig(); }
}
function ytEmbedClose() {
  if (!ytView) return;
  ytTrackNow(ytView.webContents);
  try { win?.contentView.removeChildView(ytView); } catch {}
  ytView.webContents.close(); ytView = null; ytRect = null; ytShown = null;
  if (!quitting && config.ytOpen === "panel") { config.ytOpen = ""; saveConfig(); }
  sendUI("yt-embed", { on: false });
}
// Die Oberfläche meldet, wo die Fläche liegt; zugeklappt bleibt das Video unsichtbar weiterlaufen (Musik hört man weiter)
ipcMain.on("yt-rect", (_e, r) => {
  if (!ytView || _e.sender !== win.webContents) return;
  ytRect = r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 40 && r.height > 30 ? r : null;
  // Nur bei echter Änderung anfassen: jedes setBounds/setVisible lässt das Video kurz aufblitzen
  if (ytRect && expanded) {
    const nb = { x: Math.round(ytRect.x), y: Math.round(ytRect.y), width: Math.round(ytRect.width), height: Math.round(ytRect.height) }, ob = ytView.getBounds();
    if (nb.x !== ob.x || nb.y !== ob.y || nb.width !== ob.width || nb.height !== ob.height) ytView.setBounds(nb);
    if (!ytShown) { ytView.setVisible(true); ytShown = true; }
  } else if (ytShown !== false) { ytView.setVisible(false); ytShown = false; }
});
ipcMain.on("yt-embed", (_e, action) => {
  if (action === "close") { const wc = ytView?.webContents; (wc ? ytTrackNow(wc) : Promise.resolve()).then(ytEmbedClose); }
  else ytEmbedShow(""); // Includes legacy popout requests: never launch another window.
});
// Werbeblocker für YouTube in Argus (uBlock-/EasyList-Listen über @ghostery/adblocker), Listen alle 3 Tage neu
let ytBlocker = null, ytBlockerP = null, ytFilterState = "off";
function ytFilterStatus(state) { ytFilterState = state; sendUI("yt-filter", state); }
function ytAdblock() {
  if (config.ytFilterOn === false) { ytFilterStatus("off"); return Promise.resolve(); }
  if (ytBlocker) return Promise.resolve();
  if (ytBlockerP) return ytBlockerP;
  ytFilterStatus("loading");
  ytBlockerP = (async () => {
    try {
      const { ElectronBlocker, adsAndTrackingLists } = require("@ghostery/adblocker-electron");
      const cache = path.join(app.getPath("userData"), "youtube-network-filter.bin");
      try { if (Date.now() - fs.statSync(cache).mtimeMs > 3 * 864e5) fs.unlinkSync(cache); } catch {}
      // Network filtering only: no page scriptlets or cosmetic suppression of playback warnings.
      const b = await ElectronBlocker.fromLists(fetch, adsAndTrackingLists, { loadCosmeticFilters: false }, { path: cache, read: fs.promises.readFile, write: fs.promises.writeFile });
      if (config.ytFilterOn === false) { ytFilterStatus("off"); return; }
      b.enableBlockingInSession(session.fromPartition("persist:youtube"));
      ytBlocker = b; ytFilterStatus("on");
    } catch (e) { ytFilterStatus("error"); console.warn("YouTube filter unavailable:", e.code || e.name || "filter"); }
    ytBlockerP = null;
  })();
  return ytBlockerP;
}
// YouTube always stays inside Argus; Brave is a separate browser engine, not an embeddable WebContents.
actions.hooks.youtube = query => ytEmbedShow(query);
ipcMain.on("open-youtube", (_e, q) => actions.hooks.youtube(typeof q === "string" ? q.slice(0, 200) : ""));
// ---------- Twitch-Fenster ----------
// Wie das YouTube-Fenster: im Panel eingebettet oder als eigenes Fenster, eigene Sitzung (Anmeldung bleibt), Transparenz, runde Ecken, weiche Ränder, „Nur Video“, Größe, zuletzt gesehener Kanal.
// Twitch-Werbung kommt vom Server und lässt sich hier nicht herausfiltern (Turbo-Abo oder Anmeldung ohne Werbung ist dafür der Weg).
let twWin = null, twView = null, twRect = null, twShown = null;
const twAlive = () => twWin && !twWin.isDestroyed();
const TW_HOST = /(^|\.)(twitch\.tv|twitchcdn\.net|ttvnw\.net|jtvnw\.net|twimg\.com|twitchapps\.com|arkoselabs\.com|funcaptcha\.com|recaptcha\.net|google\.com|gstatic\.com|amazon\.com|cloudfront\.net)$/i;
const twPrefs = () => ({ backgroundThrottling: false, partition: "persist:twitch", contextIsolation: true, nodeIntegration: false, sandbox: true });
const twUrl = (q) => {
  q = String(q || "").trim();
  if (/^[A-Za-z0-9_]{3,25}$/.test(q)) return "https://www.twitch.tv/" + q.toLowerCase();
  try { const u = new URL(/^https?:/i.test(q) ? q : "https://" + q); if (/(^|\.)twitch\.tv$/i.test(u.hostname)) return u.toString(); } catch {}
  return config.twLast || "https://www.twitch.tv/";
};
// „Nur Video“: auf Kanalseiten alles außer dem Player ausblenden (Klasse jv-vo am <html>); Twitch ändert seine Klassen manchmal, dann bleibt die normale Seite sichtbar
const TW_VO_CSS = `html.jv-vo, html.jv-vo body { background: transparent !important; overflow: hidden !important; }
html.jv-vo .top-nav__menu, html.jv-vo nav, html.jv-vo [data-test-selector="top-nav"], html.jv-vo .side-nav, html.jv-vo #side-nav, html.jv-vo .right-column, html.jv-vo .chat-shell, html.jv-vo [data-test-selector="channel-info-content"], html.jv-vo .channel-root__info, html.jv-vo .channel-root__right-column, html.jv-vo .consent-banner, html.jv-vo [data-a-target="consent-banner"], html.jv-vo .tw-toast, html.jv-vo .stream-chat, html.jv-vo .community-points-summary { display: none !important; }
html.jv-vo .video-player, html.jv-vo [data-a-target="video-player"], html.jv-vo .video-player__container { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; max-width: none !important; z-index: 2147483000 !important; background: #000 !important; }
html.jv-vo video { object-fit: contain !important; }`;
const twAlphaKeys = new WeakMap();
async function twAlphaApply(wc) {
  if (!wc || wc.isDestroyed()) return;
  const a = Math.max(30, Math.min(100, Number(config.twAlpha) || 100)), f = Math.max(0, Math.min(80, Number(config.twFeather) || 0)), rd = Math.max(0, Math.min(40, Number(config.twRound ?? 14))), old = twAlphaKeys.get(wc);
  if (old) { try { await wc.removeInsertedCSS(old); } catch {} twAlphaKeys.delete(wc); }
  const view = twView && wc === twView.webContents;
  const blend = f > 0 || rd > 0, wcl = config.winColor || {}, wh = Math.round(wcl.follow ? (config.themeHue ?? 205) : (wcl.h ?? 219)), ws = (wcl.s ?? 54) / 100, wl = (wcl.l ?? 5) / 100;
  const hx = (n) => { const k = (n + wh / 30) % 12, aa = ws * Math.min(wl, 1 - wl), v = wl - aa * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); return Math.round(v * 255).toString(16).padStart(2, "0"); };
  const winHex = "#" + hx(0) + hx(8) + hx(4);
  if (view) { try { twView.setBackgroundColor(a < 100 ? "#00000000" : blend ? winHex : "#000000"); twView.setBorderRadius(rd); } catch {} }
  if (!view) return;
  let css = a < 100 ? `html { opacity: ${a / 100} !important; }\n` : "";
  if (f > 0) {
    const h = Math.round(wcl.follow ? (config.themeHue ?? 205) : (wcl.h ?? 219)), c = (al) => `hsl(${h} ${wcl.s ?? 54}% ${wcl.l ?? 5}% / ${al})`;
    const edge = (dir) => `linear-gradient(${dir}, ${c(1)} 0, ${c(0.72)} ${Math.round(f * 0.3)}px, ${c(0.25)} ${Math.round(f * 0.65)}px, ${c(0)} ${f}px, ${c(0)} calc(100% - ${f}px), ${c(0.25)} calc(100% - ${Math.round(f * 0.65)}px), ${c(0.72)} calc(100% - ${Math.round(f * 0.3)}px), ${c(1)} 100%)`;
    css += `html::after { content: ""; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; background: ${edge("to right")}, ${edge("to bottom")}; }\n`;
  }
  if (css) { try { twAlphaKeys.set(wc, await wc.insertCSS(css)); } catch {} }
}
function twAlphaAll() { if (twView) twAlphaApply(twView.webContents); if (twAlive()) { try { twWin.setOpacity(Math.max(0.3, Math.min(1, (Number(config.twAlpha) || 100) / 100))); } catch {} } }
async function twTrackNow(wc) {
  if (!wc || wc.isDestroyed()) return;
  let u; try { u = new URL(wc.getURL()); } catch { return; }
  if (!/(^|\.)twitch\.tv$/i.test(u.hostname)) return;
  const channel = /^\/[A-Za-z0-9_]{3,25}\/?$/.test(u.pathname) && !/^\/(directory|downloads|jobs|turbo|settings|subscriptions|wallet|drops|login|signup)\b/i.test(u.pathname);
  try { await wc.executeJavaScript(`document.documentElement.classList.toggle("jv-vo", ${!!config.twVideoOnly} && ${channel}); window.dispatchEvent(new Event("resize")); 0`); } catch {}
  u.search = ""; const url = u.toString();
  if (channel && config.twLast !== url) { config.twLast = url; saveConfig(); }
}
function twSetup(wc) {
  wc.on("dom-ready", () => { wc.insertCSS(TW_VO_CSS).catch(() => {}); twAlphaApply(wc); twTrackNow(wc); });
  const iv = setInterval(() => { if (wc.isDestroyed()) return clearInterval(iv); twTrackNow(wc); }, 5000);
  wc.on("did-navigate-in-page", () => setTimeout(() => twTrackNow(wc), 800)); wc.on("destroyed", () => clearInterval(iv));
  wc.setUserAgent(wc.getUserAgent().replace(/\s(Electron|Argus[^\s]*)\/\S+/g, ""));
  const external = (u) => { try { return !TW_HOST.test(new URL(u).hostname); } catch { return true; } };
  wc.setWindowOpenHandler(({ url }) => { if (external(url)) { if (/^https:/i.test(url)) shell.openExternal(url); } else wc.loadURL(url); return { action: "deny" }; });
  wc.on("will-navigate", (e, u) => { if (external(u)) { e.preventDefault(); if (/^https:/i.test(u)) shell.openExternal(u); } });
}
function openTwitch(q) {
  const url = twUrl(q);
  if (twAlive()) { if (q) twWin.loadURL(url); twWin.show(); twWin.focus(); return; }
  const wa = screen.getPrimaryDisplay().workArea;
  const b = config.twBox && screen.getAllDisplays().some((d) => d.workArea.x <= config.twBox.x + 40 && config.twBox.x + 40 <= d.workArea.x + d.workArea.width && d.workArea.y <= config.twBox.y && config.twBox.y <= d.workArea.y + d.workArea.height)
    ? config.twBox : { width: 960, height: 600, x: wa.x + Math.round((wa.width - 960) / 2) + 30, y: wa.y + Math.round((wa.height - 600) / 2) + 30 };
  twWin = new BrowserWindow({ ...b, minWidth: 360, minHeight: 240, title: "Twitch · Argus", backgroundColor: "#0e0e10", autoHideMenuBar: true, show: false, alwaysOnTop: !!config.twOnTop, icon: path.join(__dirname, "assets", "icon.png"), webPreferences: twPrefs() });
  twSetup(twWin.webContents);
  if (config.twOnTop) twWin.setAlwaysOnTop(true, "floating");
  twWin.webContents.on("page-title-updated", (e, t) => { e.preventDefault(); twWin.setTitle(t.replace(/ - Twitch$/, "") + " · Twitch"); });
  const save = () => { if (twAlive() && !twWin.isMaximized() && !twWin.isFullScreen()) { config.twBox = twWin.getBounds(); saveConfig(); } };
  twWin.on("moved", save); twWin.on("resized", save);
  twWin.once("ready-to-show", () => { twAlphaAll(); twWin.show(); });
  twWin.once("ready-to-show", () => sendUI("video-win", true));
  twWin.on("closed", () => { twWin = null; sendUI("video-win", false); if (!quitting && config.twOpen === "win") { config.twOpen = ""; saveConfig(); } });
  if (config.twOpen !== "win") { config.twOpen = "win"; saveConfig(); }
  twWin.loadURL(url).catch((e) => logError(e));
}
function twViewMake() {
  if (twView) return twView;
  twView = new WebContentsView({ webPreferences: twPrefs() }); twShown = null;
  try { twView.setBackgroundColor("#000000"); } catch {}
  const wc = twView.webContents; twSetup(wc);
  wc.on("page-title-updated", (_e, t) => sendUI("tw-title", t.replace(/ - Twitch$/, "")));
  win.contentView.addChildView(twView);
  return twView;
}
async function twEmbedShow(q) {
  if (!alive()) return;
  if (config.gfxSafe) return openTwitch(q);
  if (!expanded) setExpanded(true);
  const v = twViewMake();
  if (q || !v.webContents.getURL()) v.webContents.loadURL(twUrl(q)).catch((e) => logError(e));
  sendUI("tw-embed", { on: true });
  if (config.twOpen !== "panel") { config.twOpen = "panel"; saveConfig(); }
}
function twEmbedClose() {
  if (!twView) return;
  twTrackNow(twView.webContents);
  try { win?.contentView.removeChildView(twView); } catch {}
  twView.webContents.close(); twView = null; twRect = null; twShown = null;
  if (!quitting && config.twOpen === "panel") { config.twOpen = ""; saveConfig(); }
  sendUI("tw-embed", { on: false });
}
ipcMain.on("tw-rect", (_e, r) => {
  if (!twView) return;
  twRect = r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 40 && r.height > 30 ? r : null;
  if (twRect && expanded) {
    const nb = { x: Math.round(twRect.x), y: Math.round(twRect.y), width: Math.round(twRect.width), height: Math.round(twRect.height) }, ob = twView.getBounds();
    if (nb.x !== ob.x || nb.y !== ob.y || nb.width !== ob.width || nb.height !== ob.height) twView.setBounds(nb);
    if (!twShown) { twView.setVisible(true); twShown = true; }
  } else if (twShown !== false) { twView.setVisible(false); twShown = false; }
});
ipcMain.on("tw-embed", (_e, a) => {
  if (a === "close") { const wc = twView?.webContents; (wc ? twTrackNow(wc) : Promise.resolve()).then(twEmbedClose); }
  else if (a === "popout") { (async () => { if (twView) await twTrackNow(twView.webContents); twEmbedClose(); openTwitch(""); })(); }
  else twEmbedShow("");
});
actions.hooks.twitch = (q) => (config.twMode === "fenster" || config.gfxSafe ? openTwitch(q) : twEmbedShow(q));
ipcMain.on("open-twitch", (_e, q) => actions.hooks.twitch(typeof q === "string" ? q.slice(0, 200) : ""));
function fileIndexInfo() {
  try { const st = fs.statSync(files.INDEX()); return { ok: true, ts: st.mtimeMs, mb: Math.round(st.size / 1048576) }; } catch { return { ok: false }; }
}
function startMarket() {
  setTimeout(pollSocial, 4000); setInterval(pollSocial, 120e3); setInterval(pollDiscordFast, 30e3);
  pollPrice().then(pollAlerts); setTimeout(pollFeeds, 3000);
  setTimeout(pollWeather, 5000); setInterval(pollWeather, 15 * 60e3);
  powerMonitor.on("shutdown", () => crash.clean()); // Windows fährt herunter: kein Absturz
  powerMonitor.on("resume", () => { wx.locTs = 0; setTimeout(pollWeather, 10e3); }); // nach Standby evtl. woanders
  setTimeout(pollFarm, 3000); setInterval(pollFarm, 60e3);
  // Miner-Report vom Vortag: ab der eingestellten Stunde einmal am Tag als Fenster (reportOn, reportHour)
  report.init(app.getPath("userData"), () => config.reportKeep);
  const reportTick = () => {
    if (config.reportOn === false || config.miningOn === false || new Date().getHours() < (config.reportHour ?? 8)) return;
    const k = report.yesterday(); if (config.reportShown === k) return;
    const r = report.build(k); if (!r?.farms.length) return;
    config.reportShown = k; saveConfig(); sendUI("daily-report", r);
    const bad = r.farms.filter((f) => f.median != null && f.median < f.total);
    const kwh = farmKwh(k), ups = r.farms.map((f) => f.uptime).filter((u) => u != null), upAvg = ups.length ? ups.reduce((a, b) => a + b, 0) / ups.length : null;
    notify("report", "Argus · Miner-Report " + k.split("-").reverse().join("."), (upAvg != null ? `Uptime ${(upAvg * 100).toFixed(1).replace(".", ",")} %` : "") + (kwh != null ? ` · ${kwh >= 1000 ? (kwh / 1000).toFixed(2).replace(".", ",") + " MWh" : Math.round(kwh).toLocaleString("de-DE") + " kWh"}` : "") + " · " + (bad.length ? bad.map((f) => `${f.name}: typisch ${f.median} / ${f.total} online`).join(" · ") : "Alle Anlagen liefen voll."));
  };
  setTimeout(reportTick, 20e3); setInterval(reportTick, 10 * 60e3);
  setTimeout(pollPool, 2500); setTimeout(pollNet, 3500); setInterval(pollPool, 60e3); setInterval(pollNet, 180e3);
  setInterval(pollPrice, 3 * 60e3); setTimeout(pollHist, 6000); setInterval(pollHist, 5 * 60e3); setInterval(pollAlerts, 5 * 60e3); setInterval(pollFeeds, 10 * 60e3);
  if (config.newsOn) openNews();
}
function openNews() {
  if (newsAlive()) return newsWin.showInactive();
  const wa = screen.getPrimaryDisplay().workArea;
  const b = config.newsBox && screen.getAllDisplays().some((d) => d.workArea.x <= config.newsBox.x + 40 && config.newsBox.x + 40 <= d.workArea.x + d.workArea.width && d.workArea.y <= config.newsBox.y && config.newsBox.y <= d.workArea.y + d.workArea.height)
    ? config.newsBox : { width: 330, height: 520, x: wa.x + 12, y: wa.y + 12 };
  newsWin = new BrowserWindow({ ...b, minWidth: 250, minHeight: 200, frame: false, resizable: true, maximizable: false, fullscreenable: false, minimizable: false,
    skipTaskbar: true, alwaysOnTop: !!(alive() && win.isAlwaysOnTop()) || config.newsOnTop === true, show: false, title: "Argus News & Uhren", backgroundColor: "#0a111c",
    webPreferences: { preload: path.join(__dirname, "preload-news.js"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  newsWin.setOpacity(Math.max(0.2, config.opacity.news ?? 1));
  newsWin.once("ready-to-show", () => { newsWin.showInactive(); syncNews(); pushMarket(); });
  newsWin.on("moved", snapNews);
  newsWin.on("focus", () => { if (config.newsDock && expanded && alive() && !config.newsOnTop) { win.moveTop(); newsWin.moveTop(); } });
  newsWin.on("resized", () => { if (docking || Date.now() < dockQuiet) return; config.newsBox = newsWin.getBounds(); saveConfig(); });
  newsWin.on("closed", () => { newsWin = null; });
  newsWin.loadURL(`http://127.0.0.1:${serverPort}/news.html`).catch((e) => logError(e));
}
function closeNews() { if (newsAlive()) newsWin.close(); }
// Magnetisch: liegt eine Kante nach dem Verschieben nah an einer Bildschirmkante oder an Argus, rastet sie dort ein
const SNAP = 24;
function snapNews() {
  if (!newsAlive() || Date.now() < dockQuiet) return;
  const b = newsWin.getBounds(), wa = screen.getDisplayMatching(b).workArea;
  const xs = [wa.x, wa.x + wa.width - b.width], ys = [wa.y, wa.y + wa.height - b.height];
  if (alive() && win.isVisible()) {
    const j = win.getBounds();
    xs.push(j.x - b.width, j.x + j.width, j.x, j.x + j.width - b.width);
    ys.push(j.y - b.height, j.y + j.height, j.y, j.y + j.height - b.height);
  }
  const near = (v, list) => { let best = v, d = SNAP + 1; for (const t of list) if (Math.abs(t - v) < d) { d = Math.abs(t - v); best = t; } return best; };
  const x = near(b.x, xs), y = near(b.y, ys);
  if (x !== b.x || y !== b.y) newsWin.setBounds({ ...b, x, y });
  // Andocken: liegt das Lagebild jetzt bündig an einer Kante des Panels, wandert es mit, bis man es wieder wegzieht
  const was = config.newsDock, oldBox = config.newsBox;
  config.newsDock = null;
  if (alive() && win.isVisible() && expanded) {
    const j = win.getBounds(), vOver = y < j.y + j.height && y + b.height > j.y, hOver = x < j.x + j.width && x + b.width > j.x;
    if (vOver && x + b.width === j.x) config.newsDock = { side: "left", off: y - j.y };
    else if (vOver && x === j.x + j.width) config.newsDock = { side: "right", off: y - j.y };
    else if (hOver && y + b.height === j.y) config.newsDock = { side: "top", off: x - j.x };
    else if (hOver && y === j.y + j.height) config.newsDock = { side: "bottom", off: x - j.x };
  }
  config.newsBox = { ...b, x, y }; saveConfig();
  // Verschmelzen bzw. Abreißen wie zwei Wassertropfen
  if (alive() && config.dockFx !== false) {
    const j = win.getBounds();
    if (config.newsDock && !was) dockFx("merge", config.newsDock.side, j, config.newsBox);
    else if (was && !config.newsDock && oldBox) {
      const ob = { width: oldBox.width, height: oldBox.height, x: was.side === "left" ? j.x - oldBox.width : was.side === "right" ? j.x + j.width : j.x + was.off,
        y: was.side === "top" ? j.y - oldBox.height : was.side === "bottom" ? j.y + j.height : j.y + was.off };
      dockFx("split", was.side, j, ob);
    }
  }
}
// Durchsichtiges Fenster über der Naht, Klicks gehen durch, schließt sich nach gut einer Sekunde selbst (app/fx.html)
let fxWin = null;
function dockFx(mode, side, j, r) {
  try {
    if (fxWin && !fxWin.isDestroyed()) fxWin.destroy();
    const vert = side === "left" || side === "right", B = 90;
    const seam = side === "left" ? j.x : side === "right" ? j.x + j.width : side === "top" ? j.y : j.y + j.height;
    const a0 = vert ? Math.max(j.y, r.y) : Math.max(j.x, r.x), a1 = vert ? Math.min(j.y + j.height, r.y + r.height) : Math.min(j.x + j.width, r.x + r.width);
    if (a1 - a0 < 40) return;
    const bounds = vert ? { x: seam - B, y: a0, width: 2 * B, height: a1 - a0 } : { x: a0, y: seam - B, width: a1 - a0, height: 2 * B };
    const fw = fxWin = new BrowserWindow({ ...bounds, frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false, resizable: false, focusable: false,
      skipTaskbar: true, show: false, alwaysOnTop: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    fw.setIgnoreMouseEvents(true); fw.setAlwaysOnTop(true, "screen-saver");
    fw.once("ready-to-show", () => { if (!fw.isDestroyed()) fw.showInactive(); });
    fw.loadFile(path.join(__dirname, "app", "fx.html"), { query: { mode, dir: vert ? "v" : "h" } }).catch(() => {});
    setTimeout(() => { if (!fw.isDestroyed()) fw.destroy(); }, 2500);
  } catch (e) { logError(e); }
}
// Angedocktes Lagebild folgt dem Panel beim Verschieben und bei Größenänderung
let docking = false, dockQuiet = 0; // dockQuiet: Moved-Ereignisse vom eigenen Mitführen nicht als Ablegen werten
function followDock() {
  const d = config.newsDock;
  if (!d || !newsAlive() || !alive() || !expanded) return;
  // Feste Größe von der letzten Ablage: Windows mit 125 %/150 % Skalierung rundet bei setPosition die Größe auf,
  // bei jedem Move-Ereignis ein Stück, dadurch wuchs das Lagebild beim Ziehen endlos
  const j = win.getBounds(), b = newsWin.getBounds(), nb = config.newsBox || b;
  let width = Math.round(nb.width || b.width), height = Math.round(nb.height || b.height);
  let x = d.side === "left" ? j.x - width : d.side === "right" ? j.x + j.width : j.x + d.off;
  let y = d.side === "top" ? j.y - height : d.side === "bottom" ? j.y + j.height : j.y + d.off;
  // Nur wenn das Panel wirklich maximiert dasteht. Zieht man es aus dem Vollbild heraus, ist winMode bis zum Loslassen
  // noch "max"; dann wuchs das Lagebild mit dem Abstand zur Kante, statt mitzuwandern
  const wa = screen.getDisplayMatching(j).workArea, bb = (winMode === "max" || winMode === "full") && bigBox(wa);
  if (bb && Math.abs(bb.x - j.x) <= 2 && Math.abs(bb.y - j.y) <= 2 && Math.abs(bb.width - j.width) <= 2) { // im freigelassenen Streifen, bündig über die ganze Kante
    if (d.side === "left" || d.side === "right") { width = j.x - wa.x || wa.x + wa.width - (j.x + j.width); x = d.side === "left" ? wa.x : j.x + j.width; y = wa.y; height = wa.height; }
    else { height = j.y - wa.y || wa.y + wa.height - (j.y + j.height); y = d.side === "top" ? wa.y : j.y + j.height; x = wa.x; width = wa.width; }
    if (width < 120 || height < 120) return;
  }
  if (x !== b.x || y !== b.y || width !== b.width || height !== b.height) { docking = true; dockQuiet = Date.now() + 800; newsWin.setBounds({ x: Math.round(x), y: Math.round(y), width, height }); docking = false; }
  syncNews();
}
// Sicherheitsnetz: Fenster, die per setBounds (Animation, Skalierung, Fernwartung) wandern, melden nicht immer "move": Lage alle 250 ms abgleichen
{ let lastJ = ""; setInterval(() => { if (!config.newsDock || !newsAlive() || !alive() || !expanded) return; const j = win.getBounds(), k = j.x + "," + j.y + "," + j.width + "," + j.height; if (k !== lastJ) { lastJ = k; followDock(); } }, 250); }
// Discord-App: Sprachkanal öffnen bzw. beitreten oder Profil einer Person (dort „Nachricht“); nur diese zwei Formen
ipcMain.handle("dc-join", async (_e, gid, cid) => {
  if (config.dcJoinBot === false || !/^\d{15,22}$/.test(String(gid)) || !/^\d{15,22}$/.test(String(cid))) return { ok: false, reason: "aus" };
  return dcbot.move(gid, cid, config.discordName, normName);
});
ipcMain.handle("dc-dm", async (_e, uid, text) => {
  if (!/^\d{15,22}$/.test(String(uid)) || !String(text || "").trim()) return { ok: false, reason: "Leere Nachricht" };
  return dcbot.dm(uid, "**Nachricht über Argus:** " + String(text).trim());
});
// Discord im kleinen Fenster (eigene Sitzung): Der Nutzer meldet sich selbst an und schreibt selbst, Nachrichten kommen also von ihm.
let dcWebWin = null;
ipcMain.on("dc-web", (_e, uid) => {
  if (!/^\d{15,22}$/.test(String(uid))) return;
  const url = "https://discord.com/users/" + uid;
  if (dcWebWin && !dcWebWin.isDestroyed()) { dcWebWin.loadURL(url).catch(() => {}); dcWebWin.show(); dcWebWin.focus(); return; }
  dcWebWin = new BrowserWindow({ width: 460, height: 700, minWidth: 320, minHeight: 360, title: "Discord · Argus", autoHideMenuBar: true, backgroundColor: "#1e1f22", webPreferences: { partition: "persist:discordweb", contextIsolation: true, nodeIntegration: false, sandbox: true } });
  dcWebWin.setAlwaysOnTop(true, "floating");
  const wc = dcWebWin.webContents; wc.setUserAgent(wc.getUserAgent().replace(/\s(Electron|Argus[^\s]*)\/\S+/g, ""));
  wc.setWindowOpenHandler(({ url: u }) => { if (/^https:/i.test(u)) shell.openExternal(u); return { action: "deny" }; });
  dcWebWin.on("closed", () => { dcWebWin = null; });
  dcWebWin.loadURL(url).catch(() => {});
});
ipcMain.on("open-discord", (_e, u) => { if (/^discord:\/\/-\/(channels\/\d{15,22}\/\d{15,22}|users\/\d{15,22})$/.test(String(u))) shell.openExternal(u).catch(() => {}); });
// Programm aus der Systemwache beenden (alle Prozesse mit diesem Namen). Windows-Systemprogramme und Argus selbst sind geschützt.
const PROTECTED = /^(system|registry|smss|csrss|wininit|winlogon|services|lsass|lsaiso|svchost|dwm|explorer|fontdrvhost|memory compression|secure system|audiodg|sihost|ctfmon|taskhostw|runtimebroker|searchhost|startmenuexperiencehost|shellexperiencehost|msmpeng|nissrv|securityhealthservice|wudfhost|dllhost|conhost|spoolsv|systemd|init|kthreadd)(\.exe)?$/i;
ipcMain.handle("kill-process", (_e, name) => new Promise((resolve) => {
  const n = String(name || "").trim();
  if (config.procKill === false) return resolve({ ok: false, text: "Beenden ist in den Einstellungen ausgeschaltet." });
  if (!/^[\w .()\-]{1,64}$/.test(n)) return resolve({ ok: false, text: "Ungültiger Programmname." });
  const base = n.replace(/\.exe$/i, "").toLowerCase(), mine = path.basename(process.execPath).replace(/\.exe$/i, "").toLowerCase();
  if (base === mine || /^(argus|jarvis|electron)$/.test(base)) return resolve({ ok: false, text: "Das bin ich selbst. Argus beendest du über das Tray-Menü." });
  if (PROTECTED.test(n)) return resolve({ ok: false, text: `„${n}“ ist ein Systemprogramm und geschützt.` });
  const win = process.platform === "win32";
  execFile(win ? "taskkill" : "pkill", win ? ["/F", "/T", "/IM", n.toLowerCase().endsWith(".exe") ? n : n + ".exe"] : ["-x", n], { windowsHide: true, timeout: 15000 }, (err, so, se) => {
    const out = String(so || "") + String(se || "");
    if (!err) return resolve({ ok: true, text: `„${n}“ beendet.` });
    if (/Zugriff|access is denied|nicht beendet werden/i.test(out)) return resolve({ ok: false, text: `„${n}“ lässt sich nicht beenden (läuft als Administrator). Starte Argus dafür als Administrator.` });
    if (/nicht gefunden|not found|no process/i.test(out) || err.code === 1 && !win) return resolve({ ok: false, text: `„${n}“ läuft nicht mehr.` });
    resolve({ ok: false, text: `„${n}“ konnte nicht beendet werden.` });
  });
}));
// Schnellstart: Programme, die der Nutzer selbst eingetragen hat, per Klick starten. Gestartet wird nur, was in dieser Liste steht.
const quickIcon = new Map();
const quickItems = () => (Array.isArray(config.quickItems) ? config.quickItems : []).filter((x) => x && typeof x.path === "string" && x.path);
function quickList() {
  return quickItems().map((x, i) => {
    if (!quickIcon.has(x.path)) {
      quickIcon.set(x.path, null);
      app.getFileIcon(x.path, { size: "large" }).then((img) => { if (!img.isEmpty()) { quickIcon.set(x.path, img.toDataURL()); sendUI("quick-update"); } }).catch(() => {});
    }
    let missing = false; try { missing = !fs.existsSync(x.path); } catch {}
    return { i, name: x.name, icon: quickIcon.get(x.path), missing };
  });
}
function quickAddPaths(paths) {
  const list = quickItems();
  for (const pth of paths) {
    const f = String(pth || ""); if (!f || list.length >= 24 || list.some((x) => x.path.toLowerCase() === f.toLowerCase())) continue;
    try { if (!fs.existsSync(f)) continue; } catch { continue; }
    list.push({ name: path.basename(f).replace(/\.(exe|lnk|bat|cmd|url|msc)$/i, "").slice(0, 40) || f, path: f });
  }
  config.quickItems = list; saveConfig(); return quickList();
}
ipcMain.handle("quick-list", () => quickList());
ipcMain.handle("quick-add", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Programm für den Schnellstart wählen", properties: ["openFile", "multiSelections"], filters: [{ name: "Programme und Verknüpfungen", extensions: ["exe", "lnk", "bat", "cmd", "url", "msc"] }, { name: "Alle Dateien", extensions: ["*"] }] });
  return r.canceled ? quickList() : quickAddPaths(r.filePaths || []);
});
ipcMain.handle("quick-add-paths", (_e, paths) => quickAddPaths(Array.isArray(paths) ? paths.slice(0, 24) : []));
ipcMain.handle("quick-remove", (_e, i) => { const list = quickItems(); if (list[i]) list.splice(i, 1); config.quickItems = list; saveConfig(); return quickList(); });
ipcMain.handle("quick-launch", async (_e, i) => {
  const it = quickItems()[i]; if (!it) return { ok: false, text: "Eintrag nicht gefunden." };
  const err = await shell.openPath(it.path);
  return err ? { ok: false, text: `„${it.name}“ ließ sich nicht starten: ${err}` } : { ok: true, text: `„${it.name}“ gestartet.` };
});
// Fenster-Spiegel: offene Fenster zur Auswahl (Argus' eigene Fenster bleiben draußen)
ipcMain.handle("mirror-sources", async (_e, self) => {
  try {
    const src = await desktopCapturer.getSources({ types: ["window", "screen"], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
    // Fenster zuerst (Discord ganz oben), dann die Bildschirme
    const out = src.filter((s) => s.name && (self === true || !/^Argus\b/i.test(s.name))).map((s) => ({ id: s.id, name: s.name, screen: s.id.startsWith("screen:") }));
    return out.sort((a, b) => (a.screen - b.screen) || (/discord/i.test(b.name) - /discord/i.test(a.name)) || a.name.localeCompare(b.name));
  } catch { return []; }
});
ipcMain.on("open-steam", (_e, id) => { if (/^\d{17}$/.test(String(id))) shell.openExternal("steam://friends/message/" + id).catch(() => {}); }); // Chat mit einem Steam-Freund im Steam-Programm
ipcMain.on("open-url", (_e, url) => { if (/^https:\/\//i.test(String(url))) shell.openExternal(url); });
ipcMain.on("news-refresh", () => { pollPrice(); pollHist(); pollFeeds(); pollAlerts(); });
ipcMain.on("news-close", () => { config.newsOn = false; saveConfig(); closeNews(); sendUI("notice", "News & Uhren geschlossen. Wieder an: Einstellungen → News."); });

// Claude Desktop bekommt Argus' Gedächtnis und Dateisuche als MCP-Server (gleiche argus-mcp.js, ohne laufenden Argus nutzbar).
// Trägt sich nur ein, wenn Claude Desktop installiert ist; andere Einträge bleiben unangetastet, vorher einmal gesichert.
function claudeDesktopConfigs() {
  if (process.platform !== "win32") return process.env.JARVIS_CLAUDE_DESKTOP ? [process.env.JARVIS_CLAUDE_DESKTOP] : [];
  const out = [path.join(process.env.APPDATA || "", "Claude", "claude_desktop_config.json")];
  const pk = path.join(process.env.LOCALAPPDATA || "", "Packages"); // Store-Version speichert virtualisiert
  try { for (const d of fs.readdirSync(pk)) if (/^(Claude|AnthropicPBC|Anthropic)/i.test(d)) out.push(path.join(pk, d, "LocalCache", "Roaming", "Claude", "claude_desktop_config.json")); } catch {}
  // Neuere Claude-Desktop-Versionen legen die Konfiguration unter Claude-Data\<Paketname> ab; nur vorhandene Dateien, nie neu anlegen
  const cd = path.join(process.env.LOCALAPPDATA || "", "Claude-Data");
  try { for (const d of fs.readdirSync(cd)) { const f = path.join(cd, d, "claude_desktop_config.json"); if (fs.existsSync(f)) out.push(f); } } catch {}
  return out.filter((f) => fs.existsSync(path.dirname(f)));
}
function linkClaudeDesktop() {
  const entry = { command: process.execPath, args: [path.join(__dirname, "argus-mcp.js")],
    env: { ELECTRON_RUN_AS_NODE: "1", JARVIS_MEMORY: memory.DIR(), JARVIS_INDEX: process.env.JARVIS_INDEX, ARGUS_USERDATA: process.env.ARGUS_USERDATA } };
  for (const f of claudeDesktopConfigs()) {
    try {
      let cfg = {}; const raw = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
      if (raw.trim()) cfg = JSON.parse(raw); // kaputte Datei nicht überschreiben: JSON.parse wirft, dann bleibt sie, wie sie ist
      cfg.mcpServers = cfg.mcpServers || {};
      const want = config.claudeDesktopLink !== false ? entry : undefined;
      if (JSON.stringify(cfg.mcpServers.argus) === JSON.stringify(want) && !cfg.mcpServers.jarvis) continue;
      if (raw && !fs.existsSync(f + ".vor-jarvis") && !fs.existsSync(f + ".vor-argus")) fs.writeFileSync(f + ".vor-argus", raw);
      delete cfg.mcpServers.jarvis; // Eintrag aus der Zeit vor dem Umzug
      if (want) cfg.mcpServers.argus = want; else delete cfg.mcpServers.argus;
      fs.writeFileSync(f, JSON.stringify(cfg, null, 2));
      console.log("Claude Desktop " + (want ? "verbunden: " : "getrennt: ") + f);
    } catch (e) { logError(e); }
  }
}
app.on("second-instance", () => { win?.showInactive(); setExpanded(true); });
app.on("will-quit", () => globalShortcut.unregisterAll());
let quitting = false; // beim Beenden geschlossenes YouTube nicht als „zu“ merken, damit es beim nächsten Start wiederkommt
app.on("before-quit", () => { quitting = true; try { writeConfigNow(); } catch {} // letzte YouTube-Stelle u. a. sichern
  discordSocial?.close();
  if (strata.ownProcess()) strata.stop(); watch?.stop(); stopAnim(); clearInterval(moveTimer); });
app.on("window-all-closed", () => app.quit());

// Speicher-Protokoll: alle 5 Minuten eine Zeile je Prozess (Fenster, MB), damit ein schleichender Zuwachs einem Fenster zugeordnet werden kann.
// Nur lokale Datei argus-speicher.csv (letzte ~600 Zeilen), nichts wird gesendet.
{
  const MEM_LOG = path.join(app.getPath("userData"), "argus-speicher.csv");
  const memRow = () => {
    try {
      const names = new Map();
      for (const w of BrowserWindow.getAllWindows()) { try { names.set(w.webContents.getOSProcessId(), w.getTitle() || "Fenster"); } catch {} }
      if (ytView && !ytView.webContents.isDestroyed()) { try { names.set(ytView.webContents.getOSProcessId(), "YouTube-Ansicht"); } catch {} }
      const t = new Date().toISOString(), rows = app.getAppMetrics().map((m) => `${t};${m.type};${m.pid};${names.get(m.pid) || ""};${Math.round((m.memory.privateBytes || m.memory.workingSetSize) / 1024)}`);
      let old = ""; try { old = fs.readFileSync(MEM_LOG, "utf8"); } catch {}
      const lines = (old ? old.split("\n").filter(Boolean) : ["zeit;typ;pid;fenster;mb"]).concat(rows);
      fs.writeFileSync(MEM_LOG, lines.slice(-600).join("\n") + "\n");
    } catch {}
  };
  app.whenReady().then(() => { setTimeout(memRow, 60e3); setInterval(memRow, 5 * 60e3); });
}
