import {CursorRPC} from '../lib/cursor-rpc.mjs';
const rpc=new CursorRPC();try{await rpc.start();console.log(JSON.stringify(rpc.info));try{console.log(JSON.stringify(await rpc.call('session/new',{cwd:rpc.cwd,mcpServers:[]})));}catch(e){console.log(e.message);}}finally{rpc.close();}
