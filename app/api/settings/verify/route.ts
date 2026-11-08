import {hasSession} from "@/lib/security";
import {isProviderId,verifyProvider} from "@/lib/providers";
export async function POST(request: Request) {
 if(!await hasSession()) return Response.json({error:"Unauthorized"},{status:401});
 const body=await request.json().catch(()=>null);
 if(!isProviderId(body?.provider)) return Response.json({error:"Unknown provider."},{status:400});
 try { return Response.json(await verifyProvider(body.provider)); }
 catch(e){return Response.json({error:e instanceof Error?e.message:"Connection failed."},{status:400});}
}
