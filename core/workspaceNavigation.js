export const SHARED_WORKSPACES=['skills','apis','settings','admin'];
export const ROLE_WORKSPACES={creator:['fruit','studio','scripts'],director:['director','collab','generation','canvas']};

export function navigationForRole({account,targetRole,currentNav,remembered}){
 const pages=ROLE_WORKSPACES[targetRole];
 if(!pages||!account?.roles?.includes(targetRole))throw new Error('请先开通目标身份');
 if(SHARED_WORKSPACES.includes(currentNav)&&(currentNav!=='admin'||account.isAdmin===true))return currentNav;
 return pages.includes(remembered)?remembered:pages[0];
}
