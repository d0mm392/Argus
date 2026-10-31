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
    window.argus.setConfig({ reduceAnimations: event.target.checked });
  });
  window.argus.getConfig().then(config => applyMotion(config.reduceAnimations));
})();
