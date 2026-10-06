import test from 'node:test';
import assert from 'node:assert/strict';
import {floatingPanelGeometry} from './floatingPanel.js';

test('floating window opens on the right and stays outside the outer navigation',()=>{
 const viewport={viewportWidth:1700,viewportHeight:1000,sidebarRight:180};
 assert.deepEqual(floatingPanelGeometry(viewport),{x:1268,y:126,width:420,height:700});
 assert.equal(floatingPanelGeometry({...viewport,position:{x:-1000,y:126}}).x,192);
 assert.equal(floatingPanelGeometry({...viewport,position:{x:10000,y:126}}).x,1268);
 assert.equal(floatingPanelGeometry({...viewport,position:{x:500,y:-10000}}).y,12);
 assert.equal(floatingPanelGeometry({...viewport,position:{x:500,y:10000}}).y,288);
});
test('resizing clamps position and panel dimensions inside all four boundaries',()=>{
 const result=floatingPanelGeometry({viewportWidth:540,viewportHeight:480,sidebarRight:180,position:{x:1600,y:800}});
 assert.deepEqual(result,{x:192,y:12,width:336,height:456});
 assert.equal(result.x+result.width,528);assert.equal(result.y+result.height,468);
});
test('navigation width changes and invalid saved coordinates cannot escape bounds',()=>{
 const viewport={viewportWidth:1280,viewportHeight:900,sidebarRight:240};
 assert.equal(floatingPanelGeometry({...viewport,position:{x:190,y:30}}).x,252);
 assert.deepEqual(floatingPanelGeometry({...viewport,position:{x:'bad',y:Infinity}}),{x:848,y:126,width:420,height:700});
});
