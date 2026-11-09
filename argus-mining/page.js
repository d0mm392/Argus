// Oberfläche von Argus Mining: eine Seite, läuft im Browser, holt alle 15 Sekunden den Stand
module.exports = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Argus Mining</title>
<style>
:root{--bg:#0d1117;--panel:#151b23;--line:#2a3340;--text:#e6edf3;--mute:#8b949e;--ok:#3fb950;--warn:#d29922;--bad:#f85149;--acc:#4aa3ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 "Segoe UI",system-ui,sans-serif}
header{display:flex;align-items:center;gap:16px;padding:12px 20px;border-bottom:1px solid var(--line);flex-wrap:wrap}
header b{font-size:16px;letter-spacing:.06em}header .st{color:var(--mute);margin-left:auto}
nav{display:flex;gap:4px}nav button{background:none;border:0;color:var(--mute);padding:6px 12px;cursor:pointer;font:inherit;border-bottom:2px solid transparent}
nav button.on{color:var(--text);border-color:var(--acc)}
main{padding:16px 20px;max-width:1400px}section[hidden]{display:none}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px 12px}.tile i{display:block;font-style:normal;color:var(--mute);font-size:12px}.tile span{font-size:20px;font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--mute);font-weight:500;cursor:pointer;position:sticky;top:0;background:var(--bg)}td.n,th.n{text-align:right}
tr.off td:first-child{border-left:3px solid var(--bad)}tr.weak td:first-child{border-left:3px solid var(--warn)}tr.ok td:first-child{border-left:3px solid transparent}
a{color:var(--acc)}.mute{color:var(--mute)}.est{color:var(--mute)}
.bar{display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap}
input,select,textarea,button.b{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:6px 10px;font:inherit}
button.b{cursor:pointer}button.b.p{background:var(--acc);border-color:var(--acc);color:#04111f}
textarea{width:100%;min-height:180px;font-family:Consolas,monospace}
.form{display:grid;grid-template-columns:220px 1fr;gap:12px 16px;max-width:900px;align-items:start}.form label{color:var(--mute);padding-top:6px}
.note{color:var(--mute);font-size:12px;margin-top:4px}.wrap{overflow:auto;max-height:calc(100vh - 230px)}
</style></head><body>
<header><b>ARGUS MINING</b><nav><button data-t="ov" class="on">Miner</button><button data-t="rp">Tagesreport</button><button data-t="set">Einstellungen</button></nav><span class="st" id="st">Lade…</span></header>
<main>
<section id="ov">
 <div class="tiles" id="tiles"></div>
 <div class="bar"><input id="q" placeholder="Suchen (Name, IP, Modell)"><label><input type="checkbox" id="onlyBad"> nur auffällige</label><button class="b" id="scan">Jetzt nach Minern suchen</button><span class="mute" id="scanInfo"></span></div>
 <div class="wrap"><table><thead><tr><th data-k="name">Miner</th><th data-k="ip">IP</th><th data-k="type">Modell</th><th data-k="on">Status</th><th class="n" data-k="hr">Hashrate</th><th class="n" data-k="temp">Temp.</th><th class="n" data-k="fan">Lüfter</th><th class="n" data-k="watt">Verbrauch</th><th class="n" data-k="up">Geräte-Laufzeit</th><th class="n" data-k="hup">Mining-Laufzeit</th></tr></thead><tbody id="tb"></tbody></table></div>
</section>
<section id="rp" hidden>
 <div class="bar"><select id="day"></select><button class="b" id="csv">Als CSV speichern (Excel)</button><span class="mute" id="rpInfo"></span></div>
 <div class="tiles" id="rpTiles"></div>
 <div class="wrap"><table><thead><tr><th>Miner</th><th>IP</th><th>Modell</th><th class="n">Uptime</th><th class="n">Verbrauch</th><th class="n">Ø Hashrate</th><th class="n">Neustarts</th><th class="n">Geräte-Laufzeit</th><th class="n">Mining-Laufzeit</th></tr></thead><tbody id="rpTb"></tbody></table></div>
</section>
<section id="set" hidden>
 <div class="form">
  <label>Name der Anlage</label><input id="sName">
  <label>Adressbereiche</label><div><textarea id="sRanges" spellcheck="false" placeholder="172.16.8.0-255&#10;10.0.1.0-255&#10;10.0.2.0/24"></textarea><div class="note">Eine Zeile je Bereich, wie in Foreman: „172.16.8.0-255“, „10.0.0.1-10.0.0.200“ oder „10.0.2.0/24“. Nur private Netze (10.x, 172.16–31.x, 192.168.x). Gefragt wird Port 4028, nur lesend. <span id="sCount"></span></div></div>
  <label>Wirkungsgrad für Schätzung</label><div><input id="sJth" type="number" min="0" max="200" step="0.5" style="width:120px"> J/TH<div class="note">Für Miner, die keine Watt melden (Antminer mit Stock-Firmware): Verbrauch = Hashrate × J/TH. 0 = automatisch nach Modell (z. B. S19j Pro 29,5, S21 17,5). Geschätzte Werte sind grau.</div></div>
  <label>VNISH-Passwort</label><div><input id="sVn" type="password" autocomplete="off" placeholder="leer lassen = unverändert"><div class="note">Nur nötig, wenn VNISH die Web-Schnittstelle sperrt. Damit liest Argus Mining Verbrauch und Geräte-Laufzeit direkt aus VNISH. Ändert nichts am Miner. <span id="sVnHas"></span></div></div>
  <label>Mit Windows starten</label><div><label style="color:var(--text)"><input type="checkbox" id="sAuto"> beim Anmelden minimiert starten</label></div>
  <label>Fernzugriff</label><div><label style="color:var(--text)"><input type="checkbox" id="sRemote"> andere Geräte im Netz dürfen Daten lesen</label><div class="note" id="sRemoteInfo"></div></div>
  <span></span><div><button class="b p" id="save">Speichern</button> <span class="mute" id="saved"></span></div>
 </div>
 <p class="note" id="sDir"></p>
</section>
</main>
<script>
const $=(id)=>document.getElementById(id), api=(p,o)=>fetch(p,o).then(r=>r.json());
const post=(p,b)=>api(p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b||{})});
const nf=(v,d=0)=>v==null?"–":Number(v).toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d});
const th=(h)=>h==null?"–":h>=1e15?nf(h/1e15,2)+" PH/s":nf(h/1e12,1)+" TH/s";
const pw=(w)=>w==null?"–":w>=1e6?nf(w/1e6,2)+" MW":w>=1e3?nf(w/1e3,1)+" kW":nf(w)+" W";
const dur=(s)=>{if(s==null)return"–";s=Math.round(s);const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return d?d+"d "+h+"h":h?h+"h "+m+"m":m+"m"};
const esc=(s)=>String(s??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let S=null, sortK="on", sortD=1;
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{document.querySelectorAll("nav button").forEach(x=>x.classList.toggle("on",x===b));for(const s of ["ov","rp","set"])$(s).hidden=s!==b.dataset.t;if(b.dataset.t==="rp")loadDays();if(b.dataset.t==="set")loadCfg();});
const bad=(m)=>m.on===false||m.temp>=85||(m.nom&&m.hr<m.nom*0.8);
function render(){
 if(!S)return; const ms=S.miners||[], on=ms.filter(m=>m.on!==false), hr=on.reduce((a,m)=>a+(m.hr||0),0), w=ms.reduce((a,m)=>a+(m.on!==false&&m.watt!=null?m.watt:0),0), est=ms.some(m=>m.on!==false&&m.wattEst), ts=on.map(m=>m.temp).filter(v=>v!=null);
 $("st").textContent=S.name+" · "+(S.noNet?"keine Verbindung zu den Minern":S.ts?"Stand "+new Date(S.ts).toLocaleTimeString("de-DE"):S.ips?"Suche läuft…":"Bitte Adressbereiche eintragen");
 $("tiles").innerHTML=[["Miner online",on.length+" / "+ms.length],["Hashrate",th(hr)],["Verbrauch jetzt",pw(w)+(est?" (teils geschätzt)":"")],["Temperatur Ø / max",ts.length?Math.round(ts.reduce((a,b)=>a+b,0)/ts.length)+" / "+Math.round(Math.max(...ts))+" °C":"–"],["Offline",String(ms.length-on.length)]].map(([i,v])=>"<div class=tile><i>"+i+"</i><span>"+v+"</span></div>").join("");
 $("scanInfo").textContent=S.scanning?"Suche: "+S.scanned+" von "+S.ips+" Adressen geprüft":S.scanTs?"Letzte Suche "+new Date(S.scanTs).toLocaleTimeString("de-DE")+", "+S.found+" Miner bekannt":"";
 const q=$("q").value.trim().toLowerCase(), ob=$("onlyBad").checked;
 const l=ms.filter(m=>(!q||(m.name+" "+m.ip+" "+m.type).toLowerCase().includes(q))&&(!ob||bad(m))).sort((a,b)=>{const x=a[sortK],y=b[sortK];if(sortK==="on")return((a.on===false)-(b.on===false))*-sortD||String(a.name).localeCompare(b.name,"de",{numeric:true});if(typeof x==="number"||typeof y==="number")return((x??-1)-(y??-1))*sortD;return String(x??"").localeCompare(String(y??""),"de",{numeric:true})*sortD;});
 $("tb").innerHTML=l.slice(0,3000).map(m=>"<tr class="+(m.on===false?"off":bad(m)?"weak":"ok")+"><td>"+esc(m.name)+"</td><td><a href='http://"+esc(m.ip)+"/' target=_blank rel=noopener>"+esc(m.ip)+"</a></td><td>"+esc(m.type||"–")+"</td><td>"+(m.on===false?(m.err==="keine Antwort"?"keine Antwort":"steht"):"läuft")+"</td><td class=n>"+th(m.hr)+(m.nom&&m.hr?" <span class=mute>"+Math.round(m.hr/m.nom*100)+" %</span>":"")+"</td><td class=n>"+(m.temp!=null?Math.round(m.temp)+" °C":"–")+"</td><td class=n>"+(m.fan?nf(m.fan)+" rpm":"–")+"</td><td class='n"+(m.wattEst?" est":"")+"' title='"+(m.wattEst?"geschätzt aus Hashrate × J/TH":"vom Miner gemeldet")+"'>"+pw(m.watt)+"</td><td class=n>"+dur(m.up)+"</td><td class=n>"+dur(m.hup)+"</td></tr>").join("")||"<tr><td colspan=10 class=mute>"+(S.ips?"Noch keine Miner gefunden.":"Trag unter Einstellungen die Adressbereiche ein.")+"</td></tr>";
}
document.querySelectorAll("#ov th").forEach(h=>h.onclick=()=>{const k=h.dataset.k;sortD=sortK===k?-sortD:(["hr","temp","fan","watt","up","hup"].includes(k)?-1:1);sortK=k;render();});
$("q").oninput=render;$("onlyBad").onchange=render;
$("scan").onclick=()=>post("/api/scan").then(()=>setTimeout(load,800));
async function load(){try{S=await api("/api/status");render();}catch{$("st").textContent="Argus Mining antwortet nicht. Läuft das Programm noch?";}}
load();setInterval(load,15000);
// Report
async function loadDays(){const ds=await api("/api/days");const cur=$("day").value;$("day").innerHTML=ds.slice().reverse().map(k=>"<option value="+k+">"+k.split("-").reverse().join(".")+(k===ds[ds.length-1]?" (heute, läuft noch)":"")+"</option>").join("");if(cur&&ds.includes(cur))$("day").value=cur;else if(ds.length>1)$("day").value=ds[ds.length-2];loadReport();}
async function loadReport(){const k=$("day").value;if(!k){$("rpInfo").textContent="Noch keine Daten. Der Report zählt ab jetzt alle 5 Minuten mit.";$("rpTb").innerHTML="";$("rpTiles").innerHTML="";return;}
 const r=await api("/api/report?day="+k);if(!r)return;
 $("rpInfo").textContent=r.hours+" h gemessen"+(r.noNet?", "+Math.round(r.noNet*5)+" min ohne Verbindung zu den Minern":"")+(r.hours<23.5?". Lücken (PC aus) zählen nicht mit.":"");
 $("rpTiles").innerHTML=[["Bestand",r.total+" Miner"],["Typisch online",r.median==null?"–":r.median+" / "+r.total],["Uptime",r.uptime==null?"–":nf(r.uptime*100,2)+" %"],["Verbrauch",nf(r.kwh,1)+" kWh"+(r.kwhEst>0?" <small class=mute>(davon "+nf(r.kwhEst,1)+" geschätzt)</small>":"")],["Dauerhaft / zeitweise weg",r.down+" / "+r.partly]].map(([i,v])=>"<div class=tile><i>"+i+"</i><span>"+v+"</span></div>").join("");
 $("rpTb").innerHTML=r.miners.map(m=>"<tr class="+(m.uptime<0.2?"off":m.uptime<0.98?"weak":"ok")+"><td>"+esc(m.name)+"</td><td>"+esc(m.id)+"</td><td>"+esc(m.type||"–")+"</td><td class=n>"+nf(m.uptime*100,2)+" %</td><td class='n"+(m.kwhEst>m.kwh/2?" est":"")+"'>"+nf(m.kwh,2)+" kWh</td><td class=n>"+nf(m.avgTh,1)+" TH/s</td><td class=n>"+(m.reboots+m.restarts||"–")+"</td><td class=n>"+dur(m.devUp)+"</td><td class=n>"+dur(m.hashUp)+"</td></tr>").join("");}
$("day").onchange=loadReport;$("csv").onclick=()=>{if($("day").value)location.href="/api/report.csv?day="+$("day").value;};
// Einstellungen
async function loadCfg(){const c=await api("/api/config");$("sName").value=c.name;$("sRanges").value=c.ranges;$("sJth").value=c.jth||0;$("sAuto").checked=c.autostart;$("sRemote").checked=c.remote;$("sVnHas").textContent=c.hasVnishPass?"Ein Passwort ist gespeichert.":"";
 $("sRemoteInfo").textContent=c.remote?"Lesen von außen: http://"+(c.lanIps[0]||"PC-IP")+":"+c.port+"/api/status?token="+c.token+" (auch /api/report?day=JJJJ-MM-TT, /api/report.csv). Einstellungen gehen nur an diesem PC.":"Aus: Nur dieser PC sieht die Daten.";
 $("sDir").textContent="Daten und Einstellungen liegen in "+c.dir+".";}
$("sRanges").oninput=()=>{const n=$("sRanges").value.split(/\\n/).filter(x=>x.trim()).length;$("sCount").textContent=n+" Bereiche";};
$("save").onclick=async()=>{const r=await post("/api/config",{name:$("sName").value,ranges:$("sRanges").value,jth:+$("sJth").value||0,vnishPass:$("sVn").value,autostart:$("sAuto").checked,remote:$("sRemote").checked});$("sVn").value="";$("saved").textContent="Gespeichert: "+r.ips+" Adressen"+(r.bad?.length?". Nicht verstanden: "+r.bad.join(", "):"");loadCfg();setTimeout(load,1500);};
</script></body></html>`;
