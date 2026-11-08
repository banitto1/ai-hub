import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {resolve} from 'node:path';
const original=childProcess.spawn;
childProcess.spawn=function(command,args=[],options={}){
 if(String(command).endsWith('codex.exe')&&args.includes('app-server'))return original(process.execPath,[resolve('tests/mock-account-process.mjs'),'codex'],options);
 if(String(command).endsWith('agy.exe'))return original(process.execPath,[resolve('tests/mock-antigravity.mjs'),...args],options);
 if(args.some(x=>String(x).replaceAll('\\','/').endsWith('vendor/cursor/dist-package/index.js'))&&args.includes('acp'))return original(process.execPath,[resolve('tests/mock-account-process.mjs'),'cursor'],options);
 if(args.some(x=>String(x).endsWith('gemini.js'))&&args.includes('--acp'))return original(process.execPath,[resolve('tests/mock-account-process.mjs'),'gemini'],options);
 return original(command,args,options);
};syncBuiltinESMExports();
