"use strict";
// Screenshots beider Oberflächen mit der isolierten Renderer-Testumgebung (synthetische Daten, kein main.js, kein Netz).
// Aufruf: electron tests/apple-screens.js   Umgebung: ARGUS_TEST_UI=apple|klassisch, ARGUS_TEST_THEME=dark|light, ARGUS_TEST_ARTIFACTS=<Ordner>
const { setup } = require("./renderer-fixture");
const { nativeTheme } = require("electron");
(async () => {
  const f = await setup(); const { app, evaluate, wait, screenshot, errors } = f;
  const ui = process.env.ARGUS_TEST_UI === "apple" ? "apple" : "klassisch", theme = process.env.ARGUS_TEST_THEME === "light" ? "light" : "dark";
  nativeTheme.themeSource = theme; await wait(500);
  const name = (s) => `${ui}-${theme}-${s}`, shots = [];
  shots.push(await screenshot(name("start")));
  await evaluate(`document.querySelector('#pageTabs button[data-pg="Mining"]')?.click()`); await wait(700);
  shots.push(await screenshot(name("mining")));
  await evaluate(`document.querySelector('#pageTabs button[data-pg="Start"]')?.click()`); await wait(400);
  await evaluate(`document.getElementById("settingsBtn").click()`); await wait(500);
  await evaluate(`[...document.querySelectorAll("#setTabs button")].find((b) => /Aussehen/.test(b.textContent))?.click()`); await wait(400);
  shots.push(await screenshot(name("einstellungen")));
  if (process.env.ARGUS_TEST_VIEWS === "mehr") {
    await evaluate(`[...document.querySelectorAll("#setTabs button")].find((b) => b.textContent.trim() === "Mining")?.click()`); await wait(300); shots.push(await screenshot(name("einstellungen-mining")));
    await evaluate(`document.getElementById("setClose")?.click()`); await wait(300);
    for (const pg of ["Gaming", "Trading"]) { await evaluate(`document.querySelector('#pageTabs button[data-pg="${pg}"]')?.click()`); await wait(600); shots.push(await screenshot(name(pg.toLowerCase()))); }
    await evaluate(`document.querySelector('#pageTabs button[data-pg="Start"]')?.click()`); await wait(300);
    await evaluate(`document.getElementById("apAppBtn")?.click()`); await wait(250); shots.push(await screenshot(name("app-menue")));
    await evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); document.getElementById("apAppMenu") && (document.getElementById("apAppMenu").hidden = true);`); await wait(150);
    await evaluate(`(document.getElementById("pgPlus"))?.click()`); await wait(300); shots.push(await screenshot(name("neue-seite")));
    await evaluate(`document.getElementById("pgCancel")?.click()`); await wait(200);
    await evaluate(`(document.querySelector('#apSide button[data-pg="Gaming"]') || document.querySelector('#pageTabs button[data-pg="Gaming"]'))?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 120, clientY: 206 }))`); await wait(300);
    shots.push(await screenshot(name("seitenmenue"))); await evaluate(`document.getElementById("pgMenu")?.remove()`); await wait(100);
    await evaluate(`document.getElementById("ytBtn")?.click()`); await wait(600); shots.push(await screenshot(name("youtube")));
  }
  // Rechtsklickmenü: echtes menu.html mit Beispieleinträgen und der Oberfläche des Laufs
  { const { BrowserWindow } = require("electron"), path = require("path");
    const mw = new BrowserWindow({ width: 300, height: 330, frame: false, transparent: true, show: false, webPreferences: { preload: path.join(f.root, "preload-menu.js"), contextIsolation: true } });
    await mw.loadFile(path.join(f.root, "app", "menu.html"));
    mw.webContents.send("menu-show", { ui, vars: {}, items: [{ type: "title", label: "Argus" }, { id: 1, label: "Einstellungen", enabled: true }, { id: 2, label: "Kugel anzeigen", checked: true, keep: "checkbox", enabled: true },
      { type: "separator" }, { sid: 3, label: "Darstellung im Hintergrund", enabled: true }, { id: 4, label: "Anordnung zurücksetzen", enabled: true }, { type: "separator" }, { id: 5, label: "Argus beenden", danger: true, enabled: true }] });
    await wait(500); const file = require("path").join(process.env.ARGUS_TEST_ARTIFACTS || f.profile, name("menue") + ".png");
    require("fs").writeFileSync(file, (await mw.webContents.capturePage()).toPNG()); shots.push(file); mw.destroy(); }
  const info = await evaluate(`({ ui: document.documentElement.dataset.ui, sidebar: !!document.getElementById("apSide"), sideItems: [...document.querySelectorAll("#apSide button")].map((b) => b.textContent),
    title: document.getElementById("apTitle")?.textContent || null, uiSelect: document.getElementById("setUiMode")?.value, settingsOpen: !document.getElementById("settings").hidden })`);
  console.log("ERGEBNIS " + JSON.stringify({ ui, theme, shots, info, errors }));
  app.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e?.stack || e); require("electron").app.exit(1); });
