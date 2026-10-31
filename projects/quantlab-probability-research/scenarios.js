/* Conceptual references: Black & Scholes (1973), European option bounds;
 * Merton (1976), compound-Poisson lognormal jump diffusion. Independent
 * implementation of finite Poisson mixtures; no calibration or copied code.
 */
(function(root,factory){
 const api=factory(typeof module!=='undefined'&&module.exports?require('./labs.js'):root.QuantLabs);
 if(typeof module!=='undefined'&&module.exports) module.exports=api;
 if(root) root.QuantScenarios=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(labs){
 'use strict';
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const check=(condition,message)=>{if(!condition) throw new Error(message);};
 function impliedVolatility({spot,strike,years,rate,premium,type='call'}={}) {
  check([spot,strike,years,rate,premium].every(finite)&&Math.min(spot,strike,years)>0,'Finite inputs and positive spot, strike, years required.');
  check(type==='call'||type==='put','Option type must be call or put.');
  check(labs&&typeof labs.blackScholes==='function','Load QuantLabs before QuantScenarios.');
  const discount=strike*Math.exp(-rate*years);
  check(finite(discount)&&discount>0,'Discounted strike exceeds numerical range.');
  const lower=type==='call'?Math.max(spot-discount,0):Math.max(discount-spot,0);
  const upper=type==='call'?spot:discount,bounds={lower,upper};
  check(premium>=lower&&premium<upper,'Premium violates European no-dividend bounds or has no finite-volatility solution.');
  if(premium===lower) return {volatility:0,converged:true,iterations:0,repriced:lower,error:0,bounds};
  const tolerance=1e-8*Math.max(1,spot);
  const price=vol=>labs.blackScholes(spot,strike,years,rate,vol)[type];
  let lo=0,hi=.5,highPrice=price(hi);
  while(highPrice<premium&&hi<10){hi=Math.min(10,hi*2);highPrice=price(hi);}
  check(highPrice>=premium,'Required volatility exceeds supported bracket [0, 10].');
  let volatility=hi,repriced=highPrice,iterations=0;
  for(iterations=1;iterations<=200;iterations++){
   volatility=(lo+hi)/2;repriced=price(volatility);
   if(Math.abs(repriced-premium)<=tolerance) break;
   if(repriced<premium)lo=volatility;else hi=volatility;
  }
  return {volatility,converged:Math.abs(repriced-premium)<=tolerance,iterations:Math.min(iterations,200),repriced,error:repriced-premium,bounds};
 }
 const normPDF=z=>Math.exp(-z*z/2)/Math.sqrt(2*Math.PI);
 function normCDF(z){
  if(z===0)return .5;
  const t=1/(1+.2316419*Math.abs(z));
  const tail=normPDF(z)*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return Math.max(0,Math.min(1,z>0?1-tail:tail));
 }
 function jumpDistribution({mu=.06,sigma=.2,intensity=1,jumpMean=-.05,jumpStd=.1,years=1/252,threshold=-.02}={}) {
  check([mu,sigma,intensity,jumpMean,jumpStd,years,threshold].every(finite),'All scenario parameters must be finite numbers.');
  check(mu>=-1&&mu<=1&&sigma>=.01&&sigma<=2&&intensity>=0&&intensity<=50&&jumpMean>=-1&&jumpMean<=1&&jumpStd>=0&&jumpStd<=1&&years>=1/252&&years<=2&&intensity*years<=50,'Scenario parameters exceed supported bounds; intensity × years must be ≤ 50.');
  const poissonMean=intensity*years,kappa=Math.expm1(jumpMean+jumpStd*jumpStd/2);
  const drift=(mu-.5*sigma*sigma-intensity*kappa)*years;
  const mean=drift+poissonMean*jumpMean;
  const variance=sigma*sigma*years+poissonMean*(jumpStd*jumpStd+jumpMean*jumpMean),sd=Math.sqrt(variance);
  const components=[];let weight=Math.exp(-poissonMean),retainedMass=0,n=0;
  while(true){
   components.push({weight,mean:drift+n*jumpMean,sd:Math.sqrt(sigma*sigma*years+n*jumpStd*jumpStd)});
   retainedMass+=weight;
   if(Math.max(0,1-retainedMass)<1e-12)break;
   n++;weight*=poissonMean/n;
   check(n<1000,'Poisson truncation failed to converge.');
  }
  const omittedPoissonMass=Math.max(0,1-retainedMass);
  const cdf=x=>components.reduce((sum,c)=>sum+c.weight*normCDF((x-c.mean)/c.sd),0);
  const pdf=x=>components.reduce((sum,c)=>sum+c.weight*normPDF((x-c.mean)/c.sd)/c.sd,0);
  // Search within component six-sigma bounds, then use mixture quantiles to
  // avoid a plot dominated by extraordinarily improbable far-tail components.
  const lower=Math.min(...components.map(c=>c.mean-8*c.sd));
  const upper=Math.max(...components.map(c=>c.mean+8*c.sd));
  function quantile(probability){
   let left=lower,right=upper;
   for(let i=0;i<100;i++){const mid=(left+right)/2;if(cdf(mid)<probability)left=mid;else right=mid;}
   return (left+right)/2;
  }
  const left=quantile(1e-7),right=quantile(retainedMass-1e-7);
  const points=new Set(Array.from({length:401},(_,i)=>left+(right-left)*i/400));
  const resolvedComponents=components.filter(c=>c.weight>1e-12);
  // A global grid misses narrow separated modes. Resolve each material
  // component locally at quarter-sigma spacing, including eight-sigma tails.
  for(const c of resolvedComponents) for(let i=0;i<=64;i++) { const point=c.mean+(i/4-8)*c.sd; if(point>left&&point<right) points.add(point); }
  check(points.size<=10000,'Adaptive plotting grid exceeds numerical budget.');
  const grid=Array.from(points).sort((a,b)=>a-b).map(x=>{
   const z=(x-mean)/sd;
   return {x,pdf:pdf(x),cdf:cdf(x),gaussianPdf:normPDF(z)/sd,gaussianCdf:normCDF(z)};
  });
  const gridCDFMass=grid[grid.length-1].cdf-grid[0].cdf;
  const gridPdfMass=grid.slice(1).reduce((sum,p,i)=>sum+(p.x-grid[i].x)*(p.pdf+grid[i].pdf)/2,0);
  return {grid,downsideProbability:cdf(threshold),gaussianDownsideProbability:normCDF((threshold-mean)/sd),mean,variance,
   retainedMass,omittedPoissonMass,gridCDFMass,gridPdfMass,gridPointCount:grid.length,
   gridAudit:{basePoints:401,componentCount:components.length,resolvedComponents:resolvedComponents.length,
    localStepStandardDeviations:.25,localTailStandardDeviations:8,
    absoluteMassError:Math.abs(gridPdfMass-gridCDFMass),maxPoints:10000},
   parameters:{mu,sigma,intensity,jumpMean,jumpStd,years,threshold,kappa},
   measure:'user-specified scenario, not calibrated physical forecast or risk-neutral pricing',
   comparison:'Gaussian has the same total log-return mean and variance; only distribution shape differs.',
   gridNote:'Adaptive nonuniform grid combines 401 mixture-quantile-span points with quarter-sigma local grids over ±8 standard deviations for every component with weight >1e-12. Local points are clipped to mixture quantiles 1e-7 and retainedMass-1e-7, so plotted tails omit about 2e-7 mass without renormalization. CDF probabilities use the mixture directly; gridAudit reports trapezoidal density integration error.',
   driftDefinition:'mu is annual expected simple-return drift in the compensated exponential model; mean reports the log-return mean. Normal CDF uses an approximation with absolute error about 8e-8.'};
 }
 return {impliedVolatility,jumpDistribution};
});
