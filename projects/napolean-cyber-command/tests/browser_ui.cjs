'use strict';
// Run against a local-only static server: APP_URL=http://127.0.0.1:7860/ node tests/browser_ui.cjs
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH} : {})});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    const page = await context.newPage();
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    async function assertProtectedDraft(dialogId) {
      const dialog=page.locator(dialogId);
      const values=()=>dialog.evaluate(root=>Object.fromEntries([...root.querySelectorAll('input,select,textarea')].map(el=>[el.id,el.type==='checkbox'?el.checked:el.value])));
      const original=await values();
      for(const action of ['x','close','escape']) {
        page.once('dialog',prompt=>prompt.dismiss());
        if(action==='x') await dialog.locator('[data-close]').first().click();
        else if(action==='close') await dialog.locator('[data-close]').last().click();
        else await page.keyboard.press('Escape');
        assert.equal(await dialog.evaluate(el=>el.open),true,`${dialogId} ${action} cancellation stays open`);
        assert.deepEqual(await values(),original,`${dialogId} ${action} cancellation preserves all draft fields`);
      }
    }
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:7860/');
    await page.getByRole('button',{name:'Create first assessment ↗',exact:true}).click();
    await page.locator('#assessment-name').fill('Synthetic retailer review');
    await page.locator('#client').fill('Fictional retailer');
    await page.locator('#scope').fill('Owned synthetic Python fixture only');
    await page.locator('#content').fill('import subprocess as sp\n# eval(ignored)\nsp.run(\n command,\n shell=True\n)\neval(incoming)');
    await page.locator('#authorization').check();
    await page.getByRole('button',{name:'Create assessment ↗',exact:true}).click();
    const candidate=page.getByRole('button',{name:'Possible shell-enabled process invocation',exact:true});
    await candidate.click();
    await page.locator('#verdict').selectOption('confirmed-static');
    await page.locator('#review-note').fill('Reviewed only against this synthetic owned fixture.');
    await page.getByRole('button',{name:'Record decision ↗',exact:true}).click();
    assert.equal(await page.locator('#finding-dialog').evaluate(e=>e.open),true,'incomplete confirmation stays open');
    for (const [selector,value] of Object.entries({'#reviewer':'Synthetic analyst','#reference':'fixture revision 1','#review-prerequisites':'Caller controls command in the fixture.','#review-mitigations':'No validation in this bounded fixture.','#review-method':'Manual source trace of the synthetic owned fixture.','#tracking-owner':'Fictional application team','#tracking-due':'2000-01-01','#tracking-retest':'Recheck argument-list replacement in owned fixture.'})) await page.locator(selector).fill(value);
    await page.locator('#tracking-status').selectOption('in-progress');
    await page.evaluate(()=>{
      const original=CyberLocal.request;
      let release;
      const gate=new Promise(resolve=>{release=resolve;});
      CyberLocal.request=(path,options)=>options?.method==='PATCH'?gate.then(()=>original(path,options)):original(path,options);
      window.__releaseSyntheticWrite=()=>{CyberLocal.request=original;release();};
    });
    await page.getByRole('button',{name:'Record decision ↗',exact:true}).click();
    assert.equal(await page.locator('#verdict-form').evaluate(form=>[...form.querySelectorAll('button,input,select,textarea')].every(control=>control.disabled)),true,'pending save freezes all draft controls (simulated latency)');
    await page.evaluate(()=>{window.__releaseSyntheticWrite();delete window.__releaseSyntheticWrite;});
    await page.locator('#finding-dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('#review-note').isDisabled(),false,'draft controls become editable after save');
    assert.equal(await candidate.evaluate(e=>document.activeElement===e),true,'focus returns to saved candidate');
    await page.getByRole('combobox',{name:'Filter by verdict'}).selectOption('confirmed-static');
    assert.equal(await page.locator('tbody tr').count(),1);
    await page.getByRole('combobox',{name:'Filter by severity'}).selectOption('medium');
    assert.equal(await page.locator('tbody tr').count(),0);
    await page.getByRole('combobox',{name:'Filter by severity'}).selectOption('');
    await page.getByRole('combobox',{name:'Filter by verdict'}).selectOption('');
    await candidate.click();

    const second=await context.newPage();
    second.on('pageerror',error=>errors.push(error.message));
    await second.goto(process.env.APP_URL || 'http://127.0.0.1:7860/');
    await second.getByRole('button',{name:'Synthetic retailer review',exact:true}).click();
    await second.getByRole('button',{name:'Possible shell-enabled process invocation',exact:true}).click();
    await second.locator('#reviewer').fill('Newer synthetic analyst');
    await second.locator('#reference').fill('fixture revision 2');
    await second.locator('#tracking-owner').fill('Newer application team');
    await second.locator('#tracking-status').selectOption('retest');
    await second.locator('#review-note').fill('Newer saved synthetic evidence from the second tab.');
    await second.getByRole('button',{name:'Record decision ↗',exact:true}).click();
    await second.locator('#finding-dialog').waitFor({state:'hidden'});
    await page.locator('#review-note').fill('Unsaved stale draft from the first synthetic tab.');
    const formValues=()=>page.locator('#verdict-form').evaluate(form=>Object.fromEntries([...form.querySelectorAll('input,select,textarea')].map(el=>[el.id,el.value])));
    const staleDraft=await formValues();
    await page.getByRole('button',{name:'Record decision ↗',exact:true}).click();
    await page.locator('#reload-finding').waitFor();
    assert.deepEqual(await formValues(),staleDraft,'conflicting save preserves every unsaved field');
    assert.equal(await second.evaluate(async()=>{
      const a=(await CyberLocal.request('/api/assessments')).assessments[0];
      return (await CyberLocal.request('/api/assessments/'+a.id)).assessment.findings.find(f=>f.title.includes('shell-enabled')).tracking.owner;
    }),'Newer application team');
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#reload-finding').click();
    await page.waitForFunction(()=>document.querySelector('#reviewer').value==='Newer synthetic analyst');
    assert.equal(await page.locator('#tracking-owner').inputValue(),'Newer application team');
    await page.getByRole('button',{name:'Close finding',exact:true}).click();
    await second.close();
    console.log('PASS stale UI save preserves draft/current tracking until explicit latest-record reload');

    await candidate.click();
    for(const [selector,value] of Object.entries({'#review-note':'Unsaved synthetic draft note retained for close checks.','#reviewer':'Unsaved reviewer','#reference':'Unsaved reference','#review-prerequisites':'Unsaved prerequisites','#review-mitigations':'Unsaved mitigation details','#review-method':'Unsaved validation method details long enough.','#tracking-owner':'Unsaved remediation owner','#tracking-due':'2001-01-01','#tracking-retest':'Unsaved synthetic retest details'})) await page.locator(selector).fill(value);
    await page.locator('#verdict').selectOption('confirmed-runtime');
    await page.locator('#tracking-status').selectOption('in-progress');
    const draft=await formValues();
    for(const action of ['x','close','escape']) {
      page.once('dialog',dialog=>dialog.dismiss());
      if(action==='x') await page.getByRole('button',{name:'Close finding',exact:true}).click();
      else if(action==='close') await page.locator('#finding-dialog').getByRole('button',{name:'Close',exact:true}).click();
      else await page.keyboard.press('Escape');
      assert.equal(await page.locator('#finding-dialog').evaluate(el=>el.open),true);
      assert.deepEqual(await formValues(),draft,`${action} cancellation preserves every draft field`);
    }
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Close finding',exact:true}).click();
    await page.locator('#finding-dialog').waitFor({state:'hidden'});
    await candidate.click();
    assert.equal(await page.locator('#reviewer').inputValue(),'Newer synthetic analyst','accepted discard returns to saved evidence');
    await page.locator('#next-unresolved').click();
    assert.match(await page.locator('#finding-title').innerText(),/dynamic Python/);
    await page.getByRole('button',{name:'Close finding',exact:true}).click();
    await page.getByRole('button',{name:'Record handoff',exact:true}).click();
    await page.locator('#handoff-note').fill('Blue team: verify detection for the bounded shell invocation scenario.');
    await assertProtectedDraft('#handoff-dialog');
    await page.locator('#handoff-form button[type=submit]').click();
    await page.locator('#handoff-dialog').waitFor({state:'hidden'});

    await page.evaluate(async()=>{
      const a=(await CyberLocal.request('/api/assessments')).assessments[0];
      const body={title:'Other tab manual finding',severity:'low'};
      for(const field of ['location','root_cause','input_to_impact','prerequisites','mitigations','evidence','remediation']) body[field]='Synthetic other tab '+field;
      await CyberLocal.request(`/api/assessments/${a.id}/findings`,{method:'POST',body});
    });
    // The current view is deliberately stale: the new manual entry must open its own result.
    await page.getByRole('button',{name:'Add analyst finding',exact:true}).click();
    await page.locator('#manual-title-input').fill('Synthetic manual finding');
    await page.locator('#manual-severity').selectOption('medium');
    for(const field of ['location','root_cause','input_to_impact','prerequisites','mitigations','evidence','remediation']) await page.locator('#manual-'+field).fill('Synthetic owned fixture '+field+' evidence.');
    await assertProtectedDraft('#manual-dialog');
    await page.locator('#manual-form button[type=submit]').click();
    await page.locator('#manual-dialog').waitFor({state:'hidden'});
    await page.locator('#finding-dialog').waitFor({state:'visible'});
    assert.equal(await page.locator('#finding-title').innerText(),'Synthetic manual finding');
    assert.equal(await page.locator('#verdict').inputValue(),'unresolved','manual findings always begin unresolved');
    await page.locator('#verdict').selectOption('rejected');
    await page.locator('#review-note').fill('Synthetic candidate rejected after owned fixture review.');
    await page.getByRole('button',{name:'Record decision ↗',exact:true}).click();
    await page.locator('#finding-dialog').waitFor({state:'hidden'});
    await page.locator('#tab-queue').click();
    assert.equal(await page.locator('#assessment-panel tbody tr').count(),1,'queue contains confirmed findings only');
    await page.getByRole('combobox',{name:'Filter remediation by owner'}).selectOption({label:'Newer application team'});
    await page.getByRole('combobox',{name:'Filter remediation by status'}).selectOption('retest');
    await page.locator('#queue-overdue').check();
    assert.equal(await page.locator('#assessment-panel tbody tr').count(),1,'UTC overdue confirmed item remains visible');
    await page.getByRole('combobox',{name:'Filter remediation by status'}).selectOption('resolved');
    assert.equal(await page.locator('#assessment-panel tbody tr').count(),0);

    await page.locator('#tab-reports').click();
    await page.locator('#create-report').click();
    await page.getByRole('button',{name:'Download v1 JSON',exact:true}).waitFor();
    const frozenDownload=page.waitForEvent('download');
    await page.getByRole('button',{name:'Download v1 JSON',exact:true}).click();
    const frozen=await frozenDownload;
    const fs=require('node:fs/promises');
    const frozenText=await fs.readFile(await frozen.path(),'utf8');
    assert.match(frozenText,/Newer synthetic analyst/);
    await page.getByRole('button',{name:'Print executive report',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#print-report').textContent.includes('Newer synthetic analyst'));
    await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('#print-report').isVisible(),true);
    assert.match(await page.locator('#print-report').innerText(),/Newer synthetic analyst|confirmed-static: 1/);
    assert.match(await page.locator('#print-report').innerText(),/Open remediation(?: items)?: 1\b/,'rejected and unresolved candidates do not inflate remediation total');
    await page.emulateMedia({media:'screen'});
    await page.evaluate(()=>{document.activeElement.blur();window.scrollTo(0,0);});
    await page.waitForFunction(()=>!document.querySelector('#notice').classList.contains('visible'));
    if(process.env.ARTIFACT_DIR) await page.screenshot({path:process.env.ARTIFACT_DIR+'/business-workflows.png',fullPage:true});
    await page.getByRole('button',{name:'← Assessment register',exact:true}).click();
    await page.getByRole('combobox',{name:'Filter by client'}).selectOption('Fictional retailer');
    const downloadPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:/Backup.*JSON/}).click();
    const download=await downloadPromise;
    const backup=await fs.readFile(await download.path(),'utf8');
    assert.equal(JSON.parse(backup).records.length,1);
    await page.getByRole('button',{name:'↑ Restore backup',exact:true}).click();
    await page.locator('#restore-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});
    await page.locator('#restore-submit').waitFor({state:'visible'});
    await page.waitForFunction(()=>!document.querySelector('#restore-submit').disabled);
    await page.locator('#restore-confirm').check();
    await page.locator('#restore-submit').click();
    await page.locator('#restore-dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('tbody tr').count(),2,'restored copy visible beside original');
    await page.evaluate(async()=>{
      await CyberLocal.request('/api/assessments',{method:'POST',body:{name:'Other client fixture',client:'Other client',scope:'Owned synthetic fixture',workflow:'exercise',content:'Generic tabletop',roles:['blue'],authorization:true}});
    });
    await page.locator('#nav-overview').click();
    await page.getByRole('combobox',{name:'Filter by client'}).selectOption('Fictional retailer');
    for(let index=0;index<2;index++) {
      await page.getByRole('button',{name:'Synthetic retailer review',exact:true}).first().click();
      await page.getByRole('button',{name:'Delete assessment',exact:true}).click();
      await page.locator('#confirm-delete').click();
      await page.locator('#delete-dialog').waitFor({state:'hidden'});
      await page.getByRole('combobox',{name:'Filter by client'}).waitFor();
    }
    assert.equal(await page.getByRole('combobox',{name:'Filter by client'}).inputValue(),'','last filtered client deletion resets visible selection');
    assert.equal(await page.locator('tbody tr').count(),1);
    await page.getByRole('button',{name:'Other client fixture',exact:true}).waitFor();
    assert.match(await page.getByRole('button',{name:/Backup.*JSON/}).innerText(),/all clients/,'backup scope agrees with reset selection');
    const alertAndReport=await page.evaluate(()=>{
      const fixture={name:'Synthetic totals',scope:'Owned fixture',workflow:'alerts',roles:['blue'],authorization:true,content:JSON.stringify(Array.from({length:5},()=>({event:'login_failed'})))};
      const anonymous=CyberLocal.analyze(fixture);
      const rejected=CyberLocal.analyze({...fixture,workflow:'code',content:'eval(x)'});
      rejected.findings[0].verdict='rejected';
      return {anonymous,markdown:CyberLocal.markdownExport(rejected),summary:CyberLocal.summarize(rejected)};
    });
    assert.ok(!alertAndReport.anonymous.findings.some(f=>/share actor and source identifiers/.test(f.root_cause)),'missing identity fields never claim shared identity');
    assert.match(alertAndReport.anonymous.coverage.join(' '),/unattribut|missing.*identif/i);
    assert.equal(alertAndReport.summary.open_remediation,0);
    assert.match(alertAndReport.markdown,/Open remediation items: 0/);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile page has no horizontal overflow');
    await page.evaluate(()=>{document.activeElement.blur();window.scrollTo(0,0);});
    await page.waitForFunction(()=>!document.querySelector('#notice').classList.contains('visible'));
    if(process.env.ARTIFACT_DIR) await page.screenshot({path:process.env.ARTIFACT_DIR+'/business-mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS browser UI: create, CAS conflict/reload, draft protection Close/X/Escape, structured review, manual finding, confirmed queue, report snapshot, print totals, backup/restore, client reset, anonymous alerts, mobile overflow, no page errors');
    await context.close();
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
