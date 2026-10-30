import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { io, gameProxy, type Socket } from './support/game-client.js';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';
const call=(s:Socket,e:string,d:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(4000).emit(e,d,(err:Error|null,r:any)=>err?reject(err):resolve(r)));
test('a browser player selects the correct lantern area and qualifies',{timeout:60000},async t=>{
 const backend=createGameServer({introMs:0,cardMs:1500,countdownMs:300,resultMs:60000,transitionMs:60000,playMs:60000,quizMs:4200,quizRevealMs:300,quizRestoreMs:300,shuffleQuestions:false});const port=await backend.listen();const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(`http://127.0.0.1:${port}`),'/media':`http://127.0.0.1:${port}`}}});await mobile.listen();const addr=mobile.httpServer!.address();assert.ok(addr&&typeof addr!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});const host=io(`http://127.0.0.1:${port}`,{forceNew:true}),others=Array.from({length:3},()=>io(`http://127.0.0.1:${port}`,{forceNew:true}));
 t.after(async()=>{host.disconnect();others.forEach(s=>s.disconnect());await browser.close();await mobile.close();await backend.close();});await Promise.all([host,...others].map(s=>new Promise<void>(r=>s.once('connect',()=>r()))));const room=(await call(host,'host:attach',{token:backend.game.hostToken})).data.roomId;const otherIds:string[]=[];for(const [i,s] of others.entries())otherIds.push((await call(s,'room:join',{roomId:room,name:`观测玩家${i}`})).data.playerId);
 const page=await browser.newPage({viewport:{width:844,height:390}});await page.goto(`http://127.0.0.1:${addr.port}/?room=${room}`);await page.locator('input[name=name]').fill('答题玩家');await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});const id=JSON.parse((await page.evaluate(()=>localStorage.getItem('jinjiang-session')))! ).playerId;
 let sequence=0;const helper=setInterval(()=>{const m=backend.game.match,p=backend.game.players.get(otherIds[0]);if(m?.phase!=='playing'||m.level.id!=='02-dengshi'||p?.status!=='playing'||!p.avatar)return;const target=[-7,0,7,-7,0][m.level.data.questionIndex],dx=target-p.avatar.position.x;others[0].volatile.emit('input',{matchId:m.id,phaseId:m.phaseId,seq:++sequence,x:Math.abs(dx)>.6?Math.sign(dx):0,z:0,jumpHeld:false,jumpPressSeq:0});},100);t.after(()=>clearInterval(helper));
 await call(host,'host:start',{});async function snapshot(){const r=await call(host,'room:snapshot',{});assert.ok(r.ok);return r.data.room;}async function skip(){const m=(await snapshot()).match;assert.ok((await call(host,'host:skip',{requestId:crypto.randomUUID(),matchId:m.id,phaseId:m.phaseId})).ok);}await skip();await skip();await skip();
 await page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-level')==='02-dengshi'&&document.querySelector('#status')?.getAttribute('data-phase')==='playing');await page.getByText('蜀锦主要与哪座城市有关？',{exact:false}).waitFor();
 // Keep the socket-driven comparison players on a separate lane so physical player collision does not block the browser player's route.
 for(const [i,otherId] of otherIds.entries())backend.game.players.get(otherId)!.avatar!.position.z=3+i;
 async function go(direction:'a'|'d', target:number){await page.keyboard.down(direction);await page.waitForFunction(({direction,target})=>{const x=Number(document.querySelector('#stage canvas')?.getAttribute('data-server-x'));return direction==='a'?x<target:x>target;},{direction,target},{timeout:4000});await page.keyboard.up(direction);}
 await go('a',-4.5);
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('第 2/5 题')&&document.querySelector('#status')?.textContent?.includes('作答'),null,{timeout:7000});
 assert.equal((await snapshot()).match.activeIds.length,4);assert.equal((await snapshot()).players[id].status,'playing');
 await go('d',-3.5);
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('第 3/5 题')&&document.querySelector('#status')?.textContent?.includes('作答'),null,{timeout:7000});await go('d',4.5);
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('第 4/5 题')&&document.querySelector('#status')?.textContent?.includes('作答'),null,{timeout:7000});await go('a',-4.5);
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('第 5/5 题')&&document.querySelector('#status')?.textContent?.includes('作答'),null,{timeout:7000});await go('d',-3.5);
 await page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='result',null,{timeout:7000});
 const state=await snapshot();assert.ok(state.match.results.at(-1).qualifiedIds.includes(id));assert.equal(state.match.results.at(-1).eliminatedIds.length,2);assert.match(await page.locator('#message').innerText(),/晋级/);
});
