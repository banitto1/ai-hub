import {spawn} from 'node:child_process';
import {join,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {existsSync,realpathSync} from 'node:fs';
import {EventEmitter} from 'node:events';
export class CodexRPC extends EventEmitter {
 constructor(){super();this.sequence=0;this.pending=new Map();this.buffer='';}
 async start(){
  if(this.starting)return this.starting;
  this.starting=(async()=>{
   const installed=join(process.env.LOCALAPPDATA||'','Programs/OpenAI/Codex/bin/codex.exe');
   let bundled;
   try{const r=createRequire(realpathSync(join(process.cwd(),'node_modules/@openai/codex/package.json')));bundled=join(dirname(r.resolve('@openai/codex-win32-x64/package.json')),'vendor/x86_64-pc-windows-msvc/bin/codex.exe');}catch{}
   const binary=process.env.AI_HUB_CODEX_EXE||(bundled&&existsSync(/*turbopackIgnore: true*/ bundled)?bundled:existsSync(installed)?installed:'codex');
   this.child=spawn(binary,['app-server','--listen','stdio://','-c','features.shell_tool=false','-c','web_search="disabled"'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
   this.child.stdout.setEncoding('utf8');
   this.child.stdout.on('data',chunk=>{this.buffer+=chunk;let end;while((end=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+1);try{this.receive(JSON.parse(line));}catch{}}});
   this.child.stderr.on('data',()=>{});
   this.child.on('error',error=>this.fail(error));this.child.on('exit',()=>this.fail(new Error('Codex connection closed')));
   await this.call('initialize',{clientInfo:{name:'ai_hub_local',title:'AI Hub',version:'0.3.0'},capabilities:{experimentalApi:true}});
   this.send({method:'initialized',params:{}});
  })();return this.starting;
 }
 send(message){this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',...message})+'\n');}
 call(method,params={},timeout=30000){return new Promise((resolve,reject)=>{const id=++this.sequence;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Codex timeout: '+method));},timeout);this.pending.set(id,{resolve,reject,timer});this.send({id,method,params});});}
 receive(message){
  if(message.id!==undefined&&this.pending.has(message.id)){const p=this.pending.get(message.id);clearTimeout(p.timer);this.pending.delete(message.id);message.error?p.reject(new Error(message.error.message)):p.resolve(message.result);return;}
  if(message.id!==undefined){this.send({id:message.id,error:{code:-32601,message:'AI Hub does not grant tool or filesystem approvals'}});return;}
  this.emit('notification',message);
 }
 fail(error){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();this.starting=null;this.emit('disconnected',error);}
 close(){this.child?.kill();}
}
