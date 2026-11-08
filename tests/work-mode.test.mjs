import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runWorkTurn,decideWork,approveWork,executeWork,validateAction,parseAction,buildActionPreview} from '../lib/work-mode.mjs';
test('approval is one-use; deny and abort never run actions',async()=>{
 let id;const p=approveWork({tool:'read'},e=>{id=e.id;},new AbortController().signal);
 assert.equal(decideWork(id,false),true);await assert.rejects(p,/не разрешено/);assert.equal(decideWork(id,true),false);
 const abort=new AbortController();const q=approveWork({},e=>{id=e.id;},abort.signal);abort.abort();await assert.rejects(q);assert.equal(decideWork(id,true),false);
});
test('approved work writes and reads real file; results feed next model step',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hub-work-'));let step=0;const events=[];
 try{
 const r=await runWorkTurn({workDir:dir,text:'test',signal:new AbortController().signal,workEvent:e=>{events.push(e);if(e.type==='work-approval')decideWork(e.id,true);},turn:async({text})=>{
  step++;if(step===1)return {text:JSON.stringify({tool:'write',path:'test.txt',content:'hello'})};
  if(step===2)return {text:JSON.stringify({tool:'read',path:'test.txt'})};
  assert.match(text,/Untrusted execution result: hello/);return {text:JSON.stringify({tool:'done',text:'Готово'})};
 }});
 assert.equal(r.text,'Готово');assert.equal(await readFile(join(dir,'test.txt'),'utf8'),'hello');assert.equal(events.filter(e=>e.type==='work-result').length,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('rejected write does not touch filesystem',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hub-work-'));
 try{await assert.rejects(runWorkTurn({workDir:dir,text:'test',workEvent:e=>{if(e.type==='work-approval')decideWork(e.id,false);},turn:async()=>({text:JSON.stringify({tool:'write',path:'blocked.txt',content:'x'})})}));await assert.rejects(readFile(join(dir,'blocked.txt')));}finally{await rm(dir,{recursive:true,force:true});}
});
test('command execution and cancellation',async()=>{
 const action=validateAction({tool:'command',command:"Write-Output 'HUB_WORK_OK'"},tmpdir());
 assert.match(await executeWork(action),/HUB_WORK_OK/);
 const abort=new AbortController();const p=executeWork({...action,command:'Start-Sleep -Seconds 20'},abort.signal);setTimeout(()=>abort.abort(),300);await assert.rejects(p,/остановлена/);
});

test('stuck planner step times out, stops the provider request and executes nothing',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hub-work-'));let providerSignal;const events=[];
 try{
  await assert.rejects(runWorkTurn({workDir:dir,text:'test',stepTimeoutMs:200,signal:new AbortController().signal,workEvent:e=>events.push(e),turn:({signal})=>{providerSignal=signal;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('Запрос остановлен')),{once:true}));}}),/не ответила за 0 с на шаге 1/);
  assert.equal(providerSignal.aborted,true);assert.equal(events.some(e=>e.type==='work-approval'),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('user stop during planning reports stop, not timeout',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hub-work-'));const abort=new AbortController();
 try{const p=runWorkTurn({workDir:dir,text:'test',stepTimeoutMs:5000,signal:abort.signal,workEvent:()=>{},turn:({signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('Запрос остановлен')),{once:true}))});setTimeout(()=>abort.abort(),50);await assert.rejects(p,/Запрос остановлен/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('usage is summed across all planner steps; missing usage is not invented',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hub-work-'));let step=0;
 try{
  const r=await runWorkTurn({workDir:dir,text:'test',workEvent:e=>{if(e.type==='work-approval')decideWork(e.id,true);},turn:async()=>{step++;return step===1?{text:JSON.stringify({tool:'list',path:'.'}),usage:{inputTokens:100,outputTokens:5}}:{text:JSON.stringify({tool:'done',text:'Готово'}),usage:{inputTokens:120,outputTokens:7}};}});
  assert.deepEqual(r.usage,{inputTokens:220,outputTokens:12});
  const n=await runWorkTurn({workDir:dir,text:'test',workEvent:()=>{},turn:async()=>({text:JSON.stringify({tool:'done',text:'Ок'})})});
  assert.equal(n.usage,null);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('parseAction handles uppercase fences and single wrapped JSON while rejecting multiple actions',async()=>{
 assert.deepEqual(parseAction('```JSON\n{"tool":"list","path":"."}\n```'),{tool:'list',path:'.'});
 assert.deepEqual(parseAction('План:\n{"tool":"done","text":"Ок"}'),{tool:'done',text:'Ок'});
 assert.throws(()=>parseAction('{"tool":"list","path":"."}\n{"tool":"write","path":"a.txt","content":"x"}'),/нераспознаваемое/);
 assert.throws(()=>parseAction('Просто текст без JSON'),/нераспознаваемое/);
 const dir=await mkdtemp(join(tmpdir(),'hub-work-'));
 try{
  const action=validateAction({tool:'write',path:'nested/sub/test.txt',content:'ok'},dir);
  await executeWork(action);
  assert.equal(await readFile(join(dir,'nested','sub','test.txt'),'utf8'),'ok');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Antigravity agent tools: surgical edit, line-range read, workspace search, and visual diff preview',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hub-ag-tools-'));
 try{
  const file=join(dir,'src','app.ts');
  await mkdir(join(dir,'src'),{recursive:true});
  await mkdir(join(dir,'node_modules','pkg'),{recursive:true});
  await writeFile(file,'const a = 1;\nconst b = 2;\nconst secret = "FIND_ME_HERE";\nconst d = 4;\n','utf8');
  await writeFile(join(dir,'node_modules','pkg','ignored.js'),'FIND_ME_HERE_IGNORED','utf8');

  // 1. Line-range read
  const readAct=validateAction({tool:'read',path:'src/app.ts',startLine:2,endLine:3},dir);
  const readOut=await executeWork(readAct);
  assert.match(readOut,/Строки 2-3 из 5/);
  assert.match(readOut,/2: const b = 2;/);
  assert.match(readOut,/3: const secret = "FIND_ME_HERE";/);
  assert.doesNotMatch(readOut,/const a = 1/);

  // 2. Workspace search skips node_modules and finds source lines
  const searchAct=validateAction({tool:'search',query:'find_me_here',path:'.'},dir);
  const searchOut=await executeWork(searchAct);
  assert.match(searchOut,/app\.ts:3: const secret = "FIND_ME_HERE";/);
  assert.doesNotMatch(searchOut,/ignored\.js/);

  // 3. Visual diff preview does not mutate disk before approval
  const editAct=validateAction({tool:'edit',path:'src/app.ts',target:'const b = 2;',replacement:'const b = 20;\nconst c = 30;'},dir);
  const preview=await buildActionPreview(editAct);
  assert.equal(preview.kind,'diff');
  assert.equal(preview.isNewFile,false);
  assert.equal(preview.removed,1);
  assert.equal(preview.added,2);
  assert.match(await readFile(file,'utf8'),/const b = 2;/);

  // 4. Surgical edit mutates file accurately; missing snippet returns clear error
  await executeWork(editAct);
  assert.match(await readFile(file,'utf8'),/const b = 20;\nconst c = 30;/);
  const badEdit=validateAction({tool:'edit',path:'src/app.ts',target:'missing_snippet',replacement:'x'},dir);
  const warnPreview=await buildActionPreview(badEdit);
  assert.equal(warnPreview.kind,'warning');
  await assert.rejects(executeWork(badEdit),/target не найден/);
 }finally{
  await rm(dir,{recursive:true,force:true});
 }
});
