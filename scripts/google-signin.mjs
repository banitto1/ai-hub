import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const base='http://127.0.0.1:3211';
for(let i=0;i<50;i++){try{if((await fetch(base+'/api/auth')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
const ticket=randomBytes(32).toString('hex');writeFileSync(join('.data','launch-'+createHash('sha256').update(ticket).digest('hex')+'.json'),JSON.stringify({expiresAt:Date.now()+120000}));
const r=await fetch(base+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket})});if(!r.ok)throw Error('Local login failed');const cookie=r.headers.getSetCookie()[0].split(';')[0];
const result=await fetch(base+'/api/accounts',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({provider:'gemini'}),signal:AbortSignal.timeout(190000)});
const data=await result.json();
if(!result.ok)throw Error(data.error);
if(data.authUrl){const url=new URL(data.authUrl);if(url.protocol!=='https:'||url.hostname!=='accounts.google.com')throw Error('Invalid Google authentication URL');const script="Start-Process '"+url.href.replaceAll("'","''")+"'";spawn('powershell.exe',['-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:'ignore'});console.log('Google sign-in opened. Session stays alive inside AI Hub. Enter the new code in Accounts.');}
else console.log('Google sign-in status:',data.connected?'connected':'pending');
