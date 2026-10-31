'use strict';
const KEY = 'intake-desk-demo-v1';
const $ = id => document.getElementById(id);
const form = $('inquiry-form');
const field = name => form.elements.namedItem(name);
const statuses = ['New', 'Reviewing', 'In progress', 'Closed'];
const owners = ['', 'Maya', 'Jordan', 'Alex'];
const now = () => new Date().toISOString();
const localDate = value => { const d = value ? new Date(value) : new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const today = () => localDate();
function seeds() {
 const createdAt = now();
 return [
 {id:'INQ-1001',customer:'Avery Morgan',service:'Garden maintenance',preferred:'email',contact:'avery@example.com',description:'Interested in monthly garden maintenance for a small property.',owner:'Maya',status:'New',nextAction:'Confirm property size and arrange a visit.',resolution:'',closedAt:''},
 {id:'INQ-1002',customer:'Sam Rivera',service:'Office cleaning',preferred:'email',contact:'sam@example.com',description:'Request for a weekly cleaning estimate for a small office.',owner:'',status:'Reviewing',nextAction:'Assign an owner to prepare an estimate.',resolution:'',closedAt:''},
 {id:'INQ-1003',customer:'Jamie Chen',service:'Window cleaning',preferred:'email',contact:'jamie@example.com',description:'Would like exterior windows cleaned before a community event.',owner:'Jordan',status:'In progress',nextAction:'Send the estimate for review.',resolution:'',closedAt:''},
 {id:'INQ-1004',customer:'Riley Patel',service:'Seasonal cleanup',preferred:'email',contact:'riley@example.com',description:'Asked about availability for a seasonal yard cleanup.',owner:'Alex',status:'Closed',nextAction:'',resolution:'Estimate accepted; handed over to the scheduling process.',closedAt:today()}
 ].map(r => ({...r,createdAt,updatedAt:createdAt}));
}
function validDate(value) {
 return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
}
function validRecords(value) {
 if(!Array.isArray(value))return false;
 const ids=new Set();
 return value.every(r => {
  if(!r || !['id','customer','service','contact','description','owner','status','nextAction','resolution','closedAt','createdAt','updatedAt'].every(k=>typeof r[k]==='string'))return false;
  if(!/^INQ-[1-9]\d*$/.test(r.id)||!Number.isSafeInteger(Number(r.id.slice(4)))||ids.has(r.id))return false;
  ids.add(r.id);
  return ['customer','service','contact','description'].every(k=>r[k].trim()) && ['email','phone'].includes(r.preferred) && statuses.includes(r.status) && owners.includes(r.owner) && !Number.isNaN(Date.parse(r.createdAt)) && !Number.isNaN(Date.parse(r.updatedAt)) && Date.parse(r.updatedAt)>=Date.parse(r.createdAt) && (r.status==='Closed' ? !!r.resolution.trim()&&validDate(r.closedAt)&&r.closedAt<=today()&&r.closedAt>=localDate(r.createdAt) : r.closedAt===''&&r.resolution==='');
 });
}
function showError(message) { $('error').textContent=message; $('error').hidden=false; $('form-error').textContent=message; $('form-error').hidden=false; }
let editorSnapshot='', records=seeds(), editing=null, unreadableSavedData=false, savedSnapshot=null;
try {
 const raw=localStorage.getItem(KEY); savedSnapshot=raw;
 if(raw!==null) {
  try { const parsed=JSON.parse(raw); if(!validRecords(parsed))throw Error('Invalid saved data'); records=parsed; }
  catch { unreadableSavedData=true; showError('Saved demo data is unreadable and has been preserved. Sample records are shown in memory. Saving is blocked until you explicitly reset the fictional sample data.'); }
 }
}
catch { showError('Browser storage could not be accessed. Sample records are shown in memory. Changes cannot be saved until browser storage is available.'); }
function commit(next, replaceUnreadable=false) {
 if(unreadableSavedData&&!replaceUnreadable){showError('Changes were not saved because existing browser data is unreadable. Close this form and use “Reset fictional sample data” to explicitly replace it.');return false;}
 if(!validRecords(next)){showError('Changes were not saved: check required details, dates, and record references.');return false;}
 try {
  const current=localStorage.getItem(KEY);
  if(!replaceUnreadable&&current!==savedSnapshot){showError('Another tab changed the saved records. Your changes were not saved. Copy your edits, close this form, and reload before trying again.');return false;}
  const serialized=JSON.stringify(next);
  localStorage.setItem(KEY,serialized); savedSnapshot=serialized; records=next; unreadableSavedData=false; $('error').hidden=true; $('form-error').hidden=true; render(); return true; }
 catch { showError('Changes were not saved: browser storage is unavailable or full. Your form remains open. Copy your changes before leaving, or enable browser storage and try again.'); return false; }
}
function cell(text,tag='td') { const el=document.createElement(tag); el.textContent=text; return el; }
function filtered() { const query=$('search').value.trim().toLowerCase(), status=$('status-filter').value, owner=$('owner-filter').value; return records.filter(r=>(!status||r.status===status)&&(!owner||(owner==='unassigned'?!r.owner:r.owner===owner))&&(!query||[r.id,r.customer,r.contact,r.service,r.description,r.nextAction].join(' ').toLowerCase().includes(query))); }
function render() {
 $('active-count').textContent=records.filter(r=>r.status!=='Closed').length;
 $('unassigned-count').textContent=records.filter(r=>!r.owner&&r.status!=='Closed').length;
 $('closed-count').textContent=records.filter(r=>r.status==='Closed').length;
 const list=filtered(); $('result-count').textContent=`${list.length} of ${records.length} inquiries`; $('empty').hidden=!!list.length; $('rows').replaceChildren();
 for(const r of list) {
  const tr=document.createElement('tr'), customer=cell(''); customer.append(cell(r.customer,'strong'),cell(r.id,'small')); tr.append(customer,cell(r.service));
  const status=cell(''), badge=cell(r.status,'span'); badge.className=`badge ${r.status.toLowerCase().replaceAll(' ','-')}`; status.append(badge); tr.append(status);
  const owner=cell(''); if(r.owner){const wrap=cell('','span');wrap.className='owner';const avatar=cell(r.owner.slice(0,1),'span');avatar.className='avatar';wrap.append(avatar,document.createTextNode(r.owner));owner.append(wrap);}else owner.textContent='Unassigned'; tr.append(owner,cell(r.nextAction||'—'));
  const action=cell(''),button=cell('↗','button');button.type='button';button.className='open-record';button.setAttribute('aria-label',`Open inquiry ${r.id} for ${r.customer}`);button.onclick=()=>openEditor(r.id);action.append(button);tr.append(action);$('rows').append(tr);
 }
}
function contactType() {
 const email=field('preferred').value==='email'; field('contact').type=email?'email':'tel';field('contact').placeholder=email?'name@example.com':'e.g. 202-555-0142';if(email)field('contact').removeAttribute('pattern');else field('contact').pattern='[+\\(\\)0-9 .\\-]{7,30}'; field('contact').setCustomValidity('');
}
function closeFields() { const closed=field('status').value==='Closed';$('resolution-field').hidden=!closed;$('closure-field').hidden=!closed;field('resolution').required=closed;field('closedAt').required=closed;field('closedAt').max=today();const previous=records.find(r=>r.id===editing);field('closedAt').min=previous?localDate(previous.createdAt):today();if(closed&&!field('closedAt').value)field('closedAt').value=today(); }
function openEditor(id) {
 editing=id||null; form.reset(); $('form-error').hidden=true; const record=records.find(r=>r.id===id);
 for(const key of ['customer','service','preferred','contact','description','owner','status','nextAction','resolution','closedAt']) if(record) field(key).value=record[key];
 $('record-ref').textContent=record?record.id:'NEW INQUIRY';$('dialog-title').textContent=record?'Edit inquiry':'New inquiry';
 $('timestamps').textContent=record?`Created ${new Date(record.createdAt).toLocaleString()} · Last updated ${new Date(record.updatedAt).toLocaleString()}`:'A reference and creation timestamp are added when saved.';
 for(const element of form.elements)if(element.setCustomValidity)element.setCustomValidity('');contactType();closeFields();editorSnapshot=JSON.stringify([...new FormData(form)]);$('editor').showModal();field('customer').focus();
}
$('new').onclick=()=>openEditor();function dismissEditor(event) {
 if(JSON.stringify([...new FormData(form)])!==editorSnapshot&&!confirm('Discard unsaved inquiry edits?')){event?.preventDefault();return;}
 $('editor').close();
}
$('dismiss').onclick=$('cancel').onclick=dismissEditor;
$('editor').addEventListener('cancel',dismissEditor);
field('preferred').onchange=contactType;field('status').onchange=closeFields;
for(const name of ['customer','service','description','resolution','contact'])field(name).oninput=()=>field(name).setCustomValidity('');
form.addEventListener('submit',event=>{
 event.preventDefault();
 for(const name of ['customer','service','description',...(field('status').value==='Closed'?['resolution']:[])])field(name).setCustomValidity(field(name).value.trim()?'':'Please enter a value, not only spaces.');
 if(field('preferred').value==='phone')field('contact').setCustomValidity((field('contact').value.match(/[0-9]/g)||[]).length>=7?'':'Please enter a phone number with at least seven digits.');
 if(!form.reportValidity())return;
 const previous=records.find(r=>r.id===editing),stamp=now();
 const inquiry={id:editing||`INQ-${Math.max(1000,...records.map(r=>Number(r.id.slice(4))||1000))+1}`,createdAt:previous?.createdAt||stamp,updatedAt:stamp};
 for(const name of ['customer','service','preferred','contact','description','owner','status','nextAction','resolution','closedAt'])inquiry[name]=field(name).value.trim();
 if(inquiry.status!=='Closed'){inquiry.resolution='';inquiry.closedAt='';}else inquiry.nextAction='';
 const next=previous?records.map(r=>r.id===editing?inquiry:r):[inquiry,...records];
 if(commit(next)){ $('editor').close();$('notice').textContent=`${inquiry.id} saved in this browser. Demo only · No shared database or authentication. Use fictional information only.`; }
});
for(const id of ['search','status-filter','owner-filter'])$(id).addEventListener('input',render);
function csvValue(value) { let text=String(value); if(/^[\s]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text; return '"'+text.replaceAll('"','""')+'"'; }
$('export').onclick=()=>{
 const columns=['id','customer','service','preferred','contact','description','owner','status','nextAction','resolution','closedAt','createdAt','updatedAt'];
 const csv=[columns,...filtered().map(r=>columns.map(k=>r[k]))].map(row=>row.map(csvValue).join(',')).join('\r\n');
 try { const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download='intake-desk-demo.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); } catch { showError('The CSV could not be downloaded. Your saved records have not changed. Try again in a browser that supports downloads.'); }
};
$('reset').onclick=()=>{if(confirm('Replace all records in this browser with the fictional sample data? Export any records you want to keep first.'))if(commit(seeds(),true)){$('search').value='';$('status-filter').value='';$('owner-filter').value='';$('notice').textContent='Fictional sample data restored in this browser. No shared database or authentication. Use fictional information only.';render();}};
render();

if(typeof window!=='undefined')window.addEventListener('storage',event=>{
 if(event.key!==KEY&&event.key!==null)return;
 if($('editor').open){showError('Saved records changed in another tab. Copy any edits, close this form, and reload before saving.');return;}
 try {
  const raw=localStorage.getItem(KEY), parsed=raw===null?seeds():JSON.parse(raw);
  if(!validRecords(parsed))throw Error();
  records=parsed;savedSnapshot=raw;unreadableSavedData=false;$('error').hidden=true;render();
  $('notice').textContent='Inquiry register refreshed after a change in another tab. Use fictional information only.';
 } catch { unreadableSavedData=true;showError('Changed browser data could not be read. Existing records are preserved and saving is blocked. Reload or explicitly reset the fictional sample data.'); }
});

function updateNavigation() {
 const target=location.hash==='#how-it-works'?'#how-it-works':'#register';
 document.querySelectorAll('.sidebar .nav').forEach(link=>{
  const active=link.getAttribute('href')===target;
  link.classList.toggle('active',active);
  if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');
 });
}
if(typeof window!=='undefined'&&document.querySelectorAll){updateNavigation();window.addEventListener('hashchange',updateNavigation);}
