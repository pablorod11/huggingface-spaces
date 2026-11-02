'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const app=process.env.APP_URL||'http://127.0.0.1:7860/';await page.goto(app);await page.waitForFunction(()=>!!window.CyberLocal);
 const fixture=await page.evaluate(async()=>{
  let a=(await CyberLocal.request('/api/assessments',{method:'POST',body:{name:'Engagement acceptance fixture',client:'Synthetic enterprise',scope:'Owned synthetic fixture only',workflow:'code',content:'eval(x)',authorization:true,roles:['red','blue','white','black','purple']}})).assessment;
  a=(await CyberLocal.request(`/api/assessments/${a.id}/findings`,{method:'POST',body:{title:'Print completeness fixture',severity:'medium',location:'Owned revision',root_cause:'ROOT CAUSE ACCEPTANCE MARKER',input_to_impact:'INPUT PATH ACCEPTANCE MARKER',prerequisites:'PREREQUISITE ACCEPTANCE MARKER',mitigations:'MITIGATION ACCEPTANCE MARKER',evidence:'Synthetic evidence only',remediation:'Validate in owned fixture'}})).assessment;
  return {id:a.id,first:a.findings[0].id};
 });
 await page.reload();await page.getByRole('button',{name:'Engagement acceptance fixture',exact:true}).click();
 await page.evaluate(()=>{window.print=()=>{}});
 await page.getByRole('button',{name:'Print executive report',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#print-report').textContent.includes('ROOT CAUSE ACCEPTANCE MARKER'));
 const report=await page.locator('#print-report').textContent();
 for(const marker of ['ROOT CAUSE','INPUT PATH','PREREQUISITE','MITIGATION']) assert.ok(report.includes(marker+' ACCEPTANCE MARKER'));
 assert.match(report,/Adversary simulation/,'print includes mission guidance');
 console.log('PASS complete printed evidence and mission guidance');
 await page.locator('#refresh-assessment').waitFor();
 console.log('PASS refresh affordance exists');
 await page.locator('#tab-missions').click();
 await page.getByRole('button',{name:'Edit red workbook',exact:true}).click();
 await page.locator('#workbook-owner').fill('Synthetic red owner');
 await page.locator('#workbook-status').selectOption('complete');
 await page.locator('#workbook-form button[type=submit]').click();
 assert.equal(await page.locator('#workbook-dialog').evaluate(e=>e.open),true,'complete workbook needs evidence/result/decision');
 for(const [key,value] of Object.entries({evidence:'Owned fixture revision 1',expected:'Expected benign signal',observed:'Observed synthetic signal',decision:'Synthetic control accepted'})) await page.locator('#workbook-'+key).fill(value);
 page.once('dialog',d=>d.dismiss());await page.locator('#workbook-dialog [data-close]').first().click();
 assert.equal(await page.locator('#workbook-observed').inputValue(),'Observed synthetic signal','canceled workbook close preserves evidence');
 await page.locator('#workbook-form button[type=submit]').click();
 await page.locator('#workbook-dialog').waitFor({state:'hidden'});
 assert.match(await page.locator('#assessment-panel').textContent(),/Synthetic red owner/);
 console.log('PASS five-hat workbook validation and persistence');
 await page.locator('#tab-delivery').click();
 await page.locator('#delivery-executive_summary').fill('Synthetic executive summary for the owned engagement.');
 await page.locator('#delivery-business_impact').fill('Synthetic business impact, no customer data.');
 await page.locator('#delivery-recommendations').fill('1. Validate the scoped control. 2. Retest the owned fixture.');
 await page.locator('#delivery-form button[type=submit]').click();
 await page.waitForFunction(()=>!document.querySelector('#delivery-form').hasAttribute('aria-busy'));
 const before=await page.evaluate(async id=>(await CyberLocal.request('/api/assessments/'+id)).assessment,fixture.id);
 assert.match(before.delivery.executive_summary,/Synthetic executive/);
 // Deliberately leave a draft while the second tab saves a newer review.
 await page.locator('#delivery-business_impact').fill('Unsaved local business impact draft.');
 const second=await context.newPage();await second.goto(app);await second.waitForFunction(()=>!!window.CyberLocal);
 await second.evaluate(async({id,first})=>{const a=(await CyberLocal.request('/api/assessments/'+id)).assessment;const f=a.findings.find(f=>f.id===first);await CyberLocal.request(`/api/assessments/${id}/findings/${first}`,{method:'PATCH',body:{expected_revision:f.revision,verdict:'rejected',note:'Newer synthetic review from another tab.'}});},fixture);
 await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.locator('#change-hint').waitFor();
 assert.equal(await page.locator('#delivery-business_impact').inputValue(),'Unsaved local business impact draft.','change hint preserves drafts');
 await page.locator('#delivery-form button[type=submit]').click();await page.locator('#reload-delivery').waitFor();
 assert.equal(await page.locator('#delivery-business_impact').inputValue(),'Unsaved local business impact draft.','delivery conflict preserves draft');
 await page.getByRole('button',{name:'Print executive report',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#print-report').textContent.includes('Newer synthetic review from another tab.'));
 assert.equal(await page.locator('#delivery-business_impact').inputValue(),'Unsaved local business impact draft.','fresh printing leaves unsaved delivery intact');
 page.once('dialog',d=>d.dismiss());await page.locator('#refresh-assessment').click();
 assert.equal(await page.locator('#delivery-business_impact').inputValue(),'Unsaved local business impact draft.','canceled refresh preserves draft');
 page.once('dialog',d=>d.accept());await page.locator('#refresh-assessment').click();
 await page.waitForFunction(()=>document.querySelector('#delivery-business_impact').value!=='Unsaved local business impact draft.');
 await page.getByRole('button',{name:'Print executive report',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#print-report').textContent.includes('Newer synthetic review from another tab.'));
 assert.match(await page.locator('#print-report').textContent(),/Synthetic executive summary/);
 console.log('PASS cross-tab refresh preserves drafts and print uses latest saved data');
 await page.locator('#continue-engagement').click();
 const continued=await page.evaluate(async()=>{const rows=(await CyberLocal.request('/api/assessments')).assessments;for(const row of rows){const a=(await CyberLocal.request('/api/assessments/'+row.id)).assessment;if(a.continuation)return a;}});
 assert.equal(continued.continuation.parent_id,fixture.id);assert.equal(continued.snapshots.length,0);assert.equal(continued.activity.length,1);
 assert.notEqual(continued.findings[0].id,fixture.first);
 console.log('PASS engagement continuation keeps provenance and starts fresh history');
 await page.locator('#nav-overview').click();
 await page.locator('#workspace-status').waitFor();assert.match(await page.locator('#workspace-status').textContent(),/100/);
 await page.getByRole('button',{name:'Recovery guide',exact:true}).click();await page.locator('#recovery-dialog').waitFor();
 await page.locator('#recovery-dialog [data-close]').first().click();
 const downloadWait=page.waitForEvent('download');await page.getByRole('button',{name:/Backup.*JSON/}).click();await downloadWait;
 assert.match(await page.locator('#workspace-status').textContent(),/Last backup export initiated/i);
 await page.evaluate(async()=>{
  for(const client of ['Synthetic enterprise','Other enterprise']){
   let a=(await CyberLocal.request('/api/assessments',{method:'POST',body:{name:client+' queue fixture',client,scope:'Owned fixture',workflow:'code',content:'eval(x)',roles:['white'],authorization:true}})).assessment;
   await CyberLocal.request(`/api/assessments/${a.id}/findings/${a.findings[0].id}`,{method:'PATCH',body:{expected_revision:0,verdict:'confirmed-static',note:'Synthetic owned fixture with complete analyst decision.',review:{reviewer:'Synthetic analyst',reference:'Owned revision1',prerequisites:'Owned input',mitigations:'Owned controls inspected',method:'Manually traced this owned synthetic input path.'},tracking:{owner:client+' owner',status:'in-progress',due_date:'2000-01-01',retest:''}}});
   if(client==='Synthetic enterprise') for(let index=0;index<50;index++){
    a=(await CyberLocal.request(`/api/assessments/${a.id}/findings`,{method:'POST',body:{title:'Pagination fixture '+index,severity:'low',location:'Owned fixture',root_cause:'Synthetic cause',input_to_impact:'Synthetic path',prerequisites:'Owned permission',mitigations:'Owned controls',evidence:'Synthetic evidence',remediation:'Synthetic recommendation'}})).assessment;
    const f=a.findings.at(-1);await CyberLocal.request(`/api/assessments/${a.id}/findings/${f.id}`,{method:'PATCH',body:{expected_revision:0,verdict:'confirmed-static',note:'Complete synthetic decision for pagination coverage.',review:{reviewer:'Synthetic analyst',reference:'Owned revision1',prerequisites:'Owned input',mitigations:'Owned controls inspected',method:'Manually traced this owned synthetic input path.'},tracking:{owner:client+' owner',status:'in-progress',due_date:'2000-01-01',retest:''}}});
   }
  }
 });
 await page.getByRole('button',{name:'Client remediation',exact:true}).click();await page.locator('#client-remediation').waitFor();
 assert.equal(await page.getByRole('combobox',{name:'Filter workspace remediation by client'}).isVisible(),true);
 assert.match(await page.locator('#client-remediation').textContent(),/confirmed/i);
 await page.getByRole('combobox',{name:'Filter workspace remediation by client'}).selectOption('Synthetic enterprise');
 const queueText=await page.locator('#client-remediation').textContent();assert.match(queueText,/Synthetic enterprise owner/);assert.doesNotMatch(queueText,/Other enterprise owner/);assert.doesNotMatch(queueText,/Print completeness fixture/);
 assert.equal(await page.locator('#client-remediation tbody tr').count(),50,'client queue bounds visible rows');
 await page.getByRole('button',{name:'Next page',exact:true}).click();assert.equal(await page.locator('#client-remediation tbody tr').count(),1);
 await page.getByRole('combobox',{name:'Filter workspace remediation by client'}).selectOption('Other enterprise');assert.equal(await page.locator('#client-remediation tbody tr').count(),1,'client filter resets pagination');
 await page.waitForFunction(()=>!document.querySelector('#notice').classList.contains('visible'));
 if(process.env.ARTIFACT_DIR){await page.screenshot({path:process.env.ARTIFACT_DIR+'/engagement-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);await page.screenshot({path:process.env.ARTIFACT_DIR+'/engagement-mobile.png',fullPage:true});}
 console.log('PASS client remediation, recovery guide, backup timestamp and mobile overflow');
 await page.setViewportSize({width:1440,height:1000});await page.locator('#nav-overview').click();
 await page.evaluate(()=>{CyberLocal.workspaceStatus=async()=>({count:null,approximate_bytes:null,usage:null,quota:null})});
 await page.locator('#nav-overview').click();await page.waitForFunction(()=>document.querySelector('#workspace-status')?.textContent.includes('Unavailable'));
 assert.doesNotMatch(await page.locator('#workspace-status').textContent(),/serialized records: 0 bytes/,'unknown metadata must not look like zero usage');
 console.log('PASS unavailable optional storage metadata remains distinct from zero usage (fault injection)');
 const blocked=await browser.newContext();
 await blocked.addInitScript(()=>{window.BroadcastChannel=class{constructor(){throw new DOMException('Synthetic blocked channel','SecurityError')}}});
 const blockedPage=await blocked.newPage();const blockedErrors=[];blockedPage.on('pageerror',e=>blockedErrors.push(e.message));await blockedPage.goto(app);await blockedPage.getByRole('button',{name:'Create first assessment ↗',exact:true}).waitFor();assert.deepEqual(blockedErrors,[]);await blocked.close();
 console.log('PASS optional channel policy denial does not prevent workspace startup');
 await second.close();
 assert.deepEqual(errors,[]);await context.close();
}finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
