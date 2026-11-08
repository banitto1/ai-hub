const https=require('node:https'),http=require('node:http');
const {networkInterfaces}=require('node:os');
const {join}=require('node:path');
const {existsSync,readFileSync,writeFileSync}=require('node:fs');
const {randomBytes,createHash,X509Certificate}=require('node:crypto');
const forge=require('node-forge');
const QRCode=require('qrcode');
let server;
function addresses(){return require('./mobile-addresses.cjs').listAddresses(networkInterfaces());}
function credentials(data){const file=join(data,'mobile-tls.json');if(existsSync(file))return JSON.parse(readFileSync(file,'utf8'));const keys=forge.pki.rsa.generateKeyPair(2048),cert=forge.pki.createCertificate();cert.publicKey=keys.publicKey;cert.serialNumber='01'+randomBytes(15).toString('hex');cert.validity.notBefore=new Date(Date.now()-60000);cert.validity.notAfter=new Date(Date.now()+3650*86400000);const attrs=[{name:'commonName',value:'AI Hub local phone connection'}];cert.setSubject(attrs);cert.setIssuer(attrs);cert.setExtensions([{name:'basicConstraints',cA:false},{name:'keyUsage',digitalSignature:true,keyEncipherment:true},{name:'extKeyUsage',serverAuth:true}]);cert.sign(keys.privateKey,forge.md.sha256.create());const value={key:forge.pki.privateKeyToPem(keys.privateKey),cert:forge.pki.certificateToPem(cert)};writeFileSync(file,JSON.stringify(value),{mode:0o600});return value;}
async function pair({data,port,host}){
 const ips=addresses();if(!ips.length)throw Error('Подключите компьютер к Wi-Fi или войдите в Tailscale.');
 const selected=ips.find(x=>x.address===host)||ips[0],tls=credentials(data);
 if(!server){server=https.createServer({...tls,minVersion:'TLSv1.2'},(req,res)=>{
   const allowed=addresses().some(x=>req.headers.host===x.address+':3443');
   if(!allowed){res.writeHead(403);res.end();return;}
   if(!['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(req.method)){res.writeHead(405);res.end();return;}
   if(req.headers.origin){try{if(new URL(req.headers.origin).origin!=='https://'+req.headers.host)throw Error();}catch{res.writeHead(403);res.end();return;}}
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
   const headers={...req.headers,'x-forwarded-proto':'https'};delete headers['x-forwarded-host'];
   const proxy=http.request({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers},upstream=>{const out={...upstream.headers};if(out['set-cookie'])out['set-cookie']=out['set-cookie'].map(c=>c+'; Secure');res.writeHead(upstream.statusCode,out);upstream.pipe(res);});
   proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('AI Hub unavailable');});req.on('aborted',()=>proxy.destroy());req.pipe(proxy);
 });server.on('clientError',(_e,s)=>s.destroy());try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3443,'0.0.0.0',resolve);});}catch(e){server.close();server=null;throw e;}}
 const ticket=randomBytes(32).toString('hex'),expiresAt=Date.now()+600000;
 writeFileSync(join(data,'launch-'+createHash('sha256').update(ticket).digest('hex')+'.json'),JSON.stringify({expiresAt}),{flag:'wx',mode:0o600});
 const fingerprint=createHash('sha256').update(new X509Certificate(tls.cert).raw).digest('hex');
 const candidates=ips.map(x=>'https://'+x.address+':3443');
 const code='aihub://pair?data='+Buffer.from(JSON.stringify({url:'https://'+selected.address+':3443',candidates,ticket,fingerprint})).toString('base64url');
 return {code,qr:await QRCode.toDataURL(code,{width:360,margin:2,color:{dark:'#09090b',light:'#fafafa'}}),expiresAt,addresses:ips,host:selected.address};
}
function stop(){server?.closeAllConnections();server?.close();server=null;}
module.exports={pair,stop};
