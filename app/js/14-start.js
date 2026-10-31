"use strict";
  // ---------- Start ----------
  async function init() {
    const cfg = await window.argus.getConfig();
    WAKE = buildWake(cfg.wakeWords);
    widgets = cfg.widgets || {};
    hiddenApps = new Set(cfg.hiddenApps || []);
    viz = { ...viz, ...(cfg.viz || {}) }; pins = cfg.pins || {}; micFloatOn = cfg.micFloat !== false;
    shape = SHAPES.some(([v]) => v === cfg.shape) ? cfg.shape : "kugel"; flashK = cfg.flashK ?? 1; $("setFlash").value = flashK; if (cfg.version) $("appVer").textContent = "v" + cfg.version; hiddenFans = Array.isArray(cfg.hiddenFans) ? cfg.hiddenFans : []; flashT = cfg.flashT ?? 0.5; $("setFlashT").value = flashT; shapeRim = cfg.shapeRim !== false; flat2d = cfg.shape2d === true; $("setShape2d").checked = flat2d; sync2dPick(); glowK = cfg.glow ?? 1; resize(); applyShapeWords(); markShape();
    scales = cfg.scales || {};
    swayMul = { schweben: 1, leicht: 0.4, fest: 0 }[cfg.sway] ?? 1; ytSize = cfg.ytEmbedSize || "m"; dcVoiceOnly = cfg.discordVoiceOnly !== false; dcAlsoOnline = !!cfg.discordAlsoOnline; dcOnlyMarked = !!cfg.dcOnlyMarked; dcMarked = Array.isArray(cfg.dcMarked) ? cfg.dcMarked : [];
    winColor = { ...winColor, ...(cfg.winColor || {}) }; friendsBox = { ...friendsBox, ...(cfg.friendsBox || {}) }; friendsFold = cfg.friendsFold || {}; myDc = normDc(cfg.discordName); extraVoice = cfg.extraVoice || []; bot = cfg.dcBot || bot; dcIcons = cfg.dcIcons !== false; mediaOn = cfg.mediaOn !== false; sysBox = { ...sysBox, ...(cfg.sysBox || {}) }; applySysBox();
    ballOff = cfg.ballOff || ballOff; freeLayout = cfg.panelLayout && Object.keys(cfg.panelLayout).length ? cfg.panelLayout : null; restoreNotesGeometry(cfg.page || "Start"); applyLayout();
    if (cfg.pillOff) pillOff = { small: { x: 0, y: 0, s: 1, ...cfg.pillOff.small }, big: { x: 0, y: 0, s: 1, ...cfg.pillOff.big } }; applyPill(); applyWinColor(); applyFriendsBox();
    btcCur = cfg.btcCur || "USD"; autoOpen = cfg.autoOpen !== false; if (cfg.market) market = cfg.market;
    opacity = { ...opacity, ...(cfg.opacity || {}) }; applyOpacity();
    window.argus.onNotice?.((t) => { notice(t); log(t); refreshBackend(); });
    theme = { hue: cfg.themeHue ?? 205, regions: cfg.themeRegions || "bunt" }; applyTheme();
    setTts(cfg.voiceOutput !== false);
    const onVoice = (s) => {
      voice.ready = !!s.ready; voice.status = s.text;
      if (!s.ready) { notice(s.text); $("capRegion").textContent = s.text; }
      else if (cfg.micOnStart && !voice.on && !voice.userOff) startVoice();
    };
    window.argus.onVoiceStatus(onVoice);
    alertsVoice = !!cfg.systemAlertsVoice;
    window.argus.onSystem(onSystem);
    onSystem(cfg.system);
    onVoice(cfg.voice);
    await refreshBackend();
    log("KI: " + backend.label);
  }

  resize();
  setState("idle");
  log("Argus gestartet");
  init();
  started = true;
  requestAnimationFrame(frame);
