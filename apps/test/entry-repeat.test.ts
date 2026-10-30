import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../server/src/server.js';
import jsQR from 'jsqr';
import { gameProxy } from './support/game-client.js';

test('two independent browser sessions enter from the display URL ten times',{timeout:180000},async t=>{
 const host=process.env.JINJIANG_LAN_HOST??'127.0.0.1';const bind=host==='127.0.0.1'?'127.0.0.1':'0.0.0.0';const backend=createGameServer();const port=await backend.listen(0,bind);const proxy={...gameProxy(`http://127.0.0.1:${port}`),'/admin':`http://127.0.0.1:${port}`,'/media':`http://127.0.0.1:${port}`};
 const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:bind,port:0,proxy}});await mobile.listen();const ma=mobile.httpServer!.address();assert.ok(ma&&typeof ma!=='string');
 const display=await viteServer({configFile:false,root:resolve('apps/display'),define:{'import.meta.env.VITE_MOBILE_PORT':JSON.stringify(String(ma.port))},server:{host:bind,port:0,proxy}});await display.listen();const da=display.httpServer!.address();assert.ok(da&&typeof da!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});t.after(async()=>{await browser.close();await display.close();await mobile.close();await backend.close();});
 const screen=await browser.newPage({viewport:{width:1200,height:700}});await screen.goto(`http://${host}:${da.port}`);await screen.locator('#qr img').waitFor();const url=await screen.locator('#joinurl').innerText();assert.ok(url.includes(`room=${backend.game.roomId}`));
 const qr=await screen.locator('#qr img').evaluate((image:HTMLImageElement)=>{const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);return {width:c.width,height:c.height,pixels:Array.from(ctx.getImageData(0,0,c.width,c.height).data)};});const decoded=jsQR(Uint8ClampedArray.from(qr.pixels),qr.width,qr.height);assert.equal(decoded?.data,url,'QR image must encode the displayed join URL');assert.equal(new URL(url).hostname,host);
 for(let round=1;round<=10;round++){
  const contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:844,height:390}})));
  try{for(let i=0;i<2;i++){const page=await contexts[i].newPage();await page.goto(decoded!.data);await page.locator('input[name=name]').fill(`第${round}次玩家${i+1}`);await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});}
   await screen.waitForFunction(()=>document.querySelector('#count')?.textContent==='2');for(let i=0;i<2;i++)await screen.getByText(`第${round}次玩家${i+1}`,{exact:true}).waitFor();
  }finally{await Promise.all(contexts.map(context=>context.close()));}
  await screen.waitForFunction(()=>document.querySelector('#count')?.textContent==='0');
 }
 t.diagnostic(`10/10 two-session browser entries passed at ${host}; QR image decoded; physical QR scanning and another device are not covered`);
});
