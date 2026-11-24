// Absturz-Bremse für YouTube in Argus (0.59.4).
// Bringt ein Video den Grafik- oder Seitenprozess zum Absturz, darf Argus es beim nächsten Start nicht wieder von selbst laden,
// sonst stürzt Argus bei jedem Start erneut ab. Vor dem Laden eines Videos wird es als „lädt“ vermerkt (ytLoading), nach
// stabiler Wiedergabe wieder gelöscht. Steht der Vermerk beim Start noch da, ist Argus mit genau diesem Video abgestürzt.
(function (root) {
  "use strict";
  const HOME = "https://www.youtube.com/";
  const KEEP = 20, STABLE_MS = 30e3;
  // Ein Video eindeutig erkennen, egal ob mit Zeitmarke, Playlist oder als Short/Live
  function key(url) {
    try {
      const u = new URL(url);
      if (u.hostname === "youtu.be") return u.pathname.slice(1, 12) || null;
      if (!/(^|\.)youtube\.com$/i.test(u.hostname)) return null;
      if (u.pathname === "/watch") return u.searchParams.get("v") || null;
      const m = u.pathname.match(/^\/(shorts|live|embed)\/([\w-]{6,})/);
      return m ? m[2] : null;
    } catch { return null; }
  }
  const list = (config) => (Array.isArray(config?.ytBad) ? config.ytBad.filter((x) => typeof x === "string") : []);
  const isBad = (config, url) => { const k = key(url); return !!k && list(config).includes(k); };
  // Beim Start: Was muss an den Einstellungen geändert werden? unclean = der letzte Lauf endete nicht regulär
  function startup(config = {}, unclean = false) {
    const patch = {}, loading = config.ytLoading && typeof config.ytLoading.url === "string" ? config.ytLoading.url : "";
    let bad = null, reason = "";
    if (loading) {
      bad = loading; reason = "video";
      const k = key(loading);
      if (k) patch.ytBad = [k, ...list(config).filter((x) => x !== k)].slice(0, KEEP);
    } else if (unclean && key(config.ytLast?.url)) reason = "unclean";
    if (config.ytLoading !== undefined && config.ytLoading !== null) patch.ytLoading = null;
    // Nach einem Absturz YouTube nicht von selbst öffnen und nicht mitten im letzten Video weitermachen
    if (reason) { patch.ytLast = null; if (config.ytOpen === "panel") patch.ytOpen = ""; }
    return { patch, bad, reason };
  }
  // Wiederaufnahme: ein als Absturzursache bekanntes Video nie automatisch laden
  const resume = (config, url) => (url && isBad(config, url) ? HOME : url);
  // Vom Nutzer bewusst erneut geöffnet und stabil gelaufen: wieder freigeben
  const release = (config, url) => { const k = key(url); return k ? list(config).filter((x) => x !== k) : list(config); };
  const api = { key, isBad, startup, resume, release, HOME, STABLE_MS };
  if (typeof module === "object" && module.exports) module.exports = api; else root.argusYoutubeGuard = api;
})(globalThis);
