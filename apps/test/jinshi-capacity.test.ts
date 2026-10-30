import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';
import { gameProxy } from './support/game-client.js';

test('a player joining a full lobby is a spectator and never receives controls',{timeout:60000},async t=>{
 const backend=createGameServer({introMs:0,cardMs:300,countdownMs:300,playMs:60000});for(let i=0;i<32;i++)backend.game.join(`席位${i}`,null);const port=await backend.listen();
 const vite=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(`http://127.0.0.1:${port}`),'/media':`http://127.0.0.1:${port}`}}});await vite.listen();const address=vite.httpServer!.address();assert.ok(address&&typeof address!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});t.after(async()=>{await browser.close();await vite.close();await backend.close();});
 const page=await browser.newPage({viewport:{width:844,height:390}});await page.goto(`http://127.0.0.1:${address.port}/?room=${backend.game.roomId}`);await page.locator('input[name=name]').fill('满席观众');await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});
 const id=JSON.parse((await page.evaluate(()=>localStorage.getItem('jinjiang-session')))! ).playerId;assert.equal(backend.game.players.get(id)?.status,'spectating');
 backend.game.start(backend.now());await page.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='playing');assert.equal(backend.game.match!.participants.length,32);assert.ok(!backend.game.match!.participants.includes(id));assert.equal(await page.locator('#controls').isHidden(),true);assert.equal(await page.locator('#info').innerText(),'观战中');
});
