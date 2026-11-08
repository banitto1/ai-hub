import './mock-accounts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {googleTurn,googleStatus} from '../lib/antigravity.mjs';
process.env.AI_HUB_DATA_DIR=mkdtempSync(join(tmpdir(),'hub-agy-test-'));
test('Antigravity streams text and preserves returned usage',async()=>{let text='';const result=await googleTurn({model:'gemini-4-argon-high',text:'Привет',emit:s=>text+=s});assert.equal(result.text,text);assert.match(text,/Привет/);assert.deepEqual(result.usage,{inputTokens:5,outputTokens:8});});
test('Antigravity reports failed result without substituting a model',async()=>{await assert.rejects(googleTurn({model:'gemini-4-argon-high',text:'TEST_ERROR',emit:()=>{}}),/quota exceeded/);});
test('unsupported images and cancelled requests do not generate',async()=>{await assert.rejects(googleTurn({model:'gemini-4-argon-high',text:'image',images:['x.png'],emit:()=>{}}),/только текст/);const c=new AbortController();c.abort();await assert.rejects(googleTurn({model:'gemini-4-argon-high',text:'cancel',emit:()=>{},signal:c.signal}),/остановлен/);});
test('sign-in does not imply eligibility to send requests',async()=>{process.env.AI_HUB_MOCK_ELIGIBILITY='1';try{const status=await googleStatus();assert.equal(status.signedIn,true);assert.equal(status.connected,false);assert.match(status.error,/18\+/);assert.equal(status.limits,null);}finally{delete process.env.AI_HUB_MOCK_ELIGIBILITY;}});

test('Antigravity completes after result even if child process lingers on stdout',async()=>{
 const t0=Date.now();const result=await googleTurn({model:'gemini-4-argon-high',text:'TEST_LINGER',emit:()=>{},exitGraceMs:150});
 assert.equal(result.text,'Linger reply');assert.ok(Date.now()-t0<4000);
});
