const {createWinAITransport,ORIGIN}=require('./win-ai-transport.cjs');
function createWinAIFetch({fallback=(...args)=>globalThis.fetch(...args),transportFactory=createWinAITransport}={}){
 let transport;
 return async(input,init)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(url.origin!==ORIGIN)return fallback(input,init);
  // Public relay calls use only the supplied API key, never dashboard cookies.
  transport||=transportFactory({session:{cookies:{get:async()=>[],set:async()=>{},remove:async()=>{}}}});
  const response=await transport(new Request(input,init));if(init?.redirect==='error'&&response.status>=300&&response.status<400)throw new Error('Win AI API 返回了不允许的跳转');return response;
 };
}
const winAIFetch=createWinAIFetch();
module.exports={createWinAIFetch,winAIFetch};
