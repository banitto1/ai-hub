import {chromium} from 'playwright';
import {resolve} from 'node:path';
const provider=process.argv[2]||'gemini';
const context=await chromium.launchPersistentContext(resolve('.data/browser-'+provider),{channel:'chrome',headless:false,viewport:null});
const page=context.pages()[0]||await context.newPage();await page.goto(provider==='gemini'?'https://gemini.google.com/app':'https://grok.com/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(4000);console.log((await page.locator('body').innerText()).slice(0,4500));
await context.close();
