(function(root){
 "use strict";
 const number=(value,fallback,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))&&value!==null?Number(value):fallback));
 function preferences(config={}){
  return {radius:number(config.ytRound,14,0,48),backgroundAlpha:number(config.ytBackgroundAlpha,100,0,100),frame:config.ytFrame!==false,shadow:!!config.ytShadow};
 }
 function migrate(config={}){
  const patch={ytMode:"panel"};
  if(config.ytIntegratedMigration!==1){
   patch.ytIntegratedMigration=1;
   patch.ytBeforeIntegrated=config.ytBeforeIntegrated||{mode:config.ytMode||"panel",open:config.ytOpen||"",alpha:config.ytAlpha??100};
   patch.ytBackgroundAlpha=config.ytBackgroundAlpha??config.ytAlpha??100;
   patch.ytFilterOn=typeof config.ytFilterOn==="boolean"?config.ytFilterOn:config.ytNoAds!==false||config.ytAdblock===true;
   if(config.ytOpen==="win")patch.ytOpen="panel";
  }
  return patch;
 }
 function target(query,resume){
  const safe=value=>{try{const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password||url.port||!["youtube.com","www.youtube.com","m.youtube.com","youtu.be"].includes(url.hostname))return null;return url.href;}catch{return null;}};
  return query?safe(query)||"https://www.youtube.com/results?search_query="+encodeURIComponent(String(query).slice(0,200)):safe(resume)||"https://www.youtube.com/";
 }
 const api={preferences,migrate,target};
 if(typeof module==="object"&&module.exports)module.exports=api;else root.argusYoutubeSettings=api;
})(globalThis);
