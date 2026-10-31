'use strict';
importScripts('model.js?v=20261027audit2','labs.js?v=20261027audit2','validation.js?v=20261029forecast1');
self.onmessage=event=>{
 try { const closes=event.data.closes; const report=QuantModel.run(closes,{protocol:event.data.protocol||'classic'});report.validation=QuantValidation.analyze(report);self.postMessage({report,diagnostics:QuantLabs.diagnostics(closes)}); }
 catch(error){self.postMessage({error:error.message});}
};
