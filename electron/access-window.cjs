function createAccessWindowController(){
 const stages=new WeakMap(),saved=new WeakMap();
 return function apply(win,stage){
  if(!['lock','account','workspace'].includes(stage))throw Error('启动窗口状态无效');
  if(!win||win.isDestroyed()||stages.get(win)===stage)return;
  const previous=stages.get(win);stages.set(win,stage);
  if(stage==='lock'){
   if(previous&&previous!=='lock')saved.set(win,{bounds:win.getBounds(),maximized:win.isMaximized()});
   if(win.isMaximized())win.unmaximize();
   win.setResizable(true);win.setMinimumSize(480,420);win.setSize(520,450);win.setResizable(false);win.center();
  }else if(previous==='lock'||!previous){
   win.setResizable(true);win.setMinimumSize(1000,660);
   const old=saved.get(win);if(old){win.setBounds(old.bounds);if(old.maximized)win.maximize();saved.delete(win);}else{win.setSize(1320,880);win.center();}
  }
 };
}
module.exports={createAccessWindowController};
