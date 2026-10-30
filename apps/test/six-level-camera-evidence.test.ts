import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { io, gameProxy, type Socket } from './support/game-client.js';
import { createServer as viteServer } from 'vite';
import { resolve, join } from 'node:path';
import { mkdir, unlink } from 'node:fs/promises';
import { createGameServer } from '../server/src/server.js';
import { LEVELS } from '../server/src/levels.js';
const call=(s:Socket,e:string,d:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(4000).emit(e,d,(err:Error|null,r:any)=>err?reject(err):resolve(r)));

test('capture six level mobile camera samples', {timeout:180000}, async t=>{
 const destination=process.env.CAMERA_EVIDENCE_DIR;
 if(destination)await mkdir(destination,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});t.after(()=>browser.close());
 for(const level of LEVELS){
  const backend=createGameServer({levels:[level],introMs:0,cardMs:200,countdownMs:1500,playMs:60000});const port=await backend.listen();
  const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(`http://127.0.0.1:${port}`),'/media':`http://127.0.0.1:${port}`}}});await mobile.listen();const address=mobile.httpServer!.address();assert.ok(address&&typeof address!=='string');
  const host=io(`http://127.0.0.1:${port}`,{forceNew:true}),other=io(`http://127.0.0.1:${port}`,{forceNew:true});let context:Awaited<ReturnType<typeof browser.newContext>>|undefined;
  try{
   await Promise.all([host,other].map(s=>new Promise<void>(r=>s.once('connect',()=>r()))));const room=(await call(host,'host:attach',{token:backend.game.hostToken})).data.roomId;assert.ok((await call(other,'room:join',{roomId:room,name:'其他玩家'})).ok);
   context=await browser.newContext({viewport:{width:975,height:450},...(destination?{recordVideo:{dir:destination,size:{width:975,height:450}}}:{})});const page=await context.newPage();await page.goto(`http://127.0.0.1:${address.port}/?room=${room}&cameraMetrics=1`);await page.locator('input[name=name]').fill('镜头玩家');await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});assert.ok((await call(host,'host:start',{})).ok);await page.waitForFunction(id=>document.querySelector('#status')?.getAttribute('data-level')===id&&document.querySelector('#status')?.getAttribute('data-phase')==='playing',level);
   await page.waitForFunction(()=>document.querySelector('#stage canvas')?.hasAttribute('data-player-screen-bounds'));if(destination)await page.screenshot({path:join(destination,`${level}.png`)});
   await page.keyboard.down('w');await page.waitForTimeout(400);await page.keyboard.press('Space');await page.waitForTimeout(900);await page.keyboard.up('w');await page.waitForTimeout(500);
   const video=page.video();await context.close();context=undefined;if(destination&&video){const original=await video.path();await video.saveAs(join(destination,`${level}.webm`));await unlink(original);}
   t.diagnostic(`${level}: exercised desktop browser opening, movement and jump; ${destination?'video and screenshot saved':'no video or screenshot saved'}; this is not full acceptance`);
  }finally{if(context)await context.close();host.disconnect();other.disconnect();await mobile.close();await backend.close();}
 }
});
