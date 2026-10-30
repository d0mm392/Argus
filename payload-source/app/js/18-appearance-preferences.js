"use strict";
(() => {
  document.body.dataset.uiSkin = "classic";
  const applyMotion = value => {
    document.body.classList.toggle("reduce-animations", !!value);
    reduceMotion = !!value || matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("setReduceAnimations").checked = !!value;
  };
  $("setReduceAnimations").addEventListener("change", event => {
    applyMotion(event.target.checked);
    window.jarvis.setConfig({ reduceAnimations: event.target.checked });
  });
  window.jarvis.getConfig().then(config => applyMotion(config.reduceAnimations));
})();
