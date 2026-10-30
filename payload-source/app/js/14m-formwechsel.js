"use strict";
// Option: Die Form wechselt von selbst zufällig. Das alte Bild bleibt als Schicht stehen und verschmilzt weich mit der neuen Form.
(() => {
  const sel = $("setShapeRand"), FADE = 1800;
  let timer = null;
  function change() {
    if (document.hidden || typeof shape === "undefined" || drag || setOpen) return;
    const opts = [...$("setShape").options].map((o) => o.value).filter((v) => v && v !== shape);
    if (!opts.length) return;
    const next = opts[Math.floor(Math.random() * opts.length)], cv = $("brain");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { shape = next; resize(); } else {
      const ov = document.createElement("canvas"); ov.width = cv.width; ov.height = cv.height;
      Object.assign(ov.style, { position: "absolute", left: cv.offsetLeft + "px", top: cv.offsetTop + "px", width: cv.offsetWidth + "px", height: cv.offsetHeight + "px", pointerEvents: "none", opacity: "1", transition: `opacity ${FADE}ms ease-in-out`, zIndex: "2" });
      ov.getContext("2d").drawImage(cv, 0, 0); cv.parentNode.appendChild(ov);
      shape = next; resize();
      cv.style.transition = "none"; cv.style.opacity = "0";
      requestAnimationFrame(() => requestAnimationFrame(() => { cv.style.transition = `opacity ${FADE}ms ease-in-out`; cv.style.opacity = "1"; ov.style.opacity = "0"; }));
      setTimeout(() => { ov.remove(); cv.style.transition = ""; cv.style.opacity = ""; }, FADE + 150);
    }
    $("setShape").value = next; try { applyShapeWords(); } catch {} window.jarvis.setConfig({ shape: next }); window.onPageStyle?.();
  }
  const pv = $("setPulse"); pv.addEventListener("change", () => { pulseStyle = pv.value; window.jarvis.setConfig({ pulseStyle }); });
  window.jarvis.getConfig().then((c) => { pulseStyle = c.pulseStyle || "punkte"; pv.value = pulseStyle; }).catch(() => {});
  const ns = $("setNodeStyle"), au = $("setAura"), bt = $("setBreath");
  ns.addEventListener("change", () => { nodeStyle = ns.value; window.jarvis.setConfig({ nodeStyle }); });
  au.addEventListener("change", () => { auraMode = au.value; window.jarvis.setConfig({ aura: auraMode }); });
  bt.addEventListener("change", () => { breathOn = bt.checked; window.jarvis.setConfig({ breath: breathOn }); });
  window.jarvis.getConfig().then((c) => { nodeStyle = c.nodeStyle || "punkt"; ns.value = nodeStyle; auraMode = c.aura || "aus"; au.value = auraMode; breathOn = !!c.breath; bt.checked = breathOn; }).catch(() => {});
  const arm = (min) => { clearInterval(timer); timer = null; if (min > 0) timer = setInterval(change, min * 60e3); };
  sel.addEventListener("change", () => { const m = +sel.value || 0; window.jarvis.setConfig({ shapeRand: m }); arm(m); });
  window.jarvis.getConfig().then((c) => { sel.value = String(c.shapeRand || 0); arm(+c.shapeRand || 0); }).catch(() => {});
})();
