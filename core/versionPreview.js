// Bounded previews: formatting an 87,000-character script should never create
// thousands of DOM nodes merely to open a version dialog.
export function versionPreviewPages(text='',limit=6000){
 const value=String(text),pages=[];let start=0;
 while(start<value.length){let end=Math.min(start+limit,value.length);if(end<value.length){const newline=value.lastIndexOf('\n',end);if(newline>start+limit/2)end=newline+1;}pages.push(value.slice(start,end));start=end;}
 return pages.length?pages:[''];
}
