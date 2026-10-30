import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../../apps/server/src/server.js';

test('锦市贴图在大厅和关卡中加载，输出手机和大屏预览', {timeout: 60000}, async t => {
 const backend=createGameServer({introMs:0,cardMs:300,countdownMs:300,playMs:60000});
 const port=await backend.listen();
 const proxy={'/socket.io':{target:`http://127.0.0.1:${port}`,ws:true},'/media':`http://127.0.0.1:${port}`,'/admin':`http://127.0.0.1:${port}`};
 const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy}});await mobile.listen();
 const ma=mobile.httpServer!.address();assert.ok(ma&&typeof ma!=='string');
 const display=await viteServer({configFile:false,root:resolve('apps/display'),define:{'import.meta.env.VITE_MOBILE_PORT':JSON.stringify(String(ma.port))},server:{host:'127.0.0.1',port:0,proxy}});await display.listen();
 const da=display.httpServer!.address();assert.ok(da&&typeof da!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
 t.after(async()=>{await browser.close();await display.close();await mobile.close();await backend.close();});
 const screen=await browser.newPage({viewport:{width:1600,height:900}});
 const phone=await browser.newPage({viewport:{width:844,height:390},hasTouch:true});
 const errors:string[]=[];const loaded=new Set<string>();
 for(const page of [screen,phone]){page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('texture-')){if(r.ok())loaded.add(r.url().split('/').pop()!);else errors.push(`texture response ${r.status()}: ${r.url()}`)}});}
 await screen.goto(`http://127.0.0.1:${da.port}/?cameraMetrics=1`);
 await screen.waitForFunction(()=>document.querySelector('#stage canvas')?.getAttribute('data-environment')==='jinshi'&&!!document.querySelector('#qr img'));
 await phone.goto(`http://127.0.0.1:${ma.port}/?room=${backend.game.roomId}&cameraMetrics=1`);
 await phone.locator('input[name=name]').fill('贴图预览');await phone.locator('form button').click();await phone.locator('#entry').waitFor({state:'hidden'});
 await screen.waitForFunction(()=>document.querySelector('#count')?.textContent==='1');
 await phone.waitForTimeout(2000);
 const out=resolve('production/jinshi-mobile-depth-v1');
 await screen.screenshot({path:resolve(out,'大厅-大屏.png')});await phone.screenshot({path:resolve(out,'大厅-手机.png')});
 await screen.locator('#add-bots').click();await screen.waitForFunction(()=>document.querySelector('#count')?.textContent==='10');await screen.locator('#start').click();
 await phone.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-level')==='01-jinshi'&&document.querySelector('#status')?.getAttribute('data-phase')==='playing',null,{timeout:15000});
 await phone.waitForTimeout(2000);
 await screen.screenshot({path:resolve(out,'锦市-大屏.png')});await phone.screenshot({path:resolve(out,'锦市-手机.png')});
 for(const name of ['silk-base','brocade-red','brocade-indigo','aged-wood','linen','roof','bamboo']) assert.ok([...loaded].some(x=>x.includes(name)),`未加载贴图 ${name}: ${[...loaded]}`);
 assert.deepEqual(errors,[]);console.log('贴图响应正常：', [...loaded].sort().join(', '));
});
