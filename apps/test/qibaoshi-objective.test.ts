import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { io, gameProxy, type Socket } from './support/game-client.js';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';
const call=(s:Socket,e:string,d:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(4000).emit(e,d,(err:Error|null,r:any)=>err?reject(err):resolve(r)));
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
test('a browser player moves to a landed jiaozi and sees the score increase',{timeout:90000},async t=>{
 const backend=createGameServer({introMs:0,cardMs:1500,countdownMs:300,resultMs:60000,transitionMs:60000,playMs:60000});const port=await backend.listen();const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(`http://127.0.0.1:${port}`),'/media':`http://127.0.0.1:${port}`}}});await mobile.listen();const addr=mobile.httpServer!.address();assert.ok(addr&&typeof addr!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});const host=io(`http://127.0.0.1:${port}`,{forceNew:true}),others=Array.from({length:3},()=>io(`http://127.0.0.1:${port}`,{forceNew:true}));
 t.after(async()=>{host.disconnect();others.forEach(s=>s.disconnect());await browser.close();await mobile.close();await backend.close();});await Promise.all([host,...others].map(s=>new Promise<void>(r=>s.once('connect',()=>r()))));const room=(await call(host,'host:attach',{token:backend.game.hostToken})).data.roomId;for(const [i,s] of others.entries())await call(s,'room:join',{roomId:room,name:`观测玩家${i}`});
 const page=await browser.newPage({viewport:{width:844,height:390}});await page.goto(`http://127.0.0.1:${addr.port}/?room=${room}`);await page.locator('input[name=name]').fill('拾取玩家');await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});const id=JSON.parse((await page.evaluate(()=>localStorage.getItem('jinjiang-session')))! ).playerId;
 await call(host,'host:start',{});async function snapshot(){const r=await call(host,'room:snapshot',{});assert.ok(r.ok);return r.data;}async function skip(){const m=(await snapshot()).room.match;assert.ok((await call(host,'host:skip',{requestId:crypto.randomUUID(),matchId:m.id,phaseId:m.phaseId})).ok);}
 for(let i=0;i<2;i++){await skip();await skip();await skip();}
 await page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-level')==='03-qibaoshi'&&document.querySelector('#status')?.getAttribute('data-phase')==='playing',null,{timeout:10000});
 const keys=['w','a','s','d'];let down=new Set<string>();async function direction(dx:number,dz:number){const next=new Set<string>();if(dx>.25)next.add('d');if(dx<-.25)next.add('a');if(dz>.25)next.add('s');if(dz<-.25)next.add('w');for(const key of keys)if(down.has(key)&&!next.has(key))await page.keyboard.up(key);for(const key of keys)if(next.has(key)&&!down.has(key))await page.keyboard.down(key);down=next;}
 const deadline=Date.now()+25000;let score=0;while(Date.now()<deadline){const snap=await snapshot(),state=snap.room,m=state.match,p=state.players[id],data=m.level.data;score=data.scores[id].count;if(score>0)break;const pos=p.avatar.position;const items=(Object.values(data.items) as {x:number;z:number;landsAt:number;expiresAt:number}[]).filter(item=>item.landsAt<=snap.serverTime&&item.expiresAt-snap.serverTime>1000);if(items.length){items.sort((a,b)=>Math.hypot(a.x-pos.x,a.z-pos.z)-Math.hypot(b.x-pos.x,b.z-pos.z));await direction(items[0].x-pos.x,items[0].z-pos.z);}await wait(140);}
 for(const key of down)await page.keyboard.up(key);assert.ok(score>0,'player did not collect an item');await page.waitForFunction(()=>{const match=document.querySelector('#info')?.textContent?.match(/交子 (\d+)/);return !!match&&Number(match[1])>0;},null,{timeout:5000});
});
