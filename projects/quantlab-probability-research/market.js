/* Dated public snapshots only; no uploaded input is transmitted by this module. */
(function(root){
'use strict';
function validateSnapshot(data){
 if(!data||data.schemaVersion!==1||!Array.isArray(data.securities)||!data.securities.length||data.securities.length>32)throw Error('Invalid market snapshot catalog. Use a CSV or made-up example.');
 const seen=new Set();
 return data.securities.map(s=>{
  if(!s||typeof s.ticker!=='string'||!/^[A-Z0-9.^-]{1,15}$/.test(s.ticker)||seen.has(s.ticker))throw Error('Invalid or duplicate snapshot ticker.');seen.add(s.ticker);
  if(s.currency!=='USD'||typeof s.name!=='string'||!s.name.trim()||s.name.length>200||typeof s.adjustment!=='string'||!s.adjustment.trim()||s.adjustment.length>1000||typeof s.sourceUrl!=='string'||!/^https:\/\//.test(s.sourceUrl)||typeof s.retrievedAt!=='string'||!Number.isFinite(Date.parse(s.retrievedAt)))throw Error('Snapshot source, adjustment or USD metadata is invalid.');
  if(!Array.isArray(s.dates)||!Array.isArray(s.closes)||s.dates.length!==s.closes.length||s.dates.length<714||s.dates.length>2500)throw Error('Market snapshots need 714–2,500 matching daily dates and prices.');
  let previous='';
  for(let i=0;i<s.dates.length;i++){
   const date=s.dates[i],value=s.closes[i];
   if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.slice(0,4)==='0000'||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date<=previous)throw Error('Snapshot dates must be valid, unique and increasing.');
   if(typeof value!=='number'||!Number.isFinite(value)||value<=0)throw Error('Snapshot prices must be finite and positive.');previous=date;
  }
  return{...s,dates:s.dates.slice(),closes:s.closes.slice()};
 });
}
async function loadSnapshot(fetcher=fetch){
 const response=await fetcher('market-data.json',{cache:'no-cache'});
 if(!response.ok)throw Error('Market snapshots are unavailable. Use your CSV or the made-up example.');
 const text=await response.text();if(new TextEncoder().encode(text).length>2*1024*1024)throw Error('Market snapshot exceeds the 2 MiB limit.');
 let data;try{data=JSON.parse(text);}catch{throw Error('Market snapshot is not valid JSON. Use a CSV or made-up example.');}
 return validateSnapshot(data);
}
function source(s){return{kind:'market_snapshot',synthetic:false,ticker:s.ticker,currency:s.currency,rows:s.closes.length,name:s.ticker+' · '+s.name,adjustment_basis:s.adjustment,source_url:s.sourceUrl,snapshot_retrieved_at:s.retrievedAt,first_observation_date:s.dates[0],last_observation_date:s.dates.at(-1),calendar:'Observed exchange sessions; no gaps filled.'};}
const api={validateSnapshot,loadSnapshot,source};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.QuantMarket=api;
})(globalThis);
