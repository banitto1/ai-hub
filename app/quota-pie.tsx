import {geminiSummary} from '../lib/gemini-quotas.mjs';
export function QuotaPie({remaining,lang}:{remaining:number;lang:string}){
 const value=Math.max(0,Math.min(100,remaining)),ru=lang==='ru';
 return <div className="quota-pie" role="img" aria-label={`${ru?'Осталось':'Remaining'} ${value}%, ${ru?'использовано':'used'} ${100-value}%`} style={{background:`conic-gradient(#e4e4e7 0% ${value}%, #232329 ${value}% 100%)`}}><div><strong>{Math.round(value*10)/10}%</strong><small>{ru?'осталось':'remaining'}</small></div></div>;
}
export function GeminiQuotas({report,lang}:{report:string;lang:string}){
 const rows=geminiSummary(report),ru=lang==='ru';
 return <div className="gemini-quota-grid">{rows.map(({kind,quota}:any)=><div className="gemini-quota" key={kind}>{quota?<QuotaPie remaining={quota.remaining} lang={lang}/>:<div className="quota-pie quota-unknown" role="img" aria-label={ru?'Лимит неизвестен':'Unknown quota'}><div><strong>—</strong><small>{ru?'нет данных':'unavailable'}</small></div></div>}<div><strong>{kind==='weekly'?(ru?'Недельный лимит':'Weekly limit'):(ru?'Argon · Недельный лимит':'Argon · Weekly limit')}</strong><p>{quota?(ru?(kind==='argon-weekly'?'Остаток квоты Argon':'Остаток квоты Gemini'):(kind==='argon-weekly'?'Argon quota remaining':'Gemini quota remaining')):(ru?'Antigravity не сообщает этот лимит.':'Antigravity does not report this quota.')}</p>{quota&&<small>{ru?'Обновление':'Resets'}: {quota.reset?new Date(quota.reset).toLocaleString(ru?'ru-RU':'en-US'):'—'}</small>}</div></div>)}</div>;
}
