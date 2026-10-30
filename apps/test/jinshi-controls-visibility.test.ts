import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { io, gameProxy, type Socket } from './support/game-client.js';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createGameServer } from '../server/src/server.js';
const call=(s:Socket,event:string,data:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(4000).emit(event,data,(error:Error|null,result:any)=>error?reject(error):resolve(result)));
test('an overlapping player fades the jump control while its touch target remains usable',{timeout:60000},async t=>{
 const backend=createGameServer({introMs:0,cardMs:300,countdownMs:300,playMs:60000});const port=await backend.listen();const vite=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(`http://127.0.0.1:${port}`),'/media':`http://127.0.0.1:${port}`}}});await vite.listen();const address=vite.httpServer!.address();assert.ok(address&&typeof address!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});const host=io(`http://127.0.0.1:${port}`,{forceNew:true}),other=io(`http://127.0.0.1:${port}`,{forceNew:true});t.after(async()=>{host.disconnect();other.disconnect();await browser.close();await vite.close();await backend.close();});
 await Promise.all([host,other].map(s=>new Promise<void>(resolve=>s.once('connect',()=>resolve()))));const room=(await call(host,'host:attach',{token:backend.game.hostToken})).data.roomId;const otherId=(await call(other,'room:join',{roomId:room,name:'近处玩家'})).data.playerId;
 const page=await browser.newPage({viewport:{width:844,height:390}});await page.goto(`http://127.0.0.1:${address.port}/?room=${room}`);await page.locator('input[name=name]').fill('本人');await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});const id=JSON.parse((await page.evaluate(()=>localStorage.getItem('jinjiang-session')))! ).playerId;await call(host,'host:start',{});await page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='playing');
 for(const [pid,x,z] of [[id,0,0],[otherId,3.5,1.5]] as const){const a=backend.game.players.get(pid)!.avatar!;Object.assign(a.position,{x,y:.5,z});Object.assign(a.velocity,{x:0,y:0,z:0});a.grounded=true;}
 await page.waitForFunction(()=>document.querySelector('#jump')?.classList.contains('player-overlap'),null,{timeout:10000});await page.waitForTimeout(250);const opacity=await page.locator('#jump').evaluate(el=>Number(getComputedStyle(el).opacity));assert.ok(opacity<=.4,`overlap opacity ${opacity}`);
 const evidence=process.env.JINSHI_EVIDENCE_DIR;if(evidence){await mkdir(evidence,{recursive:true});await page.screenshot({path:resolve(evidence,'other-player-behind-jump.png')});}
 const box=await page.locator('#jump').boundingBox();assert.ok(box);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();let jumped=false;for(let i=0;i<10;i++){await page.waitForTimeout(50);if(backend.game.players.get(id)!.avatar!.position.y>.6)jumped=true;}await page.mouse.up();assert.ok(jumped,'faded control did not trigger jump');
 const otherAvatar=backend.game.players.get(otherId)!.avatar!;Object.assign(otherAvatar.position,{x:-4,y:.5,z:-5});otherAvatar.grounded=true;await page.waitForFunction(()=>!document.querySelector('#jump')?.classList.contains('player-overlap'),null,{timeout:10000});
});
