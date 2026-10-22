// Sprache der Oberfläche: Deutsch (Original) oder Englisch. Übersetzt feste Beschriftungen und Hinweistexte aus der Liste I18N_EN,
// auch neu eingefügte Texte (MutationObserver). Meldungen mit Zahlen und Namen werden schrittweise ergänzt.
(() => {
  const dec = document.createElement("textarea"), decode = (s) => { dec.innerHTML = s; return dec.value; };
  const MAP = new Map(); for (const [k, v] of Object.entries(I18N_EN)) MAP.set(decode(k).trim(), decode(v));
  const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CANVAS", "CODE", "PRE"]);
  const ATTRS = ["title", "placeholder", "aria-label"];
  const orig = new WeakMap(); // Textknoten → deutscher Originaltext
  let lang = "de", obs = null, queue = new Set(), raf = 0;
  const trText = (s) => { const t = s.trim(); if (!t) return null; const e = MAP.get(t); return e ? s.replace(t, e) : null; };
  function doText(n) {
    if (n.parentNode && SKIP.has(n.parentNode.nodeName)) return;
    const v = n.nodeValue, o = orig.get(n);
    if (o !== undefined && trText(o) === v) return; // schon übersetzt
    const r = trText(v); if (r != null) { orig.set(n, v); n.nodeValue = r; }
  }
  function doAttrs(el) {
    for (const a of ATTRS) {
      if (!el.hasAttribute?.(a)) continue; const v = el.getAttribute(a), key = "data-de-" + a, o = el.getAttribute(key);
      if (o != null && MAP.get(o.trim()) === v) continue;
      const e = MAP.get(v.trim()); if (e) { el.setAttribute(key, v); el.setAttribute(a, e); }
    }
  }
  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
    doAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (n.nodeType === 3) doText(n); else if (!SKIP.has(n.nodeName)) doAttrs(n); }
  }
  function revert() {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (n.nodeType === 3) { const o = orig.get(n); if (o !== undefined) { n.nodeValue = o; orig.delete(n); } }
      else for (const a of ATTRS) { const o = n.getAttribute(`data-de-${a}`); if (o != null) { n.setAttribute(a, o); n.removeAttribute(`data-de-${a}`); } }
    }
  }
  function flush() { raf = 0; const q = [...queue]; queue.clear(); for (const n of q) if (n.isConnected) walk(n); }
  function setLang(l) {
    l = l === "en" ? "en" : "de"; if (l === lang && (obs || l === "de")) return; lang = l; document.documentElement.lang = l;
    if (obs) { obs.disconnect(); obs = null; }
    if (l === "en") {
      walk(document.body);
      obs = new MutationObserver((ms) => { for (const m of ms) { if (m.type === "childList") m.addedNodes.forEach((n) => queue.add(n)); else if (m.type === "characterData") queue.add(m.target); else queue.add(m.target); } if (!raf) raf = requestAnimationFrame(flush); });
      obs.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ATTRS });
    } else revert();
  }
  window.argusLang = { set: setLang, get: () => lang };
  window.jarvis.getConfig().then((c) => { const s = $("setLang"); if (s) s.value = c.lang === "en" ? "en" : "de"; setLang(c.lang); }).catch(() => {});
  $("setLang")?.addEventListener("change", (e) => { window.jarvis.setConfig({ lang: e.target.value }); setLang(e.target.value); });
})();
