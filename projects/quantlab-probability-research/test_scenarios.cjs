const assert=require('node:assert/strict');
const labs=require('./labs.js'), s=require('./scenarios.js');
for(const rate of [.05,-.03]) for(const type of ['call','put']) {
 const premium=labs.blackScholes(100,105,.75,rate,.35)[type];
 const result=s.impliedVolatility({spot:100,strike:105,years:.75,rate,premium,type});
 assert.ok(result.converged); assert.ok(Math.abs(result.volatility-.35)<1e-6);
 assert.ok(Math.abs(result.error)<1e-6);
}
assert.equal(s.impliedVolatility({spot:110,strike:100,years:1,rate:0,premium:10}).volatility,0);
assert.throws(()=>s.impliedVolatility({spot:100,strike:100,years:1,rate:0,premium:100}));
assert.throws(()=>s.impliedVolatility({spot:100,strike:100,years:1,rate:0,premium:-1}));
const beyond=labs.blackScholes(100,100,.01,0,11).call;
assert.throws(()=>s.impliedVolatility({spot:100,strike:100,years:.01,rate:0,premium:beyond}));
const d=s.jumpDistribution({});
assert.ok(d.omittedPoissonMass<1e-12);assert.ok(Math.abs(d.retainedMass+d.omittedPoissonMass-1)<1e-14);
assert.ok(d.downsideProbability>=0&&d.downsideProbability<=1);
for(let i=1;i<d.grid.length;i++) assert.ok(d.grid[i].cdf>=d.grid[i-1].cdf);
const integrated=d.grid.slice(1).reduce((v,p,i)=>v+(p.x-d.grid[i].x)*(p.pdf+d.grid[i].pdf)/2,0);
assert.ok(Math.abs(integrated-d.gridCDFMass)<.002);
const normal=s.jumpDistribution({intensity:0});
for(const p of normal.grid) {assert.ok(Math.abs(p.pdf-p.gaussianPdf)<1e-10);assert.ok(Math.abs(p.cdf-p.gaussianCdf)<1e-12);}
const p={mu:.1,sigma:.3,intensity:2,jumpMean:-.1,jumpStd:.2,years:.5};
const t=s.jumpDistribution(p), k=Math.exp(p.jumpMean+p.jumpStd**2/2)-1;
assert.ok(Math.abs(t.mean-(p.mu-.5*p.sigma**2-p.intensity*k+p.intensity*p.jumpMean)*p.years)<1e-14);
assert.ok(Math.abs(t.variance-(p.sigma**2+p.intensity*(p.jumpStd**2+p.jumpMean**2))*p.years)<1e-14);
const high=s.jumpDistribution({intensity:25,years:2});
assert.ok(high.omittedPoissonMass<1e-12);assert.ok(high.grid.length>=401&&high.grid.length<=10000);
const narrow=s.jumpDistribution({sigma:.01,intensity:1,jumpMean:-1,jumpStd:0,years:1/252});
assert.ok(Math.abs(narrow.gridPdfMass-narrow.gridCDFMass)<.005,'Adaptive grid must resolve narrow separated mixture modes');
assert.throws(()=>s.jumpDistribution({intensity:50,years:2}));
assert.throws(()=>s.jumpDistribution({sigma:0}));
const vm=require('node:vm'),fs=require('node:fs');
const context=vm.createContext({QuantLabs:labs});
vm.runInContext(fs.readFileSync(require.resolve('./scenarios.js'),'utf8'),context);
assert.equal(typeof context.QuantScenarios.jumpDistribution,'function');
console.log('scenarios tests passed: IV bounds/roundtrips; mixture mass, moments, CDF, normal limit, worker export');
const plotted=s.jumpDistribution();
assert(Math.abs(plotted.grid[0].cdf-1e-7)<1e-9,'plot starts at the requested lower mixture quantile');
assert(Math.abs(plotted.grid.at(-1).cdf-(plotted.retainedMass-1e-7))<1e-9,'plot ends at upper mixture quantile');
