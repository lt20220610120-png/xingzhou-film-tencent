const test=require('node:test'),assert=require('node:assert/strict');
const {createAccessWindowController}=require('./access-window.cjs');
test('startup lock is a small fixed window, account/workspace restores normal bounds',()=>{
 let bounds={x:10,y:20,width:1320,height:880},resizable=true,min=[],maximized=false;
 const win={isDestroyed:()=>false,isMaximized:()=>maximized,unmaximize:()=>maximized=false,maximize:()=>maximized=true,getBounds:()=>({...bounds}),setBounds:b=>bounds=b,setSize:(width,height)=>{if(!resizable)return;bounds={...bounds,width,height};},setMinimumSize:(...v)=>min=v,setResizable:v=>resizable=v,center(){}};
 const apply=createAccessWindowController();apply(win,'lock');assert.equal(bounds.width,520);assert.equal(resizable,false);apply(win,'account');assert.equal(bounds.width,1320);assert.equal(bounds.height,880);assert.equal(resizable,true);assert.deepEqual(min,[1000,660]);
 bounds={x:101,y:202,width:1800,height:1000};apply(win,'workspace');apply(win,'lock');apply(win,'workspace');assert.deepEqual(bounds,{x:101,y:202,width:1800,height:1000});assert.throws(()=>apply(win,'bad'),/状态/);
});
