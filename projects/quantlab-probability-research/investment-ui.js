/* Investment view is independent of the next-close forecast and its uploaded data. */
(() => {
'use strict';
const $ = id => document.getElementById(id), Q = globalThis.QuantInvestment;
const money = n => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:Math.abs(n)<1?4:2}).format(n);
const pct = n => new Intl.NumberFormat('en-US',{style:'percent',maximumFractionDigits:2}).format(n);
const probability = n => n>0&&n<.0001?'<0.01%':n<1&&n>.9999?'>99.99%':pct(n);
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog = [], selected = null, result = null, charts = [], revision = 0, csvSeries = null, explicitCustom = false, cleared = false;
const form = $('inv-form');
function invalidate(message) {
 result = null; charts = [];
 $('inv-results').hidden = true;
 $('inv-stats').replaceChildren(); $('inv-main-chart').replaceChildren(); $('inv-drawdown-chart').replaceChildren(); $('inv-table-body').replaceChildren();
 $('inv-readout').textContent = ''; $('inv-export').disabled = true;
 $('inv-status').textContent = message; $('inv-status').classList.remove('lab-error');
}
function fail(error) { invalidate(error.message); $('inv-status').classList.add('lab-error'); }
function finiteInput(id, name) {
 const input = $(id);
 if (!input.value.trim() || !input.validity.valid || !Number.isFinite(Number(input.value))) throw Error(`Enter a valid ${name}.`);
 return Number(input.value);
}
function sourceNote() {
 if (!selected) return;
 const dates = selected.dates;
 $('inv-source').textContent = `${selected.ticker} · ${selected.name} · USD · ${dates.length.toLocaleString()} prices · ${dates[0]} to ${dates.at(-1)}. ${selected.adjustment || 'Adjustment not independently verified.'} ${selected.retrievedAt ? 'Snapshot retrieved '+selected.retrievedAt+'.' : 'Your file stays in this tab.'}`;
 $('inv-source-link').hidden = !selected.sourceUrl;
 if (selected.sourceUrl) $('inv-source-link').href = selected.sourceUrl;
}
function modeControls() {
 const future = $('inv-mode').value === 'future';
 $('inv-past-controls').hidden = future; $('inv-past-controls').disabled = future;
 $('inv-future-controls').hidden = !future; $('inv-future-controls').disabled = !future;
 $('inv-start').required = !future; $('inv-end').required = !future;
 $('inv-overrides').hidden = !$('inv-override').checked;
 $('inv-return').disabled = !$('inv-override').checked || !future;
 $('inv-vol').disabled = !$('inv-override').checked || !future;
 $('inv-duration').textContent = `${$('inv-months').value} months · ${(Number($('inv-months').value)/12).toFixed(2)} years`;
}
function setDates() {
 const first = selected.dates[0], last = selected.dates.at(-1);
 for (const id of ['inv-start','inv-end']) { $(id).min = first; $(id).max = last; }
 $('inv-end').value = last;
 const start = new Date(last+'T00:00:00Z'); start.setUTCFullYear(start.getUTCFullYear()-1);
 $('inv-start').value = start.toISOString().slice(0,10) < first ? first : start.toISOString().slice(0,10);
}
function selectTicker() {
 cleared=false; revision++;
 invalidate('Choose prices to calculate an investment.');
 const custom = $('inv-ticker').value === '__csv__'; $('inv-csv-controls').hidden = !custom;
 selected = custom ? csvSeries : catalog.find(s=>s.ticker===$('inv-ticker').value) || null;
 $('inv-source').textContent = ''; $('inv-source-link').hidden = true;
 if (selected) { setDates(); sourceNote(); calculate(); }
 else if (custom) $('inv-status').textContent = 'Choose an adjusted-price CSV and enter its ticker label. No file is uploaded.';
}
function filterTickers({preserve=false}={}) {
 const search = $('inv-search').value.trim().toUpperCase(), previous = $('inv-ticker').value;
 $('inv-ticker').replaceChildren();
 for (const s of catalog.filter(s=>(s.ticker+' '+s.name).toUpperCase().includes(search))) {
  const option = document.createElement('option'); option.value=s.ticker; option.textContent=`${s.ticker} · ${s.name}`; $('inv-ticker').append(option);
 }
 const custom = document.createElement('option');custom.value='__csv__';custom.textContent='Other ticker · use my CSV';$('inv-ticker').append(custom);
 if ([...$('inv-ticker').options].some(o=>o.value===previous) && (previous!=='__csv__'||explicitCustom)) $('inv-ticker').value=previous;
 if(!preserve) selectTicker();
}
function stat(label, value) { const div=document.createElement('div'),small=document.createElement('span'),strong=document.createElement('strong');small.textContent=label;strong.textContent=value;div.append(small,strong);$('inv-stats').append(div); }
function calculate() {
 invalidate('Updating investment…'); modeControls();
 if (!selected) { $('inv-status').textContent='Choose a ticker or import your adjusted-price CSV.'; return; }
 try {
  const amount=finiteInput('inv-amount','investment amount between $0.01 and $1 billion');
  if ($('inv-mode').value==='past') {
   result=Q.historical(selected,{amount,start:$('inv-start').value,end:$('inv-end').value});
   result.mode='past';
   stat('Investment value',money(result.finalValue));stat('Total ROI',pct(result.roi));stat('Gain / loss',money(result.gain));stat('Annualized return',pct(result.annualizedReturn));stat('Maximum drawdown',pct(result.maxDrawdown));
   $('inv-result-title').textContent='What your investment would have become.';
   $('inv-result-note').textContent=`${selected.ticker} · ${money(amount)} invested · effective dates ${result.start} → ${result.end}. Fractional shares; buy and hold. Based on the adjustment stated above; no fees, taxes or inflation.`;
   $('inv-assumptions').textContent='Historical performance describes this selected period. It does not predict a future return. Drawdown measures the largest peak-to-trough fall within this period.';
   $('inv-chart-title').textContent='Your investment over time';
   $('inv-chart-caption').textContent='Investment value from the selected adjusted-price series. Use the chart or point slider to inspect a date.';
  } else {
   let annualReturn,volatility, estimate=null;
   if ($('inv-override').checked) { annualReturn=finiteInput('inv-return','annual return')/100;volatility=finiteInput('inv-vol','annual volatility')/100; }
   else { estimate=Q.estimate(selected,{windowYears:Number($('inv-window').value)});annualReturn=estimate.annualReturn;volatility=estimate.volatility; }
   const years=finiteInput('inv-months','horizon')/12;
   result=Q.project({amount,years,annualReturn,volatility});result.mode='future';result.estimate=estimate;result.annualReturn=annualReturn;result.volatility=volatility;
   stat('Mean projected value',money(result.mean));stat('Mean projected ROI',pct(result.roi));stat('Median projected value',money(result.median));stat('10th–90th outcomes',money(result.p10)+' – '+money(result.p90));stat('Modeled chance of loss',probability(result.lossProbability));
   $('inv-result-title').textContent='A range of possible futures.';
   $('inv-result-note').textContent=`${selected.ticker} · ${money(amount)} invested for ${$('inv-months').value} months from the latest snapshot (${selected.dates.at(-1)}). Conditional scenario; no fees, taxes or inflation. Future dividends, if any, are assumed to follow the same return process.`;
   $('inv-assumptions').textContent=`Annual mean return ${pct(annualReturn)} · annual volatility ${pct(volatility)}. ${estimate ? `Estimated from ${estimate.observations} daily returns, ${estimate.start} to ${estimate.end}; 252 observations per year.` : 'Uses the annual return and volatility you entered.'} Lognormal model with constant independent returns. The shaded 10th–90th percentile band describes modeled outcomes, not confidence in the estimated return. Parameter uncertainty, market changes and extreme events are not captured. This is separate from the next-close forecast.`;
   $('inv-chart-title').textContent='How your investment could grow';
   $('inv-chart-caption').textContent='Mean is the average across modeled outcomes; median divides outcomes in half. Large upside outcomes can pull the mean above the median.';
  }
  $('inv-status').textContent=result.mode==='past'?'Historical calculation ready.':'Scenario ready. This is an assumption-based estimate, not a promised return.';
  $('inv-results').hidden=false;$('inv-export').disabled=false;$('inv-layers').hidden=result.mode==='past';$('inv-drawdown-panel').hidden=result.mode!=='past';
  drawCharts(); renderTable();
 } catch(error) { fail(error); }
}
function path(points, key, x, y) {return points.map((p,i)=>(i?'L':'M')+x(i).toFixed(2)+','+y(p[key]).toFixed(2)).join(' ');}
function makeChart(id,points,layers,{drawdown=false,band=false}={}) {
 const mobile=matchMedia('(max-width:650px)').matches;
 const W=mobile?440:900,H=mobile?300:330,L=mobile?76:88,R=mobile?16:24,T=24,B=48, innerW=W-L-R, innerH=H-T-B;
 let values=layers.flatMap(layer=>points.map(p=>p[layer.key]));
 if(band) values=values.concat(points.flatMap(p=>[p.p10,p.p90]));
 let min=drawdown?Math.min(...values):Math.min(...values,result.amount),max=drawdown?0:Math.max(...values,result.amount);
 if(max===min){max+=Math.max(1,Math.abs(max)*.05);min-=Math.max(1,Math.abs(min)*.05);}
 const padding=(max-min)*.07; if(!drawdown){min=Math.max(0,min-padding);max+=padding;}
 const times=points.map(p=>result.mode==='past'?Date.parse(p.date+'T00:00:00Z'):p.years),firstTime=times[0],span=times.at(-1)-firstTime;
 const x=i=>L+(times[i]-firstTime)/span*innerW,y=v=>T+(max-v)/(max-min)*innerH;
 let content='';
 for(let i=0;i<=4;i++) {const v=min+(max-min)*i/4,py=y(v);let label=drawdown?pct(v):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:Math.abs(v)>=1e6?'compact':'standard',maximumFractionDigits:0}).format(v);content+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${py}" y2="${py}"/><text x="${L-12}" y="${py+4}" text-anchor="end">${esc(label)}</text>`;}
 if(band) {const area=path(points,'p90',x,y)+points.slice().reverse().map((p,j)=>`L${x(points.length-1-j).toFixed(2)},${y(p.p10).toFixed(2)}`).join(' ')+'Z';content+=`<path d="${area}" class="inv-band"/>`;}
 if(!drawdown) content+=`<line class="inv-principal" x1="${L}" x2="${W-R}" y1="${y(result.amount)}" y2="${y(result.amount)}"/>`;
 for(const layer of layers) content+=`<path d="${path(points,layer.key,x,y)}" class="inv-series ${layer.css}"/>`;
 const label=i=>result.mode==='past'?points[i].date:`${(points[i].years*12).toFixed(0)} mo`;
 content+=`<text x="${L}" y="${H-14}">${esc(label(0))}</text><text x="${W-R}" y="${H-14}" text-anchor="end">${esc(label(points.length-1))}</text><line class="inv-cursor" x1="${x(points.length-1)}" x2="${x(points.length-1)}" y1="${T}" y2="${H-B}"/>`;
 $(id).innerHTML=`<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${content}</svg>`;
 const svg=$(id).querySelector('svg');
 const updatePointer=event=>{const box=svg.getBoundingClientRect(),vx=(event.clientX-box.left)/box.width*W;const time=firstTime+Math.max(0,Math.min(1,(vx-L)/innerW))*span;let nearest=0;for(let i=1;i<times.length;i++)if(Math.abs(times[i]-time)<Math.abs(times[nearest]-time))nearest=i;setPoint(nearest);};
 svg.addEventListener('pointermove',event=>{if(event.pointerType==='mouse'||event.buttons)updatePointer(event);});
 svg.addEventListener('pointerdown',event=>{svg.setPointerCapture(event.pointerId);updatePointer(event);});
 charts.push({svg,x,points});
}
function drawCharts() {
 if(!result)return;
 charts=[];
 if(result.mode==='past') {makeChart('inv-main-chart',result.points,[{key:'value',css:'inv-mean'}]);makeChart('inv-drawdown-chart',result.points,[{key:'drawdown',css:'inv-drawdown'}],{drawdown:true});}
 else {
  const layers=[];
  if($('inv-show-mean').checked) layers.push({key:'mean',css:'inv-mean'});
  if($('inv-show-median').checked) layers.push({key:'median',css:'inv-median'});
  if(!layers.length&&!$('inv-show-band').checked){$('inv-show-mean').checked=true;layers.push({key:'mean',css:'inv-mean'});}
  makeChart('inv-main-chart',result.points,layers,{band:$('inv-show-band').checked});
 }
 $('inv-point').max=String(result.points.length-1);setPoint(result.points.length-1);
}
function setPoint(index) {
 if(!result)return;
 index=Math.max(0,Math.min(result.points.length-1,index));const p=result.points[index];$('inv-point').value=String(index);
 for(const chart of charts){const line=chart.svg.querySelector('.inv-cursor');line.setAttribute('x1',chart.x(index));line.setAttribute('x2',chart.x(index));}
 const text=result.mode==='past'?`${p.date} · value ${money(p.value)} · drawdown ${pct(p.drawdown)}`:`Month ${Math.round(p.years*12)} · mean ${money(p.mean)} · median ${money(p.median)} · 10th–90th ${money(p.p10)} – ${money(p.p90)}`;
 $('inv-readout').textContent=text;$('inv-point').setAttribute('aria-valuetext',text);
}
function renderTable() {
 const future=result.mode==='future';
 $('inv-table-head').innerHTML=future?'<tr><th scope="col">Month</th><th scope="col">Mean value</th><th scope="col">Median value</th><th scope="col">10th percentile</th><th scope="col">90th percentile</th></tr>':'<tr><th scope="col">Date</th><th scope="col">Value</th><th scope="col">Drawdown</th></tr>';
 const fragment=document.createDocumentFragment();
 for(const p of result.points){const row=document.createElement('tr');const values=future?[Math.round(p.years*12),money(p.mean),money(p.median),money(p.p10),money(p.p90)]:[p.date,money(p.value),pct(p.drawdown)];for(const value of values){const td=document.createElement('td');td.textContent=value;row.append(td);}fragment.append(row);}
 $('inv-table-body').append(fragment);
}
form.addEventListener('submit',event=>{event.preventDefault();calculate();});
form.addEventListener('input',event=>{
 const id=event.target.id;
 if(['inv-search','inv-ticker','inv-csv'].includes(id))return;
 if(id==='inv-csv-ticker'){if(csvSeries){csvSeries.ticker=event.target.value.trim().toUpperCase()||'MY CSV';sourceNote();calculate();}return;}
 calculate();
});
$('inv-mode').addEventListener('change',calculate);
$('inv-ticker').addEventListener('change',()=>{explicitCustom=$('inv-ticker').value==='__csv__';selectTicker();});
$('inv-search').addEventListener('input',()=>{explicitCustom=false;filterTickers();});
$('inv-csv').addEventListener('change',async()=>{
 const token=++revision;csvSeries=null;selected=null;invalidate('Reading your price file locally…');$('inv-source').textContent='';$('inv-source-link').hidden=true;
 try {const file=$('inv-csv').files[0];if(!file)throw Error('Choose an adjusted-price CSV.');if(file.size>2*1024*1024)throw Error('CSV must be no larger than 2 MiB.');const buffer=await file.arrayBuffer();if(token!==revision)return;const text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);const parsed=Q.parseCSV(text);csvSeries={...parsed,ticker:$('inv-csv-ticker').value.trim().toUpperCase()||'MY CSV',name:'Your local prices',currency:'USD',adjustment:'User-supplied adjustment and USD currency are not independently verified.'};selected=csvSeries;setDates();sourceNote();calculate();}catch(error){if(token===revision)fail(error);}
});
$('inv-point').addEventListener('input',()=>setPoint(Number($('inv-point').value)));
for(const id of ['inv-show-mean','inv-show-median','inv-show-band'])$(id).addEventListener('change',drawCharts);
for(const button of document.querySelectorAll('[data-investment-range]'))button.addEventListener('click',()=>{
 if(!selected)return;const years=Number(button.dataset.investmentRange),last=selected.dates.at(-1),date=new Date(last+'T00:00:00Z');date.setUTCFullYear(date.getUTCFullYear()-years);$('inv-start').value=years===0?selected.dates[0]:[selected.dates[0],date.toISOString().slice(0,10)].sort().at(-1);$('inv-end').value=last;calculate();
});
$('inv-reset').addEventListener('click',()=>{revision++;csvSeries=null;explicitCustom=false;form.reset();$('inv-search').value='';filterTickers();});
$('inv-export').addEventListener('click',()=>{
 if(!result)return;
 const report={schemaVersion:1,ticker:selected.ticker,name:selected.name,currency:'USD',source:{url:selected.sourceUrl||null,adjustment:selected.adjustment,firstDate:selected.dates[0],lastDate:selected.dates.at(-1),retrievedAt:selected.retrievedAt||null},assumptions:$('inv-assumptions').textContent,result};
 const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='quantlab-investment.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('clear-data').addEventListener('click',()=>{revision++;cleared=true;csvSeries=null;selected=null;$('inv-csv').value='';$('inv-source').textContent='';$('inv-source-link').hidden=true;invalidate('Investment results and local file cleared. Select a ticker to start again.');});
async function loadCatalog() {
 try {
  const response=await fetch('market-data.json',{cache:'no-cache'});if(!response.ok)throw Error('Historical snapshots are unavailable. Use your adjusted-price CSV.');
  const data=await response.json();
  if(data.schemaVersion!==1||!Array.isArray(data.securities)||!data.securities.length)throw Error('The historical snapshot format is invalid. Use your adjusted-price CSV.');
  catalog=data.securities.map(s=>{Q.validateSeries(s);if(!/^[A-Z0-9.^-]{1,15}$/.test(s.ticker)||s.currency!=='USD')throw Error('Unsupported snapshot ticker or currency.');if(s.sourceUrl&&!/^https:\/\//.test(s.sourceUrl))throw Error('Invalid data source link.');return s;});
  filterTickers({preserve:explicitCustom||cleared});
 } catch(error){catalog=[];filterTickers({preserve:explicitCustom||cleared});if(!selected&&!cleared)$('inv-status').textContent=error.message;}
}
matchMedia('(max-width:650px)').addEventListener('change',drawCharts);
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.view==='investment')history.replaceState(null,'','#investment');else if(location.hash==='#investment')history.replaceState(null,'',location.pathname+location.search);}));
modeControls();loadCatalog();
if(location.hash==='#investment')document.querySelector('[data-view="investment"]').click();
})();
