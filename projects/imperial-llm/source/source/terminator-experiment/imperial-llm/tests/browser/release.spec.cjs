const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const model=JSON.parse(fs.readFileSync(path.join(__dirname,'../../space/model.json')));
const record=JSON.parse(fs.readFileSync(path.join(__dirname,'../../space/training.json')));
async function ready(page){await page.goto('/');await expect(page.locator('#load-status')).toContainText('Model verified');await expect(page.locator('#run')).toBeEnabled();}
async function settings(page){await page.locator('.generation-settings').evaluate(el=>el.open=true);}
async function complete(page){await page.locator('#run').click();await expect(page.locator('#run-status')).toHaveText('Complete');return page.locator('#output').textContent();}

test('verified model loads once without browser errors',async({page},testInfo)=>{
  const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/model.json'))requests.push(request.url());});
  const start=Date.now();await ready(page);await expect(page.locator('#param-count')).not.toHaveText('—');
  expect(requests).toHaveLength(1);expect(errors).toEqual([]);
  await testInfo.attach('load-timing',{body:JSON.stringify({milliseconds:Date.now()-start,project:testInfo.project.name}),contentType:'application/json'});
});

test('same prompt and seed reproduce browser generation',async({page},testInfo)=>{
  await ready(page);await settings(page);await page.locator('#length').selectOption('64');
  const start=Date.now(),first=await complete(page),duration=Date.now()-start;
  expect([...first].length).toBe([...modelPrompt()].length+64);expect(await complete(page)).toBe(first);
  await testInfo.attach('generation-timing',{body:JSON.stringify({characters:64,milliseconds:duration,project:testInfo.project.name}),contentType:'application/json'});
  await page.screenshot({path:testInfo.outputPath('generated.png'),fullPage:!process.env.SPACE_URL});
});
function modelPrompt(){return 'The little';}

test('stop preserves partial text and a fresh run completes',async({page})=>{
  await ready(page);await settings(page);await page.locator('#length').selectOption('256');await page.locator('#run').click();
  await expect(page.locator('#stop')).toBeVisible();await expect(page.locator('#performance')).toContainText(/\d+ characters/);
  await page.locator('#stop').click();await expect(page.locator('#run-status')).toContainText('Stopped');await expect(page.locator('#run')).toBeFocused();
  const partial=await page.locator('#output').textContent();expect(partial.startsWith(modelPrompt())).toBeTruthy();expect([...partial].length).toBeLessThan([...modelPrompt()].length+256);
  await page.locator('#length').selectOption('64');await complete(page);await expect(page.locator('#performance')).toContainText('64 characters');
});

test('input errors focus the field and reveal collapsed settings',async({page})=>{
  await ready(page);await page.locator('#prompt').fill('');await page.locator('#run').click();await expect(page.locator('#prompt')).toBeFocused();await expect(page.locator('#input-error')).toContainText('Enter a starting prompt');
  await page.locator('#prompt').fill('🤖');await page.locator('#run').click();await expect(page.locator('#prompt')).toBeFocused();await expect(page.locator('#input-error')).toContainText('Unsupported character');
  await page.getByRole('button',{name:'The little',exact:true}).click();await settings(page);await page.locator('#seed').fill('');await page.locator('.generation-settings').evaluate(el=>el.open=false);
  await page.locator('#run').click();await expect(page.locator('#seed')).toBeFocused();await expect(page.locator('#seed')).toBeVisible();await expect(page.locator('#input-error')).toContainText('integer seed');
});

for(const failure of ['missing','corrupt'])test(`${failure} model cannot enable generation`,async({page})=>{
  await page.route('**/model.json',route=>failure==='missing'?route.fulfill({status:404,body:'Missing test model'}):route.fulfill({contentType:'application/json',body:JSON.stringify({...model,schema_version:999})}));
  await page.goto('/');await expect(page.locator('#load-status')).toContainText(failure==='missing'?'model.json: 404':'checksum');await expect(page.locator('#run')).toBeDisabled();
});

test('worker load failure gives recovery and retry works',async({page})=>{
  await page.route('**/generation-worker.js',route=>route.abort());await ready(page);await page.locator('#run').click();
  await expect(page.locator('#run-status')).toContainText('Reload the page');await expect(page.locator('#run')).toBeEnabled();
  await page.unroute('**/generation-worker.js');await page.reload();await expect(page.locator('#run')).toBeEnabled();await settings(page);await page.locator('#length').selectOption('64');await complete(page);
});

test('keyboard navigation, deep links and responsive layout',async({page,browserName},testInfo)=>{
  // macOS Safari uses Option-Tab for links by default (Apple cpsh003).
  await ready(page);await page.keyboard.press(browserName==='webkit'&&process.platform==='darwin'?'Alt+Tab':'Tab');await expect(page.getByRole('link',{name:'Skip to model laboratory'})).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#main-content')).toBeFocused();
  await page.getByRole('link',{name:'Training record',exact:true}).click();await page.reload();await expect(page.locator('#experiment')).toBeVisible();await expect(page.locator('#generate')).toBeHidden();
  if(record.evaluation.candidate_test_loss!==undefined){await expect(page.locator('#test-loss')).toHaveText(record.evaluation.candidate_test_loss.toFixed(3));await expect(page.locator('#baseline-test-loss')).toHaveText(record.evaluation.baseline_test_loss.toFixed(3));}
  await page.getByRole('link',{name:'Generate',exact:true}).click();
  const bounds=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,button:document.querySelector('#run').getBoundingClientRect().height}));
  expect(bounds.width).toBeLessThanOrEqual(bounds.viewport);expect(bounds.button).toBeGreaterThanOrEqual(44);
  await page.screenshot({path:testInfo.outputPath('layout.png'),fullPage:true});
});

test('visual baseline of the ready laboratory',async({page})=>{
  test.skip(process.env.VISUAL!=='1','Opt-in: screenshot baselines must be reviewed on the same OS/browser as the runner.');
  await ready(page);await expect(page).toHaveScreenshot('laboratory.png',{fullPage:true,animations:'disabled'});
});
