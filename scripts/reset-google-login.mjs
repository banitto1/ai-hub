import {spawn} from '@lydell/node-pty';
import {executable} from '../lib/antigravity.mjs';
const p=spawn(executable(),[],{name:'xterm-256color',cols:160,rows:40,cwd:process.cwd()+'/.data/google-chat',env:process.env});
let output='';p.onData(s=>{output=(output+s).slice(-20000);});
setTimeout(()=>p.write('/logout\r'),4000);
setTimeout(()=>{console.log(output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/[\w.+-]+@[\w.-]+/g,'[account]').slice(-3500));p.kill();process.exit(0);},9000);
