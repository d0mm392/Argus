// Einstellungen: Erklärungen erscheinen nur beim Darüberfahren (statt als Fließtext), Zeilen bleiben kompakt
(() => {
  const body = document.querySelector(".set-body"); if (!body) return;
  // statische Hinweise und title-Texte werden zur Erklärung der Zeile davor; Hinweise mit id (Status) bleiben stehen
  const tip = (el, text) => { text = text.trim(); if (!text) return; el.dataset.tip = el.dataset.tip ? el.dataset.tip + "\n\n" + text : text; el.classList.add("has-tip"); };
  let last = null;
  for (const el of [...body.children]) {
    if (el.classList.contains("set-note") && !el.id && !el.querySelector("[id]")) {
      if (last) { tip(last, el.textContent); el.classList.add("note-folded"); }
      continue;
    }
    if (!el.classList.contains("set-note")) last = el;
  }
  for (const el of body.querySelectorAll("[title]")) { const t = el.getAttribute("title"); if (!t || el.tagName === "BUTTON" && el.closest(".set-head")) continue; tip(el, t); el.removeAttribute("title"); }
  // eigene Sprechblase (die Liste scrollt, ein Pseudoelement würde abgeschnitten)
  const box = document.createElement("div"); box.id = "tipBox"; box.hidden = true; document.body.append(box);
  let timer = 0, cur = null;
  const hide = () => { clearTimeout(timer); timer = 0; cur = null; box.hidden = true; };
  body.addEventListener("mouseover", (e) => {
    const el = e.target.closest?.(".has-tip"); if (!el || el === cur) return;
    hide(); cur = el;
    timer = setTimeout(() => {
      box.textContent = el.dataset.tip; box.hidden = false;
      const r = el.getBoundingClientRect(), bw = box.offsetWidth, bh = box.offsetHeight;
      box.style.left = Math.max(8, Math.min(innerWidth - bw - 8, r.left)) + "px";
      box.style.top = (r.bottom + bh + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - bh - 4)) + "px";
    }, 300);
  });
  body.addEventListener("focusin", e => e.target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  body.addEventListener("focusout", hide);
  body.addEventListener("mouseout", (e) => { if (cur && !cur.contains(e.relatedTarget)) hide(); });
  body.addEventListener("scroll", hide); body.addEventListener("pointerdown", hide);
})();

// Formwahl: in Reihen zu 6 und als Ganzes einklappbar (Stand wird gemerkt)
(() => {
  const pick = document.getElementById("shapePick"); if (!pick) return;
  const btn = document.getElementById("pickToggle");
  let closed = false; try { closed = localStorage.getItem("jarvisShapesClosed") === "1"; } catch {}
  const label = () => { const cur = [...pick.children].find((b) => b.getAttribute("aria-checked") === "true"); btn.replaceChildren(document.createTextNode("Form: "), Object.assign(document.createElement("b"), { textContent: cur?.textContent || "" })); };
  const render = () => { pick.hidden = closed; btn.classList.toggle("closed", closed); label(); };
  btn.addEventListener("click", () => { closed = !closed; try { localStorage.setItem("jarvisShapesClosed", closed ? "1" : ""); } catch {} render(); });
  new MutationObserver(label).observe(pick, { subtree: true, attributes: true, attributeFilter: ["aria-checked"] });
  render();
})();
