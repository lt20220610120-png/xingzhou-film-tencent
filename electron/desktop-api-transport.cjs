const {createMediaReadFetch}=require('./media-read-transport.cjs');
// API credentials are explicit headers. Never inherit a web login cookie.
// Electron net.fetch rejects manual redirects: protected content GETs need
// the existing net.request adapter so credentials stay on their origin.
function createDesktopAPIFetch(net){
  const read=createMediaReadFetch(net);
  return (url,options={})=>{
    const init={...options,credentials:'omit'};
    return init.redirect==='manual'&&(!init.method||init.method==='GET')
      ?read(url,init):net.fetch(url,init);
  };
}
module.exports={createDesktopAPIFetch};
