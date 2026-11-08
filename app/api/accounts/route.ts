import {hasSession} from '@/lib/security';
import {accountStatus,loginAccount} from '@/lib/account-bridge.mjs';
export const runtime='nodejs';
export async function GET(){if(!await hasSession())return Response.json({error:'Unauthorized'},{status:401});return Response.json(await accountStatus());}
export async function POST(request:Request){if(!await hasSession())return Response.json({error:'Unauthorized'},{status:401});const body=await request.json().catch(()=>null);if(!['openai','gemini','grok'].includes(body?.provider))return Response.json({error:'Неизвестный провайдер'},{status:400});try{return Response.json(await loginAccount(body.provider,body.code));}catch(e){return Response.json({error:e instanceof Error?e.message:String(e)},{status:400});}}
