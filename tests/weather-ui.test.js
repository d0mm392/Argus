'use strict';
const { setup } = require('./renderer-fixture');
const assert = require('assert/strict'), { app } = require('electron');
async function run(body) {
  const fixture = await setup(); let count = 0;
  const check = (name, ok) => { assert(ok, name); count++; console.log('PASS ' + name); };
  await body({ ev: fixture.evaluate, check });
  check('renderer has no console errors', fixture.errors.length === 0);
  console.log(`${count}/${count} bestanden`); app.exit(0);
}
run(async ({ ev, check }) => {
  const result = await ev(`(() => {
    const data={cur:{temp:18,feels:17,hum:50,code:0,wind:5,gust:6,day:true},hours:[],days:[]};
    wxOn=true; wxData={loc:{city:'Berlin'},data,ts:1700000000000,error:'Wetterdienst vorübergehend nicht erreichbar',places:[]};
    renderWx(); const orb=temps.find(t=>t.key==='wx'); const stale={hint:document.getElementById('wxHint').textContent,temp:document.getElementById('wxNow').textContent,orb:orb.txt(18),tip:orb.tip()};
    wxData.places=[{name:'Bonn',data,ts:1700000000000,error:'Wetterdienst vorübergehend nicht erreichbar'}];wxPg.i=1;renderWx();
    const place=document.getElementById('wxHint').textContent;wxPg.i=0;
    wxData={loc:{city:'Berlin'},data:null,ts:0,error:'Wetterdienst vorübergehend nicht erreichbar',places:[]};
    renderWx(); const empty={hint:document.getElementById('wxHint').textContent,temp:document.getElementById('wxNow').textContent};
    wxData={loc:{city:'Berlin'},data,ts:Date.now(),error:'',places:[]};
    renderWx(); const recovered={hint:document.getElementById('wxHint').textContent,temp:document.getElementById('wxNow').textContent};
    return {stale,place,empty,recovered};
  })()`);
  check('stored weather visibly stale with timestamp', /Veraltete Wetterdaten.*Stand/.test(result.stale.hint) && result.stale.temp.includes('18') && result.stale.orb.includes('(alt)') && result.stale.tip.includes('Stand'));
  check('saved locations show their own stale timestamp', /Veraltete Wetterdaten.*Stand/.test(result.place));
  check('no cache shows temporary outage clearly',result.empty.hint==='Wetterdienst vorübergehend nicht erreichbar' && result.empty.temp==='');
  check('recovery clears stale warning',result.recovered.hint==='' && result.recovered.temp.includes('18'));
}).catch(error => { console.error(error.stack); app.exit(1); });
