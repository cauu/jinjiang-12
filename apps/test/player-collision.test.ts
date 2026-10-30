import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {io,gameProxy,type Socket} from './support/game-client.js';
import {createServer as viteServer} from 'vite';
import {resolve} from 'node:path';
import {createGameServer} from '../server/src/server.js';
const call=(s:Socket,e:string,d:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(4000).emit(e,d,(err:Error|null,r:any)=>err?reject(err):resolve(r)));
test('two mobile browsers see blocking, then move around each other', {timeout:30000},async t=>{
 const backend=createGameServer({introMs:0,cardMs:0,countdownMs:0,playMs:60000});const port=await backend.listen();
 const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(`http://127.0.0.1:${port}`),'/media':`http://127.0.0.1:${port}`}}});await mobile.listen();const addr=mobile.httpServer!.address();assert.ok(addr&&typeof addr!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});const host=io(`http://127.0.0.1:${port}`,{forceNew:true});
 t.after(async()=>{host.disconnect();await browser.close();await mobile.close();await backend.close();});await new Promise<void>(r=>host.once('connect',()=>r()));const room=(await call(host,'host:attach',{token:backend.game.hostToken})).data.roomId;
 const pages=await Promise.all([browser.newPage({viewport:{width:844,height:390},hasTouch:true}),browser.newPage({viewport:{width:844,height:390},hasTouch:true})]);
 for(const [i,p] of pages.entries()){await p.goto(`http://127.0.0.1:${addr.port}/?room=${room}`);await p.locator('input[name=name]').fill(`碰撞${i}`);await p.locator('form button').click();await p.locator('#entry').waitFor({state:'hidden'});}
 await call(host,'host:start',{});await pages[0].waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='playing');
 const cdp=await pages[0].context().newCDPSession(pages[0]),box=await pages[0].locator('#stick').boundingBox();assert.ok(box);const cx=box.x+box.width/2,cy=box.y+box.height/2;async function drag(dx:number,dy:number,ms:number){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+dx,y:cy+dy,id:1}]});await pages[0].waitForTimeout(ms);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 await drag(40,0,1500);
 const pos=await pages[0].locator('#stage canvas').evaluate(el=>({actual:Number(el.getAttribute('data-server-x')),visual:Number(el.getAttribute('data-player-x'))}));const ids=[...backend.game.match!.activeIds],other=backend.game.players.get(ids[1])!.avatar!.position;
 assert.ok(pos.actual<=other.x-.80,`server ${pos.actual} other ${other.x}`);assert.ok(Math.abs(pos.actual-pos.visual)<.45,`visual ${pos.visual} server ${pos.actual}`);
 await drag(0,40,700);await drag(40,0,1100);
 assert.ok(backend.game.players.get(ids[0])!.avatar!.position.x>other.x+.5,'player can navigate around obstacle');
});
