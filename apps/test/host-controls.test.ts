import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { io, gameProxy, type Socket } from './support/game-client.js';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';
const call=(s:Socket,e:string,d:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(3000).emit(e,d,(err:Error|null,r:any)=>err?reject(err):resolve(r)));
test('display can start, skip, finish and reset ten consecutive times', {timeout:60000}, async t=>{
 const backend=createGameServer({introMs:0,cardMs:60000,resultMs:60000,endingMs:60000});const port=await backend.listen();const proxy={...gameProxy(`http://127.0.0.1:${port}`),'/admin':`http://127.0.0.1:${port}`,'/media':`http://127.0.0.1:${port}`};
 const display=await viteServer({configFile:false,root:resolve('apps/display'),server:{host:'127.0.0.1',port:0,proxy}});await display.listen();const addr=display.httpServer!.address();assert.ok(addr&&typeof addr!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});const clients=[io(`http://127.0.0.1:${port}`,{forceNew:true}),io(`http://127.0.0.1:${port}`,{forceNew:true})];
 t.after(async()=>{clients.forEach(s=>s.disconnect());await browser.close();await display.close();await backend.close();});
 await Promise.all(clients.map(s=>new Promise<void>(r=>s.once('connect',()=>r()))));for(const [i,s] of clients.entries())assert.ok((await call(s,'room:join',{roomId:backend.game.roomId,name:`玩家${i}`})).ok);
 const page=await browser.newPage({viewport:{width:1200,height:700}});await page.goto(`http://127.0.0.1:${addr.port}`);await page.locator('#qr img').waitFor();
 for(let i=0;i<10;i++){
  for(const [button,phase] of [['start','card'],['skip','result'],['finish','ending'],['reset','lobby']] as const){await page.locator(`#${button}`).click();await page.waitForFunction(p=>document.querySelector('#title')?.getAttribute('data-phase')===p,phase,{timeout:5000});assert.equal(await page.locator('#error').innerText(),'');}
 }
});
