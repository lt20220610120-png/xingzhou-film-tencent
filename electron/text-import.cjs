// Decode common Chinese novel exports without silently replacing invalid bytes.
function decodeImportText(bytes) {
 const buffer=Buffer.from(bytes);
 let encoding='utf-8';
 if(buffer[0]===0xff&&buffer[1]===0xfe)encoding='utf-16le';
 else if(buffer[0]===0xfe&&buffer[1]===0xff)encoding='utf-16be';
 else {
  try{return {content:new TextDecoder('utf-8',{fatal:true}).decode(buffer),encoding};}
  catch{encoding='gb18030';}
 }
 try{return {content:new TextDecoder(encoding,{fatal:true}).decode(buffer),encoding};}
 catch{throw new Error('无法完整读取文本编码。请将小说另存为 UTF-8 文本后重新导入，原文件不会被修改。');}
}
module.exports={decodeImportText};
