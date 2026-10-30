import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { io, gameProxy, type Socket } from './support/game-client.js';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';

const call = (socket: Socket, event: string, data: unknown): Promise<any> => new Promise((resolve, reject) => socket.timeout(4000).emit(event, data, (error: Error | null, result: any) => error ? reject(error) : resolve(result)));

test('mobile camera keeps the player framed at three landscape aspect ratios', { timeout: 60000 }, async t => {
 const backend=createGameServer({introMs:0,cardMs:300,countdownMs:300,playMs:60000}); const port=await backend.listen();
 const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(`http://127.0.0.1:${port}`),'/media':`http://127.0.0.1:${port}`}}});await mobile.listen();const address=mobile.httpServer!.address();assert.ok(address&&typeof address!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
 const host=io(`http://127.0.0.1:${port}`,{forceNew:true}),other=io(`http://127.0.0.1:${port}`,{forceNew:true});
 t.after(async()=>{host.disconnect();other.disconnect();await browser.close();await mobile.close();await backend.close();});
 await Promise.all([host,other].map(s=>new Promise<void>(r=>s.once('connect',()=>r()))));const room=(await call(host,'host:attach',{token:backend.game.hostToken})).data.roomId;assert.ok((await call(other,'room:join',{roomId:room,name:'其他玩家'})).ok);
 const page=await browser.newPage({viewport:{width:960,height:540}});await page.goto(`http://127.0.0.1:${address.port}/?room=${room}&cameraMetrics=1`);await page.locator('input[name=name]').fill('镜头玩家');await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});assert.ok((await call(host,'host:start',{})).ok);await page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='playing');
 for(const viewport of [{width:960,height:540},{width:975,height:450},{width:1000,height:450}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(1500);
  const samples=await page.evaluate(`new Promise(resolve=>{let samples=[];function sample(){let c=document.querySelector('#stage canvas');samples.push([Number(c.dataset.playerScreenX),Number(c.dataset.playerScreenY),Number(c.dataset.playerScreenHeight),...JSON.parse(c.dataset.playerWithMarkersBounds)]);if(samples.length<30)requestAnimationFrame(sample);else resolve(samples)}requestAnimationFrame(sample)})`) as number[][];
  for(const [x,y,height,left,top,right,bottom] of samples){assert.ok(x>=.4&&x<=.6,`x=${x} viewport=${viewport.width}`);assert.ok(y>=.5&&y<=.7,`y=${y} viewport=${viewport.width}`);assert.ok(height>=.12&&height<=.22,`height=${height} viewport=${viewport.width}`);assert.ok(left>=0&&top>=0&&right<=1&&bottom<=1,'player and markers must be entirely inside viewport');}
  if(viewport.width===975&&process.env.CAMERA_SCREENSHOT_PATH)await page.screenshot({path:process.env.CAMERA_SCREENSHOT_PATH});
 }
 await page.keyboard.down('d');
 const moving=await page.evaluate(`new Promise(resolve=>{let samples=[];function sample(){let c=document.querySelector('#stage canvas');samples.push([Number(c.dataset.playerScreenX),Number(c.dataset.playerScreenY),Number(c.dataset.playerScreenHeight)]);if(samples.length<60)requestAnimationFrame(sample);else resolve(samples)}requestAnimationFrame(sample)})`) as number[][];
 await page.keyboard.up('d');
 const inFrame=moving.filter(([x,y,height])=>x>=.4&&x<=.6&&y>=.5&&y<=.7&&height>=.12&&height<=.22);
 assert.ok(inFrame.length>=moving.length*.95,`movement framing ${inFrame.length}/${moving.length}`);
});
