const shared=require('../cloud-backend/shared/ai-service.cjs');
const {winAIFetch}=require('./win-ai-api-fetch.cjs');
const optionsFor=options=>({fetchFn:winAIFetch,...options});
module.exports={
  ...shared,
  requestChat:(config,options)=>shared.requestChat(config,optionsFor(options)),
  testAiConnection:(config,options)=>shared.testAiConnection(config,optionsFor(options)),
};
