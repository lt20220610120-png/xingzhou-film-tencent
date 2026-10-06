const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;

// The outer navigation is the only excluded area. Project navigation and headers
// remain available for moving the window; all coordinates are viewport pixels.
export function floatingPanelGeometry({viewportWidth,viewportHeight,sidebarRight=0,position,padding=12}) {
 const right=Math.max(0,finite(viewportWidth,0)-padding);
 const bottom=Math.max(0,finite(viewportHeight,0)-padding);
 const left=Math.min(right,Math.max(padding,finite(sidebarRight,0)+padding));
 const top=Math.min(bottom,padding);
 const width=Math.min(420,Math.max(0,right-left));
 const height=Math.min(700,Math.max(0,bottom-top));
 return {x:Math.max(left,Math.min(right-width,finite(position?.x,right-width))),
  y:Math.max(top,Math.min(bottom-height,finite(position?.y,126))),width,height};
}
