import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync,writeFileSync,openSync,existsSync,readdirSync,statSync,unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname,resolve,join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."), data=join(root,".data"), port=3210;
mkdirSync(data,{recursive:true,mode:0o700});
const url="http://127.0.0.1:"+port;
async function ready() {
 try { const r=await fetch(url+"/api/auth",{signal:AbortSignal.timeout(1500)}); return (await r.json()).application==="AI Hub"; } catch { return false; }
}
if(!await ready()) {
 const out=openSync(join(data,"server.log"),"a");
 const child=spawn(process.execPath,[join(root,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,detached:true,windowsHide:true,stdio:["ignore",out,out],env:{...process.env,NEXT_TELEMETRY_DISABLED:"1"}});
 child.unref();
 let started=false;
 for(let i=0;i<60;i++){ if(await ready()){started=true;break;} await delay(500); }
 if(!started) throw new Error("AI Hub did not start. Details: "+join(data,"server.log"));
}
for(const name of readdirSync(data)) if(name.startsWith("launch-") && Date.now()-statSync(join(data,name)).mtimeMs>300000) unlinkSync(join(data,name));
const ticket=randomBytes(32).toString("hex"), hash=createHash("sha256").update(ticket).digest("hex");
writeFileSync(join(data,"launch-"+hash+".json"),JSON.stringify({expiresAt:Date.now()+120000}),{flag:"wx",mode:0o600});
const target=url+"/#launch="+ticket;
if(process.argv.includes("--no-open")) console.log(target);
else {
 const browser=spawn("rundll32.exe",["url.dll,FileProtocolHandler",target],{detached:true,windowsHide:true,stdio:"ignore"});
 browser.unref();
}
