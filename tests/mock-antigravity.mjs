import readline from 'node:readline';
const args=process.argv.slice(2);
if(args.includes('models'))console.log('gemini-4-argon-high       Gemini 4 Argon (High)');
else if(args.includes('/usage')){if(process.env.AI_HUB_MOCK_ELIGIBILITY){console.error('Eligibility check failed: Your current account is not eligible for Antigravity. To use Antigravity you must be 18 years old or older.');process.exitCode=1;}else console.log('Gemini 4 Argon: 75% remaining');}
else {
 if(!args.includes('ai-hub-chat')||!args.includes('--disable-slash-commands'))throw Error('Missing restricted chat configuration');
 readline.createInterface({input:process.stdin}).on('line',line=>{const input=JSON.parse(line).message.content;if(input==='TEST_ERROR'){console.log(JSON.stringify({event:'result',result:{status:'ERROR',error:'Model quota exceeded'}}));return;}if(input==='TEST_LINGER'){console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:'Linger reply',usage:{input_tokens:2,output_tokens:3}}}));setInterval(()=>{},60000);return;}const text=input.includes('AI Hub computer work planner')?JSON.stringify(input.includes('Approved action:')?{tool:'done',text:'Мобильная работа завершена'}:{tool:'write',path:'mobile-work.txt',content:'MOBILE_WORK_OK'}):'Test reply from Gemini 4 Argon\n'+input;console.log(JSON.stringify({event:'step_update',step_update:{step_type:'agent_response',text_delta:text}}));console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:text,usage:{input_tokens:5,output_tokens:8}}}));});
}
