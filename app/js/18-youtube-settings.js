"use strict";
(() => {
 let current={};
 const apply=config=>{
  current={...current,...config};const value=window.argusYoutubeSettings.preferences(current);
  for(const element of [$("yt"),$("ytAppearancePreview")]){
   element.style.setProperty("--yt-radius",value.radius+"px");
   element.style.setProperty("--yt-background-alpha",String(value.backgroundAlpha/100));
   element.style.setProperty("--yt-frame-color",value.frame?"var(--line)":"transparent");
   element.style.setProperty("--yt-shadow",value.shadow?"0 8px 24px rgba(0,0,0,.35)":"none");
  }
  $("setYtAlpha").value=value.backgroundAlpha;$("setYtRound").value=value.radius;
  $("setYtFrame").checked=value.frame;$("setYtShadow").checked=value.shadow;
  $("setYtFilter").checked=current.ytFilterOn!==false;
 };
 window.syncYoutubeAppearance=apply;
 const edit=patch=>{apply(patch);window.jarvis.setConfig(patch);};
 $("setYtAlpha").addEventListener("input",event=>edit({ytBackgroundAlpha:+event.target.value}));
 $("setYtRound").addEventListener("input",event=>edit({ytRound:+event.target.value}));
 $("setYtFrame").addEventListener("change",event=>{apply({ytFrame:event.target.checked});window.jarvis.setConfig({ytFrame:event.target.checked});});
 $("setYtShadow").addEventListener("change",event=>{apply({ytShadow:event.target.checked});window.jarvis.setConfig({ytShadow:event.target.checked});});
 $("setYtFilter").addEventListener("change",event=>window.jarvis.setConfig({ytFilterOn:event.target.checked}));
 $("ytPreviewOpen").addEventListener("click",()=>window.jarvis.openYoutube());
 const filterState=state=>{ $("ytFilterState").textContent=({on:"Filter aktiv. Dauerhafte Werbefreiheit ist nicht garantiert.",loading:"Filterlisten werden geladen ...",error:"Filterlisten derzeit nicht verfuegbar; bitte Verbindung pruefen.",off:"Filter durch Einstellung ausgeschaltet."})[state]||"Filter wird beim Oeffnen initialisiert."; };
 window.jarvis.onYtFilter?.(filterState);
 window.jarvis.getConfig().then(config=>{apply(config);filterState(config.ytFilterState);});
})();
