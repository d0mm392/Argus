"use strict";
// Erreichbarkeit: sichtbare bedienbare Elemente und Karten je Seite und je Einstellungsbereich (isolierte Testumgebung).
// Aufruf: electron tests/apple-reach.js <ausgabe.json>   mit ARGUS_TEST_UI=klassisch|apple
const { setup } = require("./renderer-fixture");
const fs = require("fs");
(async () => {
  const f = await setup(); const { app, evaluate, wait } = f;
  const collect = () => evaluate(`(() => {
    const clipped = (el) => !!el.closest("#pageTabs") && document.documentElement.dataset.ui === "apple"; // Quelle der Sidebar, bewusst verborgen
    const vis = (el) => { if (clipped(el) || el.closest(".report-pop")) return false; /* Pop-ups (z. B. synthetischer Fehlerbericht der Testumgebung) erscheinen zeitabhängig */ const r = el.getClientRects(); if (!r.length) return false; const s = getComputedStyle(el); return s.visibility !== "hidden" && +s.opacity > 0.01 && r[0].width > 1 && r[0].height > 1; };
    const out = [];
    for (const el of document.querySelectorAll("button[id], input[id], select[id], textarea[id], a[id], section.sys[id], .blk[id], [role=button][id]")) if (vis(el)) out.push(el.id);
    return out.sort(); })()`);
  const res = { pages: {}, settings: {}, sidebar: [], appMenu: [] };
  for (const pg of ["Start", "Mining", "Gaming", "Trading"]) {
    await evaluate(`document.querySelector('#pageTabs button[data-pg="${pg}"]')?.click()`); await wait(500);
    res.pages[pg] = await collect();
  }
  await evaluate(`document.querySelector('#pageTabs button[data-pg="Start"]')?.click()`); await wait(300);
  res.sidebar = await evaluate(`[...document.querySelectorAll("#apSide button")].map((b) => b.dataset.pg || b.textContent.trim())`);
  res.appMenu = await evaluate(`[...document.querySelectorAll("#apAppMenu button")].map((b) => b.dataset.target)`);
  await evaluate(`document.getElementById("settingsBtn").click()`); await wait(500);
  const tabs = await evaluate(`[...document.querySelectorAll("#setTabs button")].map((b) => b.textContent.trim())`);
  for (const t of tabs) {
    await evaluate(`[...document.querySelectorAll("#setTabs button")].find((b) => b.textContent.trim() === ${JSON.stringify(t)})?.click()`); await wait(250);
    // eingeklappte Abschnitte öffnen, damit alle Zeilen geprüft werden
    await evaluate(`for (const h of document.querySelectorAll(".set-body h4")) if (h.getClientRects().length && h.classList.contains("folded")) h.click(); for (const d of document.querySelectorAll(".set-body details")) d.open = true;`); await wait(150);
    res.settings[t] = await collect();
  }
  fs.writeFileSync(process.argv[process.argv.length - 1], JSON.stringify(res, null, 1));
  app.exit(0);
})().catch((e) => { console.error(e?.stack || e); require("electron").app.exit(1); });
