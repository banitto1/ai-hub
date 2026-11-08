export function geminiQuotas(report='') {
 return report.split(/\r?\n/).flatMap(line=>{
  const [name,window,percent,reset]=line.split('\t').map(s=>s.trim());
  if(!/^Gemini(?:\s|$)/i.test(name||'')||!/^\d+(?:\.\d+)?%$/.test(percent||''))return [];
  const remaining=Number(percent.slice(0,-1));
  if(remaining<0||remaining>100)return [];
  return [{name,window,remaining,reset:reset&&!Number.isNaN(Date.parse(reset))?reset:null}];
 });
}
export function geminiSummary(report=''){
 const rows=geminiQuotas(report);
 return [{kind:'weekly',quota:rows.find(r=>/^Gemini Models$/i.test(r.name)&&/weekly/i.test(r.window))||null},{kind:'argon-weekly',quota:rows.find(r=>/\bArgon\b/i.test(r.name)&&/weekly/i.test(r.window))||null}];
}
