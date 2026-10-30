import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { io, gameProxy, type Socket } from './support/game-client.js';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';

const call=(socket:Socket,event:string,data:unknown):Promise<any>=>new Promise((resolve,reject)=>socket.timeout(4000).emit(event,data,(error:Error|null,result:any)=>error?reject(error):resolve(result)));

test('a mobile player can reverse after reaching the left edge in Jinshi', { timeout: 45000 }, async t => {
 const backend=createGameServer({introMs:0,cardMs:300,countdownMs:300,playMs:60000});
 const port=await backend.listen();
 const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(`http://127.0.0.1:${port}`),'/media':`http://127.0.0.1:${port}`}}});await mobile.listen();
 const addr=mobile.httpServer!.address();assert.ok(addr&&typeof addr!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
 const host=io(`http://127.0.0.1:${port}`,{forceNew:true}),other=io(`http://127.0.0.1:${port}`,{forceNew:true});
 t.after(async()=>{host.disconnect();other.disconnect();await browser.close();await mobile.close();await backend.close();});
 await Promise.all([host,other].map(s=>new Promise<void>(r=>s.once('connect',()=>r()))));
 const room=(await call(host,'host:attach',{token:backend.game.hostToken})).data.roomId;
 assert.ok((await call(other,'room:join',{roomId:room,name:'参考玩家'})).ok);
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true});const page=await context.newPage();
 await page.goto(`http://127.0.0.1:${addr.port}/?room=${room}`);await page.locator('input[name=name]').fill('边界测试');await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});
 const id=JSON.parse((await page.evaluate(()=>localStorage.getItem('jinjiang-session')))! ).playerId as string;
 assert.ok((await call(host,'host:start',{})).ok);await page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='playing');
 const player=backend.game.players.get(id)!.avatar!;Object.assign(player.position,{x:-8.4,y:.5,z:-6.3});Object.assign(player.velocity,{x:0,y:0,z:0});
 await page.waitForTimeout(700);const box=await page.locator('#stick').boundingBox();assert.ok(box);const cx=box.x+box.width/2,cy=box.y+box.height/2;const cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-42,y:cy,id:1}]});
 await page.waitForFunction(()=>Number(document.querySelector('#stage canvas')?.getAttribute('data-server-x'))<=-9.5,null,{timeout:5000});await page.locator('#boundary-alert').waitFor({state:'visible'});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+42,y:cy,id:1}]});
 await page.waitForFunction(()=>Number(document.querySelector('#stage canvas')?.getAttribute('data-server-x'))>-7.7,null,{timeout:5000});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const position=await page.locator('#stage canvas').evaluate(el=>({server:Number(el.getAttribute('data-server-x')),visual:Number(el.getAttribute('data-player-x'))}));
 assert.ok(Math.abs(position.server-position.visual)<.8,`server=${position.server}, visual=${position.visual}`);
});
