export function createPagePoll(query, {
  page, delay, immediate=true, repeat=true, schedule=setTimeout, cancel=clearTimeout,
}) {
  let enabled=false, disposed=false, shown=false;
  let timer=null, pending=null, queued=null;

  const current=()=>enabled&&!disposed&&!page?.hidden;
  const clear=()=>{
    if (timer===null) return;
    cancel(timer);
    timer=null;
  };

  function backgroundRefresh(afterCurrent=false) {
    return request({afterCurrent}).catch(()=>{});
  }

  function arm() {
    if (!current() || pending || queued || !repeat || timer!==null) return;
    timer=schedule(()=>{
      timer=null;
      return backgroundRefresh();
    },delay);
  }

  function request({afterCurrent=false}={}) {
    if (!current()) return Promise.resolve();
    clear();
    if (pending) {
      if (!afterCurrent) return pending;
      if (!queued) {
        const next=()=>{
          queued=null;
          return request();
        };
        queued=pending.then(next,next);
      }
      return queued;
    }
    pending=Promise.resolve().then(()=>{if (current()) return query(current);}).finally(()=>{
      pending=null;
      arm();
    });
    return pending;
  }

  const visibility=()=>{
    clear();
    if (current()) {shown=true;void backgroundRefresh(true);}
  };
  page?.addEventListener('visibilitychange',visibility);

  return {
    request,
    setActive(active) {
      if (enabled===active || disposed) return;
      enabled=active;
      if (!current()) {clear();return;}
      const refresh=immediate||shown;
      shown=true;
      if (refresh) void backgroundRefresh(true);
      else arm();
    },
    setRepeat(value) {
      if (repeat===value) return;
      repeat=value;
      clear();
      arm();
    },
    dispose() {
      disposed=true;
      clear();
      page?.removeEventListener('visibilitychange',visibility);
    },
  };
}
