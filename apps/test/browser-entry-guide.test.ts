import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';
import { gameProxy } from './support/game-client.js';

const iosWechat='Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.60';
const androidWechat='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.60';
const iosSafari='Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1';

test('WeChat guides before joining; the same link joins in a browser and iPhone receives Safari guidance', {timeout:40000}, async t=>{
 const backend=createGameServer();const port=await backend.listen(),target=`http://127.0.0.1:${port}`;
 const vite=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy:{...gameProxy(target),'/media':target}}});await vite.listen();const address=vite.httpServer!.address();assert.ok(address&&typeof address!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});t.after(async()=>{await browser.close();await vite.close();await backend.close();});
 const url=`http://127.0.0.1:${address.port}/?room=${backend.game.roomId}&demo=1#join`;
 for(const [ua,viewport] of [[iosWechat,{width:390,height:844}],[androidWechat,{width:844,height:250}]] as const){
  const context=await browser.newContext({userAgent:ua,viewport,isMobile:true,hasTouch:true});await context.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:undefined});localStorage.setItem('jinjiang-session','saved-session');});
  const page=await context.newPage();await page.goto(url);assert.equal(await page.locator('#join-link').inputValue(),url);assert.equal(await page.locator('#stage').count(),0);assert.equal(await page.locator('form').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('jinjiang-session')),'saved-session');assert.equal(backend.game.players.size,0);
  await page.locator('#copy-link').click();assert.match(await page.locator('#copy-result').innerText(),/长按上方链接/);assert.equal(await page.locator('#join-link').inputValue(),url);await context.close();
 }
 const safari=await browser.newContext({userAgent:iosSafari,viewport:{width:390,height:844},isMobile:true,hasTouch:true});await safari.addInitScript(()=>Object.defineProperty(document,'fullscreenEnabled',{value:false}));const page=await safari.newPage();await page.goto(url);
 await page.locator('#safari-tip').waitFor({state:'visible'});assert.match(await page.locator('#safari-tip').innerText(),/隐藏工具栏/);assert.equal(await page.locator('.rotate').isVisible(),false,'portrait entry remains usable');await page.locator('input[name=name]').fill('Safari 玩家');await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});assert.equal(await page.locator('.rotate').isVisible(),true,'portrait gameplay requests landscape');assert.equal([...backend.game.players.values()].filter(p=>p.name==='Safari 玩家').length,1);await page.setViewportSize({width:844,height:300});await page.locator('.rotate').waitFor({state:'hidden'});await page.locator('#fullscreen').click();assert.match(await page.locator('#fullscreen-notice').innerText(),/隐藏工具栏/);await safari.close();
});
