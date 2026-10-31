/* Generation stays off the main thread. Stop terminates this worker immediately. */
if (typeof importScripts === 'function') importScripts('inference.js');
else if (typeof require === 'function') require('./inference.js');
function seededRandom(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function generate(request, post) {
  const {payload, prompt, temperature, length, seed} = request;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 300) throw new Error('Enter a prompt of 1–300 characters.');
  if (!Number.isFinite(temperature) || temperature < 0.1 || temperature > 1.5) throw new Error('Temperature must be between 0.1 and 1.5.');
  if (![64,128,256].includes(length)) throw new Error('Choose 64, 128 or 256 new characters.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('Use an integer seed from 0 to 4294967295.');
  const model = new ImperialModel(payload), ids = model.encode(prompt), start = ids.length, rng = seededRandom(seed);
  for (let step = 0; step < length; step++) {
    const logits = model.forward(ids.slice(-model.config.context_length));
    const top = logits.map((x,i)=>({x:x/temperature,i})).sort((a,b)=>b.x-a.x).slice(0,Math.min(20,logits.length));
    const max = top[0].x, exp = top.map(x=>Math.exp(x.x-max)), sum = exp.reduce((a,b)=>a+b,0);
    let roll = rng(), next = top[top.length-1].i;
    for (let j=0;j<exp.length;j++) { roll-=exp[j]/sum; if(roll<=0){next=top[j].i;break;} }
    ids.push(next);
    if ((step+1)%16===0) post({type:'progress',text:model.decode(ids.slice(start)),count:step+1});
  }
  const result = {type:'done',text:model.decode(ids.slice(start)),count:length,logits:model.forward(ids.slice(-model.config.context_length))};
  post(result); return result;
}
if (typeof self !== 'undefined') self.onmessage = event => {
  try { generate(event.data, message=>self.postMessage(message)); }
  catch(error) { self.postMessage({type:'error',message:error.message}); }
};
if (typeof module !== 'undefined') module.exports = {generate};
