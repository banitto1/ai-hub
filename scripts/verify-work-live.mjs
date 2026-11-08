// Real end-to-end check of «Работа на ПК» through Electron with real subscription providers.
// Usage: node scripts/verify-work-live.mjs [ChatGPT] [Gemini]   (default: both). Spends one short task per provider.
import {_electron as electron} from 'playwright';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const providers=process.argv.slice(2).length?process.argv.slice(2):['ChatGPT','Gemini'];
const dir=mkdtempSync(join(tmpdir(),'hub-work-live-'));
const env={...process.env,AI_HUB_PORT:'3223',AI_HUB_DATA_DIR:join(dir,'data'),AI_HUB_PROFILE_DIR:join(dir,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.AI_HUB_TEST_IMPORT;
const t0=Date.now();const log=(...a)=>console.log('['+((Date.now()-t0)/1000).toFixed(0)+'s]',...a);
const app=await electron.launch({executablePath:resolve('win-app/AI Hub.exe'),env,timeout:60000});
const pid=app.process().pid;let failed=false;
async function watch(p,label,until,timeout){
 const end=Date.now()+timeout;let last='';
 while(Date.now()<end){
  if(await until())return;
  const status=await p.locator('.work-status').innerText().catch(()=>'');const errors=await p.locator('.alert').allInnerTexts().catch(()=>[]);
  const now=status+' | '+errors.join(' / ');if(now!==last){log(label,'status:',now);last=now;}
  await p.waitForTimeout(2000);
 }
 const shot=join(dir,label.replace(/\W+/g,'-')+'-timeout.png');await p.screenshot({path:shot}).catch(()=>{});
 log(label,'TIMEOUT. Messages:\n'+(await p.locator('.hub-messages').innerText().catch(()=>'')).slice(-3000));log('screenshot',shot);
 throw Error(label+': timeout '+timeout/1000+'s');
}
try{
 const p=await app.firstWindow();log('data dir',dir);
 await p.getByRole('button',{name:'Gemini Подключён',exact:true}).waitFor({timeout:120000});
 for(const provider of providers){
  try{
   await p.getByRole('button',{name:'Новый чат',exact:true}).click();await p.getByRole('button',{name:provider+' Подключён',exact:true}).click();
   log(provider,'model:',await p.locator('.model-trigger').innerText());
   await p.getByRole('checkbox',{name:'Работа на ПК',exact:true}).check();await p.getByRole('textbox',{name:'Рабочая папка ПК',exact:true}).fill(dir);
   const filename=provider+'.txt';
   await p.getByRole('textbox',{name:'Сообщение',exact:true}).fill('Создай новый файл '+filename+' в рабочей папке с текстом HUB_WORK_OK. Файл ещё не существует. Используй только действие write. После успешной записи заверши задачу.');
   await p.getByRole('button',{name:'Отправить',exact:true}).click();
   const card=p.getByRole('region',{name:'Разрешение действия'});
   await watch(p,provider+' planning',()=>card.isVisible(),240000);
   const action=JSON.parse(await card.locator('pre').innerText());log(provider,'proposed',JSON.stringify(action));
   assert.equal(action.tool,'write');assert.equal(action.path,join(dir,filename));assert.match(action.content,/HUB_WORK_OK/);assert.equal(existsSync(action.path),false,'file must not exist before approval');
   await p.getByRole('button',{name:'Разрешить один раз',exact:true}).click();
   await watch(p,provider+' finishing',async()=>!(await p.locator('.work-status').isVisible())&&await p.getByRole('button',{name:'Отправить',exact:true}).isVisible(),240000);
   assert.match(readFileSync(action.path,'utf8'),/HUB_WORK_OK/);assert.equal(await p.locator('.hub-message.failed').count(),0);
   const text=await p.locator('.hub-messages').innerText();assert.match(text,/Работа · журнал/);
   log('PASS '+provider+': real planning, UI approval, file creation, final answer, persisted journal');
  }catch(e){failed=true;log('FAIL '+provider+':',e.message);}
 }
 await p.screenshot({path:'desktop-validation/work-mode.png'}).catch(()=>{});
}finally{
 await Promise.race([app.close(),new Promise(r=>setTimeout(r,15000))]).catch(()=>{});
 if(pid)spawn('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
 log(failed?'RESULT: FAIL':'RESULT: PASS');process.exitCode=failed?1:0;
}
