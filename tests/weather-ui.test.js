'use strict';
const { run } = require('./harness');
run(async ({ ev, check }) => {
  const result = await ev(`(() => {
    const data={cur:{temp:18,feels:17,hum:50,code:0,wind:5,gust:6,day:true},hours:[],days:[]};
    wxOn=true; wxData={loc:{city:'Berlin'},data,ts:1700000000000,error:'Wetterdienst vorübergehend nicht erreichbar',places:[]};
    renderWx(); const stale={hint:document.getElementById('wxHint').textContent,temp:document.getElementById('wxNow').textContent};
    wxData={loc:{city:'Berlin'},data:null,ts:0,error:'Wetterdienst vorübergehend nicht erreichbar',places:[]};
    renderWx(); const empty={hint:document.getElementById('wxHint').textContent,temp:document.getElementById('wxNow').textContent};
    wxData={loc:{city:'Berlin'},data,ts:Date.now(),error:'',places:[]};
    renderWx(); const recovered={hint:document.getElementById('wxHint').textContent,temp:document.getElementById('wxNow').textContent};
    return {stale,empty,recovered};
  })()`);
  check('stored weather visibly stale with timestamp', /Veraltete Wetterdaten.*Stand/.test(result.stale.hint) && result.stale.temp.includes('18'));
  check('no cache shows temporary outage clearly',result.empty.hint==='Wetterdienst vorübergehend nicht erreichbar' && result.empty.temp==='');
  check('recovery clears stale warning',result.recovered.hint==='' && result.recovered.temp.includes('18'));
});
