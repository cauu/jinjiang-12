import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { io, gameProxy, type Socket } from './support/game-client.js';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';
const call=(s:Socket,e:string,d:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(3000).emit(e,d,(err:Error|null,r:any)=>err?reject(err):resolve(r)));
test('a player eliminated by falling resumes as spectator after refresh',{timeout:45000},async t=>{
 const backend=createGameServer({levels:['04-shisan'],introMs:0,cardMs:1000,countdownMs:1000,protectionMs:1000,collapseMs:500,playMs:15000});const port=await backend.listen();
 const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(`http://127.0.0.1:${port}`),'/media':`http://127.0.0.1:${port}`}}});await mobile.listen();const addr=mobile.httpServer!.address();assert.ok(addr&&typeof addr!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});const host=io(`http://127.0.0.1:${port}`,{forceNew:true});
 t.after(async()=>{host.disconnect();await browser.close();await mobile.close();await backend.close();});await new Promise<void>(r=>host.once('connect',()=>r()));const room=(await call(host,'host:attach',{token:backend.game.hostToken})).data.roomId;
 const pages=await Promise.all(['在场','淘汰'].map(async name=>{const context=await browser.newContext({viewport:{width:844,height:390}}),page=await context.newPage();await page.goto(`http://127.0.0.1:${addr.port}/?room=${room}`);await page.locator('input[name=name]').fill(name);await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});return page;}));const [survivor,eliminated]=pages;
 await call(host,'host:start',{});await survivor.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='playing');const box=await survivor.locator('#stick').boundingBox();assert.ok(box);await survivor.mouse.move(box.x+50,box.y+50);await survivor.mouse.down();await survivor.mouse.move(box.x+85,box.y+50);
 await eliminated.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-player-status')==='eliminated',null,{timeout:10000});await survivor.mouse.up();const identity=await eliminated.evaluate(()=>localStorage.getItem('jinjiang-session'));await eliminated.reload();await eliminated.locator('#entry').waitFor({state:'hidden'});await eliminated.getByText('观战中',{exact:true}).waitFor();assert.equal(await eliminated.evaluate(()=>localStorage.getItem('jinjiang-session')),identity);assert.equal(await eliminated.locator('#status').getAttribute('data-player-status'),'eliminated');
});
