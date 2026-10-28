// Electron integration test. Uses only generated profiles and an in-memory HTTPS fixture.
// Run: electron tests/portal-download.test.js
// No real login, cookies, remote requests, save paths or file opening.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { app, BrowserWindow, session } = require("electron");
const base = process.env.ARGUS_TEST_ROOT || path.join(os.tmpdir(), "argus-portal-tests");
fs.mkdirSync(base, { recursive: true });
const profile = fs.mkdtempSync(path.join(base, "portal-"));
app.setPath("userData", profile); app.setPath("logs", profile);
app.on("window-all-closed", () => {}); // Keep the runner alive between isolated cases.
const portalPath = process.env.ARGUS_PORTAL_TEST_MODULE || path.join(__dirname, "..", "portal.js");
const origin = "https://portal-fixture.test";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label) {
  const end = Date.now() + 8000;
  while (!fn()) { if (Date.now() > end) throw new Error("Timeout: " + label); await pause(30); }
}
let passes = 0;
function check(label, actual, expected) { assert.deepEqual(actual, expected, label); passes++; console.log("PASS " + label); }

async function scenario(mode, index) {
  const ses = session.fromPartition("portal-fixture-" + index + "-" + Date.now());
  const windows = [], downloads = [], navigation = [];
  let portal, apiCalls = 0;
  const miners = [{ online: true, minerTypeId: 1 }, { online: false, minerTypeId: 1 }];
  ses.protocol.handle("https", async (request) => {
    const u = new URL(request.url);
    if (u.origin !== origin) return new Response("not found", { status: 404 });
    if (u.pathname === "/clients/current/miners") {
      apiCalls++;
      return apiCalls === 1 ? new Response("login", { status: 401 }) : Response.json(miners);
    }
    if (u.pathname === "/clients/current/types") return Response.json([{ id: 1, name: "Fixture", power: 100 }]);
    if (u.pathname === "/clients/current/hashrate") return Response.json(123);
    if (u.pathname === "/report" || u.pathname === "/attachment" || mode === "direct" && u.pathname === "/") {
      return new Response("test bytes", { headers: { "content-type": "application/octet-stream", "content-disposition": "attachment; filename=download" } });
    }
    if (mode === "redirect" && u.pathname === "/") return new Response(null, { status: 302, headers: { location: origin + "/attachment" } });
    return new Response('<!doctype html><html><body>Portal ready <a id="report" href="/report" download>Report</a></body></html>', { headers: { "content-type": "text/html" } });
  });
  class FixtureWindow extends BrowserWindow {
    constructor(options) {
      const preferences = { ...options.webPreferences, session: ses }; delete preferences.partition;
      super({ ...options, webPreferences: preferences }); windows.push(this);
      this.webContents.on("will-redirect", (_event, url) => navigation.push(new URL(url).pathname));
    }
  }
  delete require.cache[require.resolve(portalPath)];
  portal = require(portalPath);
  try {
    portal.init({ app, BrowserWindow: FixtureWindow, session: { fromPartition: () => ses } }, true, null, () => origin + "/");
    // Installed after init's production guard. Always cancel here as well: even the
    // deliberately unfixed negative control must never display a save dialog or save.
    ses.on("will-download", (event, item, contents) => {
      downloads.push({ prevented: event.defaultPrevented, name: item.getFilename(), contents, chain: item.getURLChain() });
      event.preventDefault();
    });
    await until(() => windows.length === 1, "background portal");
    const window = windows[0];
    if (mode === "direct" || mode === "redirect") {
      await until(() => downloads.length === 1, "startup download");
      check(mode + ": startup window stays hidden", window.isVisible(), false);
      check(mode + ": automatic download blocked before native save dialog", downloads[0].prevented, true);
      check(mode + ": fixture reproduces download filename", downloads[0].name, "download");
      if (mode === "redirect") check("redirect: navigation observed", navigation.includes("/attachment"), true);
      // A canceled background navigation must remain recoverable when the user opens
      // the portal. Switch the fixture to ordinary HTML before the explicit login.
      mode = "html";
      check("retry: explicit portal opening accepted", portal.login().ok, true);
      await until(() => window.webContents.getURL() === origin + "/", "retry URL");
      await until(() => !window.webContents.isLoading(), "retry load");
      check("retry: portal page renders", await window.webContents.executeJavaScript("document.body.textContent.includes('Portal ready')"), true);
    } else {
      await until(() => !window.webContents.isLoading() && window.webContents.getURL() === origin + "/", "HTML portal");
      await portal.poll();
      check("widget: API data still updates in background", [portal.data().state, portal.data().total, portal.data().up, portal.data().down], ["ok", 2, 1, 1]);
      check("widget: hidden HTML page still renders", await window.webContents.executeJavaScript("document.body.textContent.includes('Portal ready')"), true);
      await window.webContents.executeJavaScript("window.fixtureState = 'keep'; document.getElementById('report').click(); true");
      await until(() => downloads.length === 1, "scripted background download");
      check("widget: script download from loaded hidden page blocked", downloads[0].prevented, true);
      check("manual: opening portal accepted", portal.login().ok, true);
      check("widget: existing page state survives blocked download", await window.webContents.executeJavaScript("window.fixtureState"), "keep");
      window.focus();
      const box = await window.webContents.executeJavaScript("(()=>{ const b=document.getElementById('report').getBoundingClientRect(); return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)} })()");
      window.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...box });
      window.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...box });
      await until(() => downloads.length === 2, "explicit download");
      check("manual: user download is not blocked by portal policy", downloads[1].prevented, false);
      check("manual: download belongs to visible portal", downloads[1].contents === window.webContents && window.isVisible(), true);
      // Repeated enable/login must not multiply the session listener.
      portal.setOn(true); portal.login();
      check("session: one guard plus the safety observer", ses.listenerCount("will-download"), 2);
    }
  } finally {
    portal?.setOn(false);
    for (const window of windows) if (!window.isDestroyed()) window.destroy();
    // Keep the fixture protocol until process exit: pending async polling must
    // never fall through to a real network request after this case is closed.
  }
}

app.whenReady().then(async () => {
  try {
    await scenario("direct", 1); await scenario("redirect", 2); await scenario("html", 3);
    console.log("RESULT portal-download: " + passes + " passed; no files saved or opened"); app.exit(0);
  } catch (error) { console.error(error.stack); app.exit(1); }
});
setTimeout(() => { console.error("FAIL portal-download: time limit"); app.exit(2); }, 60000).unref();
