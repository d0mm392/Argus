"use strict";
// Apple-Modus: Erreichbarkeit aller Bedienelemente gegenüber Klassisch und Kontraste der Apple-Farben.
// Aufruf: electron tests/apple-mode.test.js   (startet tests/apple-reach.js je Oberfläche in einem eigenen Prozess)
const assert = require("node:assert/strict"), fs = require("fs"), path = require("path"), os = require("os");
const { spawn } = require("child_process");
const { app } = require("electron");
const ROOT = path.join(__dirname, "..");

function reach(ui, script = "apple-reach.js", extra = {}) {
  const out = path.join(fs.mkdtempSync(path.join(process.env.ARGUS_TEST_ROOT || os.tmpdir(), "reach-")), ui + ".json");
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ARGUS_TEST_UI: ui, ...extra }; delete env.ELECTRON_RUN_AS_NODE; if (!extra.ARGUS_TEST_UI_BREAK) delete env.ARGUS_TEST_UI_BREAK;
    const p = spawn(process.execPath, [path.join(__dirname, script), out], { env, stdio: ["ignore", "ignore", "pipe"] });
    let err = ""; p.stderr.on("data", (d) => { err += d; });
    const t = setTimeout(() => { p.kill(); reject(Error("apple-reach " + ui + ": Zeitlimit")); }, 90000);
    p.on("exit", (code) => { clearTimeout(t); if (code !== 0) return reject(Error(`apple-reach ${ui}: Exit ${code} ${err.slice(-400)}`)); resolve(JSON.parse(fs.readFileSync(out, "utf8"))); });
  });
}

// Relative Leuchtdichte und Kontrast nach WCAG 2.x
const lum = (hex) => { const v = hex.replace("#", "").match(/../g).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
function tokens(block) { const t = {}; for (const m of block.matchAll(/--(ap-[a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)) t[m[1]] = m[2]; return t; }

function checkContrast() {
  const css = fs.readFileSync(path.join(ROOT, "app", "apple.css"), "utf8");
  const light = tokens(css.slice(0, css.indexOf("@media (prefers-color-scheme: dark)")));
  const dark = { ...light, ...tokens(css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf("/* Transparenz reduzieren"))) };
  const bad = [];
  for (const [name, t] of [["hell", light], ["dunkel", dark]]) {
    for (const bg of ["ap-window", "ap-content", "ap-card", "ap-field"]) {
      for (const fg of ["ap-text", "ap-text2"]) { const c = contrast(t[fg], t[bg]); if (c < 4.5) bad.push(`${name}: ${fg} auf ${bg} ${c.toFixed(2)}`); }
    }
    for (const [fg, bg, min] of [["ap-on-accent", "ap-fill", 4.5], ["ap-danger", "ap-content", 4.5], ["ap-accent", "ap-content", 3]]) {
      const c = contrast(t[fg], t[bg]); if (c < min) bad.push(`${name}: ${fg} auf ${bg} ${c.toFixed(2)} < ${min}`);
    }
  }
  assert.deepEqual(bad, [], "Kontraste der Apple-Farben");
}

async function run() {
  checkContrast();
  const [k, a] = [await reach("klassisch"), await reach("apple")];
  // Bewusste Unterschiede: im Apple-Modus über App-Menü/Strg+, bzw. die Sidebar erreichbar; freie Anordnung entfällt (Kartenraster)
  const replaced = new Set(["settingsBtn", "pgPlus", "arrangeBtn"]);
  for (const area of ["pages", "settings"]) {
    for (const key of Object.keys(k[area])) {
      const have = new Set(a[area][key] || []);
      const missing = k[area][key].filter((id) => !have.has(id) && !replaced.has(id));
      assert.deepEqual(missing, [], `${area}/${key}: im Apple-Modus nicht erreichbar`);
    }
  }
  assert.deepEqual(Object.keys(a.settings).sort(), Object.keys(k.settings).sort(), "gleiche Einstellungsbereiche");
  for (const pg of ["Start", "Mining", "Gaming", "Trading"]) assert(a.sidebar.includes(pg), "Sidebar enthält " + pg);
  assert(a.sidebar.some((s) => /Neue Seite/.test(s)), "Sidebar: Neue Seite");
  for (const target of ["settingsBtn", "ytBtn", "twBtn"]) assert(a.appMenu.includes(target), "App-Menü: " + target);
  // Ausgewählte Funktionen, die der Auftrag ausdrücklich nennt: YouTube, Notizen, Mining, Discord
  assert(a.pages.Start.includes("ytBtn"), "YouTube-Knopf erreichbar");
  assert(Object.keys(a.settings).some((s) => /Discord|Freunde/i.test(s)) || Object.values(a.settings).flat().some((id) => /dc|discord/i.test(id)), "Discord-Einstellungen erreichbar");
  assert(Object.keys(a.settings).includes("Mining"), "Mining-Einstellungen erreichbar");
  // Startsicherung: Bereitschaft nur nach vollständigem Aufbau; scheitert der Aufbau, kommt keine Meldung (Rückfall beim nächsten Start)
  const ok = await reach("apple", "apple-ready.js"), broken = await reach("apple", "apple-ready.js", { ARGUS_TEST_UI_BREAK: "1" });
  assert.equal(ok.ready, 1, "genau eine Bereitschaftsmeldung nach erfolgreichem Aufbau");
  assert.equal(broken.ready, 0, "keine Bereitschaftsmeldung bei gescheitertem Aufbau");
  assert(broken.errors.length > 0, "der absichtliche Aufbaufehler ist sichtbar");
  console.log("PASS apple-mode: Startsicherung im Renderer (Meldung nur nach Aufbau), Erreichbarkeit gegenüber Klassisch (Seiten und alle Einstellungsbereiche), Sidebar, App-Menü, Kontraste hell/dunkel");
  app.exit(0);
}
app.whenReady().then(run).catch((e) => { console.error(e?.stack || e); app.exit(1); });
