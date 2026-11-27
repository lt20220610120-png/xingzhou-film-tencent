export function reportRendererIncident(operation){
  const workspace=[...document.querySelectorAll('[data-runtime-storage-mode]')].find(node=>node.getClientRects().length);
  const mode=workspace?.dataset.runtimeStorageMode;
  void window.xingzhou?.reportRendererIncident?.(operation,mode).catch(()=>{});
}
