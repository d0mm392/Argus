// YouTube in Argus ohne Werbung, nach dem Vorbild von Brave/uBlock: Werbefelder aus den Player-Daten entfernen,
// bevor YouTubes eigenes Skript sie sieht (json-prune). Was trotzdem durchrutscht, wird stumm übersprungen.
// Läuft per webFrame in der Seite selbst (die Sicherheitsregeln von YouTube verbieten eingeschleuste <script>-Tags).
const { webFrame } = require("electron");
webFrame.executeJavaScript(`(() => {
  if (window.__jarvisNoAds) return; window.__jarvisNoAds = true;
  const KEYS = ["adPlacements", "adSlots", "playerAds", "adBreakHeartbeatParams"];
  const prune = (o) => {
    if (!o || typeof o !== "object") return o;
    for (const k of KEYS) if (k in o) try { delete o[k]; } catch {}
    if (o.playerResponse && typeof o.playerResponse === "object") prune(o.playerResponse);
    return o;
  };
  // Startdaten der Seite (ytInitialPlayerResponse) und alle später nachgeladenen Antworten
  let ipr;
  try { Object.defineProperty(window, "ytInitialPlayerResponse", { configurable: true, get: () => ipr, set: (v) => { ipr = prune(v); } }); } catch {}
  const jp = JSON.parse; JSON.parse = function () { return prune(jp.apply(this, arguments)); };
  const rj = Response.prototype.json; Response.prototype.json = function () { return rj.call(this).then(prune); };
  // Notbremse: läuft doch eine Werbung, stumm schalten, ans Ende springen, „Überspringen“ drücken
  let muted = false;
  setInterval(() => {
    const p = document.querySelector("#movie_player"), v = p && p.querySelector("video");
    if (!p || !v) return;
    if (p.classList.contains("ad-showing") || p.classList.contains("ad-interrupting")) {
      if (!v.muted) { v.muted = true; muted = true; }
      if (isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration;
      const s = document.querySelector(".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern"); if (s) s.click();
    } else if (muted) { v.muted = false; muted = false; }
    // Hinweis „Werbeblocker sind nicht erlaubt“: schließen und weiterspielen
    const d = document.querySelector("ytd-enforcement-message-view-model");
    if (d) { const box = d.closest("tp-yt-paper-dialog"); if (box) box.remove(); document.querySelector("tp-yt-iron-overlay-backdrop")?.remove(); if (v.paused) v.play().catch(() => {}); }
  }, 250);
})();`);
