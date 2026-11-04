// Bildschirm übertragen, Ende zu Ende: zwei Übertragungsfenster in einem Argus, Vermittlung über einen lokalen,
// PeerJS-kompatiblen Testserver. Prüft Code, Annehmen, echtes Bild beim Zuschauer, Chat, Leiste, Beenden.
// Start: xvfb-run -a npx electron --no-sandbox tests/share.test.js   (ARGUS_SHARE_SIGNAL=wss://… für einen echten Server)
const path = require("path");
const { WebSocketServer } = require("ws");
const { run } = require("./harness");

function relay() {
  return new Promise((resolve) => {
    const clients = new Map(), wss = new WebSocketServer({ port: 0, host: "127.0.0.1", path: "/peerjs" });
    wss.on("connection", (ws, req) => {
      const q = new URL(req.url, "http://x").searchParams, id = q.get("id");
      if (!id || !q.get("token") || q.get("key") !== "peerjs") { ws.send(JSON.stringify({ type: "ERROR", payload: { msg: "bad" } })); return ws.close(); }
      if (clients.has(id)) { ws.send(JSON.stringify({ type: "ID-TAKEN" })); return ws.close(); }
      clients.set(id, ws); ws.send(JSON.stringify({ type: "OPEN" }));
      ws.on("message", (raw) => {
        let m; try { m = JSON.parse(raw); } catch { return; }
        if (m.type === "HEARTBEAT" || !m.dst) return;
        (relay.log = relay.log || []).push(String(raw));
        const to = clients.get(m.dst);
        if (to) to.send(JSON.stringify({ type: m.type, src: id, dst: m.dst, payload: m.payload }));
        else setTimeout(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: "EXPIRE", src: m.dst, dst: id })), 300);
      });
      ws.on("close", () => { if (clients.get(id) === ws) clients.delete(id); });
    });
    wss.on("listening", () => resolve({ url: `ws://127.0.0.1:${wss.address().port}/peerjs`, wss }));
  });
}

run(async ({ w, ev, wait, check, BrowserWindow }) => {
  const srv = await relay(), signal = process.env.ARGUS_SHARE_SIGNAL || srv.url;
  const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await wait(200); } return false; };

  await ev("window.argus.openShare()"); await wait(1500);
  const shareWins = () => BrowserWindow.getAllWindows().filter((x) => x.getTitle() === "Argus · Bildschirm übertragen");
  check("R-SHARE-10 Übertragungsfenster öffnet sich aus Argus", shareWins().length === 1, BrowserWindow.getAllWindows().map((x) => x.getTitle()));
  await ev("window.argus.openShare()"); await wait(600);
  check("R-SHARE-11 zweites Öffnen holt dasselbe Fenster nach vorn", shareWins().length === 1, shareWins().length);
  const mod = require(path.join(__dirname, "..", "share-main.js")).instance;
  const hostW = shareWins()[0], viewW = mod.open({ second: true });
  await until(() => !viewW.webContents.isLoading() && viewW.isVisible());
  const H = (c) => hostW.webContents.executeJavaScript(c), V = (c) => viewW.webContents.executeJavaScript(c);
  for (const f of [H, V]) await f(`window.share.setConfig({ shareSignal: ${JSON.stringify(signal)}, shareAudio: true, sharePreset: "film" })`);
  check("R-SHARE-12 nichts läuft von selbst: keine Leiste, kein Mitschnitt vor dem Annehmen", !BrowserWindow.getAllWindows().some((x) => x.getTitle() === "Argus Übertragungsleiste") && (await H("window.__share.phase")) === "idle");

  // Dialog: ×, Esc
  await H(`document.getElementById("btnSettings").click()`);
  const dOpen = await H(`!document.getElementById("dlg").hidden`);
  await H(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
  const dEsc = await H(`document.getElementById("dlg").hidden`);
  await H(`document.getElementById("btnSettings").click(); document.getElementById("dlgX").click()`);
  check("R-DLG-1 Einstellungen im Übertragungsfenster: öffnen, Esc und × schließen", dOpen && dEsc && (await H(`document.getElementById("dlg").hidden`)));

  // Zeigen vorbereiten
  const haveSrc = await until(() => H(`document.querySelectorAll("#srcGrid .src").length > 0 && !document.getElementById("btnPrepare").disabled`), 10000);
  check("R-SHARE-13 Quellenliste mit Bildschirmen und Fenstern", haveSrc, await H(`document.getElementById("srcGrid").textContent.slice(0, 200)`));
  await H(`document.getElementById("btnPrepare").click()`);
  const codeOk = await until(async () => /^[A-Z2-9]{3}-[A-Z2-9]{3}-[A-Z2-9]{3}$/.test(await H(`document.getElementById("codeOut").textContent`)) && (await H("window.__share.phase")) === "wait" && (await H(`document.getElementById("hostWaitState").dataset.k`)) === "ok");
  const code = await H(`document.getElementById("codeOut").textContent`);
  check("R-SHARE-14 Code erscheint, Verbindung zum Vermittlungsserver steht", codeOk, { code, err: await H(`document.getElementById("err").textContent`) });

  // Falscher Code: klare Meldung, kein Absturz
  await V(`{ document.querySelector('[data-role="view"]').click(); document.getElementById("inName").value = "Tester"; const i = document.getElementById("inCode"); i.value = "ZZZ-ZZZ-ZZZ"; i.dispatchEvent(new Event("input")); document.getElementById("btnJoin").click() }`);
  const wrong = await until(async () => /Code nicht gefunden/.test(await V(`document.getElementById("err").textContent`)), 15000);
  check("R-SHARE-15 falscher Code: Meldung „Code nicht gefunden“", wrong, await V(`document.getElementById("err").textContent`));

  // Richtiger Code: Anfrage beim Host
  await V(`{ const i = document.getElementById("inCode"); i.value = ${JSON.stringify(code.toLowerCase().replace(/-/g, " "))}; i.dispatchEvent(new Event("input")); document.getElementById("btnJoin").click() }`);
  const asked = await until(async () => (await H(`!document.getElementById("pHostAsk").hidden`)) && (await H(`document.getElementById("askName").textContent`)) === "Tester");
  check("R-SHARE-16 Anfrage mit Namen, muss angenommen werden", asked, await H("window.__share.phase"));
  check("R-SHARE-17 Server sieht nur Hash-Adressen und verschlüsselte Daten, weder Code noch Namen", (relay.log || []).length > 0 && !(relay.log || []).some((r) => r.includes(code.replace(/-/g, "")) || r.includes(code) || r.includes("Tester")), (relay.log || []).length);
  await H(`document.getElementById("btnAccept").click()`);

  const live = await until(async () => (await V(`document.getElementById("vid").videoWidth`)) > 0 && (await H("window.__share.connectedOnce")) && (await V("window.__share.connectedOnce")), 30000);
  check("R-SHARE-18 Bild kommt beim Zuschauer an (WebRTC direkt)", live, { v: await V(`({ w: document.getElementById("vid").videoWidth, err: document.getElementById("err").textContent, phase: window.__share.phase })`), h: await H(`({ err: document.getElementById("err").textContent, phase: window.__share.phase })`) });
  await wait(2500);
  const st = await V("window.__share.stats"), hs = await H("window.__share.stats");
  check("R-SHARE-19 Statistik: Verbindungsart und Datenrate", st.path && ["lan", "direct"].includes(st.path.kind) && st.video && st.video.frames > 0 && hs.path, { st, hs });
  const barWin = () => BrowserWindow.getAllWindows().find((x) => x.getTitle() === "Argus Übertragungsleiste" && x.isVisible());
  await until(() => !!barWin(), 5000); const bar = barWin();
  check("R-SHARE-20 rote Leiste sichtbar, solange übertragen wird", bar && bar.isVisible() && bar.isAlwaysOnTop(), BrowserWindow.getAllWindows().map((x) => x.getTitle() + ":" + x.isVisible()));
  const audio = await H("window.__share.hasAudio");
  console.log("INFO Ton in dieser Umgebung: " + (audio ? "mit Ton" : "ohne Ton (Systemton nur unter Windows)"));
  if (audio) check("R-SHARE-21 Bild und Ton im selben Stream (synchron)", await V(`(() => { const s = document.getElementById("vid").srcObject; return s.getAudioTracks().length === 1 && s.getVideoTracks().length === 1; })()`));

  // Chat in beide Richtungen
  await V(`document.getElementById("chatIn").value = "Siehst du mich?"; document.getElementById("chatForm").requestSubmit()`);
  await H(`document.getElementById("chatIn").value = "Ja"; document.getElementById("chatForm").requestSubmit()`);
  const chatOk = await until(async () => (await H(`document.getElementById("chatLog").textContent`)).includes("Tester: Siehst du mich?") && (await V(`document.getElementById("chatLog").textContent`)).includes("Ja"), 5000);
  check("R-SHARE-22 Chat in beide Richtungen", chatOk, await H(`document.getElementById("chatLog").textContent`));

  // Qualität live ändern ohne Abbruch
  await H(`{ const s = document.getElementById("optPresetLive"); s.value = "help"; s.dispatchEvent(new Event("change")) }`); await wait(1500);
  check("R-SHARE-23 Qualität live wechseln, Verbindung bleibt", (await V("window.__share.phase")) === "live" && (await H("window.__share.phase")) === "live");

  // Beenden durch den Zuschauer: Host zurück, Leiste weg, Aufnahme gestoppt
  await V(`document.getElementById("btnEnd").click()`);
  const ended = await until(async () => (await H("window.__share.phase")) === "idle" && !BrowserWindow.getAllWindows().some((x) => x.getTitle() === "Argus Übertragungsleiste"), 10000);
  check("R-SHARE-24 Zuschauer trennt: Host beendet, Leiste verschwindet, Aufnahme aus", ended && (await H("window.__share.stream === null")), { h: await H("window.__share.phase"), msg: await H(`document.getElementById("stageMsg").textContent`) });
  check("R-SHARE-25 Meldung beim Host", /beendet/.test(await H(`document.getElementById("stageMsg").textContent`)), await H(`document.getElementById("stageMsg").textContent`));

  // Ablehnen
  await H(`document.getElementById("btnPrepare").click()`);
  await until(async () => (await H("window.__share.phase")) === "wait" && (await H(`document.getElementById("hostWaitState").dataset.k`)) === "ok");
  const code2 = await H(`document.getElementById("codeOut").textContent`);
  check("R-SHARE-26 jede Übertragung bekommt einen neuen Code", code2 !== code);
  await V(`{ const i = document.getElementById("inCode"); i.value = ${JSON.stringify(code2)}; i.dispatchEvent(new Event("input")); document.getElementById("btnJoin").click() }`);
  await until(() => H(`!document.getElementById("pHostAsk").hidden`));
  await H(`document.getElementById("btnReject").click()`);
  const rej = await until(async () => /abgelehnt/.test(await V(`document.getElementById("err").textContent`)), 8000);
  check("R-SHARE-27 Ablehnen: Zuschauer bekommt Bescheid, Host wartet weiter", rej && (await H("window.__share.phase")) === "wait" && !BrowserWindow.getAllWindows().some((x) => x.getTitle() === "Argus Übertragungsleiste"));
  await H(`document.getElementById("btnCancelHost").click()`); await wait(300);
  for (const x of shareWins()) x.close();
  await wait(500); srv.wss.close();
});
