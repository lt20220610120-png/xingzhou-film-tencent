const {createReadStream}=require('node:fs');
const {createHash}=require('node:crypto');

async function sha256File(file,{signal}={}){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(file,{highWaterMark:256*1024,signal}))hash.update(chunk);
  return hash.digest('hex');
}

module.exports={sha256File};
