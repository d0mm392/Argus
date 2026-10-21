// Systemwache: misst laufend CPU, Speicher, Laufwerke, Netz, Temperatur und Prozesse
// und bewertet, ob alles in Ordnung ist.
const si = require("systeminformation");

const GB = 1024 ** 3;
const os = require("os");
const round = (v, d = 0) => (v == null || isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

class SystemWatch {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.data = { cpu: null, cpuHistory: [], ram: null, disks: [], net: null, internet: null, temp: null, gpuTemp: null, gpuName: null, cpuGHz: null, gpuGHz: null, fans: [], apps: [], top: [], checks: [], health: "ok", ts: 0 };
    this.hog = new Map();
    this.timers = [];
    this.appsOn = true; // laufende Programme nur abfragen, wenn die Anzeige an ist
  }

  // Windows: ein dauerhaft laufender PowerShell-Prozess (sysmon/sysmon.ps1) liefert Prozesse, Programme und Netz.
  // Vorher startete Argus alle 2–8 Sekunden neue PowerShell- und WMI-Abfragen, das kostete CPU und ließ es ruckeln
  startMon() {
    if (process.platform !== "win32" || this.mon) return;
    const ps = require("path").join(__dirname, "sysmon", "sysmon.ps1");
    if (!fs.existsSync(ps)) return;
    const { spawn } = require("child_process");
    const p = this.mon = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ps, "-Tray", TRAY_APPS.join("|"), "-Parent", String(process.pid)], { windowsHide: true });
    let buf = "";
    p.stdout.on("data", (d) => {
      buf += d.toString("utf8"); let i;
      while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); try { this.onMon(JSON.parse(l)); this.monOk = Date.now(); } catch {} }
    });
    p.on("exit", () => { this.mon = null; if (!this.stopped) setTimeout(() => this.startMon(), 5000); });
  }
  onMon(m) {
    // ältere PowerShell-Formate abfangen ({value:[...]}), sonst bleibt die Liste leer
    const arr = (x) => (Array.isArray(x) ? x : Array.isArray(x?.value) ? x.value : x ? [x] : []);
    m.procs = arr(m.procs).map((r) => arr(r)); if (m.apps) m.apps = arr(m.apps);
    const prev = this.monLast; this.monLast = m;
    const cores = os.cpus().length || 1, dt = prev ? (m.t - prev.t) / 1000 : 0;
    // CPU-Anteil je Prozess aus der Differenz der CPU-Sekunden (wie im Task-Manager), gruppiert nach Name
    const byName = new Map();
    const prevSec = new Map(); for (const [n, c] of prev?.procs || []) prevSec.set(n, (prevSec.get(n) || 0) + (+c || 0));
    for (const [n, c, w] of m.procs || []) { const g = byName.get(n) || { sec: 0, mem: 0, cnt: 0 }; g.sec += +c || 0; g.mem += +w || 0; g.cnt++; byName.set(n, g); }
    const top = [];
    for (const [n, g] of byName) {
      if (/^(idle|system idle process)$/i.test(n)) continue;
      const ps = prevSec.get(n), cpu = dt > 0.5 && ps != null ? Math.max(0, Math.min(100, (g.sec - ps) / dt / cores * 100)) : 0;
      top.push({ name: n + ".exe", cpu: round(cpu, 1), memMB: round(g.mem / 1048576), key: n.toLowerCase(), sec: g.sec, mem: g.mem });
    }
    top.sort((a, b) => b.cpu - a.cpu || b.memMB - a.memMB);
    this.data.top = top.slice(0, 30).map(({ name, cpu, memMB }) => ({ name, cpu, memMB }));
    this.data.procCount = (m.procs || []).length;
    const seen = new Set();
    for (const x of this.data.top) if (x.cpu >= 80) { seen.add(x.name); this.hog.set(x.name, (this.hog.get(x.name) || 0) + 1); }
    for (const k of [...this.hog.keys()]) if (!seen.has(k)) this.hog.delete(k);
    // Programm im Vollbild (für den Spielmodus), Argus selbst zählt nicht
    if (typeof m.fs === "string") this.data.fullscreen = m.fs && !/^(argus|jarvis|electron)/i.test(m.fs) ? m.fs : "";
    // Netz: Bytes seit der letzten Zeile
    if (m.net) {
      const pn = prev?.net, same = pn && pn.name === m.net.name && dt > 0;
      this.data.net = { iface: m.net.name, up: !!m.net.up, rxKBs: same ? round(Math.max(0, m.net.rx - pn.rx) / dt / 1024) : 0, txKBs: same ? round(Math.max(0, m.net.tx - pn.tx) / dt / 1024) : 0 };
    }
    // Programme mit Fenster
    if (m.apps && this.appsOn) {
      const appsSeen = new Map();
      for (const a of m.apps) {
        const key = (a.n || "").toLowerCase();
        if (!key || HIDDEN_APPS.test(key) || appsSeen.has(key)) continue;
        const t = top.find((x) => x.key === key);
        appsSeen.set(key, { key, name: APP_NAMES[key] || cleanName(a.d) || a.n, path: a.p, cpu: t ? t.cpu : null, memGB: t ? round(t.mem / GB, 2) : null });
      }
      this.data.apps = [...appsSeen.values()].slice(0, 12);
    }
    this.detectGame(m, top);
    this.emit();
  }
  // Spiel erkennen. Unter Windows kommen Prozesse über den Dauer-Prozess (sysmon), die Einzelabfrage in pollProcesses läuft dann nicht mehr.
  // Quellen in dieser Reihenfolge: Steam meldet das laufende Spiel (Registry), Programme mit Fenster samt Pfad, Prozessname (z. B. …-Win64-Shipping.exe).
  detectGame(m, top) {
    try {
      const G = require("./games"), now = Date.now();
      if (!this.gameT || now - this.gameT > 8000) { this.gameT = now; G.steamRunning().then((x) => { this.gameSteam = x; }).catch(() => { this.gameSteam = null; }); }
      const apps = (m.apps || []).map((a) => ({ name: (a.n || "") + ".exe", path: a.p || "", cpu: (top.find((x) => x.key === String(a.n || "").toLowerCase()) || {}).cpu || 0 }));
      const g = this.gameSteam || G.detect(apps) || G.byName(top);
      this.data.game = g || null;
      this.data.gameDiag = { n: top.length, withPath: apps.filter((x) => x.path).length, apps: apps.length, steam: G.steamDiag(), ship: top.filter((x) => /shipping/i.test(x.name)).map((x) => x.name).slice(0, 3), src: "Dauer-Prozess" };
    } catch { this.data.game = null; }
  }

  start() {
    this.startMon();
    const every = (ms, fn) => { const run = () => fn().catch(() => {}).finally(() => this.emit()); run(); this.timers.push(setInterval(run, ms)); };
    every(2000, () => this.pollLoad());
    // Rückfall: liefert der Dauer-Prozess nichts (z. B. blockiert), wie früher einzeln abfragen
    const t0 = Date.now(), monFresh = () => (this.monOk ? Date.now() - this.monOk < 15000 : this.mon && Date.now() - t0 < 15000);
    const unlessMon = (fn) => async () => { if (!monFresh()) await fn(); };
    every(3000, unlessMon(() => this.pollNet())); every(8000, unlessMon(() => this.pollProcesses()));
    every(60000, () => this.pollDisks());
    every(30000, () => this.pollInternet());
    every(5000, () => this.pollTemps());
    every(6000, unlessMon(() => this.pollApps()));
  }
  stop() { this.stopped = true; this.timers.forEach(clearInterval); try { this.mon?.kill(); } catch {} }

  async pollLoad() {
    // Speicher direkt vom Betriebssystem: si.mem() startet unter Windows jedes Mal eine WMI-Abfrage
    const load = await si.currentLoad(), mem = process.platform === "win32" ? { total: os.totalmem(), used: os.totalmem() - os.freemem() } : await si.mem();
    const cpu = round(load.currentLoad);
    this.data.cpu = cpu;
    this.data.cores = (load.cpus || []).map((c) => round(c.load)); // Last je Kern, für die Neuronen in der Kugel
    this.data.cpuHistory = [...this.data.cpuHistory, cpu].slice(-15); // ca. 30 s
    const used = mem.active ?? mem.used;
    this.data.ram = { pct: round((used / mem.total) * 100), usedGB: round(used / GB, 1), totalGB: round(mem.total / GB, 1) };
  }
  async pollNet() {
    const iface = await si.networkInterfaceDefault();
    const stats = (await si.networkStats(iface))[0] || {};
    this.data.net = { iface, up: stats.operstate ? stats.operstate === "up" : null, rxKBs: round((stats.rx_sec || 0) / 1024), txKBs: round((stats.tx_sec || 0) / 1024) };
  }
  async pollProcesses() {
    const p = await si.processes();
    const top = p.list.filter((x) => x.name && !/^(System Idle Process|Idle)$/i.test(x.name))
      .sort((a, b) => b.cpu - a.cpu).slice(0, 30)
      .map((x) => ({ name: x.name, cpu: round(x.cpu, 1), memMB: round((x.memRss || 0) / 1024) }));
    this.data.top = top;
    try {
      const G = require("./games"); let g = G.detect(p.list);
      if (!g) g = await G.steamRunning().catch(() => null); // Steam meldet das laufende Spiel selbst
      this.data.game = g; this.data.gameDiag = { n: p.list.length, withPath: p.list.filter((x) => x.path).length, steam: G.steamDiag(), ship: p.list.filter((x) => /shipping/i.test(x.name || "")).map((x) => x.name).slice(0, 3) };
    } catch { this.data.game = null; }
    this.data.procCount = p.all;
    // Prozess, der über mehrere Messungen viel CPU zieht
    const seen = new Set();
    for (const x of top) if (x.cpu >= 80) { seen.add(x.name); this.hog.set(x.name, (this.hog.get(x.name) || 0) + 1); }
    for (const k of [...this.hog.keys()]) if (!seen.has(k)) this.hog.delete(k);
  }
  async pollDisks() {
    const fs = await si.fsSize();
    this.data.disks = fs.filter((d) => d.size > 2 * GB && !/^\/(snap|boot|opt)/.test(d.mount))
      .map((d) => ({ mount: d.mount, pct: round(d.use), freeGB: round(d.available / GB) }));
  }
  // Internet: Verbindungsaufbau zu zwei großen DNS-Anbietern (Port 443), großzügige Wartezeit.
  // Ein laufender Download lastet die Leitung aus, dann dauert ein einzelner Ping manchmal zu lang;
  // deshalb erst nach drei Fehlschlägen hintereinander „nicht erreichbar“.
  async pollInternet() {
    const probe = (host) => new Promise((res) => {
      const t0 = Date.now(), sock = require("net").connect({ host, port: 443 });
      const done = (v) => { sock.destroy(); res(v); };
      sock.setTimeout(5000, () => done(null)); sock.once("connect", () => done(Date.now() - t0)); sock.once("error", () => done(null));
    });
    const lat = (await probe("1.1.1.1")) ?? (await probe("8.8.8.8"));
    if (lat != null) { this.netFails = 0; this.data.internet = round(lat); return; }
    this.netFails = (this.netFails || 0) + 1;
    if (this.netFails >= 3) this.data.internet = false;
  }
  // Temperaturen aus mehreren Quellen, die beste gewinnt:
  // 1. LibreHardwareMonitor (Web-Server an Port 8085): CPU und GPU jedes Herstellers
  // 2. nvidia-smi direkt aufgerufen: GPU-Temperatur bei NVIDIA
  // 3. systeminformation: CPU-Temperatur, die Windows aber meist nur mit Admin-Rechten herausgibt
  async pollTemps() {
    // Liefert der eigene Messdienst Werte, keine weiteren Abfragen starten (nvidia-smi und WMI kosten jedes Mal CPU)
    const lhm = await readLHM(), full = lhm && lhm.cpu != null && lhm.gpu != null && lhm.cpuMHz;
    const [nv, cpu, speed] = full ? [null, {}, {}] : await Promise.all([lhm?.gpu != null ? null : readNvidiaSmi(), lhm?.cpu != null ? {} : si.cpuTemperature().catch(() => ({})), si.cpuCurrentSpeed().catch(() => ({}))]);
    this.data.temp = lhm?.cpu ?? (cpu && cpu.main > 0 ? round(cpu.main) : null);
    this.data.gpuTemp = lhm?.gpu ?? nv?.temp ?? null;
    this.data.gpuName = lhm?.gpuName || nv?.name || null;
    // Takt in GHz: LibreHardwareMonitor misst echt, Windows liefert sonst nur den Durchschnitt aller Kerne
    this.data.cpuGHz = lhm?.cpuMHz ? round(lhm.cpuMHz / 1000, 2) : speed?.avg > 0 ? round(speed.avg, 2) : null;
    this.data.gpuLoad = lhm?.gpuLoad ?? nv?.load ?? null;
    this.data.gpuGHz = lhm?.gpuMHz ? round(lhm.gpuMHz / 1000, 2) : nv?.clockMHz ? round(nv.clockMHz / 1000, 2) : null;
    // Lüfter: LibreHardwareMonitor kennt Mainboard- und Grafikkarten-Lüfter in U/min, nvidia-smi nur die GPU in Prozent
    // Lüfter: kurze Aussetzer des Messdienstes (ein Abruf ohne Werte) nicht gleich als „keine Lüfter“ zeigen, letzte Werte bis zu 2 Minuten halten
    const fans = lhm?.fans?.length ? lhm.fans : nv?.fanPct != null ? [{ name: "GPU", val: nv.fanPct, unit: "%" }] : [];
    if (fans.length) { this.lastFans = fans; this.lastFansAt = Date.now(); }
    this.data.fans = fans.length ? fans : this.lastFans && Date.now() - this.lastFansAt < 120000 ? this.lastFans : [];
    this.data.tempSource = lhm ? (readSensorFile() ? "Argus" : "LibreHardwareMonitor") : nv ? "nvidia-smi" : null;
  }

  // Laufende Programme mit Fenster, dazu bekannte Programme, die gern nur im Tray laufen (Steam, Discord ...)
  async pollApps() {
    if (!this.appsOn || process.platform !== "win32") { this.data.apps = []; return; }
    const ps = "$OutputEncoding=[Console]::OutputEncoding=[Text.Encoding]::UTF8;" +
      "Get-Process | ? { $_.Path -and ($_.MainWindowHandle -ne 0 -or $_.ProcessName -match '^(" + TRAY_APPS.join("|") + ")$') } | " +
      "select ProcessName,Path,Description,@{n='Win';e={$_.MainWindowHandle -ne 0}} | ConvertTo-Json -Compress;" +
      // Last aller Prozesse je Name (ein Browser hat viele): CPU-Sekunden und RAM summiert
      "'#LOAD#';Get-Process | group ProcessName | % { '{0}|{1}|{2}' -f $_.Name.ToLower(),[math]::Round(($_.Group | measure CPU -Sum).Sum,2),($_.Group | measure WorkingSet64 -Sum).Sum }";
    const out = await new Promise((resolve) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps],
      { timeout: 8000, windowsHide: true, maxBuffer: 4 << 20 }, (err, o) => resolve(err ? null : o)));
    if (out == null) return;
    const [js, loadTxt = ""] = out.split("#LOAD#");
    let list; try { list = JSON.parse(js.trim() || "[]"); } catch { return; }
    // CPU-Anteil aus der Differenz der CPU-Sekunden seit der letzten Messung, bezogen auf alle Kerne (wie im Task-Manager)
    const now = Date.now(), cpuSec = new Map(), mem = new Map();
    for (const l of loadTxt.split(/\r?\n/)) { const [n, c, m] = l.trim().split("|"); if (n) { cpuSec.set(n, +c || 0); mem.set(n, +m || 0); } }
    const prev = this.appLoad, dtS = prev ? (now - prev.ts) / 1000 : 0, cores = os.cpus().length || 1;
    this.appLoad = { ts: now, cpuSec };
    if (!Array.isArray(list)) list = [list];
    const seen = new Map();
    for (const p of list) {
      const key = (p.ProcessName || "").toLowerCase();
      if (!key || HIDDEN_APPS.test(key) || seen.has(key)) continue;
      const was = prev?.cpuSec.get(key), nowC = cpuSec.get(key);
      const cpu = dtS > 1 && was != null && nowC != null ? Math.max(0, Math.min(100, ((nowC - was) / dtS / cores) * 100)) : null;
      seen.set(key, { key, name: APP_NAMES[key] || cleanName(p.Description) || p.ProcessName, path: p.Path, cpu: cpu == null ? null : round(cpu, 1), memGB: mem.has(key) ? round(mem.get(key) / GB, 2) : null });
    }
    this.data.apps = [...seen.values()].slice(0, 12);
  }

  evaluate() {
    const d = this.data, checks = [];
    const add = (key, label, status, text) => checks.push({ key, label, status, text });
    const avgCpu = d.cpuHistory.length ? d.cpuHistory.reduce((a, b) => a + b, 0) / d.cpuHistory.length : null;
    if (d.cpu != null) add("cpu", "CPU", avgCpu > 90 && d.cpuHistory.length >= 10 ? "warn" : "ok",
      avgCpu > 90 && d.cpuHistory.length >= 10 ? `CPU seit 30 s bei ${Math.round(avgCpu)} %` : `CPU ${d.cpu} %`);
    if (d.ram) add("ram", "Arbeitsspeicher", d.ram.pct > 97 ? "crit" : d.ram.pct > 90 ? "warn" : "ok",
      `RAM ${d.ram.pct} % (${d.ram.usedGB} von ${d.ram.totalGB} GB)`);
    for (const disk of d.disks) add("disk:" + disk.mount, "Laufwerk " + disk.mount, disk.pct > 97 ? "crit" : disk.pct > 90 ? "warn" : "ok",
      `Laufwerk ${disk.mount} ${disk.freeGB} GB frei (${disk.pct} % belegt)`);
    if (d.net) add("net", "Netzwerk", d.net.up === false ? "crit" : "ok",
      d.net.up === false ? `Netzwerk ${d.net.iface} getrennt` : `Netz ↓ ${fmtRate(d.net.rxKBs)} ↑ ${fmtRate(d.net.txKBs)}`);
    if (d.internet !== null) add("inet", "Internet", d.internet === false ? "warn" : "ok",
      d.internet === false ? "Internet nicht erreichbar" : `Internet ok, Ping ${d.internet} ms`);
    // Warnschwellen einstellbar (Domi: Laptop-CPUs laufen normal bei 85–95 °C, Warnung erst ab 100 °C)
    const lc = this.limits?.cpu || 100, lg = this.limits?.gpu || 88;
    if (d.temp != null) add("temp", "Temperatur", d.temp >= lc + 5 ? "crit" : d.temp >= lc ? "warn" : "ok", `CPU-Temperatur ${d.temp} °C`);
    if (d.gpuTemp != null) add("gputemp", "GPU-Temperatur", d.gpuTemp >= lg + 5 ? "crit" : d.gpuTemp >= lg ? "warn" : "ok", `GPU-Temperatur ${d.gpuTemp} °C`);
    for (const [name, n] of this.hog) if (n >= 3) add("hog:" + name, "Prozess", "warn", `${name} zieht dauerhaft viel CPU`);
    if (d.top[0]) add("proc", "Prozesse", "ok", `${d.procCount || "?"} Prozesse, oben: ${d.top[0].name} ${d.top[0].cpu} %`);
    d.checks = checks;
    d.health = checks.some((c) => c.status === "crit") ? "crit" : checks.some((c) => c.status === "warn") ? "warn" : "ok";
  }

  emit() { this.evaluate(); this.data.ts = Date.now(); this.onUpdate(this.data); }

  // Kurzfassung für Claude, damit es Fragen zum System beantworten kann
  summary() {
    const d = this.data;
    const lines = d.checks.map((c) => `- ${c.text}${c.status !== "ok" ? " [" + (c.status === "crit" ? "KRITISCH" : "WARNUNG") + "]" : ""}`);
    if (d.top.length) lines.push("- Top-Prozesse nach CPU: " + d.top.map((p) => `${p.name} ${p.cpu} % / ${p.memMB} MB`).join(", "));
    return lines.join("\n");
  }
}

const http = require("http");
const { execFile } = require("child_process");
const fs = require("fs");

// Eigener Messdienst von Argus (sensors/sensors.ps1) schreibt die Werte in eine Datei; sonst LibreHardwareMonitor selbst
let sensorFile = null;
function setSensorFile(p) { sensorFile = p; }
function readSensorFile() {
  if (!sensorFile) return null;
  try {
    const st = fs.statSync(sensorFile);
    if (Date.now() - st.mtimeMs > 15000) return null; // Dienst läuft nicht mehr
    return parseLHM(JSON.parse(fs.readFileSync(sensorFile, "utf8").replace(/^\uFEFF/, "")));
  } catch { return null; }
}
function readLHM() {
  const own = readSensorFile();
  if (own) return Promise.resolve(own);
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:8085/data.json", { timeout: 1500 }, (res) => {
      let body = ""; res.on("data", (c) => (body += c));
      res.on("end", () => { try { resolve(parseLHM(JSON.parse(body))); } catch { resolve(null); } });
    });
    req.on("error", () => resolve(null)); req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}
const TRAY_APPS = ["steam", "steamwebhelper", "discord", "spotify", "epicgameslauncher", "battle.net", "teamspeak", "ts3client_win64", "obs64", "nicehashminer", "msiafterburner", "telegram", "whatsapp", "signal", "nvcontainer_hidden"].map((x) => x.replace(".", "\\."));
const HIDDEN_APPS = /^(explorer|applicationframehost|textinputhost|systemsettings|shellexperiencehost|searchhost|startmenuexperiencehost|lockapp|jarvis|electron|steamwebhelper|nvcontainer.*|nvidia share|nvidia overlay|widgets|gamebar.*|ctfmon|rtkuwp|crossdeviceresume|phoneexperiencehost)$/;
const APP_NAMES = { steam: "Steam", discord: "Discord", spotify: "Spotify", brave: "Brave", chrome: "Chrome", msedge: "Edge", firefox: "Firefox", code: "VS Code",
  epicgameslauncher: "Epic Games", "battle.net": "Battle.net", obs64: "OBS", telegram: "Telegram", whatsapp: "WhatsApp", nicehashminer: "NiceHash", msiafterburner: "Afterburner",
  winword: "Word", excel: "Excel", powerpnt: "PowerPoint", outlook: "Outlook", notepad: "Editor", windowsterminal: "Terminal", vlc: "VLC", ts3client_win64: "TeamSpeak" };
const cleanName = (d) => (d || "").replace(/\s*(\(.*\)|setup|application|launcher)$/i, "").trim().slice(0, 24);

// Baum von LibreHardwareMonitor durchgehen: Hardware erkennt man am Symbol, Sensoren am Namen
function parseLHM(root) {
  const num = (v) => { const m = /(-?\d+(?:[.,]\d+)?)/.exec(v || ""); return m ? Number(m[1].replace(",", ".")) : null; };
  const cpu = [], cpuClk = [], fans = [], ctrl = []; let stopped = 0, hwName = ""; const gpus = [], rawFans = []; let curG = null;
  (function walk(n, hw) {
    const img = n.ImageURL || "";
    if (/cpu/i.test(img)) hw = "cpu";
    else if (/nvidia|ati|amd|gpu|intel/i.test(img) && !/cpu/i.test(img)) { hw = "gpu"; curG = { name: n.Text || "", temps: [], clk: [], load: null }; gpus.push(curG); }
    else if (/mainboard|chip/i.test(img)) hw = "board";
    if (img && !n.Type) hwName = n.Text || hwName;
    const leaf = !(n.Children || []).length;
    // Lüfteransteuerung in % (manche Laptops/Grafikkarten melden nur das, keine Drehzahl)
    if (leaf && n.Type === "Control") { const v = num(n.Value); if (v != null) ctrl.push({ raw: n.Text || "", name: hw === "gpu" ? "GPU" : (n.Text || "Lüfter").replace(/^Fan( Control)?\s*/i, "Lüfter "), val: Math.round(v), unit: "%" }); }
    if (leaf && (n.Type === "Fan" || /RPM/i.test(n.Value || ""))) { const v = num(n.Value); if (v === 0) stopped++; if (v != null) rawFans.push({ text: n.Text || "", hw, v }); }
    if (leaf && hw && (n.Type === "Clock" || /MHz/i.test(n.Value || ""))) {
      const v = num(n.Value);
      if (v > 100 && !/bus|memory|speicher|ring|uncore/i.test(n.Text || "")) (hw === "cpu" ? cpuClk : hw === "gpu" && curG ? curG.clk : []).push({ name: n.Text || "", v });
    }
    if (leaf && hw === "gpu" && curG && curG.load == null && (n.Type === "Load" || /%/.test(n.Value || "")) && /gpu core|^core$|^d3d 3d$/i.test(n.Text || "")) curG.load = num(n.Value);
    const isTemp = n.Type === "Temperature" || /°C/.test(n.Value || "");
    if (hw && isTemp && !(n.Children || []).length) {
      const v = num(n.Value);
      if (v > 0 && v < 130) if (hw === "cpu") cpu.push({ name: n.Text || "", v }); else if (hw === "gpu" && curG) curG.temps.push({ name: n.Text || "", v });
    }
    for (const c of n.Children || []) walk(c, hw);
  })(root, null);
  // Mehrere Grafikeinheiten (z. B. Ryzen mit eingebauter Grafik plus GeForce): die eigenständige Karte nehmen, nicht die erste
  const integ = (g) => /\(tm\) graphics|radeon graphics|uhd|iris|hd graphics|vega \d/i.test(g.name) && !/radeon rx|radeon pro/i.test(g.name);
  const best = gpus.slice().sort((x, y) => (integ(x) ? 1 : 0) - (integ(y) ? 1 : 0) || (y.temps.length + y.clk.length + (y.load != null)) - (x.temps.length + x.clk.length + (x.load != null)))[0];
  const gpu = best ? best.temps : [], gpuClk = best ? best.clk : [], gpuName = best ? best.name : null, gpuLoad = best ? best.load : null;
  // Lüfter: Drehzahl > 0, CPU/GPU-Lüfter immer, Anschlüsse mit 0 U/min nur, wenn dafür eine Ansteuerung über 0 % gemeldet wird (Lüfter dahinter steht oder hängt an einem Hub)
  const ckey = (t) => t.toLowerCase().replace(/\s*#1$/, "").trim(), cmap = new Map(ctrl.map((c) => [ckey(c.raw || ""), c.val]));
  for (const f of rawFans) {
    const nm = f.hw === "gpu" ? "GPU" + (/\d/.test(f.text) ? " " + f.text.replace(/\D+/g, "") : "") : f.text.replace(/^Fan\s*/i, "Lüfter ") || "Lüfter";
    if (f.v > 0 || f.hw === "gpu" || f.hw === "cpu" || /cpu|gpu/i.test(f.text) || (cmap.get(ckey(f.text)) || 0) > 0) fans.push({ name: nm, val: Math.round(f.v), unit: "rpm" });
  }
  const pick = (list, prefer) => { for (const re of prefer) { const f = list.find((x) => re.test(x.name)); if (f) return Math.round(f.v); } return list.length ? Math.round(Math.max(...list.map((x) => x.v))) : null; };
  const cores = cpuClk.filter((x) => /core/i.test(x.name));
  const cpuMHz = cores.length ? Math.max(...cores.map((x) => x.v)) : null; // höchster Kerntakt, wie im Task-Manager
  const gpuCore = gpuClk.find((x) => /core|graphics|shader/i.test(x.name)) || gpuClk[0];
  const out = { cpu: pick(cpu, [/package/i, /tctl|tdie/i, /core.*(max|average)/i, /ccd/i]), gpu: pick(gpu, [/gpu core/i, /^core$/i, /hot ?spot/i]), gpuName,
    cpuMHz, gpuMHz: gpuCore ? gpuCore.v : null, gpuLoad: gpuLoad == null ? null : Math.round(gpuLoad),
    // Drehzahlen zuerst; ohne Drehzahl die Ansteuerung in %; stehen alle Lüfter (Laptop im Leerlauf), eine Zeile „steht“
    fans: (fans.length ? fans.map((f, i) => ({ f, i, r: /cpu/i.test(f.name) ? 0 : /gpu/i.test(f.name) ? 2 : 1 })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.f) : ctrl.length ? ctrl : stopped ? [{ name: "Lüfter", val: 0, unit: "rpm" }] : []).slice(0, 16) };
  return out.cpu == null && out.gpu == null && !fans.length && !cpuMHz ? null : out;
}
const NVSMI = ["nvidia-smi", "C:\\Windows\\System32\\nvidia-smi.exe", "C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe"];
let nvsmi, nvsmiFailAt = 0;
function readNvidiaSmi() {
  // Nicht gefunden oder Treiber gerade weg (Neustart, Treiberfehler): alle 60 s erneut versuchen statt nie wieder
  if (nvsmi === null) { if (Date.now() - nvsmiFailAt < 60000) return Promise.resolve(null); nvsmi = undefined; }
  const tryOne = (i) => new Promise((resolve) => {
    if (i >= NVSMI.length) { nvsmi = null; nvsmiFailAt = Date.now(); return resolve(null); }
    const exe = nvsmi || NVSMI[i];
    if (exe.includes("\\") && !fs.existsSync(exe)) return resolve(tryOne(i + 1));
    execFile(exe, ["--query-gpu=temperature.gpu,name,clocks.gr,fan.speed,utilization.gpu", "--format=csv,noheader,nounits"], { timeout: 4000, windowsHide: true }, (err, out) => {
      if (err) { if (nvsmi) { nvsmi = undefined; return resolve(null); } return resolve(tryOne(i + 1)); } // Pfad war bekannt, Aufruf scheiterte einmal: nächster Durchlauf sucht neu
      nvsmi = exe;
      const rows = out.trim().split(/\r?\n/).map((l) => l.split(",").map((x) => x.trim())).filter((r) => Number(r[0]) > 0);
      if (!rows.length) return resolve(null);
      const hot = rows.sort((a, b) => Number(b[0]) - Number(a[0]))[0];
      const n = (x) => (x != null && /^\d+(\.\d+)?$/.test(x) ? Number(x) : null); // "[N/A]" bei passiv gekühlten Karten
      resolve({ temp: Number(hot[0]), name: hot[1], clockMHz: n(hot[2]), fanPct: n(hot[3]), load: n(hot[4]) });
    });
  });
  return tryOne(0);
}

function fmtRate(kbs) { return kbs == null ? "?" : kbs >= 1024 ? (kbs / 1024).toFixed(1) + " MB/s" : Math.round(kbs) + " KB/s"; }

module.exports = { SystemWatch, parseLHM, setSensorFile, readSensorFile };
