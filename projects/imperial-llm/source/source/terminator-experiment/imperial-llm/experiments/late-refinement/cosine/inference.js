/* Classic Transformer equations from the upstream PyTorch model, evaluated in JS. */
(function(root) {
  'use strict';
  function linear(x,w,b) { return w.map((row,i)=>row.reduce((s,v,j)=>s+v*x[j],b?b[i]:0)); }
  function softmax(values) { const max=Math.max(...values), exp=values.map(x=>Math.exp(x-max)), sum=exp.reduce((a,b)=>a+b,0); return exp.map(x=>x/sum); }
  function add(a,b) { return a.map((x,i)=>x+b[i]); }
  function norm(x,w,b) { const mean=x.reduce((a,b)=>a+b,0)/x.length, variance=x.reduce((a,b)=>a+(b-mean)**2,0)/x.length, scale=1/Math.sqrt(variance+1e-5); return x.map((v,i)=>(v-mean)*scale*w[i]+b[i]); }
  class ImperialModel {
    constructor(data) {
      this.config=data.config; this.vocab=data.vocab; this.weights=data.weights??data.state_dict;
      const c=this.config;
      if(!c || !Number.isInteger(c.n_embed) || !Number.isInteger(c.n_head) || c.n_embed<1 || c.n_head<1 || c.n_embed%c.n_head || !Number.isInteger(c.N_BLOCKS) || c.N_BLOCKS<1 || !Number.isInteger(c.context_length) || c.context_length<1 || !Array.isArray(this.vocab) || this.vocab.length!==c.vocab_size || new Set(this.vocab).size!==this.vocab.length || this.vocab.some(x=>typeof x!=='string'||[...x].length!==1)) throw new Error('Invalid Transformer configuration or vocabulary.');
      this.ids=new Map(this.vocab.map((v,i)=>[v,i]));
      const check=(name,shape)=>{ const value=this.weights?.[name]; function valid(x,d){return d.length?Array.isArray(x)&&x.length===d[0]&&x.every(v=>valid(v,d.slice(1))):Number.isFinite(x);} if(!valid(value,shape))throw new Error(`Invalid model tensor: ${name}`); };
      const vector=(name,n)=>check(name,[n]), matrix=(name,m,n)=>check(name,[m,n]); const n=c.n_embed;
      matrix('token_embed.weight',c.vocab_size,n);matrix('position_embed.weight',c.context_length,n);
      for(let b=0;b<c.N_BLOCKS;b++) {
        const p=`attn_blocks.${b}.`;
        for(const ln of ['ln1','ln2']){vector(p+ln+'.weight',n);vector(p+ln+'.bias',n);}
        for(let h=0;h<c.n_head;h++)for(const q of ['key','query','value'])matrix(p+`attn.heads.${h}.${q}.weight`,n/c.n_head,n);
        matrix(p+'attn.proj.weight',n,n);vector(p+'attn.proj.bias',n);
        matrix(p+'mlp.hidden.weight',4*n,n);vector(p+'mlp.hidden.bias',4*n);
        matrix(p+'mlp.proj.weight',n,4*n);vector(p+'mlp.proj.bias',n);
      }
      vector('layer_norm.weight',n);vector('layer_norm.bias',n);matrix('lm_head.weight',c.vocab_size,n);vector('lm_head.bias',c.vocab_size);
    }
    encode(text) {
      if(typeof text!=='string')throw new Error('Prompt must be text.');
      return [...text].map(char=>{if(!this.ids.has(char))throw new Error(`Unsupported character ${JSON.stringify(char)}. Try simple English text from the examples.`);return this.ids.get(char);});
    }
    decode(ids) { if(!Array.isArray(ids)||ids.some(i=>!Number.isInteger(i)||i<0||i>=this.vocab.length))throw new Error('Invalid token IDs.');return ids.map(i=>this.vocab[i]).join(''); }
    forward(ids) {
      if(!Array.isArray(ids)||!ids.length||ids.length>this.config.context_length||ids.some(i=>!Number.isInteger(i)||i<0||i>=this.vocab.length))throw new Error('Context must contain valid token IDs within the context window.');
      const w=this.weights,c=this.config;
      let x=ids.map((id,t)=>add(w['token_embed.weight'][id],w['position_embed.weight'][t]));
      for(let b=0;b<c.N_BLOCKS;b++) {
        const p=`attn_blocks.${b}.`, z=x.map(row=>norm(row,w[p+'ln1.weight'],w[p+'ln1.bias']));
        const joined=x.map(()=>[]), size=c.n_embed/c.n_head;
        for(let h=0;h<c.n_head;h++) {
          const base=p+`attn.heads.${h}.`, keys=z.map(row=>linear(row,w[base+'key.weight'])), queries=z.map(row=>linear(row,w[base+'query.weight'])), values=z.map(row=>linear(row,w[base+'value.weight']));
          for(let t=0;t<x.length;t++) {
            const probs=softmax(keys.slice(0,t+1).map(k=>k.reduce((s,v,i)=>s+v*queries[t][i],0)/Math.sqrt(size)));
            const out=Array(size).fill(0);
            for(let j=0;j<=t;j++)for(let d=0;d<size;d++)out[d]+=probs[j]*values[j][d];
            joined[t].push(...out);
          }
        }
        x=x.map((row,t)=>add(row,linear(joined[t],w[p+'attn.proj.weight'],w[p+'attn.proj.bias'])));
        x=x.map(row=>{ const z=norm(row,w[p+'ln2.weight'],w[p+'ln2.bias']), hidden=linear(z,w[p+'mlp.hidden.weight'],w[p+'mlp.hidden.bias']).map(v=>Math.max(0,v)); return add(row,linear(hidden,w[p+'mlp.proj.weight'],w[p+'mlp.proj.bias'])); });
      }
      const last=norm(x[x.length-1],w['layer_norm.weight'],w['layer_norm.bias']);
      return linear(last,w['lm_head.weight'],w['lm_head.bias']);
    }
  }
  root.ImperialModel=ImperialModel;
  if(typeof module!=='undefined'&&module.exports)module.exports={ImperialModel};
})(typeof globalThis!=='undefined'?globalThis:this);
