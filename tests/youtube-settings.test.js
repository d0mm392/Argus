"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const youtube=require("../app/youtube-settings");
test("all former modes migrate to integrated playback without touching layout or notes",()=>{
 for(const mode of ["brave","fenster","panel"]){
  const original={ytMode:mode,ytOpen:"win",ytNoAds:true,ytAdblock:false,ytAlpha:65,ytRound:21,panelLayout:{yt:{x:.2,w:.4}},notesByPage:{start:{text:"keep"}}};
  const next={...original,...youtube.migrate(original)};
  assert.equal(next.ytMode,"panel");assert.equal(next.ytOpen,"panel");assert.equal(next.ytBackgroundAlpha,65);assert.equal(next.ytFilterOn,true);
  assert.deepEqual(next.panelLayout,original.panelLayout);assert.deepEqual(next.notesByPage,original.notesByPage);
  assert.deepEqual(youtube.migrate(next),{ytMode:"panel"});
 }
});
test("explicitly disabled filters remain disabled; defaults use one regular filter",()=>{
 assert.equal(youtube.migrate({ytNoAds:false,ytAdblock:false}).ytFilterOn,false);
 assert.equal(youtube.migrate({}).ytFilterOn,true);
});
test("background opacity accepts zero while video opacity is never a preference",()=>{
 assert.deepEqual(youtube.preferences({ytBackgroundAlpha:0,ytRound:0,ytFrame:false,ytShadow:true}),{backgroundAlpha:0,radius:0,frame:false,shadow:true});
 assert.equal(youtube.preferences({ytRound:900}).radius,48);
 assert.equal(youtube.preferences({ytBackgroundAlpha:NaN}).backgroundAlpha,100);
 assert.equal(youtube.preferences({ytAlpha:30}).backgroundAlpha,100);
});
test("URL handling never launches an external browser or accepts another origin",()=>{
 assert.equal(youtube.target("","https://evil.invalid/"),"https://www.youtube.com/");
 assert.equal(youtube.target("https://www.youtube.com/watch?v=TLkA0RELQ1g"),"https://www.youtube.com/watch?v=TLkA0RELQ1g");
 assert.match(youtube.target("javascript:alert(1)"),/^https:\/\/www\.youtube\.com\/results\?search_query=/);
});
