"use strict";
// ---------- Smart Home (ioBroker): ausgewählte Datenpunkte als Kacheln, Auswahl aus dem Objektbaum ----------
let iobPick = [], iobLast = null, iobHasPass = false, iobArm = "";
const iobFmt = (it) => {
  const v = it.val; if (v == null) return "–";
  if (typeof v === "boolean") return v ? "an" : "aus";
  if (typeof v === "number") return v.toLocaleString("de-DE", { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 }) + (it.unit ? " " + it.unit : "");
  return String(v).slice(0, 40) + (it.unit ? " " + it.unit : "");
};
const IOB_CRIT = /alarm|lock|door|garage|window|siren/i;
function iobRender(d) {
  iobLast = d; const b = $("iobBody"), st = $("iobState"); if (!b) return;
  const out = [], dim = (t) => { const m = document.createElement("div"); m.className = "t-dim"; m.textContent = t; return m; };
  if (!d || d.state === "off") { out.push(dim("Aus. Einschalten unter Einstellungen, Smart Home.")); st.textContent = ""; }
  else if (d.state === "nohost" || d.state === "login" || d.state === "err" || (d.state === "wait" && !d.items?.length)) {
    out.push(dim(d.state === "wait" ? "Verbinde …" : d.err || "Keine Verbindung.")); st.textContent = d.state === "wait" ? "verbindet" : d.state === "login" ? "Anmeldung" : "keine Verbindung"; st.dataset.health = d.state === "wait" ? "ok" : "warn";
  } else {
    if (!d.items.length) out.push(dim("Noch nichts ausgewählt. Mit „+ Datenpunkt“ Geräte und Werte aus ioBroker hinzufügen."));
    for (const it of d.items) {
      const e = document.createElement("div"); e.className = "t-kpi iob-t"; const s = document.createElement("small"), bb = document.createElement("b");
      s.textContent = it.name; s.title = it.id; bb.textContent = iobFmt(it); if (typeof it.val === "boolean") bb.classList.add(it.val ? "on" : "off");
      if (it.write && it.type === "boolean") { e.classList.add("sw"); e.title = "Klick: umschalten"; e.addEventListener("click", () => iobToggle(it, e, bb)); }
      const x = document.createElement("button"); x.type = "button"; x.className = "iob-x"; x.textContent = "×"; x.title = "Kachel entfernen"; x.setAttribute("aria-label", "Entfernen");
      x.addEventListener("click", (ev) => { ev.stopPropagation(); iobPick = iobPick.filter((p) => p.id !== it.id); window.jarvis.setConfig({ iobPick }); iobRender({ ...d, items: d.items.filter((q) => q.id !== it.id) }); });
      e.append(s, bb, x); out.push(e);
    }
    st.textContent = d.ts ? "Stand " + new Date(d.ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : ""; st.dataset.health = "ok";
  }
  b.replaceChildren(...out); iobMsg(d); if (d?.state === "ok" && !$("iobAllBody").dataset.mode) iobAllRender(true);
}
// „Alle Datenpunkte“: Adapter → Gerät → Werte, eingeklappt, Zeilen nur für aufgeklappte Geräte
let iobAllOn = false; const iobOpen = new Set();
const iobRow = (it) => {
  const r = document.createElement("div"); r.className = "iob-r"; const n = document.createElement("span"), v = document.createElement("b"); n.textContent = it.name; n.title = it.id; v.textContent = iobFmt(it);
  if (typeof it.val === "boolean") v.classList.add(it.val ? "on" : "off");
  if (it.write && it.type === "boolean") { r.classList.add("sw"); r.title = "Klick: umschalten"; r.addEventListener("click", async () => { if (!(await iobToggle(it, r, v))) return; it.val = !it.val; v.textContent = iobFmt(it); v.className = it.val ? "on" : "off"; }); }
  r.append(n, v); return r;
};
const iobDet = (key, label, fill) => { const d = document.createElement("details"); d.dataset.k = key; const s = document.createElement("summary"); s.textContent = label; d.append(s); d.open = iobOpen.has(key); if (d.open) fill(d); d.addEventListener("toggle", () => { if (d.open) { iobOpen.add(key); if (d.children.length < 2) fill(d); } else iobOpen.delete(key); }); return d; };
async function iobFillAdapter(d) {
  const key = d.dataset.k, items = await window.jarvis.iobGroup(key).catch(() => []), devs = new Map();
  for (const it of items) { const rest = it.id.slice(key.length + 1).split("."), dev = rest.length > 1 ? rest.slice(0, -1).join(".") : "(allgemein)"; (devs.get(dev) || devs.set(dev, []).get(dev)).push(it); }
  const wrap = document.createElement("div"); wrap.className = "iob-dev";
  for (const [dev, arr] of devs) wrap.append(iobDet(key + "|" + dev, dev + " (" + arr.length + ")", (dd) => { const b = document.createElement("div"); b.className = "iob-rows"; for (const it of arr) b.append(iobRow({ ...it, write: it.write && iobLast?.write })); dd.append(b); }));
  d.querySelector(".iob-dev")?.remove(); d.append(wrap);
}
async function iobAllRender(force) {
  const box = $("iobAllBox"); if (!box) return; box.hidden = !(iobOn && iobAllOn && iobLast?.state === "ok"); if (box.hidden) return;
  const q = $("iobAllQ").value.trim(), body = $("iobAllBody");
  if (q) { const res = await window.jarvis.iobBrowse(q).catch(() => []); body.dataset.mode = "search"; body.replaceChildren(...res.map((o) => iobRow({ ...o, write: o.write && iobLast?.write }))); if (!res.length) body.textContent = "Nichts gefunden."; return; }
  if (!force && body.dataset.mode === "tree") { for (const d of body.querySelectorAll(":scope > details[open]")) await iobFillAdapter(d); return; } // nur offene Adapter auffrischen
  const tree = await window.jarvis.iobTree().catch(() => []); body.dataset.mode = "tree";
  body.replaceChildren(...tree.map((t) => iobDet(t.key, t.key + " (" + t.n + ")", (d) => iobFillAdapter(d))));
}
$("iobAllQ").addEventListener("input", () => { $("iobAllBody").dataset.mode = ""; clearTimeout(iobQT); iobQT = setTimeout(() => iobAllRender(true), 250); });
setInterval(() => { if (iobOn && iobAllOn && !document.hidden && !$("iobAllQ").value) iobAllRender(false); }, 5000);
async function iobToggle(it, el, bb) {
  if (IOB_CRIT.test(it.id + " " + it.role) && iobArm !== it.id) { iobArm = it.id; bb.textContent = "Wirklich?"; setTimeout(() => { if (iobArm === it.id) { iobArm = ""; bb.textContent = iobFmt(it); } }, 3000); return false; }
  iobArm = ""; const r = await window.jarvis.iobSet(it.id, !it.val).catch(() => ({ ok: false }));
  if (!r?.ok) try { notice(r?.reason || "Schalten nicht möglich."); } catch {}
  return !!r?.ok;
}
function iobMsg(d) {
  const m = $("setIobMsg"); if (!m) return;
  m.textContent = !d || d.state === "off" ? "" : d.state === "ok" ? `Verbunden, ${d.objCount} Datenpunkte gefunden.` : d.state === "wait" ? "Verbinde …" : d.err || "";
}
// Auswahl-Dialog
{
  const dlg = document.createElement("div"); dlg.className = "t-add"; dlg.id = "iobDlg"; dlg.hidden = true;
  dlg.innerHTML = '<form id="iobForm" class="iob-form"><div class="t-add-head"><b>Datenpunkte auswählen</b><button type="button" id="iobX" class="t-x2" title="Schließen (Esc)" aria-label="Schließen">×</button></div>' +
    '<label>Suchen (Name, Raum oder Adresse) <input id="iobQ" type="text" spellcheck="false" autocomplete="off" placeholder="z. B. Wohnzimmer Temperatur"></label><div id="iobList" class="iob-list"></div>' +
    '<div class="t-add-btns"><button type="button" id="iobCancel" class="btn">Abbrechen</button><button type="button" id="iobOk" class="btn primary">Fertig</button></div></form>';
  document.body.append(dlg);
}
const iobClose = () => { $("iobDlg").hidden = true; };
let iobQT = null;
async function iobSearch() {
  const q = $("iobQ").value, res = await window.jarvis.iobBrowse(q).catch(() => []), box = $("iobList"), out = [];
  if (!res.length) { const m = document.createElement("div"); m.className = "t-dim"; m.textContent = iobLast?.state === "ok" ? "Nichts gefunden." : "Noch keine Verbindung zu ioBroker."; out.push(m); }
  for (const o of res) {
    const l = document.createElement("label"); l.className = "iob-row"; const c = document.createElement("input"); c.type = "checkbox"; c.checked = iobPick.some((p) => p.id === o.id);
    c.addEventListener("change", () => { iobPick = c.checked ? [...iobPick, { id: o.id, label: o.name, role: o.role, type: o.type, unit: o.unit }].slice(0, 60) : iobPick.filter((p) => p.id !== o.id); window.jarvis.setConfig({ iobPick }); });
    const t = document.createElement("span"); const n = document.createElement("b"), a = document.createElement("small"); n.textContent = o.name; a.textContent = o.id + (o.role ? " · " + o.role : ""); t.append(n, a); l.append(c, t); out.push(l);
  }
  box.replaceChildren(...out);
}
$("iobAdd").addEventListener("click", () => { $("iobDlg").hidden = false; $("iobQ").value = ""; $("iobQ").focus(); iobSearch(); });
$("iobQ").addEventListener("input", () => { clearTimeout(iobQT); iobQT = setTimeout(iobSearch, 200); });
$("iobX").addEventListener("click", iobClose); $("iobCancel").addEventListener("click", iobClose); $("iobOk").addEventListener("click", iobClose);
$("iobDlg").addEventListener("pointerdown", (e) => { if (e.target === $("iobDlg")) iobClose(); });
$("iobDlg").addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") iobClose(); });
// Einstellungen
function iobPageEnsure() {
  if (isCustom("Smart Home") || BUILTIN_PAGES.includes("Smart Home") || customPages.length >= 8) return;
  customPages = [...customPages, "Smart Home"];
  pages["Smart Home"] = { panelLayout: {}, hiddenBlocks: BLOCKS.map(([id]) => id).filter((id) => id !== "iob" && id !== "notice"), pins: {}, scales: {} };
  pgTabs(); pgSave(); try { switchPage("Smart Home"); } catch {}
}
const iobApply = () => { $("iob").hidden = !iobOn; try { applyHidden(); } catch {} };
$("setIobOn").addEventListener("change", (e) => { iobOn = e.target.checked; window.jarvis.setConfig({ iobOn }); if (iobOn) iobPageEnsure(); iobApply(); setTimeout(iobPoll, 1500); });
$("setIobUrl").addEventListener("change", (e) => window.jarvis.setConfig({ iobUrl: e.target.value.trim() }));
$("setIobUser").addEventListener("change", (e) => window.jarvis.setConfig({ iobUser: e.target.value.trim() }));
$("setIobPass").addEventListener("change", (e) => { if (e.target.value) { window.jarvis.setConfig({ iobPass: e.target.value }); iobHasPass = true; e.target.value = ""; e.target.placeholder = "gespeichert"; } });
$("setIobAll").addEventListener("change", (e) => { iobAllOn = e.target.checked; window.jarvis.setConfig({ iobAll: iobAllOn }); $("iobAllBody").dataset.mode = ""; setTimeout(() => iobAllRender(true), 3000); });
$("setIobWrite").addEventListener("change", (e) => window.jarvis.setConfig({ iobWrite: e.target.checked }));
async function iobPoll() { try { iobRender(await window.jarvis.iobData()); } catch {} }
window.jarvis.onIob?.(iobRender);
setInterval(() => { if (iobOn && !document.hidden) iobPoll(); }, 60000);
window.jarvis.getConfig().then((c) => {
  iobOn = !!c.iobOn; iobPick = Array.isArray(c.iobPick) ? c.iobPick : []; iobHasPass = !!c.hasIobPass;
  $("setIobOn").checked = iobOn; $("setIobUrl").value = c.iobUrl || ""; $("setIobUser").value = c.iobUser || ""; $("setIobWrite").checked = !!c.iobWrite; iobAllOn = c.iobAll !== false; $("setIobAll").checked = iobAllOn; if (iobHasPass) $("setIobPass").placeholder = "gespeichert";
  iobApply(); if (iobOn) iobPoll();
}).catch(() => {});
