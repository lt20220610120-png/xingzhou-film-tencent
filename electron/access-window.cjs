function createAccessWindowController(){
 const stages=new WeakMap(),saved=new WeakMap();
 return function apply(win,stage){
  if(!['lock','account','workspace'].includes(stage))throw Error('启动窗口状态无效');
  if(!win||win.isDestroyed()||stages.get(win)===stage)return;
  const previous=stages.get(win);stages.set(win,stage);
  if(stage==='lock'){
   if(previous&&previous!=='lock')saved.set(win,{bounds:win.getBounds(),maximized:win.isMaximized()});
   if(win.isMaximized())win.unmaximize();
   win.setMinimumSize(480,420);win.setResizable(false);win.setSize(520,450);win.center();
  }else if(previous==='lock'||!previous){
   win.setResizable(true);win.setMinimumSize(1120,720);
   const old=saved.get(win);if(old){win.setBounds(old.bounds);if(old.maximized)win.maximize();saved.delete(win);}else{win.setSize(1500,940);win.center();}
  }
 };
}
module.exports={createAccessWindowController};
