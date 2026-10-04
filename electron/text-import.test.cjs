const test=require('node:test');
const assert=require('node:assert/strict');
const {decodeImportText}=require('./text-import.cjs');
test('novel import decodes UTF-8 BOM, UTF-16 and common GBK Chinese without replacement',()=>{
 assert.equal(decodeImportText(Buffer.from('\uFEFF第一章\r\n原文')).content,'第一章\r\n原文');
 assert.equal(decodeImportText(Buffer.concat([Buffer.from([255,254]),Buffer.from('第一章','utf16le')])).content,'第一章');
 assert.deepEqual(decodeImportText(Buffer.from([0xd6,0xd0,0xce,0xc4])),{content:'中文',encoding:'gb18030'});
 assert.throws(()=>decodeImportText(Buffer.from([0xff,0xff,0xff])),/编码/);
});
