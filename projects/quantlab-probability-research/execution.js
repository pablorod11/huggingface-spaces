'use strict';
// Hypothetical independent long round trips; not a backtest or execution simulator.
(function(root){
 function costs(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Enter the hypothetical trade inputs.');
  const names=['notional','attempts','completed','movePercent','spreadBps','feeBps','slippageBps','delayBps'],values={};
  for(const name of names){const value=input[name];if(typeof value!=='number'||!Number.isFinite(value))throw Error(`${name} must be a finite number.`);values[name]=value;}
  const {notional,attempts,completed,movePercent,spreadBps,feeBps,slippageBps,delayBps}=values;
  if(notional<=0||notional>1e9)throw Error('Notional must be greater than zero and no more than one billion.');
  if(!Number.isInteger(attempts)||attempts<1||attempts>10000)throw Error('Attempts must be a whole number from 1 to 10,000.');
  if(!Number.isInteger(completed)||completed<0||completed>attempts)throw Error('Completed trades must be a whole number from zero to attempts.');
  if(movePercent< -100||movePercent>100)throw Error('Price move must be between -100% and 100%.');
  for(const name of ['spreadBps','feeBps','slippageBps','delayBps'])if(values[name]<0||values[name]>10000)throw Error(`${name} must be between zero and 10,000 basis points.`);
  const ideal=notional*attempts*movePercent/100,filledGross=notional*completed*movePercent/100,missedEffect=ideal-filledGross,batch=notional*completed;
  const delayCost=batch*delayBps/10000,spreadCost=batch*spreadBps/10000,feeCost=2*batch*feeBps/10000,slippageCost=2*batch*slippageBps/10000,totalCosts=delayCost+spreadCost+feeCost+slippageCost,net=filledGross-totalCosts;
  const breakEvenMovePercent=completed>0?(spreadBps+2*feeBps+2*slippageBps+delayBps)/100:null;
  return{schema_version:1,breakEvenMovePercent,inputs:values,assumptions:[
   'Independent same-notional long round trips; every completed trade has both entry and exit filled.',
   'Uncompleted attempts have no fills, costs or exposure. Missing a losing trade can improve the result.',
   'Every completed trade has the same assumed percentage move. All charges use the fixed entered notional.',
   'Spread is charged once per round trip; fees and slippage are charged on each of two legs; delay is charged once.',
   'One basis point is 0.01%. Amounts use the same money units as notional. No compounding or reinvestment.',
   'Hypothetical arithmetic only; not a backtest, order-book or queue simulator, or prediction of real fills or profit.'
  ],ideal,filledGross,missedEffect,delayCost,spreadCost,feeCost,slippageCost,totalCosts,net,completed,attempts};
 }
 const api={costs};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.QuantExecution=api;
})(globalThis);
