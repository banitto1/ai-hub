function isLan(address){const p=ipv4(address);return !!p&&(p[0]===10||(p[0]===192&&p[1]===168)||(p[0]===172&&p[1]>=16&&p[1]<=31));}
function ipv4(address){if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(address))return null;const p=address.split('.').map(Number);return p.every(n=>n<=255)?p:null;}
function isTailscale(address){const p=ipv4(address);return !!p&&p[0]===100&&p[1]>=64&&p[1]<=127;}
function listAddresses(interfaces){return Object.entries(interfaces).flatMap(([name,items])=>(items||[]).filter(x=>x.family==='IPv4'&&!x.internal&&(isLan(x.address)||(/tailscale/i.test(name)&&isTailscale(x.address)))).map(x=>({name,address:x.address,remote:/tailscale/i.test(name)&&isTailscale(x.address)}))).sort((a,b)=>Number(b.remote)-Number(a.remote)||Number(b.address.startsWith('192.168.'))-Number(a.address.startsWith('192.168.')));}
module.exports={listAddresses,isTailscale,isLan};
