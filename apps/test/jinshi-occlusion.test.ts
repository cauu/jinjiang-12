import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { io, gameProxy, type Socket } from './support/game-client.js';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createGameServer } from '../server/src/server.js';
const call=(s:Socket,event:string,data:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(4000).emit(event,data,(error:Error|null,result:any)=>error?reject(error):resolve(result)));
test('Jinshi environment does not occlude the player at the centre and eight field edges',{timeout:70000},async t=>{
 const backend=createGameServer({introMs:0,cardMs:300,countdownMs:300,playMs:120000});const port=await backend.listen();
 const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(`http://127.0.0.1:${port}`),'/media':`http://127.0.0.1:${port}`}}});await mobile.listen();const address=mobile.httpServer!.address();assert.ok(address&&typeof address!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
 const host=io(`http://127.0.0.1:${port}`,{forceNew:true}),other=io(`http://127.0.0.1:${port}`,{forceNew:true});t.after(async()=>{host.disconnect();other.disconnect();await browser.close();await mobile.close();await backend.close();});
 await Promise.all([host,other].map(s=>new Promise<void>(resolve=>s.once('connect',()=>resolve()))));const room=(await call(host,'host:attach',{token:backend.game.hostToken})).data.roomId;await call(other,'room:join',{roomId:room,name:'测试同伴'});
 const page=await browser.newPage({viewport:{width:844,height:390}});await page.goto(`http://127.0.0.1:${address.port}/?room=${room}&cameraMetrics=1`);await page.locator('input[name=name]').fill('视线检查');await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});
 const id=JSON.parse((await page.evaluate(()=>localStorage.getItem('jinjiang-session')))! ).playerId as string;await call(host,'host:start',{});await page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='playing');
 const evidence=process.env.JINSHI_EVIDENCE_DIR;if(evidence)await mkdir(evidence,{recursive:true});
 for(const x of [-9,0,9])for(const z of [-9,0,9]){
  const a=backend.game.players.get(id)!.avatar!;Object.assign(a.position,{x,y:.5,z});Object.assign(a.velocity,{x:0,y:0,z:0});a.grounded=true;
  await page.waitForTimeout(1800);const canvas=page.locator('#stage canvas');const hits=JSON.parse((await canvas.getAttribute('data-environment-occlusion'))??'null');const bounds=JSON.parse((await canvas.getAttribute('data-player-with-markers-bounds'))??'null');
  if(evidence)await page.screenshot({path:resolve(evidence,`edge-${x}-${z}.png`)});
  assert.deepEqual(hits,[],`environment covers player at (${x},${z}): ${JSON.stringify(hits)}`);assert.ok(Array.isArray(bounds)&&bounds.every(n=>n>=0&&n<=1),`player clipped at (${x},${z}): ${JSON.stringify(bounds)}`);
 }
 t.diagnostic('Positions were placed on the server for camera sampling; this is not a physical-device visual acceptance.');
});
