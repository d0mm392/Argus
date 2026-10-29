"use strict";
// Oberfläche wählen (beide Modi) und Apple-Modus-Shell (nur bei html[data-ui="apple"]).
// Die Shell erfindet keine Funktionen: Sidebar, App-Menü und Titel lösen die vorhandenen Knöpfe und Seiten-Reiter aus,
// sodass Seitenwechsel, Seitenmenüs, YouTube, Twitch, Strata und Fensterknöpfe dieselbe Logik wie in Klassisch nutzen.
(() => {
  const root = document.documentElement, apple = root.dataset.ui === "apple";
  const label = (m) => (m === "apple" ? "Apple-Modus" : "Klassisch");

  // ---------- Einstellung "Oberfläche" (Aussehen) ----------
  const sel = $("setUiMode"), apply = $("setUiApply"), note = $("setUiNote"), solid = $("setUiReduceTransparency");
  let active = apple ? "apple" : "klassisch";
  const applySolid = (on) => root.classList.toggle("ap-solid", !!on);
  const update = () => {
    apply.disabled = sel.value === active;
    note.textContent = sel.value === active ? `Aktiv: ${label(active)}.`
      : `Wechsel zu „${label(sel.value)}“: Argus speichert zuerst alles und startet dann neu. Zurück geht es jederzeit hier oder im Tray-Menü.`;
  };
  sel.addEventListener("change", update);
  solid.addEventListener("change", () => { applySolid(solid.checked); window.jarvis.setConfig({ uiReduceTransparency: solid.checked }); });
  apply.addEventListener("click", async () => {
    apply.disabled = true; note.textContent = "Speichere und starte neu …";
    try { if (typeof nFlush === "function") nFlush(true); } catch {} // Notizen sofort sichern (zusätzlich zu beforeunload)
    let r; try { r = await window.jarvis.uiModeSwitch(sel.value); } catch (e) { r = { ok: false, text: String(e?.message || e) }; }
    if (!r?.ok) { update(); note.textContent = r?.text || "Der Wechsel ist gerade nicht möglich."; }
  });
  const cfgReady = window.jarvis.getConfig().then((c) => {
    active = c.uiMode === "apple" ? "apple" : "klassisch"; sel.value = c.uiConfigured === "apple" ? "apple" : active;
    solid.checked = !!c.uiReduceTransparency; applySolid(c.uiReduceTransparency); update();
    if (c.uiFallback) try { notice?.("Der Apple-Modus ist beim letzten Start nicht geladen. Argus läuft wieder in Klassisch, deine Daten sind unverändert."); } catch {}
    return true;
  });
  cfgReady.catch(() => {});

  if (!apple) return;

  // ---------- Apple-Modus ----------
  const NS = "http://www.w3.org/2000/svg";
  const icon = (d) => { const s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.7"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true");
    for (const p of d.split("|")) { const e = document.createElementNS(NS, "path"); e.setAttribute("d", p); s.append(e); } return s; };
  const ICONS = { Start: "M4 11l8-7 8 7|M6 10v10h12V10", Mining: "M5 19l9-9|M13 4l7 7|M11 6l3-3 7 7-3 3", Gaming: "M7 9h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.4 1.8L14 14h-4l-1.6 1.8A3 3 0 0 1 3 14v-1a4 4 0 0 1 4-4z|M8 11v3|M6.5 12.5h3",
    Trading: "M4 19h16|M6 15l4-4 3 3 5-6", custom: "M7 3h7l4 4v14H7z|M14 3v4h4", add: "M12 6v12|M6 12h12", side: "M4 5h16v14H4z|M9 5v14", chev: "M6 9l6 6 6-6" };
  const bar = document.querySelector(".bar"), brand = bar.querySelector(".brand"), tabs = $("pageTabs"), shell = document.querySelector(".shell");
  const btn = (id, cls, text, d, title) => { const b = document.createElement("button"); b.type = "button"; b.id = id; b.className = cls; if (d) b.append(icon(d)); if (text) { const t = document.createElement("b"); t.textContent = text; b.append(t); } if (title) { b.title = title; b.setAttribute("aria-label", title); } return b; };

  // Toolbar: Sidebar ein/aus, App-Menü, Seitentitel
  const sideBtn = btn("apSideBtn", "ap-tb", "", ICONS.side, "Seitenleiste ein- oder ausblenden");
  const appBtn = btn("apAppBtn", "ap-tb", "Argus", "", "Argus-Menü"); appBtn.append(icon(ICONS.chev)); appBtn.setAttribute("aria-haspopup", "menu"); appBtn.setAttribute("aria-expanded", "false");
  const title = document.createElement("span"); title.id = "apTitle"; title.setAttribute("aria-live", "polite");
  brand.prepend(sideBtn, appBtn, title);

  // App-Menü: dieselben Befehle wie die Toolbar und die Fensterknöpfe (HIG: jede Toolbar-Aktion auch als Menübefehl)
  const menu = document.createElement("div"); menu.id = "apAppMenu"; menu.setAttribute("role", "menu"); menu.hidden = true;
  const ITEMS = [["Einstellungen …", "settingsBtn", "Strg+,"], null, ["YouTube", "ytBtn"], ["Twitch", "twBtn"], ["Strata ein/aus", "strataBtn"], null,
    ["Zur Kugel verkleinern", "collapseBtn", "Esc"], ["Ausblenden", "minBtn", "Strg+Umschalt+J"], ["Maximieren / Wiederherstellen", "fullBtn"], null, ["Argus beenden", "closeBtn"]];
  for (const it of ITEMS) {
    if (!it) { menu.append(document.createElement("hr")); continue; }
    const [text, target, kbd] = it; const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "menuitem"); b.dataset.target = target;
    const s = document.createElement("span"); s.textContent = text; b.append(s); if (kbd) { const k = document.createElement("kbd"); k.textContent = kbd; b.append(k); }
    b.addEventListener("click", () => { closeMenu(); $(target)?.click(); }); menu.append(b);
  }
  bar.append(menu);
  const items = () => [...menu.querySelectorAll("button")];
  function openMenu() { menu.hidden = false; appBtn.setAttribute("aria-expanded", "true"); items()[0]?.focus(); addEventListener("pointerdown", outside, true); }
  function closeMenu(focusBack) { if (menu.hidden) return; menu.hidden = true; appBtn.setAttribute("aria-expanded", "false"); removeEventListener("pointerdown", outside, true); if (focusBack) appBtn.focus(); }
  const outside = (e) => { if (!menu.contains(e.target) && e.target !== appBtn && !appBtn.contains(e.target)) closeMenu(); };
  appBtn.addEventListener("click", () => (menu.hidden ? openMenu() : closeMenu()));
  menu.addEventListener("keydown", (e) => {
    const l = items(), i = l.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); l[(i + (e.key === "ArrowDown" ? 1 : l.length - 1)) % l.length].focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    else if (e.key === "Home" || e.key === "End") { e.preventDefault(); l[e.key === "Home" ? 0 : l.length - 1].focus(); }
  });

  // Sidebar ein/aus (bleibt als Bequemlichkeit in diesem Profil gemerkt)
  const SIDE_KEY = "argus.apple.sidebar";
  const setSide = (on) => { root.classList.toggle("ap-noside", !on); sideBtn.setAttribute("aria-pressed", String(on)); try { localStorage.setItem(SIDE_KEY, on ? "1" : "0"); } catch {} };
  let sideOn = true; try { sideOn = localStorage.getItem(SIDE_KEY) !== "0"; } catch {}
  setSide(sideOn); sideBtn.addEventListener("click", () => setSide(root.classList.contains("ap-noside")));

  // Sidebar: spiegelt die vorhandenen Seiten-Reiter; Klick und Rechtsklick gehen an den Reiter selbst
  const side = document.createElement("nav"); side.id = "apSide"; side.setAttribute("aria-label", "Seiten");
  const main = document.createElement("main"); main.id = "apMain"; main.setAttribute("aria-label", "Inhalt");
  const pageH = document.createElement("h1"); pageH.id = "apPageH"; // für Screenreader; sichtbar ist der Titel in der Toolbar
  shell.insertBefore(side, bar.nextSibling); shell.insertBefore(main, side.nextSibling);
  // Assistent-Karte: Kugel links, Gespräch rechts. Verschoben werden nur vorhandene Elemente; IDs, Ereignisse und Sichtbarkeit bleiben.
  const assist = document.createElement("section"); assist.id = "apAssist"; assist.setAttribute("aria-label", "Assistent");
  const chat = document.createElement("div"); chat.className = "ap-chat";
  main.append(pageH, assist, document.querySelector(".panel")); assist.append($("stage"), chat);
  for (const id of ["proc", "notice", "transcript", "askForm"]) { const el = $(id); if (el) chat.append(el); }
  // Seiten blenden Teile über die Klasse "gone" aus (applyHidden). Die Karte folgt: ohne Gespräch nur Kugel, ohne Kugel nur Gespräch.
  const stage = $("stage");
  const fitAssist = () => {
    const chatOn = ["transcript", "askForm"].some((id) => { const el = $(id); return el && !el.classList.contains("gone") && !el.hidden; });
    const orbOn = getComputedStyle(stage).display !== "none" && getComputedStyle($("brain")).display !== "none" && !document.body.classList.contains("noorb");
    assist.classList.toggle("ap-nochat", !chatOn); assist.classList.toggle("ap-noorb", !orbOn); assist.hidden = !chatOn && !orbOn;
  };
  const watch = new MutationObserver(fitAssist);
  for (const el of [document.body, stage, ...chat.children]) watch.observe(el, { attributes: true, attributeFilter: ["class", "hidden", "style"] });
  fitAssist();
  function build() {
    side.replaceChildren(); const h = document.createElement("h2"); h.textContent = "Seiten"; side.append(h);
    let current = "Start";
    for (const t of tabs.querySelectorAll("button[data-pg]")) {
      if (t.hidden) continue;
      const name = t.dataset.pg, b = document.createElement("button"); b.type = "button"; b.dataset.pg = name;
      b.append(icon(ICONS[name] || ICONS.custom)); const s = document.createElement("span"); s.textContent = t.textContent || name; b.append(s);
      if (t.classList.contains("on")) { b.setAttribute("aria-current", "page"); current = t.textContent || name; }
      b.addEventListener("click", () => t.click());
      b.addEventListener("contextmenu", (e) => { e.preventDefault(); t.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY })); });
      side.append(b);
    }
    const plus = $("pgPlus");
    if (plus) { const b = document.createElement("button"); b.type = "button"; b.className = "ap-add"; b.append(icon(ICONS.add)); const s = document.createElement("span"); s.textContent = "Neue Seite"; b.append(s); b.addEventListener("click", () => plus.click()); side.append(b); }
    title.textContent = current; pageH.textContent = current; document.title = "Argus – " + current;
  }
  side.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const l = [...side.querySelectorAll("button")], i = l.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault(); l[Math.max(0, Math.min(l.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))].focus();
  });
  new MutationObserver(build).observe(tabs, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"], characterData: true });
  build();

  // Einstellungen mit Strg+, (wie unter macOS Befehl+,)
  addEventListener("keydown", (e) => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === ",") { e.preventDefault(); if ($("settings").hidden) $("settingsBtn").click(); }
  });

  // Bereitschaft erst melden, wenn der Aufbau oben vollständig gelaufen ist, die Einstellungen geladen sind und die Seite
  // danach kurz stabil läuft. Wirft der Aufbau oder scheitert das Laden, bleibt die Startsicherung bestehen (Rückfall beim nächsten Start).
  const loaded = document.readyState === "complete" ? Promise.resolve() : new Promise((r) => addEventListener("load", r, { once: true }));
  Promise.all([cfgReady, loaded]).then(() => setTimeout(() => { if ($("apSide") && $("apMain")) window.jarvis.uiReady?.(); }, 3000)).catch(() => {});
})();
