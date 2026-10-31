'use strict';
// Fingerprints identify normalized model inputs, not original CSV bytes or vendor provenance.
(function(root){
 async function fingerprint({dates,closes},cryptoProvider=root.crypto){
  if(!Array.isArray(dates)||!Array.isArray(closes)||!closes.length||dates.length!==closes.length||closes.length>2500||dates.some(d=>typeof d!=='string')||closes.some(v=>!Number.isFinite(v)||v<=0))throw Error('Cannot fingerprint invalid model inputs.');
  if(!cryptoProvider?.subtle)throw Error('SHA-256 requires a secure browser context. Open this app over HTTPS or localhost.');
  const bytes=new TextEncoder().encode(JSON.stringify(['quantlab-normalized-prices-v1',dates,closes]));
  const digest=await cryptoProvider.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
 }
 function createJournal(limit=25){
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Inspection history limit must be between 1 and 100.');
  let count=0,views=[];
  return {
   record(metadata){const view={...structuredClone(metadata),sequence:++count,viewed_at:new Date().toISOString()};views.push(view);if(views.length>limit)views.shift();return structuredClone(view);},
   snapshot(){return{scope:'Successful result views in this tab since reload or clear; includes cache hits. Not a complete research history or a preregistration.',total_views:count,omitted_views:Math.max(0,count-views.length),views:structuredClone(views)};},
   clear(){count=0;views=[];}
  };
 }
 const api={fingerprint,createJournal};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.QuantProvenance=api;
})(globalThis);
