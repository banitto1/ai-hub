import {_electron as electron} from 'playwright';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'hub-layout-'));
const env={...process.env,AI_HUB_PORT:'3227',AI_HUB_DATA_DIR:join(dir,'data'),AI_HUB_PROFILE_DIR:join(dir,'profile'),AI_HUB_TEST_IMPORT:pathToFileURL(resolve('tests/mock-accounts.mjs')).href};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:resolve('win-app/AI Hub.exe'),env,timeout:60000});const pid=app.process().pid;
mkdirSync('desktop-validation',{recursive:true});
try{
 const p=await app.firstWindow();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.getByRole('heading',{name:'Привет, что сделаем сегодня?'}).waitFor();
 await p.locator('.model-trigger').filter({hasText:/astra/i}).waitFor();
 await p.getByRole('textbox',{name:'Сообщение',exact:true}).fill('Проверь длинное название рабочего проекта и отображение истории: '+ 'ОченьДлинноеНазваниеБезПробелов'.repeat(6));
 await p.getByRole('button',{name:'Отправить',exact:true}).click();
 await p.getByRole('button',{name:'Отправить',exact:true}).waitFor();
 for(const [w,h] of [[1920,1080],[1280,800],[900,700],[390,844]]){
  await p.setViewportSize({width:w,height:h});
  // Close drawer using actual control where it overlays the mobile canvas.
  if(w<=900&&!(await p.locator('.reference-shell').getAttribute('class')).includes('sidebar-collapsed'))await p.getByRole('button',{name:'Toggle Sidebar',exact:true}).click();
  const geometry=await p.evaluate(()=>{
   const r=s=>{const e=document.querySelector(s),b=e.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
   return {viewport:[innerWidth,innerHeight],body:document.documentElement.scrollWidth,composer:r('.hub-compose'),send:r('.send-button'),font:getComputedStyle(document.querySelector('.hub-compose textarea')).fontSize};
  });
  assert.ok(geometry.body<=w+1,JSON.stringify(geometry));assert.ok(geometry.composer.x>=0&&geometry.composer.right<=w+1,JSON.stringify(geometry));assert.ok(geometry.send.bottom<=h+1&&geometry.send.right<=w+1,JSON.stringify(geometry));assert.ok(parseFloat(geometry.font)>=16);
  if(w<=900)await p.getByRole('button',{name:'Открыть боковую панель',exact:true}).click();
  const rail=await p.evaluate(()=>{const a=document.querySelector('.sidebar').getBoundingClientRect();return [...document.querySelectorAll('#hub-project-sidebar .ag-chat-item,#hub-project-sidebar input,#hub-project-sidebar .ag-rail-heading')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,left:a.x,end:a.right};});});
  assert.ok(rail.length);for(const r of rail)assert.ok(r.x>=r.left&&r.right<=r.end+1,JSON.stringify(r));
  await p.screenshot({path:`desktop-validation/hub-layout-${w}.png`});
  if(w<=900)await p.getByRole('button',{name:'Toggle Sidebar',exact:true}).click();
  await p.getByRole('checkbox',{name:'Работа на ПК',exact:true}).check();
  await p.getByRole('textbox',{name:'Рабочая папка ПК',exact:true}).fill('C:\\Users\\Test\\Documents\\Проект с длинным названием');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.getByRole('checkbox',{name:'Работа на ПК',exact:true}).uncheck();
  if(await p.locator('.ag-aux-pane').isVisible())await p.getByRole('button',{name:'Панель проекта',exact:true}).click();
  await p.screenshot({path:`desktop-validation/hub-chat-${w}.png`});
  if(w<=900)await p.getByRole('button',{name:'Открыть боковую панель',exact:true}).click();
  await p.getByRole('button',{name:'Настройки',exact:true}).last().click();
  await p.getByRole('tab',{name:'Лимиты',exact:true}).click();await p.locator('.gemini-quota').first().waitFor();
  assert.equal(await p.locator('.gemini-quota').count(),2);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(w<=900)await p.getByRole('button',{name:'Открыть боковую панель',exact:true}).click();
  await p.getByRole('button',{name:'Чат',exact:true}).click();
  await p.locator('.model-trigger').click();await p.getByRole('button',{name:'Gemini Подключён',exact:true}).click();
  await p.getByRole('button',{name:'GPT-6-Astra',exact:true}).count();
  console.log(`PASS ${w}x${h}: bounds, 16px input, long chat titles, drawer, settings, quotas, model selection`);
 }
 assert.deepEqual(errors,[]);
}finally{spawnSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}
