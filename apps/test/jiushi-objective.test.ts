import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { io, gameProxy, type Socket } from './support/game-client.js';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';
const call=(s:Socket,e:string,d:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(4000).emit(e,d,(err:Error|null,r:any)=>err?reject(err):resolve(r)));
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
test('a browser player collects and delivers three grain sacks using actual controls',{timeout:120000},async t=>{
 const backend=createGameServer({introMs:0,cardMs:1500,countdownMs:300,resultMs:60000,transitionMs:60000,windMs:60000,rebirthMs:60000,playMs:120000});const port=await backend.listen();
 const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(`http://127.0.0.1:${port}`),'/media':`http://127.0.0.1:${port}`}}});await mobile.listen();const addr=mobile.httpServer!.address();assert.ok(addr&&typeof addr!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});const host=io(`http://127.0.0.1:${port}`,{forceNew:true}),others=Array.from({length:3},()=>io(`http://127.0.0.1:${port}`,{forceNew:true}));
 t.after(async()=>{host.disconnect();others.forEach(s=>s.disconnect());await browser.close();await mobile.close();await backend.close();});await Promise.all([host,...others].map(s=>new Promise<void>(r=>s.once('connect',()=>r()))));const room=(await call(host,'host:attach',{token:backend.game.hostToken})).data.roomId;for(const [i,s] of others.entries())await call(s,'room:join',{roomId:room,name:`观测玩家${i}`});
 const page=await browser.newPage({viewport:{width:844,height:390}});await page.goto(`http://127.0.0.1:${addr.port}/?room=${room}`);await page.locator('input[name=name]').fill('运粮玩家');await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});const stored=JSON.parse((await page.evaluate(()=>localStorage.getItem('jinjiang-session')))!);const id=stored.playerId;
 await call(host,'host:start',{});
 async function snapshot(){const r=await call(host,'room:snapshot',{});assert.ok(r.ok);return r.data.room;}
 async function skip(){const room=await snapshot(),m=room.match;const r=await call(host,'host:skip',{requestId:crypto.randomUUID(),matchId:m.id,phaseId:m.phaseId});assert.ok(r.ok);}
 for(let i=0;i<4;i++){await skip();await skip();await skip();}
 await page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-level')==='05-jiushi'&&document.querySelector('#status')?.getAttribute('data-phase')==='playing',null,{timeout:10000});
 const keys=['w','a','s','d'];let down=new Set<string>();async function direction(dx:number,dz:number){const next=new Set<string>();if(dx>.25)next.add('d');if(dx<-.25)next.add('a');if(dz>.25)next.add('s');if(dz<-.25)next.add('w');for(const key of keys)if(down.has(key)&&!next.has(key))await page.keyboard.up(key);for(const key of keys)if(next.has(key)&&!down.has(key))await page.keyboard.down(key);down=next;}
 const deadline=Date.now()+90000;let previousScore=0;while(Date.now()<deadline){const roomState=await snapshot(),m=roomState.match,p=roomState.players[id],d=m.level.data,score=d.scores[id].count;if(score>=3)break;if(score>previousScore){await page.waitForFunction(n=>document.querySelector('#info')?.textContent?.includes(`运粮 ${n}/3`),score,{timeout:5000});previousScore=score;}
  const carried=Object.values(d.sacks).find((s:any)=>s.carrierId===id) as {x:number;z:number}|undefined;const pos=p.avatar.position;let target:{x:number;z:number};
  if(carried){const corners=[{x:-8,z:-8},{x:8,z:-8},{x:-8,z:8},{x:8,z:8}];target=corners.sort((a,b)=>Math.hypot(a.x-pos.x,a.z-pos.z)-Math.hypot(b.x-pos.x,b.z-pos.z))[0];}
  else {const available=Object.values(d.sacks).filter((s:any)=>s.carrierId===null) as {x:number;z:number}[];assert.ok(available.length);target=available.sort((a,b)=>Math.hypot(a.x-pos.x,a.z-pos.z)-Math.hypot(b.x-pos.x,b.z-pos.z))[0];}
  const dx=target.x-pos.x,dz=target.z-pos.z;await direction(dx,dz);await wait(140);
 }
 for(const key of down)await page.keyboard.up(key);const final=await snapshot();assert.equal(final.match.level.data.scores[id].count,3);assert.equal(final.players[id].status,'qualified');
});
