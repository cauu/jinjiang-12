import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer as viteServer } from 'vite';
import { createGameServer } from '../server/src/server.js';
import { resolve } from 'node:path';
import { gameProxy } from './support/game-client.js';

const chrome=process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('display and two mobile browsers can join, start, move and restore a session', {timeout:90000}, async t=>{
 const backend=createGameServer({introMs:3000,cardMs:1200,countdownMs:800,playMs:120000,protectionMs:5000}); const port=await backend.listen();
 const proxy={...gameProxy(`http://127.0.0.1:${port}`),'/admin':`http://127.0.0.1:${port}`,'/media':`http://127.0.0.1:${port}`};
 const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy}});await mobile.listen();const mAddress=mobile.httpServer!.address();assert.ok(mAddress&&typeof mAddress!=='string');
 const display=await viteServer({configFile:false,root:resolve('apps/display'),define:{'import.meta.env.VITE_MOBILE_PORT':JSON.stringify(String(mAddress.port))},server:{host:'127.0.0.1',port:0,proxy}});await display.listen();const dAddress=display.httpServer!.address();assert.ok(dAddress&&typeof dAddress!=='string');
 const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
 t.after(async()=>{await browser.close();await display.close();await mobile.close();await backend.close();});
 const host=await browser.newPage({viewport:{width:1400,height:900}});await host.goto(`http://127.0.0.1:${dAddress.port}`);await host.locator('#qr img').waitFor();
 const url=await host.locator('#joinurl').innerText();assert.ok(url.includes(`room=${backend.game.roomId}`));
 const ctxA=await browser.newContext({viewport:{width:844,height:390}}),ctxB=await browser.newContext({viewport:{width:844,height:390}});const a=await ctxA.newPage(),b=await ctxB.newPage();
 for(const [page,name] of [[a,'阿青'],[b,'阿云']] as const){await page.goto(url);await page.locator('input[name=name]').fill(name);await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});}
 await host.getByText('阿青',{exact:false}).waitFor();await host.getByText('阿云',{exact:false}).waitFor();await host.locator('#start').click();await host.locator('#message video').waitFor();await a.locator('#message video').waitFor();await host.waitForFunction(()=>{const v=document.querySelector('video');return !!v&&v.currentTime>0;});await a.locator('#stick').waitFor({state:'visible'});await a.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='playing');
 await a.bringToFront();const canvas=a.locator('#stage canvas');await a.waitForFunction(()=>document.querySelector('#stage canvas')?.getAttribute('data-server-x')!==null);
 const stick=await a.locator('#stick').boundingBox();assert.ok(stick);
 // 0.7 stick deflection held ~0.6 s at 5 u/s covers about 2 units, and movement must stop on release.
 for(const [axis,dx,dy] of [['x',35,0],['x',-35,0],['z',0,35],['z',0,-35]] as const){
  const before=Number(await canvas.getAttribute(`data-server-${axis}`));
  await a.mouse.move(stick.x+50,stick.y+50);await a.mouse.down();await a.mouse.move(stick.x+50+dx,stick.y+50+dy);await a.waitForTimeout(600);await a.mouse.up();
  const direction=dx||dy;
  await a.waitForFunction(({axis,before,direction})=>{const c=document.querySelector('#stage canvas');const val=Number(c?.getAttribute(`data-server-${axis}`));const visual=Number(c?.getAttribute(`data-player-${axis}`));return (val-before)*direction>1.2&&(visual-before)*direction>1.2;},{axis,before,direction});
  await a.waitForTimeout(400);const stopped=Number(await canvas.getAttribute(`data-server-${axis}`));await a.waitForTimeout(450);assert.ok(Math.abs(Number(await canvas.getAttribute(`data-server-${axis}`))-stopped)<.15,'player must stop after release');
 }
 await a.locator('#jump').click();await a.waitForFunction(()=>Number(document.querySelector('#stage canvas')?.getAttribute('data-server-y'))>.6);assert.ok(await canvas.count()===1);
 // The same page retains its input counters across matches. Starting again must not replay the old jump.
 const playerId=JSON.parse((await a.evaluate(()=>localStorage.getItem('jinjiang-session')))!).playerId;
 await host.locator('#reset').click();await host.waitForFunction(()=>document.querySelector('#title')?.getAttribute('data-phase')==='lobby');
 await host.locator('#start').click();await a.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='playing');
 await a.waitForTimeout(400);assert.equal(backend.game.inputCursor(playerId).jumpPressSeq,0,'old jump is not sent to a new match');assert.equal(backend.game.players.get(playerId)!.avatar!.grounded,true,'player does not jump without input');
 const identity=await a.evaluate(()=>localStorage.getItem('jinjiang-session'));assert.ok(identity);for(let i=0;i<10;i++){await a.reload();await a.locator('#entry').waitFor({state:'hidden'});await a.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='playing');assert.equal(await a.evaluate(()=>localStorage.getItem('jinjiang-session')),identity);}await host.getByText('阿青',{exact:false}).waitFor();assert.equal(await host.locator('#count').innerText(),'2');
 assert.equal(await host.locator('#error').innerText(),'');
});
