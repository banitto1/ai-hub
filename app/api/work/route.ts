import {hasSession} from '@/lib/security';
import {decideWork} from '@/lib/work-mode.mjs';
export const runtime='nodejs';
export async function POST(request:Request){
 if(!await hasSession())return Response.json({error:'Unauthorized'},{status:401});
 const origin=request.headers.get('origin');let originHost='';try{originHost=origin?new URL(origin).host:'';}catch{}
 if(!originHost||originHost!==request.headers.get('host'))return Response.json({error:'Forbidden'},{status:403});
 const b=await request.json().catch(()=>null);
 if(typeof b?.id!=='string'||typeof b?.allow!=='boolean')return Response.json({error:'Некорректное решение'},{status:400});
 return decideWork(b.id,b.allow)?Response.json({ok:true}):Response.json({error:'Запрос истёк или уже обработан'},{status:410});
}
