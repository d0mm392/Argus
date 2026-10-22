// ---------- Eigene Seiten: anlegen, umbenennen, löschen, gestalten (Anordnen-Modus) ----------
const BUILTIN_PAGES = ["Start", "Mining", "Gaming", "Trading"];
let pgMode = "new";
{
  const d = document.createElement("div"); d.className = "t-add"; d.id = "pgDlg"; d.hidden = true;
  d.innerHTML = '<form id="pgForm"><div class="t-add-head"><b id="pgTitle">Neue Seite</b><button type="button" id="pgX" class="t-x2" title="Schließen (Esc)" aria-label="Schließen">×</button></div>' +
    '<p id="pgText" class="t-dim" hidden></p><label id="pgNameL">Name <input id="pgName" type="text" maxlength="16" placeholder="z. B. Büro, Stream, Nacht" spellcheck="false" autocomplete="off"></label>' +
    '<label id="pgFromL">Start mit <select id="pgFrom"><option value="leer">Leer (nur Notizblock)</option><option value="kopie">Kopie dieser Seite</option></select></label>' +
    '<div class="t-add-btns"><button type="button" id="pgCancel" class="btn">Abbrechen</button><button type="submit" id="pgOk" class="btn primary">Anlegen</button></div><small id="pgErr"></small></form>';
  document.body.append(d);
}
const pgSave = () => window.jarvis.setConfig({ customPages, pages, page });
function pgClose() { $("pgDlg").hidden = true; }
function pgDialog(mode) {
  if ((mode === "rename" || mode === "del") && !isCustom(page)) return;
  pgMode = mode; $("pgErr").textContent = ""; $("pgDlg").hidden = false;
  $("pgTitle").textContent = mode === "new" ? "Neue Seite" : mode === "rename" ? "Seite umbenennen" : "Seite löschen";
  $("pgNameL").hidden = mode === "del"; $("pgFromL").hidden = mode !== "new"; $("pgText").hidden = mode !== "del";
  $("pgText").textContent = mode === "del" ? `„${page}“ mit ihrer Anordnung wirklich löschen?` : "";
  $("pgOk").textContent = mode === "new" ? "Anlegen" : mode === "rename" ? "Umbenennen" : "Löschen";
  $("pgName").value = mode === "rename" ? page : ""; if (mode !== "del") $("pgName").focus(); else $("pgOk").focus();
}
function pgTabMenu(x, y) {
  document.getElementById("pgMenu")?.remove();
  const m = document.createElement("div"); m.id = "pgMenu"; m.className = "pg-menu"; m.style.left = Math.min(x, innerWidth - 170) + "px"; m.style.top = y + "px";
  for (const [t, mode] of [["Umbenennen …", "rename"], ["Löschen …", "del"]]) { const b = document.createElement("button"); b.type = "button"; b.textContent = t; b.addEventListener("click", () => { m.remove(); pgDialog(mode); }); m.append(b); }
  document.body.append(m);
  const off = (ev) => { if (!m.contains(ev.target) || ev.type === "keydown") { m.remove(); removeEventListener("pointerdown", off, true); removeEventListener("keydown", off, true); } };
  addEventListener("pointerdown", off, true); addEventListener("keydown", off, true);
}
function pgTabs() {
  const bar = $("pageTabs"); for (const b of [...bar.children]) if (b.dataset.custom || b.id === "pgPlus") b.remove();
  for (const n of customPages) { const b = document.createElement("button"); b.type = "button"; b.dataset.pg = n; b.dataset.custom = "1"; b.textContent = n; b.addEventListener("click", () => switchPage(n)); b.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); if (page !== n) switchPage(n); pgTabMenu(e.clientX, e.clientY); }); bar.append(b); }
  if (customPages.length < 8) { const p = document.createElement("button"); p.type = "button"; p.id = "pgPlus"; p.textContent = "+"; p.title = "Neue Seite anlegen"; p.addEventListener("click", () => pgDialog("new")); bar.append(p); }
  pgRows(); renderPages();
}
function pgRows() {
  const box = $("pgRows"); if (!box) return;
  const SW = { Mining: "setPagesOn", Gaming: "setGamingOn", Trading: "setTradeOn" };
  const row = (n, custom) => { const l = document.createElement("div"); l.className = "row"; const sw = !custom && SW[n] ? $(SW[n]) : null; l.append(n + (custom ? "" : sw ? (sw.checked ? " (sichtbar)" : " (ausgeblendet)") : " (immer da)"));
    if (sw) { const t = document.createElement("button"); t.type = "button"; t.className = "btn"; t.textContent = sw.checked ? "Ausblenden" : "Einblenden"; t.addEventListener("click", () => { sw.checked = !sw.checked; sw.dispatchEvent(new Event("change")); pgRows(); }); l.append(t); }
    if (custom) { const a = document.createElement("button"), b = document.createElement("button"); a.type = b.type = "button"; a.className = b.className = "btn"; a.textContent = "Öffnen"; b.textContent = "Löschen"; a.addEventListener("click", () => switchPage(n)); b.addEventListener("click", () => { if (page !== n) switchPage(n); pgDialog("del"); }); l.append(a, b); } return l; };
  box.replaceChildren(...BUILTIN_PAGES.map((n) => row(n, false)), ...customPages.map((n) => row(n, true)));
}
$("pgForm").addEventListener("submit", (e) => {
  e.preventDefault(); const name = $("pgName").value.trim().replace(/\s+/g, " ");
  if (pgMode === "del") { const old = page; switchPage("Start"); customPages = customPages.filter((x) => x !== old); delete pages[old]; delete pageLooks[old]; window.jarvis.setConfig({ pageLooks }); pgSave(); pgTabs(); pgClose(); return; }
  const bad = !name ? "Bitte einen Namen eingeben." : !/^[^<>"'\\]{1,16}$/.test(name) ? "Name enthält ungültige Zeichen." : BUILTIN_PAGES.concat(customPages).some((x) => x.toLowerCase() === name.toLowerCase() && !(pgMode === "rename" && x === page)) ? "Diesen Namen gibt es schon." : customPages.length >= 8 && pgMode === "new" ? "Mehr als 8 eigene Seiten gehen nicht." : "";
  if (bad) { $("pgErr").textContent = bad; return; }
  if (pgMode === "rename") { const old = page; customPages = customPages.map((x) => x === old ? name : x); pages[name] = pages[old] || snapPage(); delete pages[old]; if (pageLooks[old]) { pageLooks[name] = pageLooks[old]; delete pageLooks[old]; window.jarvis.setConfig({ pageLooks }); } page = name; pgSave(); pgTabs(); pageClasses(); pgClose(); return; }
  const copy = $("pgFrom").value === "kopie"; if (copy) { pages[name] = snapPage(); pageLooks[name] = JSON.parse(JSON.stringify({ ball: ballLook(), win: window.winStyleGet?.() || {}, looks: window.looksGet?.() || {} })); }
  customPages = [...customPages, name]; pgTabs(); pgClose(); switchPage(name); pgSave();
  try { notice("Seite angelegt. Rechtsklick → Anordnen: Fenster einblenden, verschieben, Größe ziehen."); } catch {}
});
$("pgCancel").addEventListener("click", pgClose); $("pgX").addEventListener("click", pgClose);
$("pgDlg").addEventListener("pointerdown", (e) => { if (e.target === $("pgDlg")) pgClose(); });
$("pgDlg").addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") pgClose(); });
$("pgNew")?.addEventListener("click", () => pgDialog("new"));
window.jarvis.getConfig().then((c) => { customPages = Array.isArray(c.customPages) ? c.customPages.filter((x) => typeof x === "string").slice(0, 8) : []; pgTabs(); try { pageClasses(); } catch {} }).catch(() => {});

for (const id of ["setPagesOn", "setGamingOn", "setTradeOn"]) $(id)?.addEventListener("change", () => setTimeout(pgRows, 50));
// Rechtsklick auf einen eingebauten Reiter: ausblenden
for (const b of $("pageTabs").querySelectorAll("button[data-pg]")) {
  const sw = { Mining: "setPagesOn", Gaming: "setGamingOn", Trading: "setTradeOn" }[b.dataset.pg]; if (!sw) continue;
  b.addEventListener("contextmenu", (e) => { e.preventDefault(); document.getElementById("pgMenu")?.remove();
    const m = document.createElement("div"); m.id = "pgMenu"; m.className = "pg-menu"; m.style.left = Math.min(e.clientX, innerWidth - 170) + "px"; m.style.top = e.clientY + "px";
    const t = document.createElement("button"); t.type = "button"; t.textContent = "Seite ausblenden"; t.addEventListener("click", () => { m.remove(); $(sw).checked = false; $(sw).dispatchEvent(new Event("change")); pgRows(); }); m.append(t); document.body.append(m);
    const off = (ev) => { if (!m.contains(ev.target) || ev.type === "keydown") { m.remove(); removeEventListener("pointerdown", off, true); removeEventListener("keydown", off, true); } };
    addEventListener("pointerdown", off, true); addEventListener("keydown", off, true); });
}
