// Kleines Schreibfenster für Discord-Kontakte: Nachricht per Bot, ohne dass sich das Discord-Programm öffnet.
// Absender ist der Bot (die offizielle Schnittstelle erlaubt keine Nachrichten im Namen des Nutzers); Antworten landen im Discord-Postfach.
window.dcWrite = function (name, uid, url) {
  document.getElementById("dcWriteCard")?.remove();
  const el = document.createElement("div");
  el.id = "dcWriteCard"; el.className = "brief-card dcw-card"; el.setAttribute("role", "dialog");
  const h = document.createElement("h3"); h.textContent = "Nachricht an " + name;
  const x = Object.assign(document.createElement("button"), { className: "brief-x", type: "button", title: "Schließen", textContent: "×" }); x.setAttribute("aria-label", "Schließen");
  const ta = Object.assign(document.createElement("textarea"), { rows: 3, maxLength: 1800, placeholder: "Kurze Nachricht …" }); ta.className = "dcw-ta";
  const info = Object.assign(document.createElement("div"), { className: "dcw-info", textContent: "„Selbst schreiben“ öffnet Discord in einem kleinen Fenster, du tippst dort selbst (einmal anmelden). „Per Bot senden“ schickt die Nachricht vom Argus-Bot, mit dem Hinweis „Nachricht über Argus“." });
  const st = Object.assign(document.createElement("div"), { className: "dcw-st" });
  const bt = document.createElement("div"); bt.className = "brief-btns";
  const mk = (t, c) => Object.assign(document.createElement("button"), { className: "btn" + (c ? " " + c : ""), type: "button", textContent: t });
  const own = mk("Selbst schreiben", "primary"), send = mk("Per Bot senden"), open = mk("In Discord-App öffnen"), cancel = mk("Abbrechen");
  bt.append(own, send, open, cancel); el.append(x, h, ta, info, st, bt); document.body.appendChild(el);
  const close = () => { el.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) go(); };
  document.addEventListener("keydown", onKey, true);
  const go = async () => {
    const t = ta.value.trim(); if (!t || send.disabled) return;
    send.disabled = true; st.textContent = "Sende …";
    const r = await window.argus.dcDm(uid, t).catch(() => ({ ok: false, reason: "Fehler" }));
    if (r.ok) { st.textContent = "Gesendet."; setTimeout(close, 900); } else { st.textContent = r.reason || "Fehlgeschlagen"; send.disabled = false; }
  };
  own.onclick = () => { window.argus.openDiscordWeb(uid); close(); };
  x.onclick = close; cancel.onclick = close; send.onclick = go;
  open.onclick = () => { window.argus.openDiscord(url); close(); };
  // Lage: mittig, ganz im Fenster; am Titel verschiebbar, an der Ecke unten rechts in der Größe änderbar
  const W = Math.min(420, innerWidth - 24); el.style.width = W + "px";
  el.style.left = Math.max(12, (innerWidth - W) / 2) + "px"; el.style.top = Math.max(12, innerHeight * 0.2) + "px";
  let mv = null;
  h.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; const r = el.getBoundingClientRect(); mv = { dx: e.clientX - r.left, dy: e.clientY - r.top }; h.setPointerCapture(e.pointerId); e.preventDefault(); });
  h.addEventListener("pointermove", (e) => { if (!mv) return; el.style.left = Math.max(0, Math.min(innerWidth - 60, e.clientX - mv.dx)) + "px"; el.style.top = Math.max(0, Math.min(innerHeight - 40, e.clientY - mv.dy)) + "px"; });
  h.addEventListener("pointerup", () => { mv = null; });
  ta.focus();
};
