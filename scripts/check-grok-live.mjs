import {grokTurn} from '../lib/cursor-rpc.mjs';
try{const r=await grokTurn({model:'grok-4.7',text:'Reply with exactly OK. Do not call tools.',emit:()=>{}});console.log(JSON.stringify(r));}catch(e){console.log('Grok check:',e.message);process.exitCode=1;}finally{globalThis.__aiHubCursor.close();}
