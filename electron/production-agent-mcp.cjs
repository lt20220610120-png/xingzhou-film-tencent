const http=require('node:http'),crypto=require('node:crypto');
async function createAgentMcpServer({tools,callTool}){
 const token=crypto.randomBytes(32).toString('hex');let stopped=false;
 const handle=async(req,res)=>{
  if(stopped||req.headers.authorization!=='Bearer '+token){res.writeHead(401);res.end();return;}
  if(req.url!=='/mcp'||req.method!=='POST'){res.writeHead(405);res.end();return;}
  let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);}
  let p;try{p=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{res.writeHead(400);res.end();return;}
  if(p.id===undefined){res.writeHead(202);res.end();return;}
  let response;try{let result;
   if(p.method==='initialize')result={protocolVersion:p.params?.protocolVersion||'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'xingzhou-film',version:'1.0.0'}};
   else if(p.method==='ping')result={};
   else if(p.method==='tools/list')result={tools:tools.map(({name,description,inputSchema})=>({name,description,inputSchema}))};
   else if(p.method==='tools/call'){if(!tools.some(t=>t.name===p.params?.name))throw Error('未知行舟工具');try{const value=await callTool(p.params.name,p.params.arguments||{});result={content:[{type:'text',text:JSON.stringify(value)}],isError:false};}catch(error){result={content:[{type:'text',text:error.message}],isError:true};}}
   else throw Error('未知MCP方法');response={jsonrpc:'2.0',id:p.id,result};
  }catch(error){response={jsonrpc:'2.0',id:p.id,error:{code:-32601,message:error.message}};}
  if(stopped||res.destroyed||res.writableEnded)return;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(response));
 };const server=http.createServer((req,res)=>{void handle(req,res).catch(()=>{if(!res.destroyed&&!res.writableEnded){if(!res.headersSent)res.writeHead(400);res.end();}});});server.requestTimeout=30000;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {config:{type:'http',name:'xingzhou',url:`http://127.0.0.1:${server.address().port}/mcp`,headers:[{name:'Authorization',value:'Bearer '+token}]},close(){stopped=true;server.close();server.closeAllConnections?.();}};
}
module.exports={createAgentMcpServer};
