import test from 'node:test';import assert from 'node:assert/strict';import {join} from 'node:path';import {resolveAntigravity} from '../lib/antigravity-path.mjs';
test('stale launcher LOCALAPPDATA falls back to actual home',()=>{const actual=join('user-home','AppData','Local','agy','bin','agy.exe');assert.equal(resolveAntigravity({LOCALAPPDATA:'bad'},'user-home',p=>p===actual),actual);});
test('explicit desktop path is preferred',()=>assert.equal(resolveAntigravity({AI_HUB_ANTIGRAVITY_EXE:'official.exe'},'home',p=>p==='official.exe'),'official.exe'));
test('bundled CLI works when installed AppData directory is invisible',()=>{const bundled=join('hub','vendor','antigravity','agy.exe');assert.equal(resolveAntigravity({LOCALAPPDATA:'invisible'},'home',p=>p===bundled,'hub'),bundled);});
