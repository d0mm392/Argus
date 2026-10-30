// Tagesbriefing: Karte (verschiebbar nicht nötig, × / Esc / Schließen) und Sprache. Text kommt aus briefing.js im Hauptprozess.
window.runBriefing = async function (pre) {
  const b = pre || (await window.jarvis.briefBuild().catch(() => null));
  if (!b) return;
  document.getElementById("briefCard")?.remove();
  const el = document.createElement("div");
  el.id = "briefCard"; el.className = "brief-card"; el.setAttribute("role", "dialog");
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  el.innerHTML = `<button class="brief-x" type="button" aria-label="Schließen" title="Schließen">×</button><h3>${esc(b.title)}</h3>` +
    b.cards.map((c) => `<div class="brief-row"><b>${esc(c[0])}</b><span>${esc(c[1])}</span></div>`).join("") +
    `<div class="brief-btns"><button class="btn" type="button" data-a="say">Nochmal vorlesen</button><button class="btn" type="button" data-a="stop">Abbrechen</button></div>`;
  document.body.appendChild(el);
  const close = () => { el.remove(); document.removeEventListener("keydown", onKey, true); try { stopSpeaking(); } catch {} };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey, true);
  const say = () => { if (typeof speak === "function") speak(b.speech, () => {}); };
  el.querySelector(".brief-x").onclick = close;
  el.querySelector("[data-a=stop]").onclick = close;
  el.querySelector("[data-a=say]").onclick = say;
  say();
};
window.jarvis.onBrief?.((b) => window.runBriefing(b));
document.getElementById("briefBtn")?.addEventListener("click", () => window.runBriefing());
(function () {
  const on = document.getElementById("setBriefOn"); if (!on) return;
  const time = document.getElementById("setBriefTime"), len = document.getElementById("setBriefLen"), parts = document.querySelectorAll("[data-bp]");
  window.jarvis.getConfig().then((c) => {
    on.checked = !!c.briefOn; time.value = c.briefTime || "08:00"; len.value = c.briefLen || "short";
    parts.forEach((p) => { p.checked = c.briefParts?.[p.dataset.bp] !== false && true; });
  }).catch(() => {});
  const save = () => window.jarvis.setConfig({ briefOn: on.checked, briefTime: time.value || "08:00", briefLen: len.value, briefParts: Object.fromEntries([...parts].map((p) => [p.dataset.bp, p.checked])) });
  [on, time, len, ...parts].forEach((x) => x.addEventListener("change", save));
  document.getElementById("setBriefTest")?.addEventListener("click", () => window.runBriefing());
})();
