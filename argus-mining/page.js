// Oberfläche von Argus Mining: eine Seite, läuft im Browser, holt alle 15 Sekunden den Stand
module.exports = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Argus Mining</title>
<style>
:root{--bg:#0d1117;--panel:#151b23;--line:#2a3340;--text:#e6edf3;--mute:#8b949e;--ok:#3fb950;--warn:#d29922;--bad:#f85149;--acc:#4aa3ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 "Segoe UI",system-ui,sans-serif}
header{display:flex;align-items:center;gap:16px;padding:12px 20px;border-bottom:1px solid var(--line);flex-wrap:wrap}
header b{font-size:16px;letter-spacing:.06em}#upd{display:flex;gap:8px;align-items:center;color:var(--warn)}tr.det td{background:var(--panel);white-space:normal;color:var(--mute)}tr.det b{color:var(--text);font-weight:500}tbody tr[data-ip]{cursor:pointer}header .st{color:var(--mute);margin-left:auto}
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
.note{color:var(--mute);font-size:12px;margin-top:4px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin-bottom:12px}.card h3{margin:0 0 10px;font-size:14px;font-weight:500;color:var(--mute)}
.dh{display:flex;align-items:center;gap:12px;margin-bottom:12px}.dh h2{margin:0;font-size:22px;font-weight:500}.badge{border-radius:999px;padding:2px 10px;font-size:12px;border:1px solid}
.badge.ok{color:var(--ok);border-color:var(--ok)}.badge.bad{color:var(--bad);border-color:var(--bad)}.badge.warn{color:var(--warn);border-color:var(--warn)}.badge.acc{color:var(--acc);border-color:var(--acc)}
.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px 18px}.kv div{overflow-wrap:anywhere}.kv b{color:var(--mute);font-weight:500;margin-right:6px}
.dgrid{display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:12px}@media(max-width:900px){.dgrid{grid-template-columns:1fr}}
.rng button{background:none;border:0;color:var(--mute);cursor:pointer;font:inherit;padding:2px 8px}.rng button.on{color:var(--text);text-decoration:underline}
.act{max-height:300px;overflow:auto;margin:0;padding:0;list-style:none}.act li{padding:6px 0;border-bottom:1px solid var(--line)}.act time{display:block;color:var(--mute);font-size:12px}
.comps{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}.comp{border:1px solid var(--line);border-radius:6px;padding:8px 10px}.comp i{display:block;font-style:normal;color:var(--mute);font-size:12px}
.meter{height:5px;background:var(--line);border-radius:3px;margin:6px 0 2px}.meter span{display:block;height:100%;border-radius:3px;background:var(--ok)}
.pools{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}.pool{border:1px solid var(--line);border-radius:6px;padding:10px 12px}.pool .u{font-family:Consolas,monospace;font-size:12px;background:var(--bg);border-radius:4px;padding:3px 6px;overflow-wrap:anywhere;margin:4px 0 8px}
.pool table td{border:0;padding:2px 0}#chart{width:100%;height:240px;display:block}#chartTip{position:absolute;pointer-events:none;background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:4px 8px;font-size:12px;display:none;white-space:nowrap}.wrap{overflow:auto;max-height:calc(100vh - 230px)}
</style></head><body>
<header><b>ARGUS MINING</b><span class=mute id=ver></span><nav><button data-t="ov" class="on">Miner</button><button data-t="rp">Report</button><button data-t="log">Protokoll</button><button data-t="set">Einstellungen</button></nav><span class="st" id="st">Lade…</span><span id="upd" hidden></span></header>
<main>
<section id="ov">
 <div class="tiles" id="tiles"></div>
 <div class="bar"><select id="qf" title="Worin suchen"><option value="">Alle Felder</option><option value="serial">Seriennummer</option><option value="worker">Worker / Pool</option><option value="ip">IP</option><option value="mac">MAC</option><option value="name">Name</option></select><input id="q" placeholder="Suchen, mehrere mit Komma" style="width:260px"><select id="fs" title="Status"><option value="">Alle Zustände</option><option value="on">läuft</option><option value="off">offline / steht</option><option value="bad">auffällig</option><option value="nosn">ohne Seriennummer</option></select><select id="fm" title="Modell"><option value="">Alle Modelle</option></select><span class="mute" id="fCount"></span><button class="b" id="scan">Jetzt nach Minern suchen</button><span class="mute" id="scanInfo"></span></div>
 <div class="wrap"><table><thead><tr><th data-k="name">Miner</th><th data-k="ip">IP</th><th data-k="serial">Seriennr.</th><th data-k="type">Modell</th><th data-k="w1">Worker (Pool 1)</th><th data-k="on">Status</th><th class="n" data-k="hr">Hashrate</th><th class="n" data-k="temp">Temp.</th><th class="n" data-k="fan">Lüfter</th><th class="n" data-k="watt">Verbrauch</th><th class="n" data-k="up">Geräte-Laufzeit</th><th class="n" data-k="hup">Mining-Laufzeit</th></tr></thead><tbody id="tb"></tbody></table></div>
</section>
<section id="rp" hidden>
 <div class="bar"><select id="rpKind"><option value="day">Tag</option><option value="month">Monat</option></select><select id="day"></select><button class="b" id="csv">Als CSV speichern (Excel)</button><input id="rq" placeholder="Filtern (Name, IP, Seriennr., Worker)" style="width:240px"><span class="mute" id="rpInfo"></span></div>
 <div class="tiles" id="rpTiles"></div>
 <div class="wrap"><table><thead><tr id="rpHead"></tr></thead><tbody id="rpTb"></tbody></table></div>
</section>
<section id="log" hidden>
 <div class="bar"><select id="logDay"></select><input id="lq" placeholder="Filtern (z. B. Offline, Seriennr., IP)" style="width:260px"><button class="b" id="logDl">Als Text speichern</button><span class="mute" id="logInfo"></span></div>
 <div class="wrap"><table><tbody id="logTb"></tbody></table></div>
</section>
<section id="det" hidden>
 <div class="dh"><button class="b" id="dBack">← Zurück</button><h2 id="dName"></h2><span id="dBadge" class="badge"></span><span class="mute" id="dLive" style="margin-left:auto"></span><a class="b" id="dWeb" target="_blank" rel="noopener" style="text-decoration:none">Weboberfläche öffnen</a></div>
 <div class="card"><h3>Miner-Details</h3><div class="kv" id="dKv"></div></div>
 <div class="dgrid">
  <div class="card" style="position:relative"><div class="tiles" id="dTiles" style="margin-bottom:6px"></div><svg id="chart" viewBox="0 0 1000 240" preserveAspectRatio="none"></svg><div id="chartTip"></div>
   <div class="bar" style="margin:6px 0 0"><span class="rng" id="dRng"><button data-r="1d" class="on">24 h</button><button data-r="7d">7 Tage</button><button data-r="30d">30 Tage</button><button data-r="90d">90 Tage</button></span><span class="mute" id="dAvg" style="margin-left:auto"></span></div></div>
  <div class="card"><h3>Aktivität <span class="mute" id="dActN"></span></h3><ul class="act" id="dAct"></ul></div>
 </div>
 <div class="card"><h3>Hashboards</h3><div class="comps" id="dBoards"></div></div>
 <div class="card"><h3>Temperatursensoren und Lüfter</h3><div class="comps" id="dComps"></div></div>
 <div class="card"><h3>Pools</h3><div class="pools" id="dPools"></div></div>
</section>
<section id="set" hidden>
 <div class="form">
  <label>Name der Anlage</label><input id="sName">
  <label>Adressbereiche</label><div><textarea id="sRanges" spellcheck="false" placeholder="172.16.8.0-255&#10;10.0.1.0-255&#10;10.0.2.0/24"></textarea><div class="note">Eine Zeile je Bereich, wie in Foreman: „172.16.8.0-255“, „10.0.0.1-10.0.0.200“ oder „10.0.2.0/24“. Nur private Netze (10.x, 172.16–31.x, 192.168.x). Gefragt wird Port 4028, nur lesend. <span id="sCount"></span></div></div>
  <label>Wirkungsgrad für Schätzung</label><div><input id="sJth" type="number" min="0" max="200" step="0.5" style="width:120px"> J/TH<div class="note">Für Miner, die keine Watt melden (Antminer mit Stock-Firmware): Verbrauch = Hashrate × J/TH. 0 = automatisch nach Modell (z. B. S19j Pro 29,5, S21 17,5). Geschätzte Werte sind grau.</div></div>
  <label>VNISH-Passwort</label><div><input id="sVn" type="password" autocomplete="off" placeholder="leer lassen = unverändert"><div class="note">Nur nötig, wenn VNISH die Web-Schnittstelle sperrt. Damit liest Argus Mining Verbrauch und Geräte-Laufzeit direkt aus VNISH. Ändert nichts am Miner. <span id="sVnHas"></span></div></div>
  <label>Antminer-Weblogin</label><div><input id="sAu" style="width:140px" autocomplete="off"> <input id="sAp" type="password" autocomplete="off" placeholder="leer = unverändert" style="width:180px"><div class="note">Nur zum Lesen der Seriennummer bei Antminer mit Stock-Firmware (Werkszugang root/root). <span id="sApHas"></span></div></div>
  <label>Updates</label><div><label style="color:var(--text)"><input type="checkbox" id="sAutoUpd"> automatisch installieren (Prüfung beim Start und alle 6 Stunden)</label> <button class="b" id="updCheck" type="button">Jetzt prüfen</button><div class="note" id="sUpd"></div></div>
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
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{document.querySelectorAll("nav button").forEach(x=>x.classList.toggle("on",x===b));for(const s of ["ov","rp","log","set","det"])$(s).hidden=s!==b.dataset.t;if(b.dataset.t==="rp")loadDays();if(b.dataset.t==="log")loadLogDays();if(b.dataset.t==="set")loadCfg();});
const w1=(m)=>(m.pools&&m.pools[0]&&m.pools[0].user)||"";
let openIp="";
const det=(m,n)=>"<tr class=det><td colspan="+n+">"+[0,1,2].map(i=>{const p=(m.pools||[])[i];return "<b>Pool "+(i+1)+":</b> "+(p?esc(p.url||"–")+" · "+esc(p.user||"–")+(p.st?" · "+esc(p.st):""):"–");}).join("<br>")+"<br><b>MAC:</b> "+esc(m.mac||"–")+" · <b>Seriennr.:</b> "+esc(m.serial||"nicht lesbar")+(m.fw?" · <b>Firmware:</b> "+esc(m.fw):"")+"</td></tr>";
const hay=(m,f)=>(f==="serial"?m.serial||"":f==="worker"?(m.pools||[]).map(p=>p.user+" "+p.url).join(" "):f==="ip"?m.ip:f==="mac"?m.mac||"":f==="name"?m.name:m.name+" "+m.ip+" "+m.type+" "+(m.serial||"")+" "+(m.mac||"")+" "+(m.pools||[]).map(p=>p.user+" "+p.url).join(" ")).toLowerCase();
const bad=(m)=>m.on===false||m.temp>=85||(m.nom&&m.hr<m.nom*0.8);
function updBar(){const u=S.update||{},el=$("upd");el.hidden=!["available","download","restart"].includes(u.state);
 el.innerHTML=u.state==="available"?"Update "+esc(u.latest)+" verfügbar"+(u.canInstall?" <button class='b p' id=updGo>Installieren</button>":"")+(u.err?" <span class=mute>"+esc(u.err)+"</span>":""):u.state==="download"?"Update wird geladen… "+(u.pct||0)+" %":u.state==="restart"?"Startet neu…":"";
 const g=$("updGo");if(g)g.onclick=()=>post("/api/update/install").then(()=>setTimeout(load,1000));}
function render(){
 if(!S)return; updBar(); setTimeout(()=>{$("fCount").textContent=$("tb").querySelectorAll("tr[data-ip]").length+" von "+(S.miners||[]).length;},0); const ms=S.miners||[], on=ms.filter(m=>m.on!==false), hr=on.reduce((a,m)=>a+(m.hr||0),0), w=ms.reduce((a,m)=>a+(m.on!==false&&m.watt!=null?m.watt:0),0), est=ms.some(m=>m.on!==false&&m.wattEst), ts=on.map(m=>m.temp).filter(v=>v!=null);
 $("st").textContent=S.name+" · "+(S.noNet?"keine Verbindung zu den Minern":S.ts?"Stand "+new Date(S.ts).toLocaleTimeString("de-DE"):S.ips?"Suche läuft…":"Bitte Adressbereiche eintragen");
 $("tiles").innerHTML=[["Miner online",on.length+" / "+ms.length],["Hashrate",th(hr)],["Verbrauch jetzt",pw(w)+(est?" (teils geschätzt)":"")],["Temperatur Ø / max",ts.length?Math.round(ts.reduce((a,b)=>a+b,0)/ts.length)+" / "+Math.round(Math.max(...ts))+" °C":"–"],["Offline",String(ms.length-on.length)]].map(([i,v])=>"<div class=tile><i>"+i+"</i><span>"+v+"</span></div>").join("");
 $("scanInfo").textContent=S.scanning?"Suche: "+S.scanned+" von "+S.ips+" Adressen geprüft":S.scanTs?"Letzte Suche "+new Date(S.scanTs).toLocaleTimeString("de-DE")+", "+S.found+" Miner bekannt":"";
 const terms=$("q").value.toLowerCase().split(/[,;\\n]+/).map(x=>x.trim()).filter(Boolean), qf=$("qf").value, fs=$("fs").value, fm=$("fm").value;
 const models=[...new Set(ms.map(m=>m.type||"").filter(Boolean))].sort();if($("fm").options.length-1!==models.length){const c=fm;$("fm").innerHTML="<option value=''>Alle Modelle</option>"+models.map(t=>"<option>"+esc(t)+"</option>").join("");$("fm").value=models.includes(c)?c:"";}
 const val=(m,k)=>k==="w1"?w1(m):m[k];
 const l=ms.filter(m=>(!terms.length||terms.some(t=>hay(m,qf).includes(t)))&&(!fs||(fs==="on"?m.on!==false:fs==="off"?m.on===false:fs==="bad"?bad(m):!m.serial))&&(!fm||m.type===fm)).sort((a,b)=>{const x=val(a,sortK),y=val(b,sortK);if(sortK==="on")return((a.on===false)-(b.on===false))*-sortD||String(a.name).localeCompare(b.name,"de",{numeric:true});if(typeof x==="number"||typeof y==="number")return((x??-1)-(y??-1))*sortD;return String(x??"").localeCompare(String(y??""),"de",{numeric:true})*sortD;});
 $("tb").innerHTML=l.slice(0,3000).map(m=>"<tr data-ip='"+esc(m.ip)+"' class="+(m.on===false?"off":bad(m)?"weak":"ok")+" title='Klick: Details'><td>"+esc(m.name)+"</td><td><a href='http://"+esc(m.ip)+"/' target=_blank rel=noopener>"+esc(m.ip)+"</a></td><td>"+esc(m.serial||"–")+"</td><td>"+esc(m.type||"–")+"</td><td>"+esc(w1(m)||"–")+"</td><td>"+(m.on===false?(m.err==="keine Antwort"?"keine Antwort":"steht"):"läuft")+"</td><td class=n>"+th(m.hr)+(m.nom&&m.hr?" <span class=mute>"+Math.round(m.hr/m.nom*100)+" %</span>":"")+"</td><td class=n>"+(m.temp!=null?Math.round(m.temp)+" °C":"–")+"</td><td class=n>"+(m.fan?nf(m.fan)+" rpm":"–")+"</td><td class='n"+(m.wattEst?" est":"")+"' title='"+(m.wattEst?"geschätzt aus Hashrate × J/TH":"vom Miner gemeldet")+"'>"+pw(m.watt)+"</td><td class=n>"+dur(m.up)+"</td><td class=n>"+dur(m.hup)+"</td></tr>"+(openIp===m.ip?det(m,12):"")).join("")||"<tr><td colspan=12 class=mute>"+(S.ips?"Noch keine Miner gefunden.":"Trag unter Einstellungen die Adressbereiche ein.")+"</td></tr>";
}
document.querySelectorAll("#ov th").forEach(h=>h.onclick=()=>{const k=h.dataset.k;sortD=sortK===k?-sortD:(["hr","temp","fan","watt","up","hup"].includes(k)?-1:1);sortK=k;render();});
$("tb").onclick=(e)=>{if(e.target.closest("a"))return;const tr=e.target.closest("tr[data-ip]");if(tr)openDetail(tr.dataset.ip);};
// ---------- Detailansicht ----------
let dIp="",dR="1d",dT=null,dHist=null,dData=null;
const show=(id)=>{for(const s of ["ov","rp","log","set","det"])$(s).hidden=s!==id;};
function openDetail(ip){dIp=ip;dR="1d";document.querySelectorAll("#dRng button").forEach(b=>b.classList.toggle("on",b.dataset.r==="1d"));show("det");window.scrollTo(0,0);$("dName").textContent=ip;$("dKv").innerHTML="<div class=mute>Frage den Miner ab…</div>";
 ["dBoards","dComps","dPools","dAct"].forEach(i=>$(i).innerHTML="");loadDetail();loadHist();loadAct();clearInterval(dT);dT=setInterval(()=>{if($("det").hidden){clearInterval(dT);return;}loadDetail();},30000);try{history.replaceState(null,"","#miner="+ip);}catch{}}
$("dBack").onclick=()=>{clearInterval(dT);show("ov");try{history.replaceState(null,"","#");}catch{}};
async function loadDetail(){const d=await api("/api/miner?ip="+encodeURIComponent(dIp)).catch(()=>null);if(!d||d.error){$("dKv").innerHTML="<div class=mute>"+esc(d?.error||"Keine Antwort")+"</div>";return;}dData=d;
 $("dName").textContent=d.name;const st=d.on===false?["bad",d.live?"steht":"keine Antwort"]:bad(d)?["warn","auffällig"]:["ok","läuft"];$("dBadge").className="badge "+st[0];$("dBadge").textContent=st[1];
 $("dLive").textContent=d.live?"live abgefragt "+new Date(d.ts).toLocaleTimeString("de-DE"):"Miner antwortet nicht, letzter bekannter Stand";$("dWeb").href="http://"+d.ip+"/";
 const kv=[["Modell",d.type||"–"],["IP",d.ip],["MAC",d.mac||"–"],["Seriennummer",d.serial||"nicht lesbar"],["Firmware",d.fw||"–"],["Worker",w1(d)||"–"],["Geräte-Laufzeit",dur(d.up)],["Mining-Laufzeit",dur(d.hup)],["Verbrauch",pw(d.watt)+(d.wattEst?" (geschätzt)":"")],["Nennwert",d.nom?th(d.nom):"–"]];
 $("dKv").innerHTML=kv.map(([k,v])=>"<div><b>"+k+"</b>"+esc(v)+"</div>").join("");
 $("dTiles").innerHTML=[["Hashrate",th(d.hr)+(d.nom&&d.hr?" <small class=mute>"+Math.round(d.hr/d.nom*100)+" %</small>":"")],["Höchste Temperatur",d.temp!=null?Math.round(d.temp)+" °C":"–"],["Schnellster Lüfter",d.fan?nf(d.fan)+" rpm":"–"],["Pools",String((d.poolsAll||[]).length)]].map(([i,v])=>"<div class=tile><i>"+i+"</i><span>"+v+"</span></div>").join("");
 const tcol=(v)=>v>=90?"var(--bad)":v>=80?"var(--warn)":"var(--ok)";
 $("dBoards").innerHTML=(d.boards||[]).map(b=>"<div class=comp><b>Board "+b.n+"</b><i>Hashrate</i>"+(b.th!=null?nf(b.th,2)+" TH/s":"–")+"<i>Chips</i>"+(b.chips??"–")+(b.bad?" <span style='color:var(--bad)'>("+b.bad+" defekt)</span>":"")+(b.freq?"<i>Frequenz</i>"+nf(b.freq)+" MHz":"")+(b.temp?"<i>Chip max.</i>"+Math.round(b.temp)+" °C":"")+"</div>").join("")||"<span class=mute>"+(d.live?"Der Miner meldet keine Werte je Hashboard.":"Nur live verfügbar.")+"</span>";
 $("dComps").innerHTML=[...(d.sensors||[]).map(x=>"<div class=comp><i>"+esc(x.label)+"</i>"+Math.round(x.v)+" °C<div class=meter><span style='width:"+Math.min(100,x.v/110*100)+"%;background:"+tcol(x.v)+"'></span></div></div>"),...(d.fans||[]).map(x=>"<div class=comp><i>"+esc(x.label)+"</i>"+nf(x.v)+" rpm<div class=meter><span style='width:"+Math.min(100,x.v/7000*100)+"%;background:var(--acc)'></span></div></div>")].join("")||"<span class=mute>"+(d.live?"Keine Sensoren gemeldet.":"Nur live verfügbar.")+"</span>";
 $("dPools").innerHTML=(d.poolsAll||[]).map((p,i)=>{const alive=/alive/i.test(p.st||"");return "<div class=pool><b>Pool "+(i+1)+"</b> <span class=mute>"+esc(p.url||"–")+"</span><div class=u>"+esc(p.user||"–")+"</div><span class='badge "+(alive?"ok":"bad")+"'>"+(alive?"Online":esc(p.st||"unbekannt"))+"</span> "+(p.active?"<span class='badge acc'>Aktiv</span>":"")+(/devfee/i.test(p.user+p.url)?" <span class='badge warn'>Dev-Fee</span>":"")+
  "<table style='margin-top:8px;width:100%'>"+[["Angenommen",p.acc],["Abgelehnt",p.rej],["Veraltet (stale)",p.stale],["Diff. angenommen",p.dacc],["Diff. abgelehnt",p.drej],["Letzte Share-Diff.",p.last]].map(([k,v])=>"<tr><td class=mute>"+k+"</td><td class=n>"+(v==null?"–":nf(v))+"</td></tr>").join("")+"</table></div>";}).join("")||"<span class=mute>Keine Pools gemeldet.</span>";}
async function loadHist(){dHist=await api("/api/miner/history?ip="+encodeURIComponent(dIp)+"&range="+dR).catch(()=>null);drawChart();}
document.querySelectorAll("#dRng button").forEach(b=>b.onclick=()=>{dR=b.dataset.r;document.querySelectorAll("#dRng button").forEach(x=>x.classList.toggle("on",x===b));loadHist();});
function drawChart(){const svg=$("chart"),P=(dHist&&dHist.points)||[],W=1000,H=240,L=46,B=22;
 if(P.length<2){svg.innerHTML="<text x=500 y=120 text-anchor=middle fill='#8b949e' font-size=14>"+(dR==="1d"?"Verlauf entsteht ab jetzt, alle 5 Minuten ein Punkt.":"Noch zu wenige Tage gespeichert.")+"</text>";$("dAvg").textContent="";return;}
 const t0=P[0][0],t1=P[P.length-1][0],vals=P.map(p=>p[1]||0),nom=dHist.nom,mx=Math.max(...vals,nom||0)*1.12||1;
 const X=(t)=>L+(t-t0)/(t1-t0||1)*(W-L-8),Y=(v)=>H-B-(v/mx)*(H-B-10);
 let g="";for(let i=0;i<=4;i++){const v=mx*i/4,y=Y(v);g+="<line x1="+L+" x2="+W+" y1="+y+" y2="+y+" stroke='#2a3340'/><text x="+(L-6)+" y="+(y+4)+" text-anchor=end fill='#8b949e' font-size=11>"+nf(v,0)+"</text>";}
 for(let i=0;i<=5;i++){const t=t0+(t1-t0)*i/5,x=X(t),d=new Date(t);g+="<text x="+x+" y="+(H-5)+" text-anchor="+(i===0?"start":i===5?"end":"middle")+" fill='#8b949e' font-size=11>"+(dR==="1d"?d.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}):d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"})+(dR==="7d"?" "+d.getHours()+"h":""))+"</text>";}
 if(nom)g+="<line x1="+L+" x2="+W+" y1="+Y(nom)+" y2="+Y(nom)+" stroke='#d29922' stroke-dasharray='6 5'/>";
 const pts=P.map(p=>X(p[0]).toFixed(1)+","+Y(p[1]||0).toFixed(1)).join(" ");
 g+="<polyline points='"+pts+"' fill=none stroke='#3fb950' stroke-width=2 vector-effect=non-scaling-stroke />";
 g+="<line id=cx y1=10 y2="+(H-B)+" stroke='#8b949e' visibility=hidden />";svg.innerHTML=g;
 const avg=vals.reduce((a,b)=>a+b,0)/vals.length,up=P.filter(p=>p[2]!=null);$("dAvg").textContent="Ø "+nf(avg,2)+" TH/s"+(nom?" · Nennwert "+nf(nom,0)+" TH/s (gestrichelt)":"")+(up.length&&dR!=="7d"?" · Uptime "+nf(up.reduce((a,p)=>a+p[2],0)/up.length*100,1)+" %":"");
 svg.onmousemove=(e)=>{const r=svg.getBoundingClientRect(),xv=(e.clientX-r.left)/r.width*W,t=t0+(xv-L)/(W-L-8)*(t1-t0);let best=P[0];for(const p of P)if(Math.abs(p[0]-t)<Math.abs(best[0]-t))best=p;const cx=svg.querySelector("#cx");cx.setAttribute("x1",X(best[0]));cx.setAttribute("x2",X(best[0]));cx.setAttribute("visibility","visible");
  const tip=$("chartTip");tip.style.display="block";tip.textContent=new Date(best[0]).toLocaleString("de-DE",dR==="1d"||dR==="7d"?{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}:{day:"2-digit",month:"2-digit",year:"numeric"})+": "+nf(best[1],2)+" TH/s"+(best[3]?" · "+best[3]+" °C":"")+(best[2]!=null&&dR!=="1d"?" · Uptime "+nf(best[2]*100,1)+" %":"");tip.style.left=Math.min(e.clientX-r.left+20,r.width-200)+"px";tip.style.top="40px";};
 svg.onmouseleave=()=>{$("chartTip").style.display="none";const cx=svg.querySelector("#cx");if(cx)cx.setAttribute("visibility","hidden");};}
async function loadAct(){const l=await api("/api/miner/activity?ip="+encodeURIComponent(dIp)).catch(()=>[]);$("dActN").textContent=l.length?"("+l.length+(l.length>=300?"+":"")+", 30 Tage)":"";
 $("dAct").innerHTML=l.map(x=>{const m=/^\\[([^\\]]+)\\] (.*)$/.exec(x)||[,"",x];return "<li><span style='color:"+(/^(Offline|Heiß|Niedrige)/.test(m[2])?"var(--bad)":/neu gestartet/.test(m[2])?"var(--warn)":"var(--ok)")+"'>"+esc(m[2].replace(/ \\(.*?\\)/,""))+"</span><time>"+esc(m[1])+"</time></li>";}).join("")||"<li class=mute>Keine Ereignisse in den letzten 30 Tagen.</li>";}
if(/^#miner=/.test(location.hash))setTimeout(()=>openDetail(decodeURIComponent(location.hash.slice(7))),300);
for(const id of ["q"])$(id).oninput=render;for(const id of ["qf","fs","fm"])$(id).onchange=render;
$("scan").onclick=()=>post("/api/scan").then(()=>setTimeout(load,800));
async function load(){try{S=await api("/api/status");$("ver").textContent=S.version;render();}catch{$("st").textContent="Argus Mining antwortet nicht. Läuft das Programm noch?";}}
load();setInterval(load,15000);
// Report
let rpR=null;
async function loadDays(){const month=$("rpKind").value==="month",ds=await api(month?"/api/months":"/api/days"),cur=$("day").value,today=ds[ds.length-1];
 $("day").innerHTML=ds.slice().reverse().map(k=>"<option value="+k+">"+(month?new Date(k+"-15").toLocaleDateString("de-DE",{month:"long",year:"numeric"}):k.split("-").reverse().join("."))+(k===today?" (läuft noch)":"")+"</option>").join("");
 if(cur&&ds.includes(cur))$("day").value=cur;else if(ds.length>1&&!month)$("day").value=ds[ds.length-2];loadReport();}
async function loadReport(){const k=$("day").value,month=$("rpKind").value==="month";if(!k){$("rpInfo").textContent="Noch keine Daten. Der Report zählt ab jetzt alle 5 Minuten mit.";$("rpTb").innerHTML="";$("rpTiles").innerHTML="";return;}
 rpR=await api(month?"/api/month?month="+k:"/api/report?day="+k);drawReport();}
function drawReport(){const r=rpR;if(!r)return;const month=r.kind==="month";
 $("rpInfo").textContent=month?r.days+" von "+r.daysInMonth+" Tagen mit Daten, "+nf(r.hours,0)+" h gemessen. Lücken (PC aus) zählen nicht mit.":r.hours+" h gemessen"+(r.noNet?", "+Math.round(r.noNet*5)+" min ohne Verbindung zu den Minern":"")+(r.hours<23.5?". Lücken (PC aus) zählen nicht mit.":"");
 $("rpTiles").innerHTML=[["Bestand",r.total+" Miner"],[month?"Typisch online (Median der Tage)":"Typisch online",r.median==null?"–":r.median+" / "+r.total],["Uptime",r.uptime==null?"–":nf(r.uptime*100,2)+" %"],["Verbrauch",(r.kwh>=1e4?nf(r.kwh/1000,2)+" MWh":nf(r.kwh,1)+" kWh")+(r.kwhEst>0?" <small class=mute>(davon "+nf(r.kwhEst,1)+" kWh geschätzt)</small>":"")],["Dauerhaft / zeitweise weg",r.down+" / "+r.partly]].map(([i,v])=>"<div class=tile><i>"+i+"</i><span>"+v+"</span></div>").join("");
 $("rpHead").innerHTML="<th>Miner</th><th>IP</th><th>Seriennr.</th><th>Modell</th><th>Worker (Pool 1)</th><th class=n>Uptime</th><th class=n>Verbrauch</th><th class=n>Ø Hashrate</th><th class=n>Neustarts</th>"+(month?"<th class=n>Tage</th>":"<th class=n>Geräte-Laufzeit</th><th class=n>Mining-Laufzeit</th>");
 const terms=$("rq").value.toLowerCase().split(/[,;]+/).map(x=>x.trim()).filter(Boolean);
 const l=r.miners.filter(m=>!terms.length||terms.some(t=>(m.name+" "+m.id+" "+m.serial+" "+m.mac+" "+m.type+" "+(m.pools||[]).map(p=>p.user+" "+p.url).join(" ")).toLowerCase().includes(t)));
 $("rpTb").innerHTML=l.map(m=>"<tr class="+(m.uptime<0.2?"off":m.uptime<0.98?"weak":"ok")+"><td>"+esc(m.name)+"</td><td>"+esc(m.id)+"</td><td>"+esc(m.serial||"–")+"</td><td>"+esc(m.type||"–")+"</td><td>"+esc(w1(m)||"–")+"</td><td class=n>"+nf(m.uptime*100,2)+" %</td><td class='n"+(m.kwhEst>m.kwh/2?" est":"")+"'>"+nf(m.kwh,m.kwh>=100?0:2)+" kWh</td><td class=n>"+nf(m.avgTh,1)+" TH/s</td><td class=n>"+(m.reboots+m.restarts||"–")+"</td>"+(month?"<td class=n>"+m.days+"</td>":"<td class=n>"+dur(m.devUp)+"</td><td class=n>"+dur(m.hashUp)+"</td>")+"</tr>").join("");}
$("rpKind").onchange=()=>{$("day").value="";loadDays();};$("rq").oninput=drawReport;
// Protokoll
let logL=[];
async function loadLogDays(){const ds=await api("/api/logdays"),cur=$("logDay").value;$("logDay").innerHTML=ds.slice().reverse().map(k=>"<option value="+k+">"+k.split("-").reverse().join(".")+"</option>").join("");if(cur&&ds.includes(cur))$("logDay").value=cur;loadLog();}
async function loadLog(){const k=$("logDay").value;if(!k){logL=[];drawLog();return;}const r=await api("/api/log?day="+k);logL=r.lines||[];drawLog();}
function drawLog(){const terms=$("lq").value.toLowerCase().split(/[,;]+/).map(x=>x.trim()).filter(Boolean),l=logL.filter(x=>!terms.length||terms.some(t=>x.toLowerCase().includes(t))).reverse();
 $("logInfo").textContent=l.length+" Einträge, neueste oben. Aufbewahrt 90 Tage.";
 $("logTb").innerHTML=l.slice(0,3000).map(x=>{const m=/^\\[([^\\]]+)\\] (.*)$/.exec(x)||[,"",x];return "<tr class="+(/^Offline|antwortet mehr|fehlgeschlagen|Fehler/.test(m[2])?"off":/neu gestartet/.test(m[2])?"weak":"ok")+"><td class=mute style='width:170px'>"+esc(m[1])+"</td><td style='white-space:normal'>"+esc(m[2])+"</td></tr>";}).join("")||"<tr><td class=mute>Keine Einträge.</td></tr>";}
$("logDay").onchange=loadLog;$("lq").oninput=drawLog;$("logDl").onclick=()=>{if($("logDay").value)location.href="/api/log.txt?day="+$("logDay").value;};
$("day").onchange=loadReport;$("updCheck").onclick=async()=>{$("sUpd").textContent="Prüfe…";await post("/api/update/check");await load();loadCfg();};$("csv").onclick=()=>{if($("day").value)location.href="/api/report.csv?"+($("rpKind").value==="month"?"month=":"day=")+$("day").value;};
// Einstellungen
async function loadCfg(){const c=await api("/api/config");$("sName").value=c.name;$("sRanges").value=c.ranges;$("sJth").value=c.jth||0;$("sAuto").checked=c.autostart;$("sAu").value=c.antUser||"root";$("sApHas").textContent=c.hasAntPass?"Ein Passwort ist gespeichert.":"";$("sAutoUpd").checked=c.autoUpdate!==false;
 const u=S&&S.update||{};$("sUpd").textContent="Version "+(S?S.version:"")+(u.state==="current"?", aktuell":u.state==="available"?", Update "+u.latest+" verfügbar":"")+(u.err?". "+u.err:"")+(u.canInstall===false?". Selbst-Update nur in der exe.":"");$("sRemote").checked=c.remote;$("sVnHas").textContent=c.hasVnishPass?"Ein Passwort ist gespeichert.":"";
 $("sRemoteInfo").textContent=c.remote?"Lesen von außen: http://"+(c.lanIps[0]||"PC-IP")+":"+c.port+"/api/status?token="+c.token+" (auch /api/report?day=JJJJ-MM-TT, /api/report.csv). Einstellungen gehen nur an diesem PC.":"Aus: Nur dieser PC sieht die Daten.";
 $("sDir").textContent="Daten und Einstellungen liegen in "+c.dir+".";}
$("sRanges").oninput=()=>{const n=$("sRanges").value.split(/\\n/).filter(x=>x.trim()).length;$("sCount").textContent=n+" Bereiche";};
$("save").onclick=async()=>{const r=await post("/api/config",{name:$("sName").value,ranges:$("sRanges").value,jth:+$("sJth").value||0,vnishPass:$("sVn").value,autostart:$("sAuto").checked,antUser:$("sAu").value,antPass:$("sAp").value,autoUpdate:$("sAutoUpd").checked,remote:$("sRemote").checked});$("sVn").value="";$("sAp").value="";$("saved").textContent="Gespeichert: "+r.ips+" Adressen"+(r.bad?.length?". Nicht verstanden: "+r.bad.join(", "):"");loadCfg();setTimeout(load,1500);};
</script></body></html>`;
