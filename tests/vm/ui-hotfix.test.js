// Electron-Tests U1 bis U6, U8 und U9 für den Hotfix 0.58.20. NUR in der Test-VM:  electron tests\vm\ui-hotfix.test.js
"use strict";
const path = require("path"), fs = require("fs");
const H = require("./harness-isolated").setup({ entry: "main", label: "ui-hotfix" });
const { UD, HOME, APPDATA, DISABLED, check, finish, wait, mainWindow, calls } = H;
const put = (p, s = "x") => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

// Testdaten vor dem Start: Arbeitsordner der Selbstverbesserung (U4) und SV-Daten für die Suche (U8, U9)
put(path.join(UD, "selfimprove-stage", "x.txt"), "STAGE");
put(path.join(UD, "selfimprove-verworfen-alt", "sv-geheim.js"), "SV"); put(path.join(UD, "backups", "1", "backup-geheim.js"), "SV"); put(path.join(UD, "selfimprove-pending.json"), "{}");
put(path.join(HOME, "Documents", "selfimprove-verworfen-1", "geheimx.js"), "SV"); put(path.join(HOME, "Documents", "nutz-test.txt"), "NUTZ");

// Stündlichen Indexierungsauslöser abfangen (main.js:2013), damit U8 ihn gezielt auslösen kann
let hourly = null; const origSI = global.setInterval;
global.setInterval = function (fn, ms, ...r) { if (ms === 3600e3) hourly = fn; return origSI.call(this, fn, ms, ...r); };

require(path.join(__dirname, "..", "..", "main.js"));

const { app } = require("electron");
app.whenReady().then(async () => {
  try {
    const w = await mainWindow(); check("START Hauptfenster", !!w); if (!w) return finish(1);
    await wait(3000);
    const ev = (js) => w.webContents.executeJavaScript(js);
    await ev("window.__si = []; window.argus.onSelfImprove((r) => window.__si.push(r)); true");
    const act = async (t) => { await ev("window.__si.length = 0; true"); const r = await ev(`window.argus.action(${JSON.stringify(t)})`); await wait(500); return { r, si: await ev("window.__si") }; };
    // U1
    let x = await act("Verbessere dich: zeig die Uhrzeit"); check("U1 improve abgelehnt, kein Ereignis", x.r === DISABLED && x.si.length === 0, x);
    x = await act("Prüf dich auf Fehler"); check("U1 check abgelehnt", x.r === DISABLED && x.si.length === 0, x);
    // U2
    for (const t of ["Übernehmen", "Mach die letzte Verbesserung rückgängig"]) { x = await act(t); check("U2 " + t, x.r === DISABLED && x.si.length === 1 && x.si[0].ok === false && x.si[0].text === DISABLED, x); }
    check("U2 kein Neustart", calls.relaunch === 0, calls.relaunch);
    // U3
    await ev("window.__si.length = 0; true"); const ra = await ev("window.argus.selfApply()"); await wait(500);
    const tr = await ev("(document.querySelector('#transcript .turn.ai:last-child')||{}).textContent || ''"), offerHidden = await ev("!!(document.getElementById('offer')||{}).hidden");
    check("U3 self-apply", ra === DISABLED && (await ev("window.__si.length")) === 1 && tr.includes(DISABLED) && offerHidden, { ra, tr, offerHidden });
    // U4
    await ev("window.__si.length = 0; true"); const rd = await ev("window.argus.selfDiscard()"); await wait(500); const siD = await ev("window.__si");
    const arch = fs.readdirSync(UD).find((n) => n.startsWith("selfimprove-verworfen-") && n !== "selfimprove-verworfen-alt");
    check("U4 self-discard archiviert", typeof rd === "string" && /^Verworfen/.test(rd) && siD.length === 1 && siD[0].ok === true && !!arch && fs.readFileSync(path.join(UD, arch, "x.txt"), "utf8") === "STAGE" && !fs.existsSync(path.join(UD, "selfimprove-stage")), { rd, siD, arch });
    x = await act("Verwerfen"); check("U4 danach normale Eingabe", x.r !== DISABLED && x.si.length === 0, x);
    // U5
    check("U5 self-offer null", (await ev("window.argus.selfOffer()")) === null);
    // U6
    x = await act("Merk dir: Testeintrag"); check("U6 Gedächtnis", typeof x.r === "string" && x.r !== DISABLED && fs.existsSync(process.env.JARVIS_MEMORY), x);
    x = await act("Wie spät ist es"); check("U6 normale Eingabe nicht abgefangen", x.r !== DISABLED, x);
    // U8: erster Indexlauf (8 s nach Start), dann Index altern und stündlichen Auslöser ausführen
    const idx = process.env.JARVIS_INDEX; for (let i = 0; i < 120 && !fs.existsSync(idx); i++) await wait(500);
    const first = fs.existsSync(idx) ? fs.readFileSync(idx, "utf8") : null; check("U8 erster Lauf", first !== null, "kein Index");
    const svRx = /selfimprove-verworfen|selfimprove-pending|[\\/]argus-desktop[\\/](selfimprove-stage|backups)[\\/]/i;
    check("U8 erster Lauf ohne SV-Pfade", first !== null && !first.split("\n").some((l) => svRx.test(l)), "SV im Index");
    if (first !== null && hourly) {
      const old = new Date(Date.now() - 13 * 3600e3); fs.utimesSync(idx, old, old); const m0 = fs.statSync(idx).mtimeMs; hourly();
      for (let i = 0; i < 120 && fs.statSync(idx).mtimeMs === m0; i++) await wait(500);
      const second = fs.readFileSync(idx, "utf8"); check("U8 zweiter Lauf fand statt", fs.statSync(idx).mtimeMs !== m0, "Index nicht neu geschrieben");
      check("U8 zweiter Lauf ohne SV-Pfade", !second.split("\n").some((l) => svRx.test(l)), "SV im Index");
    } else check("U8 stündlicher Auslöser erfasst", !!hourly, "setInterval(…, 3600e3) nicht abgefangen");
    // U9: Suchtreffer über actions.js, Windows-Suche liefert SV- und normale Pfade
    H.setSearchIndex([path.join(UD, "selfimprove-verworfen-alt", "sv-geheim.js"), path.join(UD, "backups", "1", "backup-geheim.js"), "C:\\Docs\\normal-geheim.txt"].join("\r\n") + "\r\n");
    calls.shell.length = 0;
    for (const t of ["Öffne Datei sv-geheim", "Öffne sv-geheim", "Such sv-geheim", "Öffne Datei geheimx", "Öffne Datei backup-geheim", "Öffne Datei selfimprove-pending"]) await act(t);
    const opened = calls.shell.map((c) => c[1]); check("U9 kein SV-Pfad geöffnet", !opened.some((p) => svRx.test(p) || /selfimprove-verworfen|selfimprove-stage/i.test(p)), opened);
    calls.shell.length = 0; await act("Öffne Datei nutz-test"); check("U9 Gegenprobe öffnet normale Datei", calls.shell.some((c) => c[0] === "openPath" && /nutz-test\.txt$/.test(c[1])), calls.shell);
    check("Wächter: keine Cloud-KI, kein unerwarteter Prozess", !H.violations.length, H.violations);
    finish();
  } catch (e) { check("TESTLAUF", false, String(e && e.stack || e)); finish(4); }
});
