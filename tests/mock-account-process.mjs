import readline from 'node:readline';
const threads=new Map();
const send=x=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...x})+'\n');
const notify=(method,params)=>send({method,params});
const google=process.argv.includes('gemini');
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line),p=m.params||{};let result={};
 if(m.method==='initialize')result={protocolVersion:1,authMethods:[{id:'oauth-personal'}]};
 else if(m.method==='account/read')result={account:{type:'chatgpt',planType:'plus'}};
 else if(m.method==='model/list')result={data:['gpt-6-astra','gpt-6.1-sol'].map(model=>({model,displayName:model,hidden:false}))};
 else if(m.method==='account/rateLimits/read')result={rateLimitsByLimitId:{codex:{primary:{usedPercent:42,windowDurationMins:300,resetsAt:1900000000}}}};
 else if(m.method==='thread/start'){const id=crypto.randomUUID();threads.set(id,p.model);result={thread:{id}};}
 else if(m.method==='turn/start'){const turnId=crypto.randomUUID();result={turn:{id:turnId}};const model=threads.get(p.threadId);setTimeout(()=>{const text='Test reply from '+model+'\n'+p.input[0].text;notify('item/agentMessage/delta',{threadId:p.threadId,delta:text});notify('item/completed',{threadId:p.threadId,item:{type:'agentMessage',phase:'final_answer',text}});notify('turn/completed',{threadId:p.threadId,turn:{id:turnId,status:'completed'}});},100);}
 else if(m.method==='session/new')result={sessionId:crypto.randomUUID(),models:{availableModels:[{modelId:'gemini-4-argon',name:'Gemini 4 Argon'}]}};
 else if(m.method==='session/prompt'){notify('session/update',{sessionId:p.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Test reply from Gemini 4 Argon\n'+p.prompt[0].text}}});result={stopReason:'end_turn',usage:{inputTokens:5,outputTokens:8}};}
 if(m.id!==undefined)send({id:m.id,result});
});
