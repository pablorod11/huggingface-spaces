import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// A minimal DOM boundary lets the actual app module run without a browser or packages.
// Regression: a successful model load must not hide a failed session restoration.
async function start({raw=null, readError=false, modelError=false}={}) {
  const elements=new Map();
  const element=()=>({textContent:'',className:'',disabled:true,value:'reviewer',children:[],
    append(...children){this.children.push(...children);},
    replaceChildren(...children){this.children=children;},setAttribute(){}});
  const originals=Object.fromEntries(['document','sessionStorage','fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  globalThis.document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},
    createElement:element,querySelectorAll:()=>[]};
  for(const id of ['run','guided'])document.getElementById(id);
  globalThis.sessionStorage={getItem(){if(readError)throw Error('Storage unavailable');return raw;},setItem(){}};
  globalThis.fetch=async path=>({ok:!modelError,json:async()=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)))});
  try { await import(`./app.mjs?test=${crypto.randomUUID()}`); return elements; }
  finally {for(const [key,descriptor] of Object.entries(originals)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}

test('corrupt stored JSON leaves a visible recovery warning after model startup',async()=>{
  const ui=await start({raw:'{broken'});
  assert.match(ui.get('notice').textContent,/could not be restored/i);
  assert.equal(ui.get('notice').className,'error');
  assert.equal(ui.get('run').disabled,false);
  assert.match(ui.get('queue').children[0].children[0].textContent,/No records yet/);
});
test('invalid stored structure leaves a visible recovery warning',async()=>{
  const ui=await start({raw:'{"items":{},"events":[]}'});
  assert.match(ui.get('notice').textContent,/could not be restored/i);
  assert.equal(ui.get('run').disabled,false);
});
test('blocked storage reads leave a visible recovery warning',async()=>{
  const ui=await start({readError:true});
  assert.match(ui.get('notice').textContent,/could not be restored/i);
});
test('fresh and valid empty sessions start normally',async()=>{
  for(const raw of [null,'{"items":[],"events":[]}']) {
    const ui=await start({raw});
    assert.match(ui.get('notice').textContent,/^Ready\./);
    assert.equal(ui.get('notice').className,'success');
    assert.equal(ui.get('run').disabled,false);
    assert.equal(ui.get('guided').disabled,false);
  }
});
test('a model load failure keeps classification disabled',async()=>{
  const ui=await start({modelError:true});
  assert.match(ui.get('notice').textContent,/Startup error/);
  assert.equal(ui.get('run').disabled,true);
});
