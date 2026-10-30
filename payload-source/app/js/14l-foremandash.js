"use strict";
// Foreman-Dashboard: Schalter, Anmelde-Knopf und Statuszeile in den Einstellungen
(() => {
  const msg = $("setFmDashMsg"), on = $("setFmDashOn");
  const TXT = { off: "", wait: "Warte auf die erste Abfrage …", login: "Bitte im Foreman-Fenster anmelden.", err: "Abfrage fehlgeschlagen" };
  const show = async () => { const d = await window.jarvis.fmDashData().catch(() => null); if (!d || !msg) return;
    msg.textContent = d.state === "ok" ? `${d.count} Miner gelesen, zusammen ${(d.watt / 1000).toFixed(1)} kW` + (d.px ? `. Pickaxes online/gesamt: ${d.px}` : "") : (TXT[d.state] || "") + (d.state === "err" && d.err ? `: ${d.err}` : ""); };
  on.addEventListener("change", (e) => { window.jarvis.setConfig({ fmDashOn: e.target.checked }); setTimeout(show, 1500); });
  $("setFmDashLogin").addEventListener("click", async () => { const r = await window.jarvis.fmDashLogin().catch(() => ({ ok: false })); if (msg) msg.textContent = r?.ok ? "Fenster geöffnet. Dort anmelden, danach schließen." : "Konnte das Fenster nicht öffnen."; });
  window.jarvis.getConfig().then((c) => { on.checked = !!c.fmDashOn; show(); }).catch(() => {});
  setInterval(show, 30000);
})();
