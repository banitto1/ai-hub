import {chromium} from 'playwright';
import {join} from 'node:path';
import {existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const definitions={gemini:{url:'https://gemini.google.com/app',input:'.ql-editor[contenteditable="true"]',name:'Gemini',answer:'model-response .markdown, .model-response-text, model-response'},grok:{url:'https://grok.com/',input:'.tiptap[contenteditable="true"]',name:'Grok',answer:'.message-bubble:not(.bg-surface-user-bubble), [data-message-author-role="assistant"]'}};
const states=globalThis.__aiHubWeb ||= {};
const data=()=>process.env.AI_HUB_DATA_DIR||join(process.cwd(),'.data');
function enabled(provider){return existsSync(join(data(),'web-'+provider+'.json'));}
async function launch(provider){const d=definitions[provider];if(!d)throw Error('Неизвестный сервис');const state=states[provider]||={};if(state.launching)return state.launching;if(state.page&&!state.page.isClosed())return state;state.launching=(async()=>{mkdirSync(data(),{recursive:true});const context=await chromium.launchPersistentContext(join(data(),'browser-'+provider),{channel:'chrome',headless:false,viewport:{width:1200,height:850}});state.context=context;state.page=context.pages()[0]||await context.newPage();context.on('close',()=>{state.page=null;state.context=null;});await state.page.goto(d.url,{waitUntil:'domcontentloaded',timeout:45000});await state.page.locator(d.input).first().waitFor({timeout:30000}).catch(()=>{});return state;})();try{return await state.launching;}finally{state.launching=null;}}
export async function webLogin(provider){mkdirSync(data(),{recursive:true});writeFileSync(join(data(),'web-'+provider+'.json'),JSON.stringify({enabled:true}));const s=await launch(provider);await s.page.bringToFront();return {browserLogin:true};}
async function inspect(provider,s){const p=s.page,d=definitions[provider];const ready=await p.locator(d.input).first().isVisible().catch(()=>false);const login=await p.locator('button:visible,a:visible').filter({hasText:/^(Войти|Sign in|Log in)$/i}).count();const authenticated=ready&&login===0;
 let selected='модель на сайте';if(ready){const button=p.getByRole('button',{name:provider==='gemini'?/Выбор режима|mode selector|Choose mode/i:/^Модель:|^Model:/i}).first();if(await button.count())selected=(await button.innerText()).trim()||selected;}
 return {connected:authenticated,signedIn:authenticated,models:authenticated?[{id:'web-selected',name:d.name+' · '+selected}]:[],limits:null,plan:authenticated?'Аккаунт на официальном сайте':null,error:authenticated?null:'Войдите в '+d.name+' в открытом окне Chrome. Подписка и модель выбираются на официальном сайте.',limitError:'Сайт не предоставляет хабу числовой остаток лимитов. Ограничения сервиса показываются при запросе.',connection:'browser'};
}
export async function webStatus(provider){if(!enabled(provider))return {connected:false,signedIn:false,models:[],limits:null,error:null,connection:'browser'};try{return await inspect(provider,await launch(provider));}catch(e){return {connected:false,models:[],limits:null,error:e.message,connection:'browser'};}}
export async function webTurn({provider,model,text,images=[],emit,signal}){
 if(model!=='web-selected')throw Error('Обновите список моделей: для сайта используется модель, выбранная в его окне.');
 const d=definitions[provider],s=await launch(provider);if(s.busy)throw Error('Сервис уже отвечает в другом чате. Дождитесь завершения.');s.busy=true;
 try{if(signal?.aborted)throw Error('Запрос остановлен');if(!(await inspect(provider,s)).connected)throw Error('Войдите в '+d.name+' в открытом окне Chrome.');
 const p=s.page;await p.goto(d.url,{waitUntil:'domcontentloaded',timeout:45000});const input=p.locator(d.input).first();await input.waitFor({timeout:30000});
 if(images.length){const file=p.locator('input[type="file"]');if(!await file.count())throw Error('Загрузка изображений через этот сайт пока недоступна. Используйте Astra или приложите текстовый документ.');await file.first().setInputFiles(images);await p.waitForTimeout(1500);}
 const answers=p.locator(d.answer),before=await answers.count();await input.fill(text);await input.press('Enter');
 let last='',sameSince=Date.now();const started=Date.now();
 while(Date.now()-started<240000){
  if(signal?.aborted){const stop=p.getByRole('button',{name:/Остановить|Stop response|Stop generating/i}).first();if(await stop.count())await stop.click().catch(()=>{});throw Error('Запрос остановлен');}
  const body=await p.locator('body').innerText();if(/verify you are human|подтвердите.*человек|captcha/i.test(body))throw Error('Сервис запросил проверку. Завершите её вручную в окне Chrome.');
  if(/лимит.*достигнут|достигнут.*лимит|usage limit|message limit|too many requests/i.test(body))throw Error('Сервис сообщил об ограничении запросов. Проверьте сообщение в его окне.');
  if(await answers.count()>before){let result=await answers.last().innerText();result=result.trim();if(result!==last){if(result.startsWith(last))emit(result.slice(last.length));last=result;sameSince=Date.now();}const stop=await p.getByRole('button',{name:/Остановить|Stop response|Stop generating/i}).count();if(last&&!stop&&Date.now()-sameSince>2500)return {text:last,model:d.name+' · сайт',usage:null};}
  await p.waitForTimeout(450);
 }
 throw Error('Сайт не вернул завершённый ответ. Проверьте открытое окно сервиса.');
 }finally{s.busy=false;}
}
