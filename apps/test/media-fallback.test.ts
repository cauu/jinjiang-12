import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer as viteServer } from 'vite';
import { createGameServer } from '../server/src/server.js';
import { resolve } from 'node:path';
import { gameProxy } from './support/game-client.js';

test('all four failed videos show fallback on mobile and display and do not stop the timeline', {timeout:90000}, async t=>{
 const backend=createGameServer({introMs:4000,cardMs:60000,countdownMs:600,playMs:10000,resultMs:60000,transitionMs:60000,windMs:4000,rebirthMs:4000,endingMs:4000});const port=await backend.listen();
 const proxy={...gameProxy(`http://127.0.0.1:${port}`),'/admin':`http://127.0.0.1:${port}`,'/media':`http://127.0.0.1:${port}`};
 const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy}});await mobile.listen();const ma=mobile.httpServer!.address();assert.ok(ma&&typeof ma!=='string');
 const display=await viteServer({configFile:false,root:resolve('apps/display'),define:{'import.meta.env.VITE_MOBILE_PORT':JSON.stringify(String(ma.port))},server:{host:'127.0.0.1',port:0,proxy}});await display.listen();const da=display.httpServer!.address();assert.ok(da&&typeof da!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
 t.after(async()=>{await browser.close();await display.close();await mobile.close();await backend.close();});
 const host=await browser.newPage({viewport:{width:1200,height:700}});await host.route('**/media/*.mp4',route=>route.abort());await host.goto(`http://127.0.0.1:${da.port}`);await host.locator('#qr img').waitFor();const url=await host.locator('#joinurl').innerText();
 const sessions=await Promise.all(['甲','乙'].map(async name=>{const ctx=await browser.newContext({viewport:{width:844,height:390}}),page=await ctx.newPage();await page.route('**/media/*.mp4',route=>route.abort());await page.goto(url);await page.locator('input[name=name]').fill(name);await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});return page;}));
 const phase=async(value:string)=>host.waitForFunction(p=>document.querySelector('#title')?.getAttribute('data-phase')===p,value,{timeout:10000});
 const fallback=async()=>{await host.getByText('过场进行中',{exact:true}).waitFor();await sessions[0].getByText('过场进行中',{exact:true}).waitFor();};
 const skip=async()=>host.locator('#skip').click();
 await host.locator('#start').click();await fallback();await phase('card');
 // Skip the first two levels and their regular transitions using the real display controls.
 for(let i=0;i<2;i++){await skip();await phase('result');await skip();await phase('transition');await skip();await phase('card');}
 // Third level leads to wind; fourth level leads to rebirth.
 await skip();await phase('result');await skip();await phase('transition');await fallback();await phase('card');
 await skip();await phase('result');await skip();await phase('transition');await fallback();await phase('card');
 // Finish early to test ending failure without waiting for game rules.
 await host.locator('#finish').click();await phase('ending');await fallback();await phase('finished');
 await Promise.all(sessions.map(page=>page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='finished')));
 assert.match(await host.locator('#message').innerText(),/^冠军：/);
});
