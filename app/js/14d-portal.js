// ---------- Hosting-Portal: Miner-Zähler (nur lesend, Anmeldung im eigenen Fenster) ----------
let portalAt = 0;
const portalLabel = { working: "läuft", broken: "defekt", stopped: "gestoppt", offline: "offline", online: "online" };
function portalRender(d) {
  const b = $("portalBody"), st = $("portalState"), kp = (k, v, sub) => { const e = document.createElement("div"); e.className = "t-kpi"; const s = document.createElement("small"), bb = document.createElement("b"); s.textContent = k; bb.textContent = v; e.append(s, bb); if (sub) { const x = document.createElement("span"); x.textContent = sub; e.append(x); } return e; };
  const out = [];
  window.portalSnap = d; portalLast = d.total ? d : null; try { renderMOver(); } catch {}
  if (d.state === "wait" && !d.total) { const m = document.createElement("div"); m.className = "t-dim"; m.textContent = "Lade Miner …"; b.replaceChildren(m); st.textContent = "lädt"; st.dataset.health = "ok"; return; }
  if (d.state === "login" || (!d.total && d.state !== "ok")) {
    const m = document.createElement("div"); m.className = "t-dim"; m.textContent = d.state === "off" ? "Aus. Einschalten unter Einstellungen → Mining." : (d.err || "Nicht angemeldet.");
    out.push(m); if (d.state !== "off" && d.state !== "nohost") { const a = document.createElement("button"); a.type = "button"; a.className = "btn"; a.textContent = "Anmelden"; a.addEventListener("click", () => { window.jarvis.portalLogin(); }); out.push(a); }
    st.textContent = d.state === "off" ? "" : d.state === "nohost" ? "Adresse fehlt" : "bitte anmelden"; st.dataset.health = "warn";
  } else {
    out.push(kp("Miner", String(d.total), d.locations ? d.locations + " Standorte" : ""));
    for (const s of d.states || []) out.push(kp(portalLabel[s.k] || s.k, String(s.n), d.total ? (s.n / d.total * 100).toFixed(1).replace(".", ",") + " %" : ""));
    if (d.hashrate != null) out.push(kp("Hashrate", typeof d.hashrate === "number" ? d.hashrate.toLocaleString("de-DE") : String(d.hashrate)));
    for (const m of d.models || []) out.push(kp(m.name, String(m.n)));
    st.textContent = (d.err ? "Fehler, Stand " : "Stand ") + new Date(d.ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); st.dataset.health = d.err ? "warn" : "ok";
  }
  b.replaceChildren(...out);
}
async function portalTick() {
  if (!portalOn || Date.now() - portalAt < (portalLast ? 20000 : 4000)) return; portalAt = Date.now();
  try { portalRender(await window.jarvis.portalData()); } catch {}
}
setInterval(portalTick, 5000);
$("setPortalOn").addEventListener("change", (e) => { portalOn = e.target.checked; window.jarvis.setConfig({ portalOn }); portalAt = 0; setTimeout(portalTick, 800); applyPortal(); });
const portalOpen = async () => { const r = await window.jarvis.portalLogin().catch(() => ({ ok: false, reason: "Fehler" })); const m = $("setPortalMsg"); if (m) m.textContent = r?.ok ? "Portal-Fenster geöffnet. Dort anmelden, es schließt sich danach von selbst." : (r?.reason || "Fenster lässt sich nicht öffnen."); if (r && !r.ok && /Adresse/.test(r.reason || "")) { $("setPortalUrl")?.scrollIntoView?.({ block: "center" }); $("setPortalUrl")?.focus(); } };
$("setPortalLogin").addEventListener("click", portalOpen);
function applyPortal() { $("portal").hidden = !portalOn; try { applyHidden(); } catch {} }
$("setPortalUrl").addEventListener("change", (e) => { window.jarvis.setConfig({ portalUrl: e.target.value.trim() }); portalAt = 0; setTimeout(portalTick, 1500); });
window.jarvis.getConfig().then((c) => { $("setPortalUrl").value = c.portalUrl || ""; portalOn = !!c.portalOn; $("setPortalOn").checked = portalOn; applyPortal(); }).catch(() => {});
