'use strict';
const el=id=>document.getElementById(id);
let pending=false;
function render(state){
  pending=false;
  el('start').disabled=!!state.active;
  el('mode').disabled=!!state.active;
  el('dumps').disabled=!!state.active;
  el('save').disabled=(!!state.active&&!state.reportReady)||state.status==='idle';
  const labels={observed:'Beobachtungszeit erreicht; Testprozess vom Controller beendet',idle:'Bereit für einen Test',starting:'Diagnose wird vorbereitet',running:'Argus wird beobachtet …',success:'Start im frischen Diagnoseprofil erfolgreich',aborted:'Argus wurde vorzeitig beendet oder meldete einen Prozessfehler','start-failed':'Argus konnte nicht gestartet werden','collection-failed':'Bericht konnte nur teilweise gesammelt werden','stop-failed':'Testprozess konnte nicht beendet werden'};
  el('status').textContent=labels[state.status]||state.status;
  el('detail').textContent=state.status==='stop-failed'?'Der Bericht kann gespeichert werden. Ein weiterer Versuch bleibt gesperrt, solange der Testprozess läuft.':state.active?'Bitte bis zu einer Minute warten. Es gibt keine automatischen Wiederholungen.':state.status==='idle'?'Ein Klick startet genau einen Versuch. Die Beobachtung dauert bis zu einer Minute.':
    'Lauf: '+state.id+'; Vergleich: '+state.mode+'. '+(state.nativeFailureAssessment||'')+' Ergebnis gilt ausschließlich für ein frisches Diagnoseprofil. Exitcode: '+(state.exitCode??'nicht verfügbar')+(state.controllerStopped?' (Testprozess nach Beobachtung kontrolliert beendet).':'.')+' Bitte den Bericht speichern und zurückschicken.';
  if(!state.active && state.appDiscovery?.workerOutcome){
    const result=state.appDiscovery.workerOutcome;
    el('detail').textContent+=' Verknuepfungs-Hilfsprozess: '+result.reason+'. '+(state.appDiscovery.collision?.complete&&!state.appDiscovery.authorizationInvalidated?'Kollisionspruefung vollstaendig.':'Kollisionspruefung insgesamt unvollstaendig; keine Store-App-IDs freigegeben. Der native Grundfehler ist nicht behoben.');
  }else if(!state.active && state.appDiscovery?.storeOutcome){
    el('detail').textContent+=' App-Erkennung: '+state.appDiscovery.storeOutcome.reason+'. Anzahl freigegebener Store-Apps: '+state.appDiscovery.storeOutcome.count+'.';
  }
  el('errors').textContent=state.collectionErrors?.length?'Sammlung/Verarbeitung: '+state.collectionErrors.length+' Fehler. Verfügbare Protokolle bleiben erhalten und werden mit exportiert.':'';
}
el('start').addEventListener('click',async()=>{
  if(pending||el('start').disabled)return;
  pending=true;el('start').disabled=true;el('save').disabled=true;el('saved').textContent='';
  try{const mode=el('mode').value,dumps=el('dumps').checked;el('dumps').checked=false;render(await window.diagnostic.start(mode,dumps));}catch(e){pending=false;el('status').textContent='Diagnose konnte nicht gestartet werden';el('detail').textContent=e.message;el('start').disabled=false;}
});
el('save').addEventListener('click',async()=>{
  el('save').disabled=true;
  try{const result=await window.diagnostic.save();el('saved').textContent=result.canceled?'Speichern abgebrochen. Der Bericht bleibt verfügbar.':'Bericht gespeichert: '+result.file;}
  catch(e){el('saved').textContent='Speichern fehlgeschlagen: '+e.message+'. Bitte einen anderen Speicherort wählen.';}
  finally{el('save').disabled=false;}
});
window.diagnostic.onState(render);
window.diagnostic.state().then(render).catch(e=>{el('detail').textContent=e.message;});

function renderUpdate(state){
  el('update-text').textContent=state.text;
  el('update-check').disabled=['checking','downloading','installing'].includes(state.status);
  el('update-download').hidden=!['available','error'].includes(state.status)||!state.version;
  el('update-install').hidden=state.status!=='ready';el('update-install').disabled=!state.installAllowed;
  el('update-progress').hidden=state.status!=='downloading';el('update-progress').value=state.percent||0;
  if(state.status==='installing')el('start').disabled=true;
}
for(const [id,method]of [['update-check','updateCheck'],['update-download','updateDownload'],['update-install','updateInstall']]){
  el(id).addEventListener('click',async()=>{try{renderUpdate(await window.diagnostic[method]());}catch(error){el('update-text').textContent=error.message;}});
}
window.diagnostic.onUpdate(renderUpdate);
window.diagnostic.updateState().then(renderUpdate).catch(error=>{el('update-text').textContent=error.message;});
