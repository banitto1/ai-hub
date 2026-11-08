import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
export function resolveAntigravity(env=process.env,home=homedir(),exists=existsSync,cwd=process.cwd()){
 const candidates=[env.AI_HUB_ANTIGRAVITY_EXE,join(cwd,'vendor','antigravity','agy.exe'),env.LOCALAPPDATA&&join(env.LOCALAPPDATA,'agy','bin','agy.exe'),join(home,'AppData','Local','agy','bin','agy.exe'),env.USERPROFILE&&join(env.USERPROFILE,'AppData','Local','agy','bin','agy.exe')].filter(Boolean);
 return candidates.find(path=>exists(/*turbopackIgnore: true*/ path))||candidates[0];
}
