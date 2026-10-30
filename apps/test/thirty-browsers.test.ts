import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';
import { gameProxy } from './support/game-client.js';

test('30 independent real browser sessions join one room and see the start of a game', {timeout:240000}, async t=>{
 const backend=createGameServer({introMs:0,cardMs:1000,countdownMs:1500,playMs:120000});const port=await backend.listen();
 const proxy={...gameProxy(`http://127.0.0.1:${port}`),'/admin':`http://127.0.0.1:${port}`,'/media':`http://127.0.0.1:${port}`};
 const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy}});await mobile.listen();const ma=mobile.httpServer!.address();assert.ok(ma&&typeof ma!=='string');
 const display=await viteServer({configFile:false,root:resolve('apps/display'),define:{'import.meta.env.VITE_MOBILE_PORT':JSON.stringify(String(ma.port))},server:{host:'127.0.0.1',port:0,proxy}});await display.listen();const da=display.httpServer!.address();assert.ok(da&&typeof da!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
 t.after(async()=>{await browser.close();await display.close();await mobile.close();await backend.close();});
 const host=await browser.newPage({viewport:{width:1200,height:700}});await host.goto(`http://127.0.0.1:${da.port}`);await host.locator('#qr img').waitFor();const url=await host.locator('#joinurl').innerText();
 const sessions:{context:BrowserContext;page:Page}[]=[];
 for(let start=0;start<30;start+=5){const batch=await Promise.all(Array.from({length:5},async(_,offset)=>{const context=await browser.newContext({viewport:{width:844,height:390}}),page=await context.newPage();await page.goto(url);await page.locator('input[name=name]').fill(`玩家${start+offset+1}`);await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden',timeout:30000});return {context,page};}));sessions.push(...batch);}
 await host.waitForFunction(()=>document.querySelector('#count')?.textContent==='30',{timeout:30000});await host.locator('#start').click();
 await Promise.all(sessions.map(({page})=>page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='playing',null,{timeout:60000})));
 await Promise.all(sessions.map(({page})=>page.waitForFunction(()=>document.querySelector('#stage canvas')?.getAttribute('data-model-state')==='ready'&&document.querySelector('#stage canvas')?.getAttribute('data-model-count')==='30',null,{timeout:90000})));
 assert.equal(sessions.length,30);assert.equal((await host.locator('#players > div').count()),30);
 t.diagnostic('30 independent browser contexts joined and loaded all 30 character appearances; this is not a full six-level acceptance run.');
});
