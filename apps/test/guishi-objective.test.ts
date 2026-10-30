import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { io, gameProxy, type Socket } from './support/game-client.js';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';
const call=(s:Socket,e:string,d:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(4000).emit(e,d,(err:Error|null,r:any)=>err?reject(err):resolve(r)));
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
test('a browser player can jump up the staircase and claim the goal',{timeout:120000},async t=>{
 const backend=createGameServer({introMs:0,cardMs:1500,countdownMs:300,resultMs:60000,transitionMs:60000,windMs:60000,rebirthMs:60000,playMs:60000});const port=await backend.listen();
 const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(`http://127.0.0.1:${port}`),'/media':`http://127.0.0.1:${port}`}}});await mobile.listen();const addr=mobile.httpServer!.address();assert.ok(addr&&typeof addr!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});const host=io(`http://127.0.0.1:${port}`,{forceNew:true}),others=Array.from({length:3},()=>io(`http://127.0.0.1:${port}`,{forceNew:true}));
 t.after(async()=>{host.disconnect();others.forEach(s=>s.disconnect());await browser.close();await mobile.close();await backend.close();});await Promise.all([host,...others].map(s=>new Promise<void>(r=>s.once('connect',()=>r()))));const room=(await call(host,'host:attach',{token:backend.game.hostToken})).data.roomId;for(const [i,s] of others.entries())await call(s,'room:join',{roomId:room,name:`观测玩家${i}`});
 const page=await browser.newPage({viewport:{width:844,height:390}});await page.goto(`http://127.0.0.1:${addr.port}/?room=${room}`);await page.locator('input[name=name]').fill('登顶玩家');await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});const id=JSON.parse((await page.evaluate(()=>localStorage.getItem('jinjiang-session')))! ).playerId;
 await call(host,'host:start',{});async function snapshot(){const r=await call(host,'room:snapshot',{});assert.ok(r.ok);return r.data.room;}async function skip(){const m=(await snapshot()).match;assert.ok((await call(host,'host:skip',{requestId:crypto.randomUUID(),matchId:m.id,phaseId:m.phaseId})).ok);}
 for(let i=0;i<5;i++){await skip();await skip();await skip();}
 await page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-level')==='06-guishi'&&document.querySelector('#status')?.getAttribute('data-phase')==='playing',null,{timeout:10000});
 const initial=await snapshot(),gaps=initial.match.level.data.gaps as number[],pos=initial.players[id].avatar.position;const columns=Array.from({length:10},(_,i)=>i).filter(c=>[5,10,15].every(row=>!gaps.includes(row*10+c)));const column=columns.sort((a,b)=>Math.abs(a-4.5-pos.x)-Math.abs(b-4.5-pos.x))[0];
 let xKey='';await page.keyboard.down('w');const deadline=Date.now()+30000;let lastJump=0;
 while(Date.now()<deadline){const state=await snapshot(),m=state.match,a=state.players[id].avatar;if(m.championId)break;if(state.players[id].status!=='playing')break;
  const row=Math.floor((10-a.position.z)/1.2),nextGap=[5,10,15].find(r=>r>=row);const safe=column??Array.from({length:10},(_,i)=>i).filter(c=>nextGap===undefined||!gaps.includes(nextGap*10+c)).sort((u,v)=>Math.abs(u-4.5-a.position.x)-Math.abs(v-4.5-a.position.x))[0];const targetX=a.position.z< -9.3?0:safe-4.5,dx=targetX-a.position.x;const next=dx>.25?'d':dx<-.25?'a':'';if(next!==xKey){if(xKey)await page.keyboard.up(xKey);if(next)await page.keyboard.down(next);xKey=next;}
  if(a.grounded&&Date.now()-lastJump>250){await page.keyboard.press('Space');lastJump=Date.now();}await wait(100);
 }
 await page.keyboard.up('w');if(xKey)await page.keyboard.up(xKey);const final=await snapshot();assert.equal(final.match.championId,id,`player did not reach goal; state ${JSON.stringify(final.players[id].avatar)}`);
});
