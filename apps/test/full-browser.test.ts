import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';
import { LEVELS } from '../server/src/levels.js';
import { LEVEL_NAMES } from '@jinjiang/shared';
import { io, gameProxy, type Socket } from './support/game-client.js';

const progress=process.env.JINJIANG_PROGRESS??'/tmp/jinjiang-full-browser-progress.log';
const report=(text:string)=>appendFileSync(progress,`${new Date().toISOString()} ${text}\n`);
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const call=(s:Socket,e:string,d:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(4000).emit(e,d,(error:Error|null,result:any)=>error?reject(error):resolve(result)));
test('browser users play a default-duration match without host skips',{timeout:900000},async t=>{
 const count=Number(process.env.JINJIANG_PLAYERS??30);assert.ok([2,10,30].includes(count),'JINJIANG_PLAYERS must be 2, 10 or 30');
 writeFileSync(progress,'');const backend=createGameServer();const port=await backend.listen();const proxy={...gameProxy(`http://127.0.0.1:${port}`),'/admin':`http://127.0.0.1:${port}`,'/media':`http://127.0.0.1:${port}`};
 const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy}});await mobile.listen();const ma=mobile.httpServer!.address();assert.ok(ma&&typeof ma!=='string');
 const display=await viteServer({configFile:false,root:resolve('apps/display'),define:{'import.meta.env.VITE_MOBILE_PORT':JSON.stringify(String(ma.port))},server:{host:'127.0.0.1',port:0,proxy}});await display.listen();const da=display.httpServer!.address();assert.ok(da&&typeof da!=='string');
 const browsers=await Promise.all(Array.from({length:1+Math.ceil(count/6)},()=>chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']})));const browser=browsers[0];const observer=io(`http://127.0.0.1:${port}`,{forceNew:true});await new Promise<void>(r=>observer.once('connect',()=>r()));assert.ok((await call(observer,'host:attach',{token:backend.game.hostToken})).ok);
 t.after(async()=>{observer.disconnect();await Promise.all(browsers.map(instance=>instance.close()));await display.close();await mobile.close();await backend.close();});
 const screen=await browser.newPage({viewport:{width:1200,height:700}});await screen.goto(`http://127.0.0.1:${da.port}`);await screen.locator('#qr img').waitFor();const url=await screen.locator('#joinurl').innerText();const pages:Page[]=[];
 for(let start=0;start<count;start+=5){const batch=await Promise.all(Array.from({length:Math.min(5,count-start)},async(_,i)=>{const ctx=await browsers[1+Math.floor((start+i)/6)].newContext({viewport:{width:844,height:390}}),page=await ctx.newPage();const player=start+i+1;page.on('crash',()=>report(`玩家${player} 页面崩溃`));page.on('framenavigated',frame=>{if(frame===page.mainFrame())report(`玩家${player} 导航 ${frame.url()}`);});page.on('pageerror',error=>report(`玩家${player} 页面错误 ${error.message}`));await page.goto(url);await page.locator('input[name=name]').fill(`玩家${player}`);await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden',timeout:30000});return page;}));pages.push(...batch);report(`${pages.length} 个浏览器已入房`);}
 const playerIds=await Promise.all(pages.map(page=>page.evaluate(()=>JSON.parse(localStorage.getItem('jinjiang-session')!).playerId as string)));await screen.waitForFunction(count=>document.querySelector('#count')?.textContent===String(count),count);await screen.locator('#start').click();const seen=new Set<string>();let last='';const deadline=Date.now()+750000;
 while(Date.now()<deadline){
  const state=await screen.locator('#title').evaluate(el=>({phase:(el as HTMLElement).dataset.phase,level:(el as HTMLElement).dataset.level}));
  if(state.phase==='finished')break;
  if(state.phase==='playing'&&state.level&&!seen.has(state.level)){
   seen.add(state.level);report(`开始关卡 ${state.level}`);
   // Each active browser uses its actual on-screen joystick; eliminated users remain spectators.
   const initial=(await call(observer,'room:snapshot',{})).data.room;let failures=0;const controlled=await Promise.all(pages.map(async(page,i)=>{
    try{await page.waitForFunction(level=>{const status=document.querySelector('#status') as HTMLElement|null;return status?.dataset.level===level&&status?.dataset.phase==='playing';},state.level,{timeout:5000});const playerStatus=await page.locator('#status').getAttribute('data-player-status'),serverStatus=initial.players[playerIds[i]]?.status;if(playerStatus!==serverStatus)throw new Error(`玩家状态与服务端不一致：页面 ${playerStatus}，服务端 ${serverStatus}`);if(playerStatus!=='playing'){if(!['eliminated','spectating'].includes(playerStatus??'')||!((await page.locator('#info').innerText()).includes('观战中'))||await page.locator('#controls').isVisible())throw new Error(`观战状态异常：${playerStatus}`);return false;}const stick=page.locator('#stick');if(!await stick.isVisible())throw new Error('在场玩家摇杆不可见');const box=await stick.boundingBox();if(!box)throw new Error('无法读取摇杆位置');
     await page.mouse.move(box.x+50,box.y+50);await page.mouse.down();await page.mouse.move(box.x+50+(i%2?20:-20),box.y+50+(i%3-1)*12);return true;
    }catch(error){failures++;report(`玩家${i+1} 操作失败：${error instanceof Error?error.message:String(error)} URL=${page.url()} 已关闭=${page.isClosed()}`);if(i===0){try{const body=await Promise.race([page.evaluate(()=>document.body.innerHTML.slice(0,2000)),wait(3000).then(()=>'页面读取超时')]);report(`玩家1 页面内容 ${body}`);}catch(e){report(`玩家1 页面读取失败 ${String(e)}`);}}return false;}
   }));
   await wait(500);
   await Promise.all(pages.map(async(page,i)=>{if(controlled[i])try{await page.mouse.up();}catch(error){failures++;report(`玩家${i+1} 松开摇杆失败：${String(error)}`);}}));const final=(await call(observer,'room:snapshot',{})).data.room;
   for(let i=0;i<pages.length;i++)if(controlled[i]){const a=initial.players[playerIds[i]]?.avatar?.position,b=final.players[playerIds[i]]?.avatar?.position;if(!a||!b||(b.x-a.x)*(i%2?1:-1)<.05){failures++;report(`玩家${i+1} 服务端未向操作方向移动：${JSON.stringify({before:a,after:b})}`);}}
   report(`${state.level} 实际操作 ${controlled.filter(Boolean).length} 人`);
   assert.equal(failures,0,`${state.level} 有 ${failures} 个页面无法完成状态检查或操作`);
   assert.ok(controlled.some(Boolean),`${state.level} 没有页面完成摇杆操作`);
  }
  const key=`${state.phase}:${state.level}`;if(key!==last){last=key;report(`阶段 ${key}`);}await wait(500);
 }
 const phase=await screen.locator('#title').getAttribute('data-phase');assert.equal(phase,'finished');if(count===30)assert.deepEqual([...seen],LEVELS,'30-player default game must actually enter all six levels');else assert.deepEqual([...seen],LEVELS.slice(0,seen.size),'smaller matches must follow level order until an early winner');
 await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='finished')));const texts=await Promise.all(pages.map(page=>page.locator('#message').innerText()));const history=await screen.locator('#history').innerText();for(const page of pages)assert.equal(await page.locator('#history').innerText(),history);const champion=await screen.locator('#message').innerText();assert.match(champion,/^冠军：/);for(const text of texts)assert.equal(text,champion);
 const authority=(await call(observer,'room:snapshot',{})).data.room;assert.equal(await screen.locator('#history > div').count(),authority.match.results.length);assert.equal(authority.match.results.length,seen.size);const expectedHistory=authority.match.results.map((result:{levelId:keyof typeof LEVEL_NAMES;qualifiedIds:string[]})=>`${LEVEL_NAMES[result.levelId]} 晋级：${result.qualifiedIds.map(id=>authority.players[id]?.name??id).join('、')}`).join('\n');assert.equal(history,expectedHistory,'results must match the server');assert.equal(champion,`冠军：${authority.players[authority.match.championId]?.name??'等待结果'}`,'champion must match the server');
 report(`通过：${count} 浏览器完成 ${seen.size} 关；${champion}`);t.diagnostic(`${count} browsers completed ${seen.size} levels and saw ${champion}`);
});
