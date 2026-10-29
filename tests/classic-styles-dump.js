"use strict";
// Gibt die berechneten Stile aller Elemente mit ID in der klassischen Oberfläche aus (Startseite und Einstellungen).
// Dient dem Nachweis, dass der Apple-Modus Klassisch nicht verändert: Lauf gegen den alten und den neuen Stand, Ergebnisse vergleichen.
// Aufruf: electron tests/classic-styles-dump.js <ausgabe.json>   (ARGUS_PRODUCT_ROOT wählt den Produktstand)
const { setup } = require("./renderer-fixture");
const fs = require("fs");
(async () => {
  const f = await setup(); const { app, evaluate, wait } = f;
  require("electron").nativeTheme.themeSource = "dark"; await wait(400);
  const dump = () => evaluate(`(() => { const P = ["display","position","font-family","font-size","font-weight","letter-spacing","text-transform","color","background-color","background-image","border-top-color","border-top-width","border-radius","box-shadow","padding-top","padding-left","margin-top","width","height","opacity","grid-template-columns"];
    const out = {}; for (const el of document.querySelectorAll("[id]")) { if (/^(ap|setUi)/.test(el.id)) continue; const s = getComputedStyle(el), r = {};
      for (const p of P) { let v = s.getPropertyValue(p); if (p === "width" || p === "height") v = String(Math.round(parseFloat(v) || 0)); r[p] = v; } out[el.id] = r; } return out; })()`);
  const start = await dump();
  await evaluate(`document.getElementById("settingsBtn").click()`); await wait(500);
  const settings = await dump();
  fs.writeFileSync(process.argv[process.argv.length - 1], JSON.stringify({ start, settings }));
  app.exit(0);
})().catch((e) => { console.error(e?.stack || e); require("electron").app.exit(1); });
