const original=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=String(input);
 if(!/^https:\/\/(api.openai.com|api.x.ai|generativelanguage.googleapis.com)\//.test(url))return original(input,init);
 const body=JSON.parse(init?.body||"{}");
 if(body.model==="fail" || url.includes("/models/fail:"))return Response.json({error:{message:"Test rate limit"}},{status:429});
 if(url.includes("generateContent"))return Response.json({candidates:[{content:{parts:[{text:"Gemini draft"}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:5,thoughtsTokenCount:3,totalTokenCount:18},modelVersion:"gemini-test"});
 return Response.json({model:"test-model",output:[{content:[{type:"output_text",text:JSON.stringify(body.input)}]}],usage:{input_tokens:10,output_tokens:5}});
};
