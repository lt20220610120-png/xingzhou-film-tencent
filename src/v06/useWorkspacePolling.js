import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createPagePoll} from '../../core/pagePolling.js';
import {useWorkspaceActive} from '../components/WorkspacePresence.jsx';

const visible=()=>!globalThis.document?.hidden;
const watchVisibility=listener=>{
  const page=globalThis.document;
  page?.addEventListener('visibilitychange',listener);
  return ()=>page?.removeEventListener('visibilitychange',listener);
};

export function useWorkspaceVisible() {
  const active=useWorkspaceActive();
  const documentVisible=useSyncExternalStore(watchVisibility,visible,()=>true);
  return active&&documentVisible;
}

/** Schedule presentation reads only, independently of the jobs they display. */
export function useWorkspacePolling(query,{scope,delay,enabled=true,immediate=true,repeat=true,anchor}={}) {
  const active=useWorkspaceActive();
  const latest=useRef(null), controller=useRef(null);
  latest.current={query,scope,active,enabled,repeat};
  useEffect(()=>{
    const page=anchor?.current?.ownerDocument||globalThis.document;
    const owner=page?.defaultView||globalThis;
    const thisScope=scope;
    const poll=createPagePoll(current=>{
      const stillCurrent=()=>current()&&latest.current.active&&latest.current.enabled&&latest.current.scope===thisScope;
      if (stillCurrent()) return latest.current.query(stillCurrent);
    },{page,delay,immediate,repeat:latest.current.repeat,
      schedule:(callback,ms)=>owner.setTimeout(callback,ms),cancel:ticket=>owner.clearTimeout(ticket),
    });
    controller.current=poll;
    poll.setActive(latest.current.active&&latest.current.enabled);
    return ()=>{
      poll.dispose();
      if (controller.current===poll) controller.current=null;
    };
  },[scope,delay,immediate,anchor]);
  useEffect(()=>{controller.current?.setActive(active&&enabled);},[active,enabled]);
  useEffect(()=>{controller.current?.setRepeat(repeat);},[repeat]);
  return useCallback(options=>controller.current?.request(options)??Promise.resolve(),[]);
}

export function useWorkspaceClock(running,anchor) {
  const [now,setNow]=useState(Date.now);
  useWorkspacePolling(()=>setNow(Date.now()),{delay:1000,enabled:Boolean(running),anchor});
  return now;
}
