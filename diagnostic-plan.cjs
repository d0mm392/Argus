'use strict';
const cumulative=['desktop','apps','integrations','local','index','steam','network'];
const plans={argus:null,minimal:[], 'argus-no-gpu':null,modules:[],core:[]};
for(let i=0;i<cumulative.length;i++)plans['stage-'+(i+1)]=cumulative.slice(0,i+1);
for(const group of cumulative)plans['core-'+group]=[group];
const appProbes={'apps-callback':'callback-only','apps-parse':'parse-only','apps-walk':'walk-only','apps-native':'native','apps-worker':'worker'};
for(const mode of Object.keys(appProbes))plans[mode]=['apps'];
function plan(mode){
  if(!Object.hasOwn(plans,mode))throw Error('Unbekannter Diagnosemodus.');
  return {mode,groups:plans[mode]===null?[...cumulative]:[...plans[mode]],modulesOnly:mode==='modules',
    disableGpu:!['argus','minimal'].includes(mode),staged:!['argus','minimal','argus-no-gpu'].includes(mode),appsProbe:appProbes[mode]||'worker'};
}
module.exports={plan,modes:Object.keys(plans)};
