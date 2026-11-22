// Encode only a disposable outbound copy. The selected project file is never opened for writing.
function compressReferenceImage(bytes,mime,{nativeImage,maxEdge=2304}={}) {
  if (!nativeImage || bytes.length<256*1024 || bytes.length>32*1024*1024
      || !['image/png','image/jpeg'].includes(mime)) return null;
  // Animated PNG and transparency both carry reference information.
  if (mime==='image/png' && bytes.includes(Buffer.from('acTL'))) return null;
  try {
    const image=nativeImage.createFromBuffer(bytes);
    const {width,height}=image.getSize();
    if (image.isEmpty() || width*height>40_000_000) return null;
    if (mime==='image/png') {
      const bitmap=image.getBitmap();
      for (let i=3;i<bitmap.length;i+=4) if (bitmap[i]!==255) return null;
    }
    const edge=Math.max(width,height);
    const scaled=edge<=maxEdge?image:image.resize(width>=height?{width:maxEdge,quality:'best'}:{height:maxEdge,quality:'best'});
    const jpeg=scaled.toJPEG(89);
    return jpeg.length && jpeg.length<=0.8*bytes.length ? jpeg : null;
  } catch { return null; }
}
module.exports={compressReferenceImage};
