// Andere Designs für Uhr, Wetter, Notizen und Systemwache: je Fenster eine Variante (Attribut data-look, Aussehen in style.css).
// Wahl: Einstellungen › Aussehen › Fenster-Designs oder Rechtsklick auf das Fenster › Design.
(function () {
  const LOOKS = {"clocks": ["Uhr", [["", "Standard"], ["gross", "Groß, schlicht"], ["analog", "Analog"], ["zifferblatt", "Zifferblatt mit Zahlen"], ["3d", "3D-Uhr"], ["mechanisch", "Mechanisch"], ["futuristisch", "Futuristisch"]]], "wx": ["Wetter", [["", "Standard"], ["gross", "Groß, schlicht"], ["kompakt", "Kompakt (nur jetzt)"], ["glas", "Durchsichtig, weiße Schrift"]]], "notes": ["Notizen", [["", "Standard"], ["schlicht", "Durchsichtig, schlicht"], ["gelb", "Haftnotiz"], ["linien", "Liniertes Papier"]]], "sys": ["Systemwache", [["", "Standard"], ["glas", "Durchsichtig, weiße Schrift"], ["schlank", "Schlank, ohne Rahmen"], ["kachel", "Kacheln"]]]};
  let looks = {};
  const apply = () => {
    for (const id of Object.keys(LOOKS)) { const el = document.getElementById(id); if (el) { if (looks[id]) el.dataset.look = looks[id]; else delete el.dataset.look; } }
    window.renderClocksNow?.();
  };
  window.setLook = (id, v) => {
    if (!LOOKS[id] || !LOOKS[id][1].some((o) => o[0] === v)) return;
    looks = { ...looks, [id]: v }; apply(); sync(); window.jarvis.setConfig({ looks }); window.onPageStyle?.();
  };
  // Designs gehören zur Seite (10-anordnen-modus.js, pageLooks)
  window.looksGet = () => looks;
  window.looksSet = (m) => { looks = m && typeof m === "object" ? { ...m } : {}; apply(); sync(); window.jarvis.setConfig({ looks }); };
  const box = document.getElementById("lookBox");
  const sync = () => { if (box) for (const s of box.querySelectorAll("select")) s.value = looks[s.dataset.id] || ""; };
  if (box) for (const [id, [name, opts]] of Object.entries(LOOKS)) {
    const lab = document.createElement("label"); lab.className = "row"; lab.append(name + " ");
    const sel = document.createElement("select"); sel.dataset.id = id;
    for (const [k, l] of opts) sel.append(Object.assign(document.createElement("option"), { value: k, textContent: l }));
    sel.addEventListener("change", () => window.setLook(id, sel.value));
    lab.append(sel); box.append(lab);
  }
  window.jarvis.getConfig().then((c) => { looks = c.looks && typeof c.looks === "object" ? c.looks : {}; apply(); sync(); }).catch(() => {});
})();
