const LABELS = ['EDUCATION','FINANCE','HEALTHCARE','SOFTWARE','TRADES'];
const finite = x => typeof x === 'number' && Number.isFinite(x);
export class Classifier {
  constructor(model) {
    if (model?.format_version !== 1 || JSON.stringify(model.classes)!==JSON.stringify(LABELS)) throw Error('Unsupported model categories or format.');
    const n = Object.keys(model.vocabulary||{}).length;
    if (!n || model.idf?.length!==n || model.coefficients?.length!==5 || model.intercept?.length!==5 ||
        !model.idf.every(x=>finite(x)&&x>0) || !model.intercept.every(finite) ||
        !model.coefficients.every(row=>row.length===n&&row.every(finite)) ||
        !Object.values(model.vocabulary).every(x=>Number.isInteger(x)&&x>=0&&x<n) || new Set(Object.values(model.vocabulary)).size!==n) throw Error('Invalid model dimensions or numbers.');
    const {auto_accept:a,escalate:e}=model.thresholds||{};
    if (!finite(e)||e<0||e>1||!(a===null||(finite(a)&&a>=e&&a<=1))) throw Error('Invalid routing thresholds.');
    this.model=model; this.classes=model.classes;
  }
  predict(text) {
    if(typeof text!=='string'||!text.trim()) throw Error('Enter a work description first.');
    if([...text].length>10000) throw Error('Use at most 10,000 characters.');
    const tokens=text.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu)||[];
    const terms=[...tokens,...tokens.slice(0,-1).map((t,i)=>t+' '+tokens[i+1])];
    const counts=new Map(); for(const t of terms) counts.set(t,(counts.get(t)||0)+1);
    const features=[]; for(const [t,c] of counts) if(Object.hasOwn(this.model.vocabulary,t)) {
      const i=this.model.vocabulary[t]; features.push([i,(1+Math.log(c))*this.model.idf[i]]);
    }
    const norm=Math.sqrt(features.reduce((s,[,v])=>s+v*v,0)); if(norm) for(const f of features) f[1]/=norm;
    const logits=this.model.coefficients.map((row,c)=>this.model.intercept[c]+features.reduce((s,[i,v])=>s+row[i]*v,0));
    const max=Math.max(...logits), exp=logits.map(v=>Math.exp(v-max)), sum=exp.reduce((a,b)=>a+b,0), probs=exp.map(v=>v/sum);
    const best=probs.indexOf(Math.max(...probs)), confidence=probs[best];
    const {auto_accept:a,escalate:e}=this.model.thresholds;
    const route=!features.length||confidence<e?'ESCALATE':a!==null&&confidence>=a?'AUTO_ACCEPT':'HUMAN_REVIEW';
    return {prediction:this.classes[best],confidence,probabilities:Object.fromEntries(this.classes.map((c,i)=>[c,probs[i]])),route,known_features:features.length,model_version:this.model.model_version};
  }
}
export class ReviewSession {
  constructor(state={items:[],events:[]},persist=()=>{}) { this.state=structuredClone(state); this.persist=persist; }
  commit(next) { this.persist(JSON.stringify(next)); this.state=next; }
  add(text,result) {
    if(!text?.trim()||!LABELS.includes(result.prediction)||!finite(result.confidence)||result.confidence<0||result.confidence>1||!['AUTO_ACCEPT','HUMAN_REVIEW','ESCALATE'].includes(result.route)) throw Error('Invalid prediction.');
    const auto=result.route==='AUTO_ACCEPT';
    const item={id:crypto.randomUUID(),text,prediction:result.prediction,confidence:result.confidence,model_version:result.model_version,route:result.route,status:auto?'resolved':result.route==='ESCALATE'?'escalated':'pending',revision:0,owner:null,senior_required:result.route==='ESCALATE',final_label:auto?result.prediction:null,provenance:auto?'MODEL':null,corrected:false};
    const next=structuredClone(this.state); next.items.push(item); next.events.push({item_id:item.id,action:'create',actor:'inference',role:'service',reason:'Initial prediction',timestamp:new Date().toISOString(),snapshot:structuredClone(item)}); this.commit(next); return item;
  }
  transition(id,revision,role,action,label,reason='') {
    if(!['reviewer','senior'].includes(role)) throw Error('Audit readers cannot change records.');
    const next=structuredClone(this.state), item=next.items.find(x=>x.id===id), actor='demo-'+role;
    if(!item) throw Error('Select a record first.');
    if(item.revision!==revision) throw Error('Stale revision. Refresh the record before retrying.');
    if(['resolved','out_of_scope'].includes(item.status)) throw Error('This decision is complete and cannot be overwritten.');
    if(item.senior_required&&role!=='senior') throw Error('Escalations require a senior reviewer.');
    if(action==='claim') {
      if(!['pending','escalated'].includes(item.status)) throw Error('This record is already claimed.');
      item.status='in_review'; item.owner=actor;
    } else {
      if(item.status!=='in_review'||item.owner!==actor) throw Error('Claim this record with the current identity before deciding.');
      if(!reason.trim()) throw Error('Give a reason for this decision.');
      if(action==='escalate') Object.assign(item,{status:'escalated',owner:null,senior_required:true});
      else if(action==='out_of_scope') {
        if(role!=='senior') throw Error('Only a senior can close work out of scope.');
        Object.assign(item,{status:'out_of_scope',final_label:null,provenance:'HUMAN'});
      } else if(action==='resolve') {
        if(!LABELS.includes(label)) throw Error('Choose a supported category.');
        Object.assign(item,{status:'resolved',final_label:label,provenance:'HUMAN',corrected:label!==item.prediction});
      } else throw Error('Unsupported action.');
    }
    item.revision++;
    next.events.push({item_id:id,action,actor,role,reason,timestamp:new Date().toISOString(),snapshot:structuredClone(item)}); this.commit(next); return item;
  }
  feedback() { return this.state.items.filter(x=>x.status==='resolved'&&x.provenance==='HUMAN').map(x=>({...x,history:this.state.events.filter(e=>e.item_id===x.id)})); }
}
