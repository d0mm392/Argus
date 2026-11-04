"use strict";
window.share.onBar((s) => {
  document.getElementById("txt").textContent = "Du überträgst " + (s.audio ? "Bild und Ton" : "dein Bild") + (s.peer ? " an " + s.peer : "");
});
document.getElementById("stop").onclick = () => window.share.barStop();
document.getElementById("show").onclick = () => window.share.barShow();
