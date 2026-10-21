const { run } = require("./harness"); const fs = require("fs");
run(async ({ w, ev, wait }) => {
  await ev(`document.getElementById('crashPop').hidden=true; true`);
  const shapes = await ev(`[...document.getElementById('setShape').options].map(o=>o.value)`);
  let i = 0;
  for (const v of shapes) {
    await ev(`(()=>{const a=document.getElementById('setShape'); a.value='${v}'; a.dispatchEvent(new Event('change')); return true})()`); await wait(2200);
    const r = await ev(`(()=>{const b=document.getElementById('brain').getBoundingClientRect(); return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]})()`);
    const img = await w.webContents.capturePage({ x: Math.max(0, r[0]), y: Math.max(0, r[1]), width: r[2], height: r[3] });
    fs.writeFileSync(process.env.SHOTS + `/s${String(i++).padStart(2, "0")}-${v}.png`, img.toPNG());
  }
  console.log("SHAPES", shapes.join(","));
});
