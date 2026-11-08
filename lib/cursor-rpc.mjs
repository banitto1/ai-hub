import {CodexRPC} from './codex-rpc.mjs';
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
export class CursorRPC extends CodexRPC {
 async start(){if(this.starting)return this.starting;this.starting=(async()=>{
  this.cwd=join(process.env.AI_HUB_DATA_DIR||join(process.cwd(),'.data'),'grok-chat');mkdirSync(this.cwd,{recursive:true});
  const dir=join(process.cwd(),'vendor/cursor/dist-package'),env={...process.env};delete env.CURSOR_API_KEY;
  this.child=spawn(join(dir,'node.exe'),[join(dir,'index.js'),'acp'],{cwd:this.cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  this.child.stdout.setEncoding('utf8');this.child.stdout.on('data',s=>{this.buffer+=s;let n;while((n=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,n);this.buffer=this.buffer.slice(n+1);try{this.receive(JSON.parse(line));}catch{}}});
  this.child.stderr.on('data',()=>{});this.child.on('error',e=>this.fail(e));this.child.on('exit',()=>this.fail(Error('Соединение Grok / Cursor закрыто')));
  this.info=await this.call('initialize',{protocolVersion:1,clientInfo:{name:'ai-hub',version:'0.4.0'},clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false}});
 })();return this.starting;}
 receive(m){if(m.method==='session/request_permission'&&m.id!==undefined){this.send({id:m.id,result:{outcome:{outcome:'cancelled'}}});return;}super.receive(m);}
}
const rpc=globalThis.__aiHubCursor ||= new CursorRPC();let cached,pending;
async function newSession(){await rpc.start();return rpc.call('session/new',{cwd:rpc.cwd,mcpServers:[]});}
export async function grokStatus(){if(cached&&Date.now()-cached.at<30000)return cached.value;if(pending)return pending;pending=(async()=>{let value={connected:false,signedIn:false,models:[],limits:null,error:null};try{const s=await newSession();value.connected=true;value.signedIn=true;value.models=(s.models?.availableModels||[]).filter(m=>/grok/i.test(m.modelId+' '+m.name)).map(m=>({id:m.modelId.split('[')[0],name:m.name}));if(!value.models.length)value.error='Grok отсутствует в каталоге этого аккаунта Cursor. Подписка и аккаунт не изменялись.';}catch(e){if(!/auth|log.?in|sign.?in/i.test(e.message))value.error=e.message;}const stateFile=join(rpc.cwd||process.cwd(),'access-state.json');if(existsSync(stateFile)){const saved=JSON.parse(readFileSync(stateFile,'utf8'));if(Date.now()-saved.at<86400000){value.connected=false;value.error=saved.error;}}value.limitError='Клиент Cursor не вернул остаток подписки. Проверка лимитов доступна в аккаунте Grok / Cursor.';cached={at:Date.now(),value};return value;})();try{return await pending;}finally{pending=null;}}
let login;
export async function grokLogin(){
 if(login)return login;
 login=new Promise((resolve,reject)=>{const dir=join(process.cwd(),'vendor/cursor/dist-package');const child=spawn(join(dir,'node.exe'),[join(dir,'index.js'),'login'],{env:{...process.env,NO_OPEN_BROWSER:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',settled=false;const timeout=setTimeout(()=>{child.kill();login=null;if(!settled)reject(Error('Время входа Cursor истекло'));},240000);const read=s=>{output+=s;const m=output.match(/https:\/\/cursor\.com\/loginDeepControl\?[^\s\x1b]+/);if(m&&!settled){settled=true;resolve({authUrl:m[0]});}};child.stdout.on('data',read);child.stderr.on('data',read);child.on('error',e=>{clearTimeout(timeout);login=null;reject(e);});child.on('exit',code=>{clearTimeout(timeout);login=null;cached=null;rpc.close();if(!settled)code===0?resolve({connected:true}):reject(Error('Не удалось войти в Cursor'));});});return login;
}
export async function grokTurn({model,text,images=[],emit,signal}){
 if(!/grok/i.test(model))throw Error('Подключение Cursor в хабе предназначено только для моделей Grok.');
 if(signal?.aborted)throw Error('Запрос остановлен');
 const s=await newSession();await rpc.call('session/set_mode',{sessionId:s.sessionId,modeId:'ask'});const selected=s.models?.availableModels?.find(m=>m.modelId.split('[')[0]===model);if(!selected)throw Error('Grok недоступен в каталоге аккаунта.');await rpc.call('session/set_model',{sessionId:s.sessionId,modelId:selected.modelId});
 let output='';const listener=m=>{const u=m.params?.update;if(m.method==='session/update'&&m.params.sessionId===s.sessionId&&u?.sessionUpdate==='agent_message_chunk'&&u.content?.type==='text'){output+=u.content.text;emit(u.content.text);}};
 const abort=()=>rpc.send({method:'session/cancel',params:{sessionId:s.sessionId}});rpc.on('notification',listener);signal?.addEventListener('abort',abort,{once:true});
 try{const r=await rpc.call('session/prompt',{sessionId:s.sessionId,prompt:[{type:'text',text:'Answer directly using only supplied context. Do not use tools or access files.\n'+text},...images.map(path=>{const b=readFileSync(path);return {type:'image',mimeType:b[0]===137?'image/png':'image/jpeg',data:b.toString('base64')};})]},300000);if(r.stopReason!=='end_turn')throw Error('Grok: '+r.stopReason);if(/^\s*Upgrade your plan to continue\s*$/i.test(output)){const error='Вход Cursor выполнен, но текущий тариф отклонил запрос Grok: требуется другой план. Подписка SuperGrok автоматически не переносится. Официальный Grok доступен отдельно.';writeFileSync(join(rpc.cwd,'access-state.json'),JSON.stringify({at:Date.now(),error}));throw Error(error);}return {text:output,model,usage:r.usage};}finally{rpc.off('notification',listener);signal?.removeEventListener('abort',abort);cached=null;}
}
