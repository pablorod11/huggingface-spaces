/* Memory only: no localStorage, IndexedDB, cookies, network or service worker. */
(function(root){
'use strict';
function createRunCache({now=()=>Date.now(),maxEntries=3,ttlMs=600000}={}){
 if(!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>3||!Number.isFinite(ttlMs)||ttlMs<=0||ttlMs>600000)throw Error('Cache must hold 1–3 runs for at most ten minutes.');
 const entries=new Map();let timer=null;
 const prune=()=>{const time=now();for(const [key,entry]of entries)if(time-entry.created>=ttlMs||time<entry.created)entries.delete(key);};
 const schedule=()=>{if(timer!==null)clearTimeout(timer);timer=null;if(entries.size){const delay=Math.max(1,Math.min(...Array.from(entries.values(),entry=>entry.created+ttlMs-now())));timer=setTimeout(()=>{timer=null;prune();schedule();},delay);timer.unref?.();}};
 return {
  get(key){prune();const entry=entries.get(key);if(!entry)return null;entries.delete(key);entries.set(key,entry);return structuredClone(entry.value);},
  set(key,value){prune();const copy=structuredClone(value);entries.delete(key);entries.set(key,{created:now(),value:copy});while(entries.size>maxEntries)entries.delete(entries.keys().next().value);schedule();},
  clear(){entries.clear();if(timer!==null)clearTimeout(timer);timer=null;},size(){prune();return entries.size;}
 };
}
const api={createRunCache};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.QuantCache=api;
})(typeof globalThis!=='undefined'?globalThis:this);
