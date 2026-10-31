/* Inspectable mathematical demonstrations; no market-performance claim. */
(function(root) {
 'use strict';
 const finite=(x)=>typeof x==='number' && Number.isFinite(x);
 const requireThat=(condition,message)=>{if(!condition) throw new Error(message);};
 function game(name) {
  if(['prisoner','prisoners_dilemma',"prisoner's dilemma",'prisoner dilemma'].includes(name)) {
   return {name:"Prisoner's dilemma",rowPayoffs:[[3,0],[5,1]],columnPayoffs:[[3,5],[0,1]],
    actions:['Cooperate','Defect'],pureNash:[[1,1]],strictDominantRows:[1],strictDominantColumns:[1],
    paretoPure:[[0,0],[0,1],[1,0]],note:'Pure-outcome Pareto comparison only. Defect is strictly dominant; mutual defection is inefficient.'};
  }
  if(['matching','matching_pennies','matching pennies'].includes(name)) {
   return {name:'Matching pennies',rowPayoffs:[[1,-1],[-1,1]],columnPayoffs:[[-1,1],[1,-1]],pureNash:[],
    mixed:{rowProbability:.5,columnProbability:.5,value:0}};
  }
  throw new Error('Choose prisoner or matching.');
 }
 // Abramowitz–Stegun normal CDF approximation, absolute error about 8e-8.
 function normalCDF(x) {
  const t=1/(1+.2316419*Math.abs(x));
  const tail=Math.exp(-x*x/2)/Math.sqrt(2*Math.PI)*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return x>=0?1-tail:tail;
 }
 function blackScholes(spot,strike,years,rate,vol) {
  requireThat([spot,strike,years,rate,vol].every(finite)&&Math.min(spot,strike,years,vol)>0,
   'Finite inputs and positive spot, strike, years, volatility required.');
  const d1=(Math.log(spot/strike)+(rate+vol*vol/2)*years)/(vol*Math.sqrt(years));
  const d2=d1-vol*Math.sqrt(years),discount=strike*Math.exp(-rate*years);
  const call=spot*normalCDF(d1)-discount*normalCDF(d2),put=call-spot+discount;
  requireThat(finite(call)&&finite(put),'Inputs overflow numerical pricing range.');
  return {call,put};
 }
 function kelly(p,odds,fraction=.25,cap=.25) {
  requireThat([p,odds,fraction,cap].every(finite)&&p>=0&&p<=1&&odds>0&&fraction>=0&&fraction<=1&&cap>=0&&cap<=1,
   'Probability, fractional multiplier and cap must lie in [0,1]; net odds must be positive.');
  return Math.min(cap,Math.max(0,fraction*(p-(1-p)/odds)));
 }
 function diagnostics(closes) {
  requireThat(Array.isArray(closes)&&closes.length>=4&&closes.every(x=>finite(x)&&x>0),
   'Require at least four finite positive closes.');
  const r=closes.slice(1).map((x,i)=>Math.log(x)-Math.log(closes[i]));
  const n=r.length,mean=r.reduce((s,x)=>s+x,0)/n;
  const moments=[2,3,4].map(k=>r.reduce((s,x)=>s+(x-mean)**k,0)/n);
  const std=Math.sqrt(moments[0]*n/(n-1));
  const result={mean,std,skew:moments[0]>0?moments[1]/moments[0]**1.5:null,
   excessKurtosis:moments[0]>0?moments[2]/moments[0]**2-3:null,n,
   normality_note:'Descriptive population-moment skew and excess kurtosis; normality is not independence. No normality-test p-value or forecasting validity is claimed.'};
  return result;
 }
 function csvRows(text) {
  // State machine handles escaped quotes, quoted commas/newlines, CRLF and BOM.
  // Empty records are refused; one terminal line ending is allowed.
  text=text.replace(/^\uFEFF/,'');
  let rows=[],row=[],field='',quoted=false,afterQuote=false,start=true;
  for(let i=0;i<text.length;i++) {
   const c=text[i];
   requireThat(field.length<=16384,'CSV fields must not exceed 16384 characters.');
   if(quoted) {
    if(c==='"') {if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;afterQuote=true;}}
    else field+=c;
    continue;
   }
   if(c==='"') {requireThat(start&&!afterQuote,'Malformed CSV quote.');quoted=true;start=false;continue;}
   if(c===','||c==='\n'||c==='\r') {
    requireThat(row.length<64,'CSV supports at most 64 columns.');
    row.push(field);field='';start=true;afterQuote=false;
    if(c!==',') {requireThat(rows.length<2501,'Require 714–2500 price rows.');rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}
    continue;
   }
   requireThat(!afterQuote,'Unexpected character after closing CSV quote.');
   field+=c;start=false;
  }
  requireThat(!quoted,'Unterminated quoted CSV field.');
  requireThat(field.length<=16384,'CSV fields must not exceed 16384 characters.');
  if(field!==''||row.length||afterQuote) {requireThat(row.length<64,'CSV supports at most 64 columns.');requireThat(rows.length<2501,'Require 714–2500 price rows.');row.push(field);rows.push(row);}
  return rows;
 }
 function parseCSV(text) {
  requireThat(typeof text==='string','CSV text required.');
  requireThat(new TextEncoder().encode(text).byteLength<=2*1024*1024,'CSV exceeds 2 MiB.');
  const rows=csvRows(text);
  requireThat(rows.length>=715&&rows.length<=2501,'Require 714–2500 price rows.');
  const header=rows[0].map(value=>value.trim().toLowerCase());
  const quality={rows:rows.length-1,bomRemoved:text.startsWith('\uFEFF'),normalizedHeaderFields:header.filter((value,i)=>value!==rows[0][i]).length,trimmedValues:0,rowsDropped:0,imputedValues:0,largeMoveCount:0,unchangedCloseCount:0,largeMoveThresholdSimpleReturn:0.2,warnings:[]};
  requireThat(new Set(header).size===header.length,'Duplicate column names are refused.');
  const di=header.indexOf('date'),ci=header.indexOf('close');
  requireThat(di>=0&&ci>=0,'CSV requires date and close columns.');
  const dates=[],closes=[];let previous=null,maxGap=0;
  for(let index=1;index<rows.length;index++) {
   const row=rows[index],check=(condition,message)=>requireThat(condition,`CSV row ${index+1}: ${message}`);
   check(row.length===header.length,'Every row must have the same number of fields as the header.');
   const date=row[di].trim(),price=row[ci].trim();
   quality.trimmedValues+=(date!==row[di]?1:0)+(price!==row[ci]?1:0);
   check(/^\d{4}-\d{2}-\d{2}$/.test(date),'Dates must use YYYY-MM-DD.');
   const stamp=Date.parse(date+'T00:00:00.000Z');
   check(Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===date,'Invalid calendar date.');
   check(previous===null||stamp>previous,'Dates must be unique and strictly ascending.');
   check(/^[+]?((\d+(\.\d*)?)|(\.\d+))([eE][+-]?\d+)?$/.test(price),'Closes must be numeric, finite and positive; missing values are refused.');
   const close=Number(price);
   check(finite(close)&&close>0,'Closes must be finite and positive.');
   if(previous!==null) {
    maxGap=Math.max(maxGap,(stamp-previous)/86400000);
    const simpleRatio=close/closes.at(-1);
    if(simpleRatio>=1.2||simpleRatio<=.8)quality.largeMoveCount++;
    if(close===closes.at(-1))quality.unchangedCloseCount++;
   }
   previous=stamp;dates.push(date);closes.push(close);
  }
  if(maxGap>4)quality.warnings.push('Calendar gaps exceed four days. Check missing observations and the 252-observation annualization assumption.');
  if(quality.largeMoveCount)quality.warnings.push('Price moves of at least 20% were retained. Check corporate actions and adjusted-price consistency.');
  if(quality.unchangedCloseCount)quality.warnings.push('Repeated closing prices were retained. Check stale prices or illiquidity if unexpected.');
  quality.calendarGapMaxDays=maxGap;
  quality.note='No rows sorted, deduplicated, dropped, interpolated or winsorized. Adjusted-price status cannot be verified from date/close alone.';
  return {dates,closes,calendarGapMaxDays:maxGap,quality};
 }
 const api={game,blackScholes,kelly,diagnostics,parseCSV};
 if(typeof module!=='undefined'&&module.exports) module.exports=api;
 if(root) root.QuantLabs=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
