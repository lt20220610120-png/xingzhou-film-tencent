import React,{createContext,useContext} from 'react';
export const WorkspaceActiveContext=createContext(true);
export const useWorkspaceActive=()=>useContext(WorkspaceActiveContext);

/** Preserve local state while keeping portaled dialogs out of inactive pages. */
export function WorkspacePresence({active,children}){
 return <WorkspaceActiveContext.Provider value={active}><div className="workspace-preserved" hidden={!active} style={active?undefined:{display:'none'}}>{children}</div></WorkspaceActiveContext.Provider>;
}
