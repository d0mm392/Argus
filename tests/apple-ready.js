"use strict";
// Startsicherung im Renderer: zählt die Bereitschaftsmeldungen (ui-ready) nach dem Laden. Aufruf: electron tests/apple-ready.js <ausgabe.json>
// mit ARGUS_TEST_UI=apple und optional ARGUS_TEST_UI_BREAK=1 (Aufbau scheitert, es darf keine Meldung kommen)
const { setup } = require("./renderer-fixture");
(async () => {
  const f = await setup(); await f.wait(5500);
  require("fs").writeFileSync(process.argv[process.argv.length - 1], JSON.stringify({ ready: f.uiReady.length, errors: f.errors.map(String).slice(0, 5) }));
  f.app.exit(0);
})().catch((e) => { console.error(e?.stack || e); require("electron").app.exit(1); });
