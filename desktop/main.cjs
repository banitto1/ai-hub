const { app, BrowserWindow, ipcMain, Menu, shell, session, dialog, nativeTheme, screen } = require('electron');
const { spawn } = require('node:child_process');
const { join, resolve } = require('node:path');
const { mkdirSync, writeFileSync, openSync, existsSync } = require('node:fs');
const { randomBytes, createHash } = require('node:crypto');
const net = require('node:net');
const mobile=require('./mobile.cjs');
const services = Object.freeze({chatgpt:'https://chatgpt.com/',gemini:'https://gemini.google.com/app',grok:'https://grok.com/'});
const root = existsSync(join(__dirname,'../../app/page.tsx')) ? resolve(__dirname,'../..') : resolve(__dirname,'..');
let main, server, origin;
const windows = new Map();
app.setName('AI Hub');
app.setPath('userData',process.env.AI_HUB_PROFILE_DIR||join(app.getPath('appData'),'AI Hub'));
app.setAppUserModelId('local.ai-hub.desktop');
if (!app.requestSingleInstanceLock()) app.quit();
else {
app.on('second-instance',()=>{if(main){main.restore();main.show();main.focus();}});
app.whenReady().then(start).catch(error=>{dialog.showErrorBox('AI Hub',error.message);app.quit();});
}
app.on('before-quit',()=>{mobile.stop();for(const win of BrowserWindow.getAllWindows())if(win!==main)win.destroy();if(server?.pid)spawn('taskkill.exe',['/PID',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});});
app.on('window-all-closed',()=>app.quit());
function trusted(event) {
  if (!main || event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error('Untrusted caller');
}
function serviceURL(id) { if(!Object.hasOwn(services,id)) throw new Error('Unknown service'); return services[id]; }
function secureRemote(win) {
  win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('https://'))event.preventDefault();});
  win.webContents.setWindowOpenHandler(({url})=> url.startsWith('https://') ? {action:'allow',overrideBrowserWindowOptions:{autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}}} : {action:'deny'});
  win.webContents.on('did-create-window',child=>secureRemote(child));
}
async function start() {
  nativeTheme.themeSource='dark';
  Menu.setApplicationMenu(null);
  // Stable local origin preserves renderer preferences and drafts between launches.
  const requestedPort=Number(process.env.AI_HUB_PORT||3211);
  if(!Number.isInteger(requestedPort)||requestedPort<1024||requestedPort>65535)throw new Error('Invalid local port');
  const port = await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(new Error('Порт '+requestedPort+' занят. Закройте другой экземпляр AI Hub.')));s.listen(requestedPort,'127.0.0.1',()=>{s.close(()=>resolve(requestedPort));});});
  origin='http://127.0.0.1:'+port;
  const data=process.env.AI_HUB_DATA_DIR||join(root,'.data'); mkdirSync(data,{recursive:true});
  const node=existsSync(join(root,'win-app/node.exe'))?join(root,'win-app/node.exe'):join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe');
  const log=openSync(join(data,'desktop-server.log'),'a');
  const serverEnv={...process.env,AI_HUB_DATA_DIR:data,NEXT_TELEMETRY_DISABLED:'1'};
  const agyPath=[process.env.AI_HUB_ANTIGRAVITY_EXE,join(root,'vendor','antigravity','agy.exe'),join(app.getPath('home'),'AppData','Local','agy','bin','agy.exe'),process.env.LOCALAPPDATA&&join(process.env.LOCALAPPDATA,'agy','bin','agy.exe')].find(p=>p&&existsSync(p));
  if(agyPath)serverEnv.AI_HUB_ANTIGRAVITY_EXE=agyPath;
  if(process.env.AI_HUB_TEST_IMPORT&&process.env.AI_HUB_PROFILE_DIR&&process.env.AI_HUB_DATA_DIR)serverEnv.NODE_OPTIONS='--import '+process.env.AI_HUB_TEST_IMPORT;
  server=spawn(node,[join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:root,windowsHide:true,stdio:['ignore',log,log],env:serverEnv});
  let failure;server.on('error',e=>failure=e);server.on('exit',code=>{if(code)failure=new Error('Local server exited: '+code);});
  let ready=false;
  for(let i=0;i<120;i++){if(failure)throw failure;try{const r=await fetch(origin+'/api/auth');if((await r.json()).application==='AI Hub'){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
  if(!ready)throw new Error('Не удалось запустить AI Hub. Журнал: .data/desktop-server.log');
  const ticket=randomBytes(32).toString('hex');
  writeFileSync(join(data,'launch-'+createHash('sha256').update(ticket).digest('hex')+'.json'),JSON.stringify({expiresAt:Date.now()+120000}),{flag:'wx',mode:0o600});
  const area=screen.getPrimaryDisplay().workAreaSize;
  const icon=existsSync(join(__dirname,'icon.ico'))?join(__dirname,'icon.ico'):undefined;
  main=new BrowserWindow({width:Math.min(1500,area.width),height:Math.min(1000,area.height),minWidth:Math.min(1000,area.width),minHeight:Math.min(700,area.height),show:false,title:'Hub',titleBarStyle:'hidden',titleBarOverlay:{color:'#1c1c1c',symbolColor:'#cccccc',height:30},icon,backgroundColor:'#09090b',autoHideMenuBar:true,webPreferences:{preload:join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,partition:'persist:workspace'}});
  main.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
  main.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  main.on('closed',()=>{main=null;app.quit();});
  main.once('ready-to-show',()=>{main.show();main.focus();});
  ipcMain.handle('work:pick-directory',async(event)=>{
    trusted(event);
    const r=await dialog.showOpenDialog(main,{title:'Выберите рабочую папку ПК',properties:['openDirectory']});
    return r.canceled?null:r.filePaths[0]||null;
  });
  ipcMain.handle('account:google-login',async(event)=>{
    trusted(event);
    const agy=agyPath||join(app.getPath('home'),'AppData','Local','agy','bin','agy.exe');
    if(!existsSync(agy))throw new Error('Antigravity не установлен');
    const cwd=join(data,'google-chat');mkdirSync(cwd,{recursive:true});
    const script=join(data,'google-signin.ps1');
    const quote=s=>"'"+s.replaceAll("'","''")+"'";
    writeFileSync(script,'Start-Process -FilePath '+quote(agy)+' -WorkingDirectory '+quote(cwd));
    // This terminal is the official interactive Google sign-in flow.
    await new Promise((resolve,reject)=>{const p=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{windowsHide:true,stdio:'ignore'});p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(new Error('Не удалось открыть вход Google')));});
  });
  ipcMain.handle('phone:pair',async(event,host)=>{trusted(event);return mobile.pair({data,port,host});});
  ipcMain.handle('phone:stop',event=>{trusted(event);mobile.stop();});
  ipcMain.handle('account:open-auth',async(event,value)=>{trusted(event);const url=new URL(value);if(url.protocol!=='https:'||!['auth.openai.com','chatgpt.com','accounts.google.com','cursor.com','grok.com','x.com','twitter.com'].includes(url.hostname)||url.username||url.password)throw new Error('Invalid authentication URL');await shell.openExternal(url.href);});
  ipcMain.handle('service:open',async(event,id,external)=>{
    trusted(event);const url=serviceURL(id);
    if(external===true){await shell.openExternal(url);return;}
    if(windows.has(id)){windows.get(id).show();windows.get(id).focus();return;}
    const isolated=session.fromPartition('persist:service-'+id);
    isolated.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    const win=new BrowserWindow({width:Math.min(1380,area.width),height:Math.min(920,area.height),minWidth:800,minHeight:600,title:'AI Hub · '+id,backgroundColor:'#15191c',autoHideMenuBar:true,webPreferences:{session:isolated,nodeIntegration:false,contextIsolation:true,sandbox:true}});
    windows.set(id,win);secureRemote(win);
    win.on('closed',()=>windows.delete(id));
    try{await win.loadURL(url);}catch(error){win.close();throw new Error('Не удалось загрузить сервис. Проверьте интернет или используйте вход через браузер.');}
  });
  ipcMain.handle('service:clear',async(event,id)=>{trusted(event);serviceURL(id);const isolated=session.fromPartition('persist:service-'+id);for(const win of BrowserWindow.getAllWindows())if(win.webContents.session===isolated)win.destroy();await isolated.clearStorageData();await isolated.clearCache();});
  ipcMain.handle('app:window-action',(event,action)=>{trusted(event);if(action==='minimize')main.minimize();if(action==='maximize'){main.isMaximized()?main.unmaximize():main.maximize();}});
  ipcMain.handle('app:zoom',(event,value)=>{trusted(event);if(![1,1.1,1.2,1.3].includes(value))throw new Error('Invalid zoom');main.webContents.setZoomFactor(value);});
  await main.loadURL(origin+'/#launch='+ticket);
}
