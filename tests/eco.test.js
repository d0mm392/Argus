// UI-Test Sparoptik. Aufruf: xvfb-run -a npx electron --no-sandbox tests/eco.test.js
const { run } = require("./harness");
run(async ({ ev, wait, check }) => {
  const cfg = () => ev(`window.argus.getConfig()`);
  await ev(`document.getElementById('crashPop').hidden=true; true`);
  // R-ECO-1: Sparoptik. „immer“ setzt body.eco-calm und Pixeldichte 1, „aus“ entfernt die Klasse, der Wert wird gespeichert.
  const setEco = async (v) => { await ev(`(()=>{ const s=document.getElementById('setEco'); s.value=${JSON.stringify(v)}; s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`); await wait(900); };
  const cls = () => ev(`document.body.classList.contains('eco-calm')`);
  await setEco("immer"); const eImmer = await cls();
  const dprImmer = await ev(`document.getElementById('brain').width / document.getElementById('stage').clientWidth`);
  await setEco("aus"); const eAus = await cls();
  await setEco("ruhe"); const stored = (await cfg()).ecoLook;
  check("R-ECO-1 Sparoptik: „immer“ setzt eco-calm und Pixeldichte 1, „aus“ entfernt sie, Wert wird gespeichert", eImmer === true && eAus === false && stored === "ruhe" && dprImmer <= 1.01, { eImmer, eAus, stored, dprImmer });
});
