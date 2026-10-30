import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { io, gameProxy, type Socket } from './support/game-client.js';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';
import { createNetworkProxy } from '../server/test/support/network-proxy.js';
const call=(s:Socket,e:string,d:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(4000).emit(e,d,(err:Error|null,r:any)=>err?reject(err):resolve(r)));

test('network cuts during all four videos preserve the server timeline and identity',{timeout:150000},async t=>{
 const backend=createGameServer();const port=await backend.listen();const proxy=await createNetworkProxy(port,9876);const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(proxy.urlFor(29)),'/media':`http://127.0.0.1:${port}`}}});await mobile.listen();const addr=mobile.httpServer!.address();assert.ok(addr&&typeof addr!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});const host=io(`http://127.0.0.1:${port}`,{forceNew:true}),other=io(`http://127.0.0.1:${port}`,{forceNew:true});
 t.after(async()=>{host.disconnect();other.disconnect();await browser.close();await mobile.close();await proxy.close();await backend.close();});await Promise.all([host,other].map(s=>new Promise<void>(r=>s.once('connect',()=>r()))));const room=(await call(host,'host:attach',{token:backend.game.hostToken})).data.roomId;assert.ok((await call(other,'room:join',{roomId:room,name:'其他玩家'})).ok);
 const context=await browser.newContext({viewport:{width:844,height:390}}),page=await context.newPage();await page.goto(`http://127.0.0.1:${addr.port}/?room=${room}`);await page.locator('input[name=name]').fill('视频断线玩家');await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});const identity=await page.evaluate(()=>localStorage.getItem('jinjiang-session'));assert.ok(identity);const id=JSON.parse(identity).playerId;
 async function snapshot(){const r=await call(host,'room:snapshot',{});assert.ok(r.ok);return r.data;}async function skip(){const m=(await snapshot()).room.match;assert.ok((await call(host,'host:skip',{requestId:crypto.randomUUID(),matchId:m.id,phaseId:m.phaseId})).ok);}
 async function checkVideo(videoId:string){
  await page.waitForFunction(id=>{const v=document.querySelector('video');return !!v&&v.getAttribute('src')===`/media/${id}_phone.mp4`&&!v.paused&&v.currentTime>.1;},videoId,{timeout:10000});const before=await snapshot();assert.equal(before.room.match.media.id,videoId);assert.equal(before.room.match.media.durationMs,({intro:15000,wind:8000,rebirth:6000,ending:50000} as Record<string,number>)[videoId]);const end=before.room.match.phaseEndsAt,phase=before.room.match.phaseId;
  await context.setOffline(true);proxy.cut(29);await page.getByText('连接中断，正在重连',{exact:true}).waitFor({timeout:5000});await page.waitForTimeout(700);await context.setOffline(false);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent!=='连接中断，正在重连',null,{timeout:10000});assert.equal(await page.evaluate(()=>localStorage.getItem('jinjiang-session')),identity);
  const limit=Date.now()+5000;let restored=await snapshot();while(!restored.room.players[id].connected&&Date.now()<limit){await page.waitForTimeout(100);restored=await snapshot();}assert.equal(restored.room.players[id].connected,true);assert.equal(restored.room.match.phaseId,phase);assert.equal(restored.room.match.phaseEndsAt,end);assert.equal(restored.room.players[id].name,'视频断线玩家');const visible=await page.evaluate(()=>{const v=document.querySelector('video');return !!(v&&v.getBoundingClientRect().width>0&&v.getBoundingClientRect().height>0&&getComputedStyle(v).visibility!=='hidden'&&getComputedStyle(v).display!=='none')||document.querySelector('#message')?.textContent==='过场进行中';});assert.ok(visible,'after recovery the video or fallback should be visible');
  while((await snapshot()).room.match.phaseId===phase)await page.waitForTimeout(100);const after=await snapshot();assert.ok(after.serverTime>=end&&after.serverTime-end<3000,`${videoId} advanced ${after.serverTime-end}ms after deadline`);t.diagnostic(`${videoId} resumed without extending deadline`);
 }
 assert.ok((await call(host,'host:start',{})).ok);await checkVideo('intro');
 for(let i=0;i<2;i++){await skip();await skip();await skip();}
 await skip();await skip();await checkVideo('wind');
 await skip();await skip();await checkVideo('rebirth');
 const m=(await snapshot()).room.match;assert.ok((await call(host,'host:finish',{requestId:crypto.randomUUID(),matchId:m.id,phaseId:m.phaseId})).ok);await checkVideo('ending');await context.close();
});
