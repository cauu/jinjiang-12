import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { io, gameProxy, type Socket } from './support/game-client.js';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';

const call=(s:Socket,e:string,d:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(3000).emit(e,d,(err:Error|null,r:any)=>err?reject(err):resolve(r)));
test('100 real pointer direction changes give a rendered character response with p95 at most 100ms',{timeout:90000},async t=>{
 const backend=createGameServer({introMs:0,cardMs:200,countdownMs:200,playMs:120000});const port=await backend.listen();
 const vite=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(`http://127.0.0.1:${port}`),'/media':`http://127.0.0.1:${port}`}}});await vite.listen();const address=vite.httpServer!.address();assert.ok(address&&typeof address!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});const host=io(`http://127.0.0.1:${port}`,{forceNew:true}),other=io(`http://127.0.0.1:${port}`,{forceNew:true});
 t.after(async()=>{host.disconnect();other.disconnect();await browser.close();await vite.close();await backend.close();});
 await Promise.all([host,other].map(s=>new Promise<void>(r=>s.once('connect',()=>r()))));const room=(await call(host,'host:attach',{token:backend.game.hostToken})).data.roomId;await call(other,'room:join',{roomId:room,name:'其他玩家'});
 const page=await browser.newPage({viewport:{width:844,height:390}});page.on('pageerror',error=>t.diagnostic(`pageerror: ${error.message}`));await page.goto(`http://127.0.0.1:${address.port}/?room=${room}`);await page.locator('input[name=name]').fill('测试玩家');await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});await call(host,'host:start',{});await page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='playing');
 await page.waitForFunction(()=>{const c=document.querySelector('#stage canvas');return c?.hasAttribute('data-player-x')===true;});
 const stick=await page.locator('#stick').boundingBox();assert.ok(stick);await page.mouse.move(stick.x+50,stick.y+50);await page.mouse.down();const samples:number[]=[];
 for(let i=0;i<100;i++){
  const direction=i%2===0?1:-1;
  await page.evaluate(`(() => { const canvas=document.querySelector('#stage canvas'); let complete; let arrived=false; window.__latency=new Promise(resolve=>complete=resolve); setTimeout(()=>complete(arrived?500:-1),1500); document.addEventListener('pointermove',()=>{arrived=true;const start=performance.now(),before=Number(canvas.dataset.playerX);const check=()=>{if((Number(canvas.dataset.playerX)-before)*${direction}>.0001){canvas.removeEventListener('jinjiang:render',check);complete(performance.now()-start);}else if(performance.now()-start>500){canvas.removeEventListener('jinjiang:render',check);complete(500);}};canvas.addEventListener('jinjiang:render',check);},{once:true}); })()`);
  await page.mouse.move(stick.x+50+direction*35,stick.y+50);const value=await page.evaluate(()=>(window as unknown as {__latency:Promise<number>}).__latency);assert.notEqual(value,-1,`pointer event missing at sample ${i}`);samples.push(value);
 }
 await page.mouse.up();const sorted=[...samples].sort((a,b)=>a-b),p95=sorted[94];t.diagnostic(`100 pointer-to-render samples p95=${p95.toFixed(1)}ms max=${Math.max(...samples).toFixed(1)}ms`);assert.ok(p95<=100,`p95 ${p95}ms > 100ms`);
});
