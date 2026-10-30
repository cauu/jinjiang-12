import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { io, gameProxy, type Socket } from './support/game-client.js';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';
const call=(s:Socket,event:string,data:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(4000).emit(event,data,(error:Error|null,result:any)=>error?reject(error):resolve(result)));
test('three ordinary jumps each produce a local jump and authoritative landing cue',{timeout:60000},async t=>{
 const backend=createGameServer({introMs:0,cardMs:300,countdownMs:300,playMs:60000});const port=await backend.listen();
 const vite=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(`http://127.0.0.1:${port}`),'/media':`http://127.0.0.1:${port}`}}});await vite.listen();const address=vite.httpServer!.address();assert.ok(address&&typeof address!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});const host=io(`http://127.0.0.1:${port}`,{forceNew:true}),other=io(`http://127.0.0.1:${port}`,{forceNew:true});
 t.after(async()=>{host.disconnect();other.disconnect();await browser.close();await vite.close();await backend.close();});await Promise.all([host,other].map(s=>new Promise<void>(resolve=>s.once('connect',()=>resolve()))));const room=(await call(host,'host:attach',{token:backend.game.hostToken})).data.roomId;await call(other,'room:join',{roomId:room,name:'同伴'});
 const page=await browser.newPage({viewport:{width:844,height:390}});await page.addInitScript(()=>{const store=window as any;store.__played=[];const original=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){const src=this.currentSrc||this.src;const p=original.call(this);void p.then(()=>store.__played.push(src),()=>{});return p;};});
 await page.goto(`http://127.0.0.1:${address.port}/?room=${room}`);await page.locator('input[name=name]').fill('声音检查');await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});const id=JSON.parse((await page.evaluate(()=>localStorage.getItem('jinjiang-session')))! ).playerId;await call(host,'host:start',{});await page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='playing');await page.waitForTimeout(1200);
 for(let i=1;i<=3;i++){
  assert.ok(backend.game.players.get(id)!.avatar!.grounded);await page.keyboard.press(' ',{delay:100});
  await page.waitForFunction(n=>((window as any).__jjAudio as string[]|undefined??[]).filter(v=>v==='jump').length>=n,i,{timeout:5000});
  await page.waitForFunction(n=>((window as any).__jjAudio as string[]|undefined??[]).filter(v=>v==='land').length>=n,i,{timeout:5000});
  // The landing cue comes from local prediction, so it may lead the server by about one round trip.
  const until=Date.now()+1000;while(!backend.game.players.get(id)!.avatar!.grounded&&Date.now()<until)await page.waitForTimeout(20);
  assert.ok(backend.game.players.get(id)!.avatar!.grounded);
 }
});
