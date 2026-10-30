import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createGameServer } from '../server/src/server.js';

const chrome=process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('all four placeholder videos and their mobile copies load and play in Chrome at the intended duration', {timeout:30000}, async t=>{
 const server=createGameServer();const port=await server.listen();const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 t.after(async()=>{await browser.close();await server.close();});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${port}/health`);
 for(const [name,duration] of [['intro',15],['wind',8],['rebirth',6],['ending',50]] as const){for(const suffix of ['', '_phone']){
  const result=await page.evaluate(async ({src})=>{
   const v=document.createElement('video');v.muted=true;v.playsInline=true;v.src=src;document.body.append(v);
   await new Promise<void>((resolve,reject)=>{v.onloadedmetadata=()=>resolve();v.onerror=()=>reject(new Error('video load failed'));});
   const duration=v.duration;await v.play();await new Promise<void>((resolve,reject)=>{if(v.currentTime>0)return resolve();const timeout=setTimeout(()=>reject(new Error('video did not advance within 5 seconds')),5000);v.addEventListener('timeupdate',()=>{if(v.currentTime>0){clearTimeout(timeout);resolve();}},{once:true});});const currentTime=v.currentTime;v.pause();v.remove();return {duration,currentTime};
  },{src:`/media/${name}${suffix}.mp4`});
  assert.ok(Math.abs(result.duration-duration)<.1,`${name}${suffix} duration ${result.duration}`);assert.ok(result.currentTime>0,`${name}${suffix} did not advance`);
 }}
});
