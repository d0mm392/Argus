// Stimmen-Verwaltung: Liste, Download mit Fortschritt, Entfernen, Wechseln, Probe hören, Roboterfilter.
// Gleiche Oberfläche in den Einstellungen (#voiceBox) und im Einrichtungs-Assistenten (#suVoiceBox).
(function () {
  const boxes = () => [...document.querySelectorAll("[data-voicebox]")];
  const SAMPLE = "Hallo, so klinge ich. Alle Systeme laufen.";
  const busy = new Set(); let state = null, msg = "";
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  async function load() { try { state = await window.argus.voiceList(); } catch (e) { state = null; } draw(); }
  function draw() {
    for (const b of boxes()) {
      if (b.contains(document.activeElement) && document.activeElement.tagName === "INPUT") continue; // nicht unter dem Cursor neu zeichnen
      if (!state) { b.textContent = ""; continue; }
      const sv = state.server || {}, srvOn = sv.active;
      let html = "";
      if (state.win) html += state.voices.map((v) => {
        const act = v.installed ? (v.active && !srvOn ? '<b class="vc-on">in Benutzung</b> ' : "") + `<button class="btn" type="button" data-vp="${v.id}">Probe hören</button>` +
          (v.active && !srvOn ? "" : ` <button class="btn" type="button" data-vu="${v.id}">Nehmen</button>`) + (v.active && !srvOn ? "" : ` <button class="btn" type="button" data-vr="${v.id}">Entfernen</button>`)
          : busy.has(v.id) ? `<span class="vc-pr" data-vpr="${v.id}">lädt…</span>` : `<button class="btn" type="button" data-vd="${v.id}">Laden (${v.mb} MB)</button>`;
        return `<div class="vc-row"><span>${esc(v.label)}</span><span class="vc-act">${act}</span></div>`;
      }).join(""); else html += '<div class="set-note">Die eingebauten Stimmen laufen bisher nur unter Windows.</div>';
      html += `<div class="vc-row vc-srv"><span>Eigener Sprachserver (lokal, OpenAI-kompatibel, z. B. für Chatterbox oder XTTS auf der Grafikkarte)</span><span class="vc-act">${srvOn ? '<b class="vc-on">in Benutzung</b> ' : ""}</span></div>` +
        `<div class="vc-srvf"><input type="text" data-srv="url" placeholder="Adresse, z. B. http://127.0.0.1:8000" value="${esc(sv.url)}"><input type="text" data-srv="model" placeholder="Modell (optional)" value="${esc(sv.model)}"><input type="text" data-srv="voice" list="vcVoices" placeholder="Stimme (optional)" value="${esc(sv.voice)}"><datalist id="vcVoices"></datalist>` +
        `<button class="btn" type="button" data-vp="server">Probe hören</button> <button class="btn" type="button" data-vu="server">Nehmen</button></div>`;
      setTimeout(async () => { const dl = document.getElementById("vcVoices"); if (!dl || !sv.url) return; const vs = await window.argus.voiceServerVoices().catch(() => []); dl.replaceChildren(...vs.map((v) => Object.assign(document.createElement("option"), { value: v.id, label: v.label }))); }, 0);
      b.innerHTML = html + `<div class="set-note">${msg ? esc(msg) + "<br>" : ""}Speicherort: ${esc(state.dir)}${state.runtime ? "" : " (Sprach-Programm wird beim ersten Laden mit geholt, rund 20 MB)"}</div>`;
    }
  }
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("button"); if (!t || !t.closest("[data-voicebox]")) return;
    const d = t.dataset;
    if (d.vd) { // mehrere Downloads laufen gleichzeitig, jeder mit eigenem Fortschritt
      busy.add(d.vd); msg = ""; draw();
      window.argus.voiceInstall(d.vd).then(async (r) => { busy.delete(d.vd); if (!r.ok) msg = "Download fehlgeschlagen (" + d.vd + "): " + (r.error || "unbekannt"); else if (!state.voices.some((v) => v.installed)) await window.argus.voiceUse(d.vd); await load(); });
    }
    else if (d.vu) { const ok = await window.argus.voiceUse(d.vu); msg = ok ? "" : "Das geht nicht: Adresse des Sprachservers fehlt oder ist nicht lokal."; await load(); }
    else if (d.vr) { await window.argus.voiceRemove(d.vr); await load(); }
    else if (d.vp && typeof speakPiper === "function") { msg = ""; const ok = await speakPiper(SAMPLE, () => {}, d.vp); if (!ok) { msg = "Probe nicht möglich (Stimme fehlt, Server nicht erreichbar oder Sprach-Programm startet nicht)."; draw(); } }
  });
  document.addEventListener("change", (e) => {
    const i = e.target.closest?.("[data-srv]"); if (!i) return;
    const k = { url: "voiceServer", model: "voiceServerModel", voice: "voiceServerVoice" }[i.dataset.srv];
    window.argus.setConfig({ [k]: i.value.trim() }).then(load);
  });
  window.argus.onVoiceProgress?.((m) => { for (const el of document.querySelectorAll('[data-vpr="' + m.id + '"]')) el.textContent = m.pct + " %"; });
  for (const id of ["setVoiceRobot", "suVoiceRobot"]) document.getElementById(id)?.addEventListener("change", (e) => {
    window.voiceRobot = e.target.checked; window.argus.setConfig({ voiceRobot: e.target.checked });
    for (const o of ["setVoiceRobot", "suVoiceRobot"]) { const x = document.getElementById(o); if (x) x.checked = e.target.checked; }
  });
  window.argus.getConfig().then((c) => { window.voiceRobot = !!c.voiceRobot; for (const o of ["setVoiceRobot", "suVoiceRobot"]) { const x = document.getElementById(o); if (x) x.checked = window.voiceRobot; } }).catch(() => {});
  document.getElementById("settings")?.addEventListener("transitionend", () => {});
  new MutationObserver(() => { if (!document.getElementById("settings").hidden) load(); }).observe(document.getElementById("settings"), { attributes: true, attributeFilter: ["hidden"] });
  new MutationObserver(() => { if (document.getElementById("setup")?.querySelector('.su-step.on[data-step="4"]')) load(); }).observe(document.getElementById("setup") || document.body, { attributes: true, subtree: true, attributeFilter: ["class"] });
  load();
})();
