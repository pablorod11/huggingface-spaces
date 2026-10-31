// Code-only smoke test. This is not a browser or rendered-layout test.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(require('path').join(__dirname,'index.html'),'utf8');
const payload=html.match(/<script id="payload" type="application\/json">([\s\S]*?)<\/script>/)[1];
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
class Element {
 constructor(id){this.id=id;this.value='';this.textContent='';this.innerHTML='';this.hidden=true;this.listeners={};this.dataset={};this.attrs={};this.focused=false;}
 append(o){} addEventListener(k,f){this.listeners[k]=f}setAttribute(k,v){this.attrs[k]=v}focus(){this.focused=true}click(){this.onclick()}
}
const elements={};const get=id=>elements[id]??=new Element(id);
get('payload').textContent=payload;
const tabs=['schemaTab','checksTab'].map(get);tabs[0].dataset.sql='schema';tabs[1].dataset.sql='checks';
vm.runInNewContext(source,{document:{getElementById:get,createElement:()=>new Element('option'),querySelectorAll:()=>tabs},Intl});
assert.equal(get('nExceptions').textContent,16);assert.match(get('resultCount').textContent,/16 of 16/);
get('search').value='S005';get('search').listeners.input();assert.match(get('resultCount').textContent,/2 of 16/);
get('ownerFilter').value='Data engineering';get('ownerFilter').listeners.input();assert.match(get('resultCount').textContent,/1 of 16/);
get('search').value='nonexistent';get('search').listeners.input();assert.match(get('exceptionRows').innerHTML,/No matching exceptions/);
const data=JSON.parse(payload);const index=data.exceptions.findIndex(r=>r.service_id==='S014');const button=new Element('button');button.dataset.index=index;
get('exceptionRows').listeners.click({target:{closest:()=>button}});assert.equal(get('detail').hidden,false);assert.match(get('detail').innerHTML,/Unknown/);assert.match(get('detail').innerHTML,/7000/);assert.match(get('detail').innerHTML,/CHARGE_CONFLICT/);
get('closeDetail').onclick();assert.equal(get('detail').hidden,true);assert.equal(button.focused,true);
tabs[0].click();assert.equal(get('sqlCode').textContent,data.sql.schema);assert.equal(tabs[0].tabIndex,0);tabs[0].listeners.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(get('sqlCode').textContent,data.sql.checks);assert.equal(tabs[1].focused,true);
console.log('PASS: 7 code-only interaction groups (initial metrics, search, owner filter, empty state, conflict detail, close/focus, keyboard SQL tabs). No rendered/browser acceptance claimed.');
