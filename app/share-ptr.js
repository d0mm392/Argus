"use strict";
window.share.onPointer((p) => {
  document.body.replaceChildren();
  const x = p.x * window.innerWidth, y = p.y * window.innerHeight;
  const r = document.createElement("div"); r.className = "ring"; r.style.left = x + "px"; r.style.top = y + "px";
  const l = document.createElement("div"); l.className = "lab"; l.style.left = x + "px"; l.style.top = y + "px"; l.textContent = p.label ? p.label + " zeigt hierhin" : "Hier";
  document.body.append(r, l);
});
