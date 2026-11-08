import {CodexRPC} from '../lib/codex-rpc.mjs';
const rpc=new CodexRPC();
try{await rpc.start();const a=await rpc.call('account/read',{refreshToken:false});const m=await rpc.call('model/list',{limit:100});let limits;try{limits=await rpc.call('account/rateLimits/read');}catch(e){limits={error:e.message};}console.log(JSON.stringify({accountType:a.account?.type,plan:a.account?.planType,models:m.data?.map(x=>({id:x.id,model:x.model,name:x.displayName})),limits},null,2));}finally{rpc.close();}
