"use strict";
// 0.59.4 R-YT-CRASH-1: Ein Video, bei dem YouTube abstürzt, wird vor dem Laden vermerkt, nach dem Absturz gesperrt
// und nicht wieder geladen (keine Absturzschleife beim Start oder Wiederöffnen).
const assert=require("node:assert/strict");
const {app}=require("electron"),{setupYoutube}=require("./youtube-view-fixture");
async function run(){
 const {config,wait,youtube,context}=await setupYoutube();
 const V="https://www.youtube.com/watch?v=crashVid0001";
 await youtube.open(V);await wait(400);
 assert.equal(config.ytLoading?.url,V,"video is marked as loading before playback");
 const wc=youtube.view().webContents;
 const gone=new Promise(r=>wc.once("render-process-gone",r));wc.forcefullyCrashRenderer();await gone;await wait(2500);
 assert.deepEqual([...config.ytBad],["crashVid0001"],"crashed video is remembered");
 assert.equal(config.ytLoading,null);assert.notEqual(config.ytLast?.url,V,"crashed video is not the resume point");
 assert.equal(new URL(wc.getURL()).pathname,"/","view falls back to the YouTube home page");
 assert.equal(vmEval(context,"ytResumeUrl()"),"https://www.youtube.com/","blocked video is never resumed");
 youtube.close();assert.equal(config.ytLoading,null);
 console.log("PASS R-YT-CRASH-1 YouTube-Absturz: Video vermerkt, gesperrt, Startseite statt Absturzschleife");app.exit(0);
}
const vmEval=(ctx,code)=>require("vm").runInContext(code,ctx);
run().catch(e=>{console.error(e.stack||e);app.exit(1);});setTimeout(()=>app.exit(2),30000).unref();
