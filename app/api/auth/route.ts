import {createSession,clearSession,hasSession,passwordMatches,checkLoginAttempt,registerLoginFailure,clearLoginFailures,consumeLaunchTicket} from "@/lib/security";
export async function GET() {
 return Response.json({authenticated:await hasSession(),configured:true,passwordEnabled:Boolean(process.env.APP_PASSWORD),application:"AI Hub"});
}
export async function POST(request: Request) {
 const origin=request.headers.get("origin");
 if(origin) {
  try {
   const source=new URL(origin), target=new URL(request.url);
   if(source.host!==(request.headers.get('host')||target.host))
    return Response.json({error:"Origin not allowed."},{status:403});
  } catch {return Response.json({error:"Origin not allowed."},{status:403});}
 }
 const body=await request.json().catch(()=>null);
 if(consumeLaunchTicket(body?.ticket)) { await createSession(); return Response.json({authenticated:true}); }
 const attempt=checkLoginAttempt("local");
 if(!attempt.allowed) return Response.json({error:"Too many attempts. Wait 15 minutes."},{status:429});
 if(typeof body?.password!=="string" || body.password.length>256 || !passwordMatches(body.password)) {
  registerLoginFailure("local"); return Response.json({error:"Open the AI Hub desktop shortcut to unlock, or enter your configured password."},{status:401});
 }
 clearLoginFailures("local"); await createSession(); return Response.json({authenticated:true});
}
export async function DELETE() { await clearSession(); return Response.json({authenticated:false}); }
