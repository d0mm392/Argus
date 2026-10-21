"use strict";
  // ---------- Start ----------
  async function init() {
    const cfg = await window.jarvis.getConfig();
    WAKE = buildWake(cfg.wakeWords);
    widgets = cfg.widgets || {};
    hiddenApps = new Set(cfg.hiddenApps || []);
    viz = { ...viz, ...(cfg.viz || {}) }; pins = cfg.pins || {}; micFloatOn = cfg.micFloat !== false;
    shape = cfg.shape || "kugel"; shapeRim = cfg.shapeRim !== false; glowK = cfg.glow ?? 1; resize(); applyShapeWords(); markShape();
    scales = cfg.scales || {};
    swayMul = { schweben: 1, leicht: 0.4, fest: 0 }[cfg.sway] ?? 1; ytSize = cfg.ytEmbedSize || "m"; dcVoiceOnly = cfg.discordVoiceOnly !== false;
    winColor = { ...winColor, ...(cfg.winColor || {}) }; friendsBox = { ...friendsBox, ...(cfg.friendsBox || {}) }; friendsFold = cfg.friendsFold || {}; myDc = normDc(cfg.discordName); extraVoice = cfg.extraVoice || []; bot = cfg.dcBot || bot; dcIcons = cfg.dcIcons !== false; mediaOn = cfg.mediaOn !== false; sysBox = { ...sysBox, ...(cfg.sysBox || {}) }; applySysBox();
    ballOff = cfg.ballOff || ballOff; freeLayout = cfg.panelLayout && Object.keys(cfg.panelLayout).length ? cfg.panelLayout : null; applyLayout();
    if (cfg.pillOff) pillOff = { small: { x: 0, y: 0, s: 1, ...cfg.pillOff.small }, big: { x: 0, y: 0, s: 1, ...cfg.pillOff.big } }; applyPill(); applyWinColor(); applyFriendsBox();
    btcCur = cfg.btcCur || "USD"; autoOpen = cfg.autoOpen !== false; if (cfg.market) market = cfg.market;
    opacity = { ...opacity, ...(cfg.opacity || {}) }; applyOpacity();
    window.jarvis.onNotice?.((t) => { notice(t); log(t); refreshBackend(); });
    theme = { hue: cfg.themeHue ?? 205, regions: cfg.themeRegions || "bunt" }; applyTheme();
    setTts(cfg.voiceOutput !== false);
    const onVoice = (s) => {
      voice.ready = !!s.ready; voice.status = s.text;
      if (!s.ready) { notice(s.text); $("capRegion").textContent = s.text; }
      else if (cfg.micOnStart && !voice.on && !voice.userOff) startVoice();
    };
    window.jarvis.onVoiceStatus(onVoice);
    alertsVoice = !!cfg.systemAlertsVoice;
    window.jarvis.onSystem(onSystem);
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
