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
    validateContext(ids) {
      if(!Array.isArray(ids)||!ids.length||ids.length>this.config.context_length||ids.some(i=>!Number.isInteger(i)||i<0||i>=this.vocab.length))throw new Error('Context must contain valid token IDs within the context window.');
    }
    forward(ids) {
      this.validateContext(ids);
      return this.forwardContext(ids);
    }
    // A fresh decoder belongs to one request and immutable model weights.
    // Rebuild whenever the exact prefix changes: learned positions shift on crop.
    createDecoder() {
      let previous=[], cache=[], logits;
      return {forward:ids=>{
        this.validateContext(ids);
        const prefix=previous.every((id,i)=>ids[i]===id);
        if(prefix&&ids.length===previous.length)return logits.slice();
        if(prefix&&previous.length&&ids.length===previous.length+1) {
          logits=this.forwardToken(ids[ids.length-1],previous.length,cache);
        } else {
          cache=[];
          // A full window cannot accept another row without shifting positions.
          logits=this.forwardContext(ids,ids.length<this.config.context_length?cache:undefined);
        }
        previous=ids.slice();
        return logits.slice();
      }};
    }
    forwardContext(ids,cache) {
      const w=this.weights,c=this.config;
      let x=ids.map((id,t)=>add(w['token_embed.weight'][id],w['position_embed.weight'][t]));
      for(let b=0;b<c.N_BLOCKS;b++) {
        const p=`attn_blocks.${b}.`, z=x.map(row=>norm(row,w[p+'ln1.weight'],w[p+'ln1.bias']));
        const joined=x.map(()=>[]), size=c.n_embed/c.n_head, lastOnly=b===c.N_BLOCKS-1;
        if(cache)cache[b]=[];
        for(let h=0;h<c.n_head;h++) {
          const base=p+`attn.heads.${h}.`, keys=z.map(row=>linear(row,w[base+'key.weight'])), values=z.map(row=>linear(row,w[base+'value.weight']));
          if(cache)cache[b][h]={keys:keys.map(row=>new Float64Array(row)),values:values.map(row=>new Float64Array(row))};
          for(let t=lastOnly?x.length-1:0;t<x.length;t++) {
            const query=linear(z[t],w[base+'query.weight']);
            const probs=softmax(keys.slice(0,t+1).map(k=>k.reduce((s,v,i)=>s+v*query[i],0)/Math.sqrt(size)));
            const out=Array(size).fill(0);
            for(let j=0;j<=t;j++)for(let d=0;d<size;d++)out[d]+=probs[j]*values[j][d];
            joined[t].push(...out);
          }
        }
        x=x.map((row,t)=>lastOnly&&t!==x.length-1?row:add(row,linear(joined[t],w[p+'attn.proj.weight'],w[p+'attn.proj.bias'])));
        x=x.map((row,t)=>{ if(lastOnly&&t!==x.length-1)return row; const z=norm(row,w[p+'ln2.weight'],w[p+'ln2.bias']), hidden=linear(z,w[p+'mlp.hidden.weight'],w[p+'mlp.hidden.bias']).map(v=>Math.max(0,v)); return add(row,linear(hidden,w[p+'mlp.proj.weight'],w[p+'mlp.proj.bias'])); });
      }
      const last=norm(x[x.length-1],w['layer_norm.weight'],w['layer_norm.bias']);
      return linear(last,w['lm_head.weight'],w['lm_head.bias']);
    }
    forwardToken(id,position,cache) {
      const w=this.weights,c=this.config,size=c.n_embed/c.n_head;
      let x=add(w['token_embed.weight'][id],w['position_embed.weight'][position]);
      for(let b=0;b<c.N_BLOCKS;b++) {
        const p=`attn_blocks.${b}.`,z=norm(x,w[p+'ln1.weight'],w[p+'ln1.bias']),joined=[];
        for(let h=0;h<c.n_head;h++) {
          const base=p+`attn.heads.${h}.`,head=cache[b][h],query=linear(z,w[base+'query.weight']);
          head.keys.push(new Float64Array(linear(z,w[base+'key.weight'])));
          head.values.push(new Float64Array(linear(z,w[base+'value.weight'])));
          const probs=softmax(head.keys.map(k=>k.reduce((s,v,i)=>s+v*query[i],0)/Math.sqrt(size)));
          const out=Array(size).fill(0);
          for(let j=0;j<head.values.length;j++)for(let d=0;d<size;d++)out[d]+=probs[j]*head.values[j][d];
          joined.push(...out);
        }
        x=add(x,linear(joined,w[p+'attn.proj.weight'],w[p+'attn.proj.bias']));
        const z2=norm(x,w[p+'ln2.weight'],w[p+'ln2.bias']);
        const hidden=linear(z2,w[p+'mlp.hidden.weight'],w[p+'mlp.hidden.bias']).map(v=>Math.max(0,v));
        x=add(x,linear(hidden,w[p+'mlp.proj.weight'],w[p+'mlp.proj.bias']));
      }
      return linear(norm(x,w['layer_norm.weight'],w['layer_norm.bias']),w['lm_head.weight'],w['lm_head.bias']);
    }
  }
  root.ImperialModel=ImperialModel;
  if(typeof module!=='undefined'&&module.exports)module.exports={ImperialModel};
})(typeof globalThis!=='undefined'?globalThis:this);
