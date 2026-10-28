"use strict";
const assert=require("node:assert/strict"),fs=require("fs"),path=require("path");
const {app}=require("electron"),{setup}=require("./renderer-fixture");
async function run(){
 const {root,config,evaluate,evaluateWithValue,wait,screenshot,errors}=await setup();
 const baseline=fs.readFileSync(path.join(__dirname,"fixtures/classic-before-skins.css"),"utf8");
 assert.equal(fs.readFileSync(path.join(root,"app/style.css"),"utf8").replace(/\r\n/g,"\n"),baseline.replace(/\r\n/g,"\n"));
 const migrate=require(path.join(root,"app/appearance")).migrate;
 for(const skin of [undefined,"classic","light","dark"]){
   const original={uiSkin:skin,notesByPage:{start:{text:"keep"}},fpsIdle:15,ytRound:23};
   const next={...original,...migrate(original)};assert.equal(next.uiSkin,"classic");
   delete next.uiSkin;delete original.uiSkin;assert.deepEqual(next,original);
 }
 assert.equal(config.uiSkin,"classic");
 assert.equal(await evaluate('document.querySelectorAll(\'[name="uiSkin"],.skin-picks,.skin-preview,link[href="skins.css"]\').length'),0);
 const snapshot=()=>evaluateWithValue(()=>{
   const properties=["color","backgroundColor","fontFamily","fontSize","fontWeight","lineHeight","letterSpacing","borderRadius","boxShadow","padding","gap","minHeight"];
   return Object.fromEntries(["body",".shell",".bar .btn.icon",".settings",".set-body",".set-body .row",".set-body h4","#notes","#notesText"].map(selector=>{
     const style=getComputedStyle(document.querySelector(selector));return[selector,Object.fromEntries(properties.map(property=>[property,style[property]]))];
   }));
 },null);
 const current=await snapshot();
 await evaluateWithValue(css=>{document.querySelector('link[href="style.css"]').disabled=true;const style=document.createElement("style");style.id="baselineStyle";style.textContent=css;document.head.append(style);return true;},baseline);
 await wait(30);assert.deepEqual(await snapshot(),current,"classic matches actual stylesheet before skins");
 await evaluate('document.getElementById("baselineStyle").remove();document.querySelector(\'link[href="style.css"]\').disabled=false;true');
 await screenshot("classic-only");assert.equal(config.notesByPage.start.pages[0].text,"Synthetic Start note");assert.deepEqual(errors,[]);
 console.log("PASS classic-only: no Apple controls/styles, light/dark preferences migrate without other changes, original pre-skin CSS and computed styling retained");app.exit(0);
}
run().catch(error=>{console.error(error.stack);app.exit(1);});setTimeout(()=>app.exit(2),15000).unref();
