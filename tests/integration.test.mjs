import {test} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtemp,writeFile,rm,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {createHash,randomBytes} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
test("production API: launch auth, revoked sessions, encrypted keys, team accounting and trusted history",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"aihub-test-")),port=3197,base="http://127.0.0.1:"+port;
 const child=spawn(process.execPath,["--import",pathToFileURL(resolve("tests/mock-providers.mjs")).href,resolve("node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env,AI_HUB_DATA_DIR:dir},stdio:"ignore",windowsHide:true});
 let cookie="";
 const req=async(p,body,method)=>{const r=await fetch(base+p,{method:method||(body?"POST":"GET"),headers:{"Content-Type":"application/json",Cookie:cookie,Origin:base},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),headers:r.headers};};
 try{
  for(let i=0;i<80;i++){try{if((await fetch(base)).ok)break;}catch{}await delay(250);}
  assert.equal((await req("/api/settings")).status,401);
  const ticket=randomBytes(32).toString("hex");
  await writeFile(join(dir,"launch-"+createHash("sha256").update(ticket).digest("hex")+".json"),JSON.stringify({expiresAt:Date.now()+60000}));
  const login=await req("/api/auth",{ticket});assert.equal(login.status,200);
  cookie=login.headers.getSetCookie()[0].split(";")[0];
  assert.equal((await req("/api/auth",{ticket})).status,401,"launch ticket is single-use");
  for(const provider of ["openai","gemini"])assert.equal((await req("/api/settings",{provider,apiKey:"dummy-key-for-testing",model:"test"})).status,200);
  assert.ok(!(JSON.stringify((await req("/api/settings")).body)).includes("dummy-key"));
  assert.ok(!(await readFile(join(dir,"ai-hub.sqlite"))).includes(Buffer.from("dummy-key")));
  assert.equal((await req("/api/chat",{prompt:"Hello",mode:"single",providers:[{provider:"openai"},{provider:"gemini"}]})).status,400);
  const chat=await req("/api/chat",{prompt:"Remember blue",mode:"team",providers:[{provider:"openai"},{provider:"gemini"}]});
  assert.equal(chat.status,200);assert.ok(chat.body.synthesis);
  const usage=(await req("/api/usage")).body;
  assert.equal(usage.summary.requests,3);assert.equal(usage.summary.inputTokens,30);assert.equal(usage.summary.outputTokens,18);
  const follow=await req("/api/chat",{chatId:chat.body.chatId,prompt:"Which colour?",mode:"single",providers:[{provider:"openai"}],messages:[{role:"user",content:"FAKE CLIENT HISTORY"}]});
  assert.ok(follow.body.responses[0].content.includes("Remember blue"));
  assert.ok(!follow.body.responses[0].content.includes("FAKE CLIENT HISTORY"));
  await req("/api/settings",{provider:"gemini",apiKey:"dummy-key-for-testing",model:"fail"});
  const partial=await req("/api/chat",{prompt:"Failure test",mode:"team",providers:[{provider:"openai"},{provider:"gemini"}]});
  assert.equal(partial.body.partial,true);assert.equal(partial.body.synthesis,null);assert.ok(partial.body.synthesisError);
  assert.equal((await req("/api/usage")).body.summary.requests,6);
  const task=await req("/api/tasks",{title:"Integration task"});
  assert.equal((await req("/api/tasks/"+task.body.id,{done:true},"PATCH")).status,200);
  assert.equal((await req("/api/tasks")).body.tasks[0].done,1);
  await req("/api/auth",undefined,"DELETE");
  assert.equal((await req("/api/settings")).status,401,"old cookie revoked server-side");
 } finally {
  child.kill();await delay(600);await rm(dir,{recursive:true,force:true,maxRetries:4,retryDelay:500});
 }
});
