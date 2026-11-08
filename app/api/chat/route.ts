import {readFile} from "node:fs/promises";
import {db,now} from "@/lib/db";
import {hasSession} from "@/lib/security";
import {callProvider,configuredModel,getProviderStatus,isProviderId,type ChatMessage,type ProviderId,type ProviderResult} from "@/lib/providers";
const running=new Set<string>();
type SavedMessage={role:"user"|"assistant";content:string;provider:ProviderId|null;model:string};
export async function POST(request: Request) {
 if(!await hasSession()) return Response.json({error:"Unauthorized"},{status:401});
 const body=await request.json().catch(()=>null);
 const prompt=typeof body?.prompt==="string"?body.prompt.trim():"";
 if(!prompt || prompt.length>20000) return Response.json({error:"Message must contain 1 to 20,000 characters."},{status:400});
 if(!["single","compare","team"].includes(body.mode)) return Response.json({error:"Choose a valid mode."},{status:400});
 if(!Array.isArray(body.providers) || !body.providers.length || body.providers.length>4 || body.providers.some((p: any)=>!isProviderId(p?.provider)))
  return Response.json({error:"Select valid providers."},{status:400});
 const selected=body.providers.map((p: any)=>p.provider) as ProviderId[];
 if(new Set(selected).size!==selected.length || (body.mode==="single" ? selected.length!==1 : selected.length<2))
  return Response.json({error:body.mode==="single"?"Single mode needs exactly one model.":"Compare and team modes need at least two different models."},{status:400});
 const statuses=getProviderStatus();
 if(selected.some(p=>!statuses.find(s=>s.id===p)?.configured)) return Response.json({error:"Configure every selected provider first. Argon is awaiting its API specification."},{status:400});
 let systemPrompt=typeof body.systemPrompt==="string"?body.systemPrompt.slice(0,5000):"You are a helpful assistant. Answer clearly and accurately.";
 let agent: {system_prompt:string;model:string;provider:ProviderId}|undefined;
 if(body.agentId){
  agent=db.prepare("SELECT system_prompt,model,provider FROM agents WHERE id=?").get(String(body.agentId)) as typeof agent;
  if(!agent) return Response.json({error:"Agent not found."},{status:404});
  systemPrompt=agent.system_prompt;
 }
 let attachment="";
 if(body.fileIds!==undefined){
  if(!Array.isArray(body.fileIds)||body.fileIds.length>3) return Response.json({error:"Attach up to three text files."},{status:400});
  for(const id of body.fileIds){
   const file=db.prepare("SELECT name,size_bytes,storage_path FROM files WHERE id=?").get(String(id)) as {name:string;size_bytes:number;storage_path:string}|undefined;
   if(!file || !/\.(txt|md|csv|json|log)$/i.test(file.name) || file.size_bytes>100000) return Response.json({error:"Chat attachments support TXT, MD, CSV, JSON and LOG files up to 100 KB."},{status:400});
   attachment+="\n\n[Attached file: "+file.name+"]\n"+await readFile(file.storage_path,"utf8");
  }
 }
 let chatId=typeof body.chatId==="string"?body.chatId:"";
 if(chatId && !db.prepare("SELECT id FROM chats WHERE id=?").get(chatId)) return Response.json({error:"Chat not found."},{status:404});
 if(chatId && running.has(chatId)) return Response.json({error:"Wait for the current response in this chat."},{status:409});
 if(!chatId){
  chatId=crypto.randomUUID();
  db.prepare("INSERT INTO chats(id,title,mode,created_at,updated_at) VALUES(?,?,?,?,?)").run(chatId,prompt.slice(0,72),body.mode,now(),now());
 }
 running.add(chatId);
 try {
  const history=db.prepare("SELECT role,content,provider,model FROM messages WHERE chat_id=? ORDER BY rowid DESC LIMIT 60").all(chatId).reverse() as SavedMessage[];
  const content=prompt+attachment;
  db.prepare("INSERT INTO messages(id,chat_id,role,content,created_at) VALUES(?,?,?,?,?)").run(crypto.randomUUID(),chatId,"user",content,now());
  db.prepare("UPDATE chats SET title=CASE WHEN title='New chat' THEN ? ELSE title END,mode=?,updated_at=? WHERE id=?").run(prompt.slice(0,72),body.mode,now(),chatId);
  const persist=(provider:ProviderId,content:string,model:string)=>db.prepare("INSERT INTO messages(id,chat_id,role,provider,model,content,created_at) VALUES(?,?,?,?,?,?,?)").run(crypto.randomUUID(),chatId,"assistant",provider,model,content,now());
  const invoke=async(provider:ProviderId,conversation:ChatMessage[],instructions:string)=>{
   const start=Date.now();
   try {
    const result=await callProvider(provider,conversation,instructions,agent?.provider===provider?agent.model:undefined);
    record(chatId,provider,result,Date.now()-start,"success");
    return {provider,ok:true as const,content:result.text,model:result.model};
   } catch(error) {
    const message=error instanceof Error?error.message:"Provider request failed.";
    record(chatId,provider,null,Date.now()-start,"error",message);
    return {provider,ok:false as const,error:message};
   }
  };
  const responses=await Promise.all(selected.map((provider,index)=>{
   const prior=history.filter(m=>m.role==="user" || (m.provider===provider && m.model!=="error")).slice(-30).map(({role,content})=>({role,content}));
   const role=body.mode==="team" ? "\nTeam role: "+(["Propose a concrete solution.","Review assumptions and identify weaknesses.","Offer an alternative approach."][index%3]) : "";
   return invoke(provider,[...prior,{role:"user",content}],systemPrompt+role);
  }));
  for(const r of responses) persist(r.provider,r.ok?r.content:"Request failed: "+r.error,r.ok?r.model:"error");
  let synthesis:{provider:ProviderId;content:string}|null=null, synthesisError:string|null=null;
  if(body.mode==="team"){
   const completed=responses.filter(r=>r.ok);
   if(completed.length>=2){
    const judge=completed.find(r=>r.provider==="openai")?.provider || completed[0].provider;
    const notes=completed.map(r=>r.provider+":\n"+r.content).join("\n\n");
    const prior=history.filter(m=>m.role==="user").slice(-10).map(({role,content})=>({role,content}));
    const result=await invoke(judge,[...prior,{role:"user",content:content+"\n\nIndependent team responses:\n"+notes+"\n\nSynthesize a final answer. Address disagreements and state uncertainty."}],systemPrompt);
    if(result.ok){synthesis={provider:judge,content:result.content};persist(judge,result.content,"team synthesis");}
    else {synthesisError=result.error;persist(judge,"Team synthesis failed: "+result.error,"error");}
   } else synthesisError="Fewer than two providers responded; synthesis was skipped.";
  }
  db.prepare("UPDATE chats SET updated_at=? WHERE id=?").run(now(),chatId);
  return Response.json({chatId,responses,synthesis,synthesisError,partial:responses.some(r=>!r.ok)||Boolean(synthesisError)});
 } finally {running.delete(chatId);}
}
function record(chatId:string,provider:ProviderId,result:ProviderResult|null,latency:number,status:string,error:string|null=null){
 db.prepare("INSERT INTO usage_logs(id,chat_id,provider,model,input_tokens,output_tokens,latency_ms,status,error,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(crypto.randomUUID(),chatId,provider,result?.model||configuredModel(provider),result?.inputTokens??null,result?.outputTokens??null,latency,status,error,now());
}
