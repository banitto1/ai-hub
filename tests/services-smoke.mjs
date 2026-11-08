import { _electron as electron } from 'playwright';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const temp=mkdtempSync(join(tmpdir(),'aihub-services-'));
const env={...process.env,AI_HUB_DATA_DIR:join(temp,'data'),AI_HUB_PROFILE_DIR:join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:resolve('win-app/AI Hub.exe'),env,timeout:60000});
const results=[];
try{const page=await app.firstWindow();await page.getByRole('heading',{name:'Ваше пространство для ИИ'}).waitFor({timeout:60000});
 for(const id of ['chatgpt','gemini','grok']){
  const next=app.waitForEvent('window');
  const opening=page.evaluate(id=>window.desktop.openService(id).then(()=>null,e=>e.message),id);
  const remote=await next;await remote.waitForLoadState('domcontentloaded',{timeout:25000}).catch(()=>{});
  const error=await Promise.race([opening,new Promise(r=>setTimeout(()=>r('Loading timeout'),25000))]);
  const info=remote.isClosed()?{id,error}:{id,url:remote.url(),title:await remote.title().catch(()=>''),bridge:await remote.evaluate(()=>typeof window.desktop).catch(()=>''),error};
  results.push(info);if(!remote.isClosed())await remote.close();
 }
 writeFileSync('desktop-validation/services.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await app.close();}
