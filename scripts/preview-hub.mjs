import {_electron as electron} from 'playwright';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const temp=mkdtempSync(join(tmpdir(),'hub-preview-'));
const env={...process.env,AI_HUB_PORT:'3223',AI_HUB_DATA_DIR:join(temp,'data'),AI_HUB_PROFILE_DIR:join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.AI_HUB_TEST_IMPORT;
const app=await electron.launch({executablePath:resolve('win-app/AI Hub.exe'),env,timeout:60000});
try{const p=await app.firstWindow();await p.getByRole('heading',{name:'Один чат. Ваши модели.'}).waitFor({timeout:60000});await p.locator('.model-trigger').filter({hasText:'GPT-6-Astra'}).waitFor({timeout:60000});await p.waitForTimeout(300);const shot=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));writeFileSync('desktop-validation/hub-v3.png',Buffer.from(shot,'base64'));console.log('Native live catalog: Astra 6 available. No generation sent. Screenshot saved.');}finally{await app.close();}
