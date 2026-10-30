import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { io, gameProxy, type Socket } from './support/game-client.js';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';
import { createNetworkProxy } from '../server/test/support/network-proxy.js';
const call=(s:Socket,e:string,d:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(3000).emit(e,d,(err:Error|null,r:any)=>err?reject(err):resolve(r)));
test('a delayed browser responds locally, converges after release, and restores its identity after a network cut', {timeout:120000}, async t=>{
 const backend=createGameServer({introMs:0,cardMs:500,countdownMs:500,playMs:120000});const port=await backend.listen();const proxy=await createNetworkProxy(port,9876);const target=proxy.urlFor(29);
 const vite=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(target),'/media':`http://127.0.0.1:${port}`}}});await vite.listen();const addr=vite.httpServer!.address();assert.ok(addr&&typeof addr!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});const host=io(`http://127.0.0.1:${port}`,{forceNew:true}),other=io(`http://127.0.0.1:${port}`,{forceNew:true});
 t.after(async()=>{host.disconnect();other.disconnect();await browser.close();await vite.close();await proxy.close();await backend.close();});
 await Promise.all([host,other].map(s=>new Promise<void>(r=>s.once('connect',()=>r()))));const room=(await call(host,'host:attach',{token:backend.game.hostToken})).data.roomId;await call(other,'room:join',{roomId:room,name:'另一玩家'});
 const page=await browser.newPage({viewport:{width:844,height:390}});await page.goto(`http://127.0.0.1:${addr.port}/?room=${room}`);await page.locator('input[name=name]').fill('网络玩家');await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});const identity=await page.evaluate(()=>localStorage.getItem('jinjiang-session'));assert.ok(identity);const playerId=(JSON.parse(identity) as {playerId:string}).playerId;
 await call(host,'host:start',{});await page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='playing');await page.waitForFunction(()=>document.querySelector('#stage canvas')?.hasAttribute('data-player-x'));
 const canvas=page.locator('#stage canvas'),before=Number(await canvas.getAttribute('data-player-x')),beforeServer=Number(await canvas.getAttribute('data-server-x')),box=await page.locator('#stick').boundingBox();assert.ok(box);
 await page.mouse.move(box.x+50,box.y+50);await page.mouse.down();await page.mouse.move(box.x+85,box.y+50);
 await page.waitForFunction(initial=>Number(document.querySelector('#stage canvas')?.getAttribute('data-player-x'))>initial+.05,before,{timeout:1000});
 assert.ok(Math.abs(Number(await canvas.getAttribute('data-server-x'))-beforeServer)<.05,'local motion should appear before server movement arrives');
 await page.waitForTimeout(500);await page.mouse.up();await page.waitForTimeout(1500);
 const position=await canvas.evaluate(el=>({visual:Number((el as HTMLElement).dataset.playerX),server:Number((el as HTMLElement).dataset.serverX)}));assert.ok(Math.abs(position.visual-position.server)<.3,`visual/server difference ${Math.abs(position.visual-position.server)}m`);
 for(let i=0;i<10;i++){
  proxy.cut(29);await page.getByText('连接中断，正在重连',{exact:true}).waitFor({timeout:5000});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent!=='连接中断，正在重连',null,{timeout:10000});assert.equal(await page.evaluate(()=>localStorage.getItem('jinjiang-session')),identity);
  const end=Date.now()+10000;let connected=false;while(Date.now()<end&&!connected){const snap=await call(host,'room:snapshot',{});connected=snap.data.room.players[playerId].connected;if(!connected)await new Promise(r=>setTimeout(r,100));}assert.ok(connected,`server must confirm resumed identity after cut ${i+1}`);
 }
 await page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-player-status')==='playing',null,{timeout:10000});
 const afterReconnect=Number(await canvas.getAttribute('data-server-x'));const cursorBefore=backend.game.inputCursor(playerId);await page.mouse.move(box.x+50,box.y+50);await page.mouse.down();await page.mouse.move(box.x+85,box.y+50);
 try{await page.waitForFunction(initial=>Number(document.querySelector('#stage canvas')?.getAttribute('data-server-x'))>initial+.1,afterReconnect,{timeout:5000});}catch(error){t.diagnostic(JSON.stringify({afterReconnect,cursorBefore,cursorAfter:backend.game.inputCursor(playerId),player:backend.game.players.get(playerId),page:await page.evaluate(({x,y})=>({serverX:document.querySelector('#stage canvas')?.getAttribute('data-server-x'),playerX:document.querySelector('#stage canvas')?.getAttribute('data-player-x'),status:document.querySelector('#status')?.textContent,stick:document.querySelector('#stick span')?.getAttribute('style'),entryHidden:(document.querySelector('#entry') as HTMLElement).hidden,error:document.querySelector('#error')?.textContent,hit:document.elementFromPoint(x,y)?.outerHTML.slice(0,300)}),{x:box.x+50,y:box.y+50})}));throw error;}finally{await page.mouse.up();}
 await page.waitForTimeout(5500);assert.equal(await page.locator('#entry').isHidden(),true,'stale resume failures must not cover an already restored game');
});
