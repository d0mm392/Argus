'use strict';
const el=id=>document.getElementById(id);
let pending=false;
function render(state){
  pending=false;
  el('start').disabled=!!state.active;
  el('save').disabled=(!!state.active&&!state.reportReady)||state.status==='idle';
  const labels={idle:'Bereit für einen Test',starting:'Diagnose wird vorbereitet',running:'Argus wird beobachtet …',success:'Start im frischen Diagnoseprofil erfolgreich',aborted:'Argus wurde vorzeitig beendet oder meldete einen Prozessfehler','start-failed':'Argus konnte nicht gestartet werden','collection-failed':'Bericht konnte nur teilweise gesammelt werden','stop-failed':'Testprozess konnte nicht beendet werden'};
  el('status').textContent=labels[state.status]||state.status;
  el('detail').textContent=state.status==='stop-failed'?'Der Bericht kann gespeichert werden. Ein weiterer Versuch bleibt gesperrt, solange der Testprozess läuft.':state.active?'Bitte bis zu einer Minute warten. Es gibt keine automatischen Wiederholungen.':state.status==='idle'?'Ein Klick startet genau einen Versuch. Die Beobachtung dauert bis zu einer Minute.':
    'Ergebnis gilt ausschließlich für ein frisches Diagnoseprofil. Exitcode: '+(state.exitCode??'nicht verfügbar')+(state.controllerStopped?' (Testprozess nach Beobachtung kontrolliert beendet).':'.')+' Bitte den Bericht speichern und zurückschicken.';
  el('errors').textContent=state.collectionErrors?.length?'Sammlung/Verarbeitung: '+state.collectionErrors.length+' Fehler. Verfügbare Protokolle bleiben erhalten und werden mit exportiert.':'';
}
el('start').addEventListener('click',async()=>{
  if(pending||el('start').disabled)return;
  pending=true;el('start').disabled=true;el('save').disabled=true;el('saved').textContent='';
  try{render(await window.diagnostic.start());}catch(e){pending=false;el('status').textContent='Diagnose konnte nicht gestartet werden';el('detail').textContent=e.message;el('start').disabled=false;}
});
el('save').addEventListener('click',async()=>{
  el('save').disabled=true;
  try{const result=await window.diagnostic.save();el('saved').textContent=result.canceled?'Speichern abgebrochen. Der Bericht bleibt verfügbar.':'Bericht gespeichert: '+result.file;}
  catch(e){el('saved').textContent='Speichern fehlgeschlagen: '+e.message+'. Bitte einen anderen Speicherort wählen.';}
  finally{el('save').disabled=false;}
});
window.diagnostic.onState(render);
window.diagnostic.state().then(render).catch(e=>{el('detail').textContent=e.message;});
