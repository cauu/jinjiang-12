import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { io, gameProxy, type Socket } from './support/game-client.js';
import { createServer as viteServer } from 'vite';
import { createGameServer } from '../server/src/server.js';

const call=(s:Socket,event:string,data:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(4000).emit(event,data,(error:Error|null,result:any)=>error?reject(error):resolve(result)));
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
test('simulated mobile renderer records five minutes with 30 avatars in jinshi',{timeout:430000},async t=>{
 const backend=createGameServer({introMs:0,cardMs:100,countdownMs:100,playMs:360000,protectionMs:360000});const port=await backend.listen();const target=`http://127.0.0.1:${port}`;
 const vite=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(target),'/media':target}}});await vite.listen();const address=vite.httpServer!.address();assert.ok(address&&typeof address!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});const sockets:Array<Socket>=[];
 t.after(async()=>{for(const s of sockets)s.disconnect();await browser.close();await vite.close();await backend.close();});
 async function connect(){const s=io(target,{forceNew:true});sockets.push(s);await new Promise<void>(r=>s.once('connect',()=>r()));return s;}
 const host=await connect();assert.ok((await call(host,'host:attach',{token:backend.game.hostToken})).ok);
 for(let i=0;i<29;i++){const s=await connect();assert.ok((await call(s,'room:join',{roomId:backend.game.roomId,name:`帧率玩家${i+1}`})).ok);}
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});const page=await context.newPage();await page.goto(`http://127.0.0.1:${address.port}/?room=${backend.game.roomId}`);await page.locator('input[name=name]').fill('帧率玩家');await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});
 await page.evaluate(()=>{const samples:number[]=[];let previous=0;const canvas=document.querySelector('#stage canvas')!;canvas.addEventListener('jinjiang:render',()=>{const now=performance.now();const status=document.querySelector('#status');if(status?.getAttribute('data-phase')==='playing'){if(previous)samples.push(now-previous);previous=now;}else previous=0;});(window as any).__fpsSamples=samples;});
 assert.ok((await call(host,'host:start',{})).ok);await page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='playing');
 assert.equal(backend.game.match!.participants.length,30);await wait(305000);
 const metrics=await page.evaluate(()=>({samples:(window as any).__fpsSamples as number[],elapsed:performance.now(),phase:document.querySelector('#status')?.getAttribute('data-phase')}));
 assert.equal(metrics.phase,'playing');const bins:number[]=[];let elapsed=0;for(const duration of metrics.samples){elapsed+=duration;const index=Math.floor(elapsed/1000);bins[index]=(bins[index]??0)+1;}const seconds=Array.from({length:Math.floor(elapsed/1000)},(_,i)=>bins[i]??0);
 const sorted=[...metrics.samples].sort((a,b)=>a-b),percentile=(p:number)=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];const result={environment:'Chrome headless SwiftShader; 844x390; one browser, 29 Socket.IO players',durationMs:metrics.samples.reduce((a,b)=>a+b,0),sampleSeconds:seconds.length,secondsAtLeast30:seconds.filter(x=>x>=30).length,percentAtLeast30:seconds.filter(x=>x>=30).length/seconds.length,frameP50Ms:percentile(.5),frameP95Ms:percentile(.95),stallsOver100Ms:metrics.samples.filter(x=>x>100).length,seconds,frameDurations:metrics.samples,ruleOverrides:{introMs:0,cardMs:100,countdownMs:100,playMs:360000,protectionMs:360000},level:'01-jinshi'};
 writeFileSync(resolve('docs/development/reports/fps-simulator-30-2026-10-28.json'),JSON.stringify(result));t.diagnostic(JSON.stringify({...result,seconds:undefined,frameDurations:undefined}));
 assert.ok(result.durationMs>=300000,`only ${result.durationMs}ms sampled`);assert.ok(result.percentAtLeast30>=.95,`only ${(result.percentAtLeast30*100).toFixed(1)}% seconds at >=30 FPS`);
});
