"use strict";
  // ---------- Einstellungen ----------
  async function openSettingsPanel() {
    const c = await window.jarvis.getConfig();
    window.syncYoutubeAppearance?.(c);
    $("setHue").value = theme.hue; $("setRegions").value = theme.regions;
    $("setTts").checked = tts.on; $("setVoice").value = c.voiceEngine || "jarvis"; $("setVoiceFb").value = c.voiceFallback || "retry"; $("setDonate").value = c.donateUrl || "";
    $("setMic").checked = !!c.micOnStart; $("setWake").value = (c.wakeWords || []).join(", ");
    $("setBallLabels").value = c.ballLabels || "aktiv"; $("setBgShoot").value = String(c.bgShoot ?? 1); $("setFriendsSplit").checked = !!c.friendsSplit; $("setDcJoin").checked = c.dcJoinBot !== false; $("setFriendsHold").value = String(c.friendsHold ?? 3);
    $("setScaleAi").value = scales.ai || 1; $("setScaleStrata").value = scales.strata || 1; fillDevices();
    $("setAiShare").value = c.aiShare || "ausgewogen"; $("setClaudeAsk").checked = c.claudeAsk !== false;
    $("setBackend").value = c.backend || "auto"; $("setModel").value = c.ollamaModel || "";
    $("setCcModel").value = c.claudeCodeModel || "sonnet"; $("setGpu").value = c.gpuUse || "voll";
    $("ccNote").textContent = c.claudeCode ? "Claude Code gefunden: Antworten laufen über dein Abo." : "Claude Code nicht gefunden. Installieren und einmal anmelden, dann antwortet Claude über dein Abo (siehe Anleitung).";
    $("setKey").value = ""; $("setKey").placeholder = c.hasApiKey ? "gespeichert (leer lassen = unverändert)" : "sk-ant-…";
    $("setNews").checked = c.newsOn !== false; $("setNewsTop").checked = c.newsOnTop === true; $("setDockFx").checked = c.dockFx !== false; $("setCur").value = c.btcCur || "USD"; btcCur = c.btcCur || "USD";
    newsCats = { ...(c.newsCats || {}) }; for (const cb of document.querySelectorAll("[data-cat]")) cb.checked = newsCats[cb.dataset.cat] !== false;
    if (c.market) market = c.market;
    for (const cb of document.querySelectorAll("[data-viz]")) cb.checked = viz[cb.dataset.viz] !== false;
    $("setZoom").value = c.setZoom || 1.15; document.documentElement.style.setProperty("--set-zoom", c.setZoom || 1.15);
    markRing(); $("setRingSize").value = scales.rings || 1; $("setMedia").checked = c.mediaOn !== false;
    $("setUpdUrl").value = c.updateUrl || ""; $("setUpdChannel").value = c.updateChannel || "stabil"; refreshUpd(); $("setSensors").checked = c.sensors !== false;
    $("setMicFloat").checked = c.micFloat !== false; $("setShape").value = shape; markShape(); $("setShapeRim").checked = shapeRim; $("setGlow").value = glowK; $("setSway").value = c.sway || "schweben";
    $("setTaskbarShow").value = c.taskbarShow || "nie"; $("setAfterHide").value = c.afterHide || "mini"; $("setTaskbarFront").checked = c.taskbarFront === true; $("setOnTop").value = c.onTop || "kugel"; $("setWakeFront").checked = c.wakeFront !== false; $("setAutoOpen").checked = c.autoOpen !== false;
    $("setSteamOn").checked = c.steamOn !== false; $("setDiscordOn").checked = c.discordOn !== false;
    $("setDcVoice").checked = true; $("setDcOnline").checked = !!c.discordAlsoOnline; $("setDcMarked").checked = !!c.dcOnlyMarked; $("setDcName").value = c.discordName || ""; $("setDcBot").value = ""; $("setDcBot").placeholder = c.hasDcBot ? "gespeichert (leer lassen = unverändert)" : "noch keiner eingetragen"; $("setDcIcons").checked = c.dcIcons !== false; bot = c.dcBot || bot; setBotStatus(); $("setDcExtra").value = (c.extraVoice || []).map((v) => (v.name ? v.name + " " : "") + `https://discord.com/channels/${v.g}/${v.c}`).join("\n"); $("setOverlay").checked = c.voiceOverlay !== false; $("setOvCorner").value = c.overlayCorner || "oben-links"; $("setOvMode").value = c.overlayMode || "streamkit";
    winColor = { ...winColor, ...(c.winColor || {}) }; syncWinInputs();
    const fi = c.fileIndex || {};
    $("indexNote").textContent = fi.ok ? `Dateiverzeichnis aller Laufwerke: Stand ${new Date(fi.ts).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}, ${fi.mb} MB.` : "Dateiverzeichnis aller Laufwerke: wird noch aufgebaut (beim ersten Start einige Minuten). Bis dahin sucht Argus nur im Benutzerordner.";
    $("setSteamId").value = c.steamId || ""; $("setDiscord").value = c.discordServers || ""; $("setSteamKey").value = "";
    $("setSteamKey").placeholder = c.hasSteamKey ? "gespeichert (leer lassen = unverändert)" : "noch keiner eingetragen";
    $("socialNote").textContent = [c.market?.steam?.error, c.market?.discord?.error, ...(c.market?.discord?.servers || []).map((x) => x.error)].filter(Boolean).join(" · ");
    $("setMemory").checked = c.memoryOn !== false; $("setDesktopLink").checked = c.claudeDesktopLink !== false;
    $("memNote").textContent = "Alle Gespräche und „Merk dir“-Notizen liegen in " + (c.memoryDir || "Argus-Gedaechtnis") + ". Claude in Argus und in der Claude-Desktop-App kann sie durchsuchen und Dateien auf allen Laufwerken finden und lesen, aber nichts ändern. Claude Desktop danach einmal neu starten.";
    $("setAlerts").checked = !!c.systemAlertsVoice; $("setAuto").checked = !!c.autostart;
    widgets = c.widgets || widgets; buildWidgetRows(); buildAppRows(); buildOpRows();
    $("settings").hidden = false;
  }
  $("settingsBtn").addEventListener("click", () => { if (!$("settings").hidden) { $("settings").hidden = true; return; } openSettingsPanel(); });
  // Aussparung frei platzieren: gestrichelter Rahmen, ziehen und skalieren, „Fertig“ schneidet das Loch ins Fenster
  async function holePlace() {
    const box = $("holeBox"), c = await window.jarvis.getConfig();
    const W = innerWidth, H = innerHeight, w = Math.min(W - 40, c.holeW || 360), h = Math.min(H - 40, c.holeH || 260), cor = c.holeCorner || "br";
    let x = Number.isFinite(c.holeX) ? c.holeX : cor.endsWith("r") ? W - w : 0, y = Number.isFinite(c.holeY) ? c.holeY : cor.startsWith("b") ? H - h : 0, bw = w, bh = h;
    const put = () => { x = Math.max(0, Math.min(W - bw, x)); y = Math.max(0, Math.min(H - bh, y)); box.style.cssText = `left:${x}px;top:${y}px;width:${bw}px;height:${bh}px`; };
    put(); box.hidden = false; $("settings").hidden = true;
    window.jarvis.setConfig({ holeOn: true, holeEdit: true });
    let drag = null;
    const down = (e, mode) => { e.preventDefault(); e.stopPropagation(); drag = { mode, sx: e.clientX, sy: e.clientY, x, y, bw, bh }; box.setPointerCapture(e.pointerId); };
    box.onpointerdown = (e) => { if (e.target.closest("button")) return; down(e, e.target.id === "holeGrip" ? "size" : "move"); };
    box.onpointermove = (e) => { if (!drag) return; const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (drag.mode === "move") { x = drag.x + dx; y = drag.y + dy; } else { bw = Math.max(120, Math.min(W - x, drag.bw + dx)); bh = Math.max(100, Math.min(H - y, drag.bh + dy)); } put(); };
    box.onpointerup = () => { drag = null; };
    $("holeDone").onclick = () => { box.hidden = true; window.jarvis.setConfig({ holeX: Math.round(x), holeY: Math.round(y), holeW: Math.round(bw), holeH: Math.round(bh), holeEdit: false, holeOn: true }); $("setHoleOn").checked = true; };
  }
  // Solange die Einstellungen offen sind, bleibt das Fenster ganz (sonst verdeckt die Aussparung Bedienelemente)
  new MutationObserver(() => { if ($("holeBox").hidden) window.jarvis.setConfig({ holeEdit: !$("settings").hidden }); }).observe($("settings"), { attributes: true, attributeFilter: ["hidden"] });
  $("setClose").addEventListener("click", () => { $("settings").hidden = true; });
  $("setTts").addEventListener("change", (e) => { setTts(e.target.checked); window.jarvis.setConfig({ voiceOutput: e.target.checked }); });
  $("setVoiceFb").addEventListener("change", (e) => window.jarvis.setConfig({ voiceFallback: e.target.value }));
  $("setVoice").addEventListener("change", (e) => window.jarvis.setConfig({ voiceEngine: e.target.value }));
  $("setVoiceTest").addEventListener("click", () => speak("Hallo" + (userName ? " " + userName : "") + ". So klinge ich jetzt. Alle Systeme laufen.", () => {}));
  $("setMic").addEventListener("change", (e) => window.jarvis.setConfig({ micOnStart: e.target.checked }));
  // Mikrofon und Lautsprecher wählen (leer = Windows-Standard)
  async function fillDevices() {
    let list = []; try { list = await navigator.mediaDevices.enumerateDevices(); } catch {}
    const fill = (sel, kind, cur, def) => {
      const devs = list.filter((d) => d.kind === kind && d.deviceId !== "default" && d.deviceId !== "communications");
      sel.replaceChildren(new Option(def, ""), ...devs.map((d, i) => new Option(d.label || (kind === "audioinput" ? "Mikrofon " : "Lautsprecher ") + (i + 1), d.deviceId)));
      sel.value = devs.some((d) => d.deviceId === cur) ? cur : "";
    };
    fill($("setMicDev"), "audioinput", micId, "Windows-Standard"); fill($("setSpkDev"), "audiooutput", spkId, "Windows-Standard");
  }
  $("setMicDev").addEventListener("change", async (e) => { micId = e.target.value; await window.jarvis.setConfig({ micId }); if (voice.on) { stopVoice(); setTimeout(startVoice, 400); } });
  $("setSpkDev").addEventListener("change", async (e) => { spkId = e.target.value; await window.jarvis.setConfig({ spkId }); applySink(); });
  $("setBallLabels").addEventListener("change", (e) => { ballLabels = e.target.value; window.jarvis.setConfig({ ballLabels }); });
  $("setBgShoot").addEventListener("change", (e) => { bgShoot = +e.target.value; window.jarvis.setConfig({ bgShoot }); });
  $("setFriendsSplit").addEventListener("change", (e) => { friendsSplit = e.target.checked; friendsSig = ""; window.jarvis.setConfig({ friendsSplit }); buildFriends(); });
  $("setFriendsStill").addEventListener("change", (e) => { friendsStill = e.target.checked; window.jarvis.setConfig({ friendsStill }); });
  { const hs = (k, v) => window.jarvis.setConfig({ [k]: v });
    $("setHoleOn").addEventListener("change", (e) => hs("holeOn", e.target.checked));
    const hIds = ["setHoleTL", "setHoleTR", "setHoleBR", "setHoleBL"], hRad = () => hIds.map((id) => +$(id).value), hBox = () => { $("holeBox").style.borderRadius = hRad().map((v) => v + "px").join(" "); };
    $("setHoleRound").addEventListener("input", (e) => { for (const id of hIds) $(id).value = e.target.value; hBox(); hs("holeRound", +e.target.value); hs("holeRadii", hRad()); });
    for (const id of hIds) $(id).addEventListener("input", () => { hBox(); hs("holeRadii", hRad()); });
    $("setHolePlace").addEventListener("click", () => holePlace()); }
  $("setDcJoin").addEventListener("change", (e) => { dcJoinBot = e.target.checked; friendsSig = ""; buildFriends(); window.jarvis.setConfig({ dcJoinBot }); });
  $("setFriendsHold").addEventListener("change", (e) => { friendsHold = +e.target.value; window.jarvis.setConfig({ friendsHold }); });
  for (const [id, k] of [["setScaleAi", "ai"], ["setScaleStrata", "strata"]]) $(id).addEventListener("input", (e) => { const v = +e.target.value; if (Math.abs(v - 1) < 0.03) delete scales[k]; else scales[k] = v; clearTimeout(scaleSave); scaleSave = setTimeout(() => window.jarvis.setConfig({ scales }), 400); });
  window.jarvis.getConfig?.().then((c) => { ballLabels = c.ballLabels || "aktiv"; bgShoot = c.bgShoot ?? 1; friendsSplit = !!c.friendsSplit; friendsHold = c.friendsHold ?? 3; friendsStill = c.friendsStill !== false; $("setFriendsStill").checked = friendsStill; $("setHoleOn").checked = !!c.holeOn; $("setHoleRound").value = c.holeRound ?? 16; { const rd = Array.isArray(c.holeRadii) ? c.holeRadii : [0, 1, 2, 3].map(() => c.holeRound ?? 16); ["setHoleTL", "setHoleTR", "setHoleBR", "setHoleBL"].forEach((id, i) => { $(id).value = rd[i] ?? 16; }); $("holeBox").style.borderRadius = [0, 1, 2, 3].map((i) => (rd[i] ?? 16) + "px").join(" "); } dcJoinBot = c.dcJoinBot !== false; micId = c.micId || ""; spkId = c.spkId || ""; friendsSig = ""; });
  $("setWake").addEventListener("change", (e) => {
    const words = e.target.value.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
    if (words.length) { WAKE = buildWake(words); window.jarvis.setConfig({ wakeWords: words }); }
  });
  for (const [id, k] of [["setNotifyPanel", "notifyPanel"], ["setNotifyWin", "notifyWin"], ["setNotifySound", "notifySound"], ["setOceanNotify", "oceanNotify"], ["setPayoutNotify", "payoutNotify"]]) $(id).addEventListener("change", (e) => window.jarvis.setConfig({ [k]: e.target.checked }));
  window.jarvis.getConfig?.().then((c) => { for (const [id, k] of [["setNotifyPanel", "notifyPanel"], ["setNotifyWin", "notifyWin"], ["setNotifySound", "notifySound"], ["setOceanNotify", "oceanNotify"], ["setPayoutNotify", "payoutNotify"]]) $(id).checked = c[k] !== false; });
  // ---------- Täglicher Miner-Report ----------
  let rpText = "";
  function showReport(r) {
    if (!r?.farms?.length) { $("rpTitle").textContent = "Miner-Report"; $("rpSub").textContent = "Noch keine Daten. Argus zählt ab jetzt mit, der erste Report kommt morgen."; $("rpBody").replaceChildren(); $("reportPop").hidden = false; return; }
    const dd = r.day.split("-").reverse().join(".");
    $("rpTitle").textContent = "Miner-Report · " + dd;
    const bad = r.farms.filter((f) => f.median != null && f.median < f.total);
    $("rpSub").textContent = bad.length ? `${bad.length} von ${r.farms.length} Anlagen liefen nicht voll. „Typisch“ ist der Median über den Tag, kurze Aussetzer zählen als Schwankung.` : "Alle Anlagen liefen über den Tag voll.";
    const tb = document.createElement("table"); tb.innerHTML = "<thead><tr><th>Anlage</th><th>Bestand</th><th>Typisch online</th><th>Spanne</th><th>Offline</th><th>Uptime</th><th>Verbrauch</th></tr></thead>";
    const body = document.createElement("tbody"); const lines = [`Miner-Report ${dd}`];
    for (const f of r.farms) {
      const tr = document.createElement("tr"), na = f.median == null;
      tr.className = na ? "na" : f.median < f.total ? "bad" : "ok";
      const offTxt = na ? (f.pxShare > 0.5 ? "Pickaxe offline" : "keine Daten") : [f.down.length ? `${f.down.length} dauerhaft` : "", f.partly.length ? `${f.partly.length} zeitweise` : "", f.blips ? `${f.blips} kurz weg` : ""].filter(Boolean).join(" · ") || "–";
      const names = [f.down.length ? "Dauerhaft: " + f.down.slice(0, 12).join(", ") + (f.down.length > 12 ? " …" : "") : "", f.partly.length ? "Zeitweise: " + f.partly.slice(0, 8).map(([m, p]) => `${m} (${p} %)`).join(", ") : ""].filter(Boolean).join("\n");
      const cells = [f.name, String(f.total), na ? "–" : `${f.median} / ${f.total}`, na ? "–" : f.min === f.max ? String(f.min) : `${f.min}–${f.max}`, offTxt, f.uptime != null ? (f.uptime * 100).toFixed(1).replace(".", ",") + " %" + (f.hours < 20 ? ` (${f.hours} h gemessen)` : "") : "–", f.kwh != null ? fmtEnergy(f.kwh) : "–"];
      cells.forEach((c, i) => { const td = document.createElement("td"); td.textContent = c; if (i === 4 && names) { const d = document.createElement("div"); d.className = "rp-names"; d.textContent = names; d.style.whiteSpace = "pre-line"; td.append(d); } tr.append(td); });
      body.append(tr); lines.push(`${f.name}: ${na ? offTxt : `typisch ${f.median}/${f.total} online (Spanne ${cells[3]})`}, Uptime ${cells[5]}, Verbrauch ${cells[6]}${names ? "\n  " + names.replace(/\n/g, "\n  ") : ""}`);
    }
    tb.append(body); $("rpBody").replaceChildren(tb); rpText = lines.join("\n");
    window.jarvis.reportDays?.().then((ds) => { $("rpDay").replaceChildren(...ds.slice().reverse().map((k) => new Option(k.split("-").reverse().join("."), k))); $("rpDay").value = r.day; });
    $("reportPop").hidden = false;
  }
  $("rpClose").addEventListener("click", () => { $("reportPop").hidden = true; const p = $("reportPop"); p.style.left = p.style.top = p.style.transform = ""; });
  $("rpCopy").addEventListener("click", () => { navigator.clipboard?.writeText(rpText); });
  $("rpDay").addEventListener("change", (e) => window.jarvis.reportGet(e.target.value).then(showReport));
  window.jarvis.onDailyReport?.((r) => { if (!expanded) window.jarvis.toggleExpanded?.(); showReport(r); });
  // Report von gestern per Knopf (Datum rollt mit), älterer Tag per Auswahl; beides schließt die Einstellungen, damit das Fenster sichtbar ist
  const dayLbl = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }); };
  const keyOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  async function reportBtns() {
    const yk = keyOf(Date.now() - 864e5), ds = (await window.jarvis.reportDays?.().catch(() => [])) || [];
    $("setReportShow").textContent = "Report von gestern öffnen (" + dayLbl(yk) + ")";
    $("setReportDay").replaceChildren(new Option("Anderer Tag …", ""), ...ds.filter((k) => k !== yk).slice().reverse().map((k) => new Option(dayLbl(k), k)));
    $("setReportDay").hidden = ds.filter((k) => k !== yk).length === 0;
  }
  const openReportDay = (k) => window.jarvis.reportGet(k).then(showReport);
  $("setReportShow").addEventListener("click", () => openReportDay(keyOf(Date.now() - 864e5)));
  $("setReportDay").addEventListener("change", (e) => { if (e.target.value) openReportDay(e.target.value); e.target.value = ""; });
  new MutationObserver(() => { if (!$("settings").hidden) reportBtns(); }).observe($("settings"), { attributes: true, attributeFilter: ["hidden"] });
  // Report-Fenster per Kopfzeile verschieben (Mitte ist die Ausgangslage)
  { const pop = $("reportPop"); let dr = null;
    const grab = (e) => { if (e.button !== 0) return; const r = pop.getBoundingClientRect(); dr = { dx: e.clientX - r.left, dy: e.clientY - r.top }; pop.style.transform = "none"; pop.style.left = r.left + "px"; pop.style.top = r.top + "px"; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); };
    for (const h of [$("rpTitle"), $("rpSub")]) { h.style.cursor = "move"; h.addEventListener("pointerdown", grab);
      h.addEventListener("pointermove", (e) => { if (!dr) return; pop.style.left = Math.max(0, Math.min(innerWidth - 80, e.clientX - dr.dx)) + "px"; pop.style.top = Math.max(0, Math.min(innerHeight - 40, e.clientY - dr.dy)) + "px"; });
      h.addEventListener("pointerup", () => { dr = null; }); } }
  $("setReportOn").addEventListener("change", (e) => window.jarvis.setConfig({ reportOn: e.target.checked }));
  $("setReportNotify").addEventListener("change", (e) => window.jarvis.setConfig({ reportNotify: e.target.checked }));
  $("setReportHour").addEventListener("change", (e) => window.jarvis.setConfig({ reportHour: +e.target.value }));
  $("setReportKeep").addEventListener("change", (e) => window.jarvis.setConfig({ reportKeep: +e.target.value }));
  window.jarvis.getConfig?.().then((c) => { $("setReportOn").checked = c.reportOn !== false; $("setReportNotify").checked = c.reportNotify !== false; $("setReportHour").value = String(c.reportHour ?? 8); $("setReportKeep").value = String(c.reportKeep ?? 14); });
  $("setFpsIdle").addEventListener("change", (e) => { fpsIdle = +e.target.value; window.jarvis.setConfig({ fpsIdle }); });
  $("setFpsMax").addEventListener("change", (e) => { fpsMax = +e.target.value; window.jarvis.setConfig({ fpsMax }); });
  window.jarvis.getConfig?.().then((c) => { fpsIdle = c.fpsIdle || 30; fpsMax = c.fpsMax || 60; $("setFpsIdle").value = String(fpsIdle); $("setFpsMax").value = String(fpsMax); });
  const applyBar = (m) => { document.body.classList.remove("bar-kompakt", "bar-schwebend"); if (m === "kompakt" || m === "schwebend") document.body.classList.add("bar-" + m); };
  $("setBarMode").addEventListener("change", (e) => { applyBar(e.target.value); window.jarvis.setConfig({ barMode: e.target.value }); });
  window.jarvis.getConfig?.().then((c) => { $("setBarMode").value = c.barMode || "normal"; applyBar(c.barMode); });
  // schwebende Leiste: in den oberen 44 px einblenden
  addEventListener("mousemove", (e) => { if (document.body.classList.contains("bar-schwebend")) document.querySelector(".bar").classList.toggle("near", e.clientY < 44); }, { passive: true });
  $("setAiShare").addEventListener("change", (e) => window.jarvis.setConfig({ aiShare: e.target.value }));
  $("setClaudeAsk").addEventListener("change", (e) => window.jarvis.setConfig({ claudeAsk: e.target.checked }));
  const aiExtUi = (b) => document.querySelectorAll(".ai-ext").forEach((el) => { el.hidden = b !== "openai"; });
  $("setBackend").addEventListener("change", (e) => { aiExtUi(e.target.value); window.jarvis.setConfig({ backend: e.target.value }).then(refreshBackend); });
  $("setAiProv").addEventListener("change", (e) => window.jarvis.setConfig({ aiProv: e.target.value }).then(refreshBackend));
  $("setAiModel").addEventListener("change", (e) => window.jarvis.setConfig({ aiModel: e.target.value.trim() }).then(refreshBackend));
  $("setAiBase").addEventListener("change", (e) => window.jarvis.setConfig({ aiBase: e.target.value.trim() }).then(refreshBackend));
  $("setAiKey").addEventListener("change", (e) => { if (e.target.value.trim()) window.jarvis.setConfig({ aiKey: e.target.value.trim() }).then(() => { e.target.value = ""; refreshBackend(); }); });
  window.jarvis.getConfig?.().then((c) => { $("setAiProv").value = c.aiProv || "openai"; $("setAiModel").value = c.aiModel || ""; $("setAiBase").value = c.aiBase || ""; $("setAiKey").placeholder = c.hasAiKey ? "gespeichert (leer lassen = unverändert)" : "Key des Anbieters"; aiExtUi(c.backend); });
  $("setGpu").addEventListener("change", (e) => window.jarvis.setConfig({ gpuUse: e.target.value }));
  $("setCcModel").addEventListener("change", (e) => window.jarvis.setConfig({ claudeCodeModel: e.target.value }).then(refreshBackend));
  $("setModel").addEventListener("change", (e) => window.jarvis.setConfig({ ollamaModel: e.target.value.trim() }));
  $("setKey").addEventListener("change", (e) => { if (e.target.value.trim()) window.jarvis.setConfig({ anthropicApiKey: e.target.value.trim() }).then(refreshBackend); });
  $("setAlerts").addEventListener("change", (e) => { alertsVoice = e.target.checked; window.jarvis.setConfig({ systemAlertsVoice: e.target.checked }); });
  $("setAuto").addEventListener("change", (e) => window.jarvis.setConfig({ autostart: e.target.checked }));
  $("setFile").addEventListener("click", () => window.jarvis.openSettings());
  $("setChangelog").addEventListener("click", () => window.jarvis.openChangelog());
  let newsCats = {};
  $("setNews").addEventListener("change", (e) => window.jarvis.setConfig({ newsOn: e.target.checked }));
  $("setNewsTop").addEventListener("change", (e) => window.jarvis.setConfig({ newsOnTop: e.target.checked }));
  $("setDockFx").addEventListener("change", (e) => window.jarvis.setConfig({ dockFx: e.target.checked }));
  $("setCoins").replaceChildren(...ALT_COINS.map((sym) => { const l = document.createElement("label"), c = document.createElement("input"); c.type = "checkbox"; c.value = sym; l.append(c, sym); return l; }));
  $("setCoins").addEventListener("change", () => { coinSel = ["BTC", ...[...$("setCoins").querySelectorAll("input:checked")].map((c) => c.value)]; temps.forEach((t) => { t.val = undefined; }); window.jarvis.setConfig({ coins: coinSel }); });
  window.jarvis.getConfig?.().then((c) => { coinSel = Array.isArray(c.coins) ? c.coins : ["BTC"]; for (const i of $("setCoins").querySelectorAll("input")) i.checked = coinSel.includes(i.value); });
  $("setCur").addEventListener("change", (e) => { btcCur = e.target.value; temps.forEach((t) => { t.val = undefined; }); window.jarvis.setConfig({ btcCur }); });
  for (const cb of document.querySelectorAll("[data-cat]")) cb.addEventListener("change", () => { newsCats[cb.dataset.cat] = cb.checked; window.jarvis.setConfig({ newsCats: { ...newsCats } }); });
  for (const cb of document.querySelectorAll("[data-viz]")) cb.addEventListener("change", () => { viz = { ...viz, [cb.dataset.viz]: cb.checked }; window.jarvis.setConfig({ viz }); });
  $("setMicFloat").addEventListener("change", (e) => { micFloatOn = e.target.checked; window.jarvis.setConfig({ micFloat: micFloatOn }); });
  $("setSway").addEventListener("change", (e) => { swayMul = { schweben: 1, leicht: 0.4, fest: 0 }[e.target.value] ?? 1; window.jarvis.setConfig({ sway: e.target.value }); });
  // Hinweis unter den Messbalken, wenn Temperaturen fehlen; Klick richtet die Messung ein
  let lastSys = null, procsAll = false; try { procsAll = localStorage.getItem("jarvisProcsAll") === "1"; } catch {}
  function renderSysHint(sys) {
    let hint = $("sysHint");
    if (!hint) {
      hint = document.createElement("div"); hint.id = "sysHint"; hint.className = "sys-hint"; $("meters").after(hint);
      hint.addEventListener("click", () => { if (sensState !== "laeuft" && sensState !== "einrichten") window.jarvis.sensorSetup(); });
    }
    const miss = sys.temp == null || sys.gpuTemp == null, what = sys.temp == null && sys.gpuTemp == null ? "CPU-/GPU" : sys.temp == null ? "CPU" : "GPU";
    hint.style.cursor = miss && sensState !== "laeuft" && sensState !== "einrichten" ? "pointer" : "";
    hint.textContent = !miss ? "" : sensState === "laeuft" ? `Keine ${what}-Temperatur: Messdienst läuft, liefert aber keinen Wert für diese Hardware.`
      : sensState === "einrichten" ? "Temperaturmessung wird eingerichtet … Windows-Abfrage mit Ja bestätigen."
      : sensState.startsWith("fehler") ? `Keine ${what}-Temperatur (${sensState.replace(/^fehler: /, "")}). Klick: nochmal einrichten.`
      : `Keine ${what}-Temperatur. Klick: Messung einrichten (einmal Admin-Abfrage).`;
  }
  // Eigene Temperaturmessung
  let sensState = "aus";
  const SENS_TXT = { aus: "Aus.", bereit: "Noch nicht eingerichtet.", einrichten: "Wird eingerichtet … bitte die Windows-Abfrage mit Ja bestätigen.", laeuft: "Läuft." };
  function showSens(st) {
    sensState = st || "aus";
    $("sensNote").textContent = SENS_TXT[sensState] || sensState.replace(/^fehler: /, "Fehler: ");
    $("setSensSetup").hidden = sensState === "laeuft" || sensState === "einrichten";
    lastSys && renderSysHint(lastSys);
  }
  window.jarvis.onSensorStatus?.(showSens);
  window.jarvis.sensorStatus?.().then(showSens);
  $("setSensSetup").addEventListener("click", () => window.jarvis.sensorSetup());
  $("setSensors").addEventListener("change", (e) => window.jarvis.setConfig({ sensors: e.target.checked }));
  let updPoll = null;
  // Der Knopf zeigt, was wirklich passiert: „Suche …“ nur beim Suchen, „Lädt … 42 %“ sobald ein Download läuft
  function syncUpdBtn(u) {
    const b = $("setUpdCheck"), t = u?.text || "", dl = /^Lade/.test(t), se = /^Suche/.test(t), pc = t.match(/(\d+) %/);
    b.classList.toggle("busy", dl || se); b.textContent = dl ? "Lädt …" + (pc ? " " + pc[1] + " %" : "") : se ? "Suche …" : "Nach Updates suchen";
    return dl || se;
  }
  function watchUpd(limit) {
    clearInterval(updPoll); const t0 = Date.now();
    updPoll = setInterval(async () => {
      const v = await refreshUpd(false), busy = syncUpdBtn(v), dl = /^Lade/.test(v.text || "");
      if (!busy || Date.now() - t0 > (dl ? 30 * 60e3 : limit)) { clearInterval(updPoll); updPoll = null; syncUpdBtn({ text: "" }); }
    }, 700);
  }
  async function refreshUpd(check) {
    const u = await (check ? window.jarvis.updateCheck() : window.jarvis.updateStatus());
    $("updNote").textContent = "Version " + u.version + (u.text ? ". " + u.text.replace(/\.$/, "") + "." : ".");
    $("setUpdInstall").hidden = !u.ready;
    if (!check) { if (syncUpdBtn(u) && !updPoll) watchUpd(60000); return u; }
    syncUpdBtn({ text: "Suche" }); watchUpd(60000);
  }
  $("setUpdChannel").addEventListener("change", (e) => { window.jarvis.setConfig({ updateChannel: e.target.value }).then(() => setTimeout(() => refreshUpd(false), 3000)); });
  $("setUpdUrl").addEventListener("change", (e) => { window.jarvis.setConfig({ updateUrl: e.target.value.trim() }).then(() => setTimeout(() => refreshUpd(false), 3000)); });
  $("setUpdCheck").addEventListener("click", () => refreshUpd(true));
  new MutationObserver(() => { if (!$("settings").hidden) refreshUpd(false); }).observe($("settings"), { attributes: true, attributeFilter: ["hidden"] });
  $("setUpdInstall").addEventListener("click", () => window.jarvis.updateInstall());
  $("setPinsReset").addEventListener("click", () => { pins = {}; scales = {}; window.jarvis.setConfig({ pins, scales }); });
  $("setTaskbarFront").addEventListener("change", (e) => window.jarvis.setConfig({ taskbarFront: e.target.checked }));
  $("setTaskbarShow").addEventListener("change", (e) => window.jarvis.setConfig({ taskbarShow: e.target.value }));
  $("setAfterHide").addEventListener("change", (e) => window.jarvis.setConfig({ afterHide: e.target.value }));
  $("setOnTop").addEventListener("change", (e) => window.jarvis.setConfig({ onTop: e.target.value }));
  $("setWakeFront").addEventListener("change", (e) => window.jarvis.setConfig({ wakeFront: e.target.checked }));
  $("setAutoOpen").addEventListener("change", (e) => { autoOpen = e.target.checked; window.jarvis.setConfig({ autoOpen }); });
  $("setSteamOn").addEventListener("change", (e) => window.jarvis.setConfig({ steamOn: e.target.checked }));
  $("setDiscordOn").addEventListener("change", (e) => window.jarvis.setConfig({ discordOn: e.target.checked }));
  $("setDcMarked").addEventListener("change", (e) => { dcOnlyMarked = e.target.checked; friendsSig = ""; buildFriends(); window.jarvis.setConfig({ dcOnlyMarked }); });
  $("setDcOnline").addEventListener("change", (e) => { dcAlsoOnline = e.target.checked; friendsSig = ""; buildFriends(); window.jarvis.setConfig({ discordAlsoOnline: dcAlsoOnline }); });
  $("setDcVoice").addEventListener("change", (e) => { dcVoiceOnly = e.target.checked; friendsSig = ""; buildFriends(); window.jarvis.setConfig({ discordVoiceOnly: dcVoiceOnly }); });
  $("setDcName").addEventListener("change", (e) => { myDc = normDc(e.target.value); friendsSig = ""; buildFriends(); window.jarvis.setConfig({ discordName: e.target.value.trim(), discordAuto: false }); });
  window.jarvis.onDiscordSelf?.((me) => { myDc = normDc(me.name); $("setDcName").value = me.name; friendsSig = ""; buildFriends(); });
  // Zustand des eigenen Bots, mit Einladungslink sobald er verbunden ist
  function setBotStatus() {
    const el = $("dcBotState"); if (!el) return;
    const n = bot.guilds.length;
    el.textContent = bot.status === "aus" ? "Kein Bot: Kamera und Live werden nicht angezeigt. Anleitung in ANLEITUNG.md, Abschnitt Discord-Bot."
      : bot.status.startsWith("verbunden") ? `Bot ${bot.status}, auf ${n} Server${n === 1 ? "" : "n"}. ` : "Bot: " + bot.status + " ";
    if (bot.invite && bot.status.startsWith("verbunden")) {
      const a = document.createElement("a"); a.href = "#"; a.textContent = "Auf einen Server einladen"; a.style.color = "#8ff0c0";
      a.addEventListener("click", (e) => { e.preventDefault(); window.jarvis.openUrl(bot.invite); }); el.append(a);
    }
  }
  // Private Sprachkanäle: je Zeile „Name Link“ (Link über Rechtsklick auf den Kanal → „Link kopieren“)
  const parseExtra = (t) => t.split(/\n+/).map((l) => { const m = /(.*?)\s*https?:\/\/(?:\w+\.)?discord(?:app)?\.com\/channels\/(\d{15,22})\/(\d{15,22})/.exec(l); return m ? { name: m[1].trim().slice(0, 40), g: m[2], c: m[3] } : null; }).filter(Boolean).slice(0, 6);
  $("setDcBot").addEventListener("change", (e) => { const v = e.target.value.trim(); if (v) { window.jarvis.setConfig({ dcBotToken: v }); e.target.value = ""; e.target.placeholder = "gespeichert (leer lassen = unverändert)"; } });
  $("setDcIcons").addEventListener("change", (e) => { dcIcons = e.target.checked; friendsSig = ""; buildFriends(); window.jarvis.setConfig({ dcIcons }); });
  $("setDcExtra").addEventListener("change", (e) => { extraVoice = parseExtra(e.target.value); friendsSig = ""; buildFriends(); window.jarvis.setConfig({ extraVoice }); });
  $("setOverlay").addEventListener("change", (e) => window.jarvis.setConfig({ voiceOverlay: e.target.checked }));
  $("setOvCorner").addEventListener("change", (e) => window.jarvis.setConfig({ overlayCorner: e.target.value }));
  $("setOvMode").addEventListener("change", (e) => window.jarvis.setConfig({ overlayMode: e.target.value }));
  $("setTwMode").addEventListener("change", (e) => window.jarvis.setConfig({ twMode: e.target.value }));
  $("setTwTop").addEventListener("change", (e) => window.jarvis.setConfig({ twOnTop: e.target.checked }));
  $("setTwChan").addEventListener("change", (e) => { const v = e.target.value.trim(); if (v) { window.jarvis.openTwitch(v.slice(0, 200)); e.target.value = ""; } });
  window.jarvis.getConfig?.().then((c) => { $("setTwMode").value = c.twMode || "panel"; $("setTwTop").checked = !!c.twOnTop; $("setTwAlpha").value = c.twAlpha ?? 100; $("setTwRound").value = c.twRound ?? 14; $("setTwFeather").value = c.twFeather ?? 0; for (const id of ["setTwAlpha", "setTwRound", "setTwFeather"]) $(id).dispatchEvent(new Event("input")); });
  $("ytBtn").addEventListener("click", () => { if (ytOn) window.jarvis.ytEmbed("close"); else window.jarvis.openYoutube(""); });
  // ---------- Strata: Ein/Aus-Knopf ----------
  function renderStrata(st) {
    if (!st) return; const b = $("strataBtn"); b.dataset.st = st.state; strataHas = !!st.dir || (st.state && st.state !== "aus");
    b.querySelector("span").textContent = st.state === "lädt" ? "Strata lädt" : st.state === "an" ? "Strata an" : "Strata";
    b.title = (st.text || "Strata (große lokale KI)") + (st.state === "an" ? " · Klick: ausschalten, Speicher freigeben" : " · Klick: einschalten (belegt rund 30 GB RAM)");
  }
  let strataLast = "";
  window.jarvis.getConfig?.().then((c) => { if (c.strata) renderStrata(c.strata); });
  window.jarvis.onStrata?.((st) => { renderStrata(st); if (st.text && st.text !== strataLast) { strataLast = st.text; log(st.text); if (/fehl|nicht|beendet/.test(st.state + st.text) && st.state !== "aus") notice(st.text); } });
  $("strataBtn").addEventListener("click", async () => { const b = $("strataBtn"); b.classList.add("busy"); try { renderStrata(await window.jarvis.strataToggle()); } finally { b.classList.remove("busy"); } });
  $("setStrataIdle").addEventListener("change", (e) => window.jarvis.setConfig({ strataIdleMin: +e.target.value }));
  $("setStrataDir").addEventListener("change", (e) => window.jarvis.setConfig({ strataDir: e.target.value.trim() }));
  window.jarvis.getConfig?.().then((c) => { renderStrata(c.strata); $("setStrataIdle").value = String(c.strataIdleMin ?? 20); $("setStrataDir").value = c.strataDir || ""; if (c.strata?.dir && !c.strataDir) $("setStrataDir").placeholder = c.strata.dir; });

  // ---------- Einrichtung beim ersten Start (neue Nutzer): Schritt für Schritt ----------
  let userName = "", suStep = 0, suCfg = {}, suPcInfo = null, suStrataDir = "", suDlStarted = false;
  const suVal = (n) => document.querySelector(`input[name="${n}"]:checked`)?.value || "";
  const suSet = (n, v) => { const e = document.querySelector(`input[name="${n}"][value="${v}"]`); if (e) e.checked = true; };
  const suSteps = () => [0, 1, ...(["auto", "ollama"].includes(suVal("suAi")) ? [2] : []), 3, 4, 5];
  function suShow(i) {
    suStep = i; const list = suSteps(), pos = list.indexOf(i);
    for (const s of document.querySelectorAll("#setup .su-step")) s.classList.toggle("on", +s.dataset.step === i);
    $("suDots").innerHTML = list.map((_, k) => `<i class="${k < pos ? "done" : k === pos ? "on" : ""}"></i>`).join("");
    $("suBack").hidden = pos <= 0; $("suNext").textContent = i === 5 ? "Fertigstellen" : "Weiter";
    if (i === 2) suLocalUi(); if (i === 5) suSummary();
    $("setup").querySelector(".set-body").scrollTop = 0;
  }
  function suAiUi() {
    const ai = suVal("suAi"); $("suKeyRow").hidden = ai !== "claude"; $("suExtRow").hidden = ai !== "openai";
    const cc = $("suCcState"); cc.textContent = suCfg.claudeCode ? "Claude Code gefunden, Argus nutzt dein Abo ohne Zusatzkosten." : "Claude Code fehlt noch: claude.com/download installieren und einmal anmelden. Bis dahin antwortet die lokale KI.";
    cc.classList.toggle("ok", !!suCfg.claudeCode);
  }
  // Empfehlung nach Ausstattung: Strata ab ~48 GB RAM und 16 GB Grafikspeicher, Kompakt ab 8 GB RAM, darunter keine
  function suRecLocal(p) { return p.strataDir && p.ramGB >= 46 && p.vramGB >= 16 ? "strata" : p.ramGB >= 8 ? "kompakt" : "keine"; }
  async function suLocalUi() {
    const p = suPcInfo || (suPcInfo = await window.jarvis.pcInfo().catch(() => null)) || { ramGB: 0, cores: 0 };
    const rec = suRecLocal(p), big = p.ramGB >= 15;
    $("suPc").textContent = `Dein PC: ${p.ramGB} GB Arbeitsspeicher, ${p.cores} Kerne` + (p.gpu ? `, ${p.gpu}${p.vramGB ? ` (${p.vramGB} GB)` : ""}` : "") + "."
      + (rec === "keine" ? " Für eine lokale KI ist das knapp, sie wäre sehr langsam." : "");
    $("suKompaktTxt").textContent = `Argus lädt sie einmalig herunter (${big ? "rund 5 GB, Modell qwen2.5 7B" : "rund 2 GB, Modell qwen2.5 3B"}) und richtet sie selbst ein.`;
    for (const e of document.querySelectorAll("#suLocal .su-rec")) e.hidden = e.dataset.rec !== rec;
    $("suLocalNone").hidden = suVal("suAi") === "ollama";
    if (!suVal("suLocal") || (suVal("suAi") === "ollama" && suVal("suLocal") === "keine")) suSet("suLocal", rec === "keine" && suVal("suAi") === "ollama" ? "kompakt" : rec);
    suStrataDir = suStrataDir || p.strataDir || "";
    const st = $("suStrataState"); st.textContent = suStrataDir ? "Gefunden: " + suStrataDir : p.ramGB < 46 ? `Dein PC hat ${p.ramGB} GB, Strata braucht mehr.` : "Noch nicht installiert. Ist es schon da, wähle unten den Ordner.";
    st.classList.toggle("ok", !!suStrataDir);
    suLocalSel();
  }
  function suLocalSel() {
    const l = suVal("suLocal"); $("suStrataRow").hidden = l !== "strata"; $("suDlRow").hidden = l !== "kompakt";
    $("suDlGo").hidden = suDlStarted;
  }
  window.jarvis.onLocalAI?.((s) => {
    if ($("setup").hidden || !s) return;
    $("suDlBar").style.width = (s.phase === "ready" ? 100 : s.pct ?? 0) + "%";
    $("suDlTxt").textContent = s.phase === "ready" ? "Lokale KI ist bereit." : (s.text || "") + (s.phase === "error" ? " (Argus versucht es später noch einmal)" : " · Du kannst währenddessen weiter einrichten.");
  });
  $("suDlGo").addEventListener("click", async () => {
    suDlStarted = true; suLocalSel(); $("suDlTxt").textContent = "Starte Download …";
    await window.jarvis.setConfig({ backend: suVal("suAi"), ollamaOff: false }); // löst das Herunterladen aus (läuft im Hintergrund weiter)
  });
  $("suStrataPick").addEventListener("click", async () => {
    const r = await window.jarvis.pickFolder(); if (!r?.dir) return;
    if (r.ok) { suStrataDir = r.dir; suLocalUi(); } else { $("suStrataState").textContent = "In diesem Ordner liegt kein Strata (START-HERE.bat fehlt)."; $("suStrataState").classList.remove("ok"); }
  });
  $("suFmTest").addEventListener("click", async () => {
    $("suFmNote").textContent = "Teste …";
    const r = await window.jarvis.foremanTest({ client: $("suFmClient").value, key: $("suFmKey").value }).catch((e) => ({ text: String(e.message || e) }));
    $("suFmNote").textContent = r?.text || "Keine Antwort.";
  });
  for (const e of document.querySelectorAll('input[name="suAi"]')) e.addEventListener("change", suAiUi);
  for (const e of document.querySelectorAll('input[name="suLocal"]')) e.addEventListener("change", suLocalSel);
  const AI_TXT = { auto: "Claude-Abo und lokale KI", ollama: "Nur lokale KI", claude: "Claude per API-Schlüssel", none: "Ohne KI (nachrüstbar unter Einstellungen)" };
  function suSummary() {
    const ai = suVal("suAi"), l = ["auto", "ollama"].includes(ai) ? suVal("suLocal") : "keine", items = [];
    items.push("Name: " + ($("suName").value.trim() || "–"));
    items.push("KI: " + AI_TXT[ai] + (ai === "auto" && !suCfg.claudeCode ? " (Claude Code noch installieren)" : ""));
    if (["auto", "ollama"].includes(ai)) items.push("Lokale KI: " + (l === "kompakt" ? "Kompakt (Ollama)" + (suDlStarted ? ", lädt bereits" : ", lädt nach dem Fertigstellen") : l === "strata" ? "Strata" + (suStrataDir ? "" : " (Ordner noch nicht gewählt)") : "keine"));
    const acc = [$("suMineAddr").value.trim() && "OCEAN", $("suFmClient").value.trim() && "Foreman", ($("suSteamId").value.trim() || $("suSteamKey").value.trim()) && "Steam", $("suDcBot").value.trim() && "Discord"].filter(Boolean);
    items.push("Konten: " + (acc.join(", ") || "keine (später unter Einstellungen)"));
    items.push("Anzeige: " + [$("suSensors").checked && "Temperaturen", $("suWx").checked && "Wetter", $("suBtc").checked && "Bitcoin und News"].filter(Boolean).join(", ") + ($("suAuto").checked ? " · startet mit Windows" : ""));
    $("suSum").replaceChildren(...items.map((t) => { const li = document.createElement("li"); li.textContent = t; return li; }));
    $("suEndNote").textContent = l === "kompakt" ? "Die lokale KI lädt im Hintergrund weiter, bis dahin antwortet " + (ai === "auto" && suCfg.claudeCode ? "Claude." : "Argus im Demo-Modus.") : "Mit Fertigstellen lädt Argus neu und ist bereit.";
  }
  function showSetup(c) {
    if (!expanded) window.jarvis.toggleExpanded();
    suCfg = c; suPcInfo = null; suDlStarted = false; suStrataDir = c.strataDir || "";
    $("suName").value = c.userName || ""; $("suInfo").value = c.userInfo || "";
    suSet("suAi", c.setupDone ? c.backend || "auto" : c.claudeCode ? "auto" : "ollama"); suAiUi();
    if (c.setupDone) suSet("suLocal", c.ollamaOff ? (c.strata?.dir ? "strata" : "keine") : "kompakt");
    if (c.wakeWords?.length && c.setupDone) $("suWake").value = c.wakeWords.join(", ");
    $("suMineAddr").value = c.mineAddr || ""; $("suBtc").checked = c.setupDone ? c.newsOn !== false : false; $("suSteamId").value = c.steamId || "";
    $("suCrash").checked = c.crashReport !== false;
    $("setup").hidden = false; suShow(0); setTimeout(() => $("suName").focus(), 300);
  }
  $("suBack").addEventListener("click", () => { const l = suSteps(); suShow(l[Math.max(0, l.indexOf(suStep) - 1)]); });
  $("suNext").addEventListener("click", async () => {
    if (suStep === 0 && !$("suName").value.trim()) { $("suName").focus(); $("suName").placeholder = "Bitte einen Namen eintragen"; return; }
    if (suStep === 1 && !suVal("suAi")) return;
    if (suStep === 1 && suVal("suAi") === "claude" && !$("suKey").value.trim() && !suCfg.hasApiKey) { $("suKey").focus(); $("suKey").placeholder = "Bitte den Schlüssel eintragen"; return; }
    if (suStep === 1 && suVal("suAi") === "openai" && $("suAiProv").value !== "custom" && !$("suAiKey").value.trim() && !suCfg.hasAiKey) { $("suAiKey").focus(); $("suAiKey").placeholder = "Bitte den Schlüssel eintragen"; return; }
    if (suStep !== 5) { const l = suSteps(); return suShow(l[l.indexOf(suStep) + 1]); }
    await suFinish();
  });
  async function suFinish() {
    const name = $("suName").value.trim(), ai = suVal("suAi"), l = ["auto", "ollama"].includes(ai) ? suVal("suLocal") : "keine";
    const wake = $("suWake").value.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
    const btc = $("suBtc").checked, mineAddr = $("suMineAddr").value.trim(), patch = {
      userName: name, userInfo: $("suInfo").value.trim(), backend: ai, sensors: $("suSensors").checked, weatherOn: $("suWx").checked,
      newsOn: btc, widgets: { btc: { on: btc }, weather: { on: $("suWx").checked } }, mineOn: !!mineAddr, mineAddr, autostart: $("suAuto").checked, crashReport: $("suCrash").checked,
      ollamaOff: l !== "kompakt", setupDone: true,
    };
    if (l === "strata" && suStrataDir) patch.strataDir = suStrataDir;
    if (wake.length) patch.wakeWords = wake;
    if (ai === "claude" && $("suKey").value.trim()) patch.anthropicApiKey = $("suKey").value.trim();
    if (ai === "openai") { patch.aiProv = $("suAiProv").value; patch.aiModel = $("suAiModel").value.trim(); if ($("suAiKey").value.trim()) patch.aiKey = $("suAiKey").value.trim(); }
    const sId = $("suSteamId").value.trim(), sKey = $("suSteamKey").value.trim(), dc = $("suDcBot").value.trim();
    if (sId) patch.steamId = sId; if (sKey) patch.steamKey = sKey; if (sId || sKey) patch.steamOn = true;
    if (dc) { patch.dcBotToken = dc; patch.discordOn = true; }
    const fmClient = $("suFmClient").value.replace(/\D/g, "");
    if (!suCfg.setupDone) patch.miningOn = !!mineAddr || !!fmClient; // neu eingerichtet ohne Mining-Konto: Mining-Rubrik gar nicht erst zeigen
    $("suNext").classList.add("busy");
    try {
      if (fmClient) { await window.jarvis.foremanAccounts([{ name: $("suFmName").value.trim() || "Farm 1", client: fmClient, key: $("suFmKey").value.trim() }]); patch.foremanOn = true; }
      await window.jarvis.setConfig(patch);
    } finally { $("suNext").classList.remove("busy"); }
    userName = name; if (wake.length) WAKE = buildWake(wake);
    $("setup").hidden = true; location.reload(); // alles mit den neuen Einstellungen neu aufbauen
  }
  // ---------- Anleitungen „So geht's“ für Konten und KI (im Assistenten und in den Einstellungen) ----------
  // Schritte als [Text, Link?]; Links öffnen im Browser, `Code` lässt sich markieren und kopieren
  const HELP = {
    claudeCode: { t: "Claude über dein Abo", sub: "Für Claude Pro oder Max. Argus nutzt dann dein Abo, ohne Zusatzkosten.", steps: [
      ["Windows-Taste drücken, „PowerShell“ eingeben und öffnen."],
      ["Diesen Befehl einfügen und Enter drücken: `irm https://claude.ai/install.ps1 | iex`"],
      ["Meldet der Installer, dass Git fehlt: Git für Windows installieren und Schritt 2 wiederholen.", "https://git-scm.com/download/win"],
      ["PowerShell schließen, neu öffnen, `claude` eingeben und Enter."],
      ["Im Browser mit deinem Claude-Konto anmelden und zustimmen. Danach das PowerShell-Fenster schließen."],
      ["Argus neu starten (Rechtsklick auf das Symbol unten rechts, Beenden, wieder öffnen). Oben steht dann „Claude · dein Abo“."]] },
    apiKey: { t: "Claude per API-Schlüssel", sub: "Ohne Abo, du zahlst pro Anfrage. Kurze Fragen kosten Bruchteile eines Cents.", steps: [
      ["Konsole öffnen und anmelden oder registrieren.", "https://console.anthropic.com/"],
      ["Unter „Billing“ ein kleines Guthaben aufladen, zum Beispiel 5 $."],
      ["Unter „API Keys“ auf „Create Key“, Namen „Argus“ eingeben, Schlüssel kopieren (beginnt mit sk-ant-)."],
      ["In Argus einfügen. Der Schlüssel wird nur einmal angezeigt, Argus speichert ihn verschlüsselt."]] },
    strata: { t: "Strata (große lokale KI)", sub: "Nur für starke PCs: rund 30 GB freier Arbeitsspeicher und eine Grafikkarte mit mindestens 16 GB.", steps: [
      ["Strata wird nicht von Argus geladen, du brauchst das Strata-Paket separat (zum Beispiel von dem, der dir Argus empfohlen hat)."],
      ["Den Ordner zum Beispiel nach C:\\Users\\<Name>\\Strata entpacken. Darin liegt START-HERE.bat."],
      ["In Argus den Ordner wählen oder leer lassen, Argus sucht ihn dann selbst."],
      ["Mit dem Knopf „Strata“ im Panel ein- und ausschalten. Der erste Start dauert etwa 20 Sekunden."]] },
    ocean: { t: "OCEAN-Pool verbinden", sub: "Kein Konto und kein Passwort nötig, die Pool-Statistik ist öffentlich.", steps: [
      ["Deine Adresse ist die Bitcoin-Adresse, die in deinen Minern als Pool-Benutzername steht (bei „adresse.worker“ der Teil vor dem Punkt)."],
      ["Prüfen: auf ocean.xyz die Adresse ins Suchfeld einfügen. Siehst du deine Worker, stimmt sie.", "https://ocean.xyz/"],
      ["In Argus eine Adresse pro Zeile eintragen, gern mit Namen davor: `Farm A = bc1q…`"]] },
    foreman: { t: "Foreman verbinden", sub: "Für die Farm-Überwachung (Miner online, Hashrate, Heatmap, Tagesreport).", steps: [
      ["Bei Foreman anmelden.", "https://dashboard.foreman.mn/"],
      ["Oben rechts auf dein Profil, dann „API Information“ (dieselben Daten wie für Pickaxe)."],
      ["„Client ID“ und „API Key“ kopieren und in Argus eintragen."],
      ["„Verbindung testen“ drücken. Kommt „Verbunden“, passt es. Weitere Farmen unter Einstellungen, Mining, „+ Konto hinzufügen“."]] },
    steam: { t: "Steam-Freunde anzeigen", sub: "Argus zeigt, wer online ist und was gespielt wird.", steps: [
      ["Steam-API-Schlüssel holen (mit deinem Steam-Konto anmelden).", "https://steamcommunity.com/dev/apikey"],
      ["Bei „Domain“ einfach `localhost` eintragen, zustimmen, Schlüssel kopieren."],
      ["Dein Profil-Link: in Steam auf deinen Namen, Rechtsklick, „Seiten-URL kopieren“."],
      ["Damit Freunde sichtbar sind: Steam, Profil bearbeiten, Privatsphäre: „Mein Profil“ und „Freundesliste“ auf Öffentlich."]] },
    discordServer: { t: "Discord-Server anzeigen", sub: "Wer auf deinem Server im Sprachkanal sitzt, ohne Bot.", steps: [
      ["In Discord: Servereinstellungen, „Widget“ (manchmal unter „Beteiligung“), „Server-Widget aktivieren“ einschalten."],
      ["Auf derselben Seite die Server-ID kopieren und in Argus eintragen."],
      ["Private Sprachkanäle: Rechtsklick auf den Kanal, „Link kopieren“, in Argus unter „Private Sprachkanäle“ einfügen."]] },
    discordBot: { t: "Eigener Discord-Bot", sub: "Optional, für Kamera-, Live- und Stumm-Anzeigen. Nie dein persönliches Konto oder Token verwenden.", steps: [
      ["Entwicklerportal öffnen, „New Application“, Namen „Argus“.", "https://discord.com/developers/applications"],
      ["Links „Bot“, dann „Reset Token“ und den Token kopieren. Er wird nur einmal angezeigt."],
      ["Links „OAuth2“, „URL Generator“: Haken bei „bot“, unten „View Channels“ und (fürs Beitreten per Bot, optional) „Move Members“. Den Link öffnen und den Bot auf deinen Server einladen."],
      ["Token in Argus einfügen. Argus speichert ihn verschlüsselt und spricht damit nur mit Discord."]] },
  };
  function showHelp(k) {
    const h = HELP[k]; if (!h) return;
    $("hpTitle").textContent = h.t; $("hpSub").textContent = h.sub || "";
    $("hpSteps").replaceChildren(...h.steps.map(([txt, url]) => {
      const li = document.createElement("li");
      txt.split(/(`[^`]+`)/).forEach((part) => { if (/^`.*`$/.test(part)) { const c = document.createElement("code"); c.textContent = part.slice(1, -1); li.append(c); } else li.append(part); });
      if (url) { const a = document.createElement("a"); a.textContent = " " + url.replace(/^https:\/\//, "").replace(/\/$/, "") + " ↗"; a.addEventListener("click", () => window.jarvis.openUrl(url)); li.append(a); }
      return li;
    }));
    $("helpPop").hidden = false;
  }
  document.addEventListener("click", (e) => { const b = e.target.closest?.(".help-btn"); if (!b) return; e.preventDefault(); e.stopPropagation(); showHelp(b.dataset.help); }, true);
  $("hpClose").addEventListener("click", () => { $("helpPop").hidden = true; });
  // ---------- Fehlerbericht nach Absturz (nur mit Zustimmung, als GitHub-Issue) ----------
  let crTitle = "", crHistId = null, crDone = false;
  // Fenster an der Kopfzeile verschieben (bleibt im Bild)
  function dragPop(pop, handle) {
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return;
      const r = pop.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      pop.style.transform = "none"; pop.style.left = r.left + "px"; pop.style.top = r.top + "px";
      const mv = (m) => { pop.style.left = Math.max(0, Math.min(innerWidth - 120, m.clientX - dx)) + "px"; pop.style.top = Math.max(0, Math.min(innerHeight - 50, m.clientY - dy)) + "px"; };
      const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
      addEventListener("pointermove", mv); addEventListener("pointerup", up);
    });
  }
  const fmtT = (t) => new Date(t).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  function crOpen(title, text, hist) {
    crTitle = title; crHistId = hist?.id || null; crDone = false; $("crText").value = text; $("crIgnore").checked = false;
    $("crIgnore").parentElement.hidden = !!hist || /Nutzer/.test(title); $("crDel").hidden = !hist; $("crNo").textContent = hist ? "Schließen" : "Nicht senden";
    $("crTitleH").textContent = hist ? "Gespeicherter Bericht" : "Fehlerbericht"; $("crState").hidden = !hist; if (hist) $("crState").textContent = fmtT(hist.t) + " · " + hist.state + " · wird nach 14 Tagen gelöscht";
    $("crashPop").hidden = false;
  }
  function showCrash(r) { if (!r) return; if (!expanded) window.jarvis.toggleExpanded(); crOpen(r.title, r.text, null); }
  async function crRender() {
    const l = await window.jarvis.crashList().catch(() => []), box = $("crList");
    if (!l.length) { box.replaceChildren(Object.assign(document.createElement("div"), { className: "cr-empty", textContent: "Noch keine Berichte gespeichert." })); return; }
    box.replaceChildren(...l.map((it) => { const b = document.createElement("button"); b.type = "button"; b.className = "cr-item"; b.title = "Bericht ansehen";
      const t = document.createElement("b"); t.textContent = it.title; const g = document.createElement("span"); g.className = "tag" + (it.state === "gesendet" ? " sent" : ""); g.textContent = it.state; const d = document.createElement("small"); d.textContent = fmtT(it.t);
      b.append(t, g, d); b.addEventListener("click", async () => { const v = await window.jarvis.crashView(it.id); if (v) crOpen(v.title, v.text, v); else crRender(); }); return b; }));
  }
  const crClose = () => {
    if (!crHistId && !crDone) window.jarvis.crashDismiss($("crIgnore").checked, crTitle, $("crText").value).then(() => crRender());
    $("crashPop").hidden = true;
  };
  $("crNo").addEventListener("click", crClose); $("crX").addEventListener("click", crClose);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("crashPop").hidden) crClose(); });
  dragPop($("crashPop"), $("crHead"));
  $("crCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(crTitle + "\n\n" + $("crText").value); notice("Fehlerbericht kopiert"); } catch { $("crText").select(); document.execCommand("copy"); }
    if (!crHistId && !crDone) { crDone = true; await window.jarvis.crashArchive(crTitle, $("crText").value, "kopiert"); crRender(); }
  });
  $("crSend").addEventListener("click", async () => { crDone = true; await window.jarvis.crashSend(crTitle, $("crText").value); $("crashPop").hidden = true; notice("GitHub öffnet sich, dort noch auf „Submit new issue“ klicken"); crRender(); });
  $("crDel").addEventListener("click", async () => { if (crHistId) await window.jarvis.crashDel(crHistId); $("crashPop").hidden = true; crRender(); });
  $("setCrashNow").addEventListener("click", async () => { showCrash(await window.jarvis.crashGet(true)); }); // Einstellungen bleiben offen
  crRender();
  $("setCrash").addEventListener("change", (e) => window.jarvis.setConfig({ crashReport: e.target.checked }));
  window.jarvis.getConfig?.().then((c) => { $("setCrash").checked = c.crashReport !== false; if (c.setupDone) setTimeout(() => window.jarvis.crashGet(false).then(showCrash).catch(() => {}), 6000); });
  $("setUserName").addEventListener("change", (e) => { userName = e.target.value.trim(); window.jarvis.setConfig({ userName }); });
  $("setUserInfo").addEventListener("change", (e) => window.jarvis.setConfig({ userInfo: e.target.value.trim() }));
  $("setExport").addEventListener("click", async () => { const r = await window.jarvis.settingsExport(); if (r?.ok) $("setExpNote").textContent = "Gesichert: " + r.file; });
  $("setImport").addEventListener("click", async () => { const r = await window.jarvis.settingsImport(); if (r?.ok) $("setExpNote").textContent = `${r.n} Einstellungen geladen, Argus startet neu …`; else if (r?.error) $("setExpNote").textContent = r.error; });
  $("setRerun").addEventListener("click", () => window.jarvis.getConfig().then((c) => { $("settings").hidden = true; showSetup(c); }));
  window.jarvis.getConfig?.().then((c) => {
    userName = c.userName || ""; $("setUserName").value = userName; $("setUserInfo").value = c.userInfo || "";
    if (!c.setupDone) setTimeout(() => showSetup(c), 800);
  });


// ---------- Design-Test: Ruhiges Design als Option ----------
(() => {
  const body = document.body;
  const apply = (c) => {
    body.dataset.design = c.design === "ruhig" ? "ruhig" : "klassisch";
    body.dataset.dset = c.designSet !== false ? "1" : "0"; body.dataset.dblk = c.designBlk !== false ? "1" : "0"; body.dataset.dtype = c.designType !== false ? "1" : "0";
    body.dataset.dbtn = c.design === "ruhig" && c.designBtn === "ruhig" ? "ruhig" : "";
  };
  const fill = (c) => { $("setDesign").value = c.design === "ruhig" ? "ruhig" : "klassisch"; $("setDSet").checked = c.designSet !== false; $("setDBlk").checked = c.designBlk !== false; $("setDType").checked = c.designType !== false; $("setDBtn").value = c.designBtn === "ruhig" ? "ruhig" : ""; };
  const save = (patch) => { window.jarvis.setConfig(patch); window.jarvis.getConfig().then(apply); };
  window.jarvis.getConfig().then((c) => { apply(c); fill(c); });
  $("setDesign").addEventListener("change", (e) => save({ design: e.target.value }));
  $("setDSet").addEventListener("change", (e) => save({ designSet: e.target.checked }));
  $("setDBlk").addEventListener("change", (e) => save({ designBlk: e.target.checked }));
  $("setDType").addEventListener("change", (e) => save({ designType: e.target.checked }));
  $("setDBtn").addEventListener("change", (e) => save({ designBtn: e.target.value }));
})();

$("setDonate").addEventListener("change", (e) => { const v = e.target.value.trim(); window.jarvis.setConfig({ donateUrl: /^https:\/\/\S+$/i.test(v) ? v : "" }); if (v && !/^https:\/\//i.test(v)) { e.target.value = ""; try { notice("Nur https-Adressen sind erlaubt."); } catch {} } });
$("setDonateBtn").addEventListener("click", () => window.jarvis.openDonate?.());

// Saved requests remain intact; unavailable relationships access never substitutes server members.
$("dcFriendsUnavailable").textContent = window.argusDiscordList.capability.reason;
$("setDcVoice").checked = true;

$("setBackgroundPresentation").addEventListener("change", e => window.jarvis.setConfig({ backgroundPresentation: e.target.value }));
window.jarvis.getConfig().then(c => { $("setBackgroundPresentation").value = c.backgroundPresentation || "fluid"; });
