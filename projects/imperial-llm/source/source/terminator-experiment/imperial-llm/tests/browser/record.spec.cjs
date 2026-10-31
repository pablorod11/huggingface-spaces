const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const record=JSON.parse(fs.readFileSync(path.join(__dirname,'../../space/training.json')));

test('validation curve renders recorded points without inventing training history',async({page},testInfo)=>{
  await page.goto('/#experiment');
  await expect(page.locator('#load-status')).toContainText('Model verified');
  await expect(page.locator('.chart-card h3')).toHaveText('Validation curve');
  await expect(page.locator('.legend')).toHaveText('Validation');
  const points=await page.locator('#loss-chart polyline').evaluateAll(lines=>lines.map(line=>line.getAttribute('points')));
  expect(points).toHaveLength(1);
  expect(points[0]).not.toMatch(/NaN|undefined|Infinity/);
  expect(points[0].split(' ')).toHaveLength(record.selected_run.history.length);
  await expect(page.locator('#train-loss')).toHaveText(record.meta.train_loss.toFixed(3));
  await expect(page.locator('#val-loss')).toHaveText(record.meta.val_loss.toFixed(3));
  await expect(page.locator('#curve-note')).toContainText('Training loss was measured only at the selected checkpoint');
  const bounds=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
  expect(bounds.width).toBeLessThanOrEqual(bounds.viewport);
  await page.screenshot({path:testInfo.outputPath('training-record.png'),fullPage:true});
});
