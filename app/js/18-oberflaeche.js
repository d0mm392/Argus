"use strict";
(() => {
  const applySkin = skin => {
    const selected = ["light", "dark"].includes(skin) ? skin : "classic";
    document.body.dataset.uiSkin = selected;
    for (const radio of document.querySelectorAll('[name="uiSkin"]')) radio.checked = radio.value === selected;
  };
  const applyMotion = value => {
    document.body.classList.toggle("reduce-animations", !!value);
    reduceMotion = !!value || matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("setReduceAnimations").checked = !!value;
  };
  for (const radio of document.querySelectorAll('[name="uiSkin"]')) radio.addEventListener("change", e => {
    if (!e.target.checked) return;
    applySkin(e.target.value); window.jarvis.setConfig({ uiSkin: e.target.value });
  });
  $("setReduceAnimations").addEventListener("change", e => { applyMotion(e.target.checked); window.jarvis.setConfig({ reduceAnimations: e.target.checked }); });
  window.jarvis.getConfig().then(c => { applySkin(c.uiSkin); applyMotion(c.reduceAnimations); });
})();
