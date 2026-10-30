import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Page } from 'playwright-core';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import jsQR from 'jsqr';
import { createGameServer } from '../server/src/server.js';
import { gameProxy } from './support/game-client.js';

// One real-duration lobby → intro → first-round result. The two touch-capable
// browser pages and nine bots share the same authoritative server.
test('Jinshi production scene: full lobby-to-result journey and authoritative visual data', {timeout:150000}, async t=>{
 const evidence=process.env.JINSHI_EVIDENCE_DIR;
 if(evidence)await mkdir(evidence,{recursive:true});
 const backend=createGameServer();const port=await backend.listen();
 const proxy={...gameProxy(`http://127.0.0.1:${port}`),'/media':`http://127.0.0.1:${port}`,'/admin':`http://127.0.0.1:${port}`};
 const mobile=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0,proxy}});await mobile.listen();
 const ma=mobile.httpServer!.address();assert.ok(ma&&typeof ma!=='string');
 const display=await viteServer({configFile:false,root:resolve('apps/display'),define:{'import.meta.env.VITE_MOBILE_PORT':JSON.stringify(String(ma.port))},server:{host:'127.0.0.1',port:0,proxy}});await display.listen();
 const da=display.httpServer!.address();assert.ok(da&&typeof da!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
 t.after(async()=>{await browser.close();await display.close();await mobile.close();await backend.close();});
 const dc=await browser.newContext({viewport:{width:1600,height:900}});
 const c1=await browser.newContext({viewport:{width:844,height:390},hasTouch:true});
 const c2=await browser.newContext({viewport:{width:844,height:390},hasTouch:true});
 for(const context of [dc,c1])await context.addInitScript(()=>{const store=window as any;store.__audioEvents=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){const src=this.currentSrc||this.src;if(src.includes('market-loop-v1'))store.__marketAudio=this;const promise=play.call(this);void promise.then(()=>store.__audioEvents.push({type:'played',src}),()=>store.__audioEvents.push({type:'rejected',src}));return promise;};});
 const [d,p1,p2]=await Promise.all([dc.newPage(),c1.newPage(),c2.newPage()]);const errors:string[]=[];
 for(const p of [d,p1,p2])p.on('pageerror',e=>errors.push(e.message));
 const shot=async(p:Page,name:string)=>{if(evidence)await p.screenshot({path:resolve(evidence,name)});};
 await d.goto(`http://127.0.0.1:${da.port}/?cameraMetrics=1`);
 await d.waitForFunction(()=>document.querySelector('#stage canvas')?.getAttribute('data-environment')==='jinshi'&&!!document.querySelector('#qr img'));
 const qr=await d.locator('#qr img').evaluate((image:HTMLImageElement)=>{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);return {width:canvas.width,height:canvas.height,pixels:Array.from(ctx.getImageData(0,0,canvas.width,canvas.height).data)};});
 const decoded=jsQR(Uint8ClampedArray.from(qr.pixels),qr.width,qr.height);assert.ok(decoded);
 const joinUrl=new URL(decoded.data);assert.equal(joinUrl.port,String(ma.port));assert.equal(joinUrl.searchParams.get('room'),backend.game.roomId);
 await shot(d,'01-lobby-display.png');
 for(const [page,name] of [[p1,'锦市甲'],[p2,'锦市乙']] as const){await page.goto(joinUrl.toString()+'&cameraMetrics=1');await page.locator('input[name=name]').fill(name);await page.locator('form button').click();await page.locator('#entry').waitFor({state:'hidden'});}
 await d.waitForFunction(()=>document.querySelector('#count')?.textContent==='2');await shot(p1,'02-lobby-phone.png');
 await d.locator('#add-bots').click();await d.waitForFunction(()=>{const audio=(window as any).__marketAudio;return !!audio&&!audio.paused},null,{timeout:10000});await d.waitForFunction(()=>document.querySelector('#count')?.textContent==='11');
 await d.locator('#start').click();
 for(const p of [d,p1,p2])await p.locator('video').waitFor({state:'attached',timeout:15000});await d.waitForFunction(()=>!!(window as any).__marketAudio?.paused,null,{timeout:5000});
 await p1.waitForFunction(()=>{const v=document.querySelector('video');return !!v&&v.readyState>=1&&Number.isFinite(v.duration)});
 const media=await p1.locator('video').evaluate((v:HTMLVideoElement)=>({src:v.currentSrc,duration:v.duration,muted:v.muted}));
 assert.match(media.src,/intro_phone\.mp4/);assert.ok(Math.abs(media.duration-15)<.2,`intro duration ${media.duration}`);assert.equal(media.muted,true);for(const p of [d,p1])await p.waitForFunction(()=>{const v=document.querySelector('video');return !!v&&v.currentTime>.3&&!v.paused},null,{timeout:8000});await shot(p1,'03-intro-phone.png');await shot(d,'04-intro-display.png');
 await p1.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='card',null,{timeout:22000});await shot(p1,'05-card-phone.png');
 await p1.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='playing',null,{timeout:13000});
 for(const p of [p1,p2])await p.waitForFunction(()=>document.querySelector('#stage canvas')?.getAttribute('data-model-state')==='ready'&&document.querySelector('#stage canvas')?.getAttribute('data-environment')==='jinshi',null,{timeout:15000});
 await d.waitForFunction(()=>!document.querySelector('#teams')?.hasAttribute('hidden')&&document.querySelectorAll('#teams .team').length===4);
 const id=JSON.parse((await p1.evaluate(()=>localStorage.getItem('jinjiang-session')))! ).playerId as string;
 const player=backend.game.players.get(id)!;const before=player.avatar!.position.z;
 const stick=await p1.locator('#stick').boundingBox();assert.ok(stick);const cdp=await c1.newCDPSession(p1);
 const x=stick.x+stick.width/2,y=stick.y+stick.height/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-stick.height*.35,id:1}]});
 await p1.waitForTimeout(1300);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.ok(player.avatar!.position.z<before-.5,`touch movement z: ${before} -> ${player.avatar!.position.z}`);
 const jumpBox=await p1.locator('#jump').boundingBox();assert.ok(jumpBox);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:jumpBox.x+jumpBox.width/2,y:jumpBox.y+jumpBox.height/2,id:2}]});
 let jumped=false;for(let i=0;i<10;i++){await p1.waitForTimeout(40);if(player.avatar!.position.y>.6)jumped=true;}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok(jumped,'touch jump did not rise on the server');await p1.waitForFunction(()=>((window as any).__audioEvents as any[]).some(e=>e.type==='played'&&e.src.includes('jump-v1.wav')),null,{timeout:5000});await p1.waitForFunction(()=>((window as any).__audioEvents as any[]).some(e=>e.type==='played'&&e.src.includes('land-v1.wav')),null,{timeout:5000});
 const data=backend.game.match!.level.data;
 for(const team of data.teams)assert.equal(data.owners.filter(o=>o===team.id).length,team.tileCount);
 const own=data.teams.find(team=>team.playerIds.includes(id))!;assert.ok(own.tileCount>0);
 await p1.waitForFunction(n=>document.querySelector('#info')?.textContent?.includes(`面积 ${n}`),own.tileCount,{timeout:5000}).catch(async()=>{assert.match(await p1.locator('#info').innerText(),/面积 \d+/);});
 const roster=await d.locator('#teams .team').allTextContents();assert.equal(roster.length,4);assert.ok(roster.every(x=>/\d+ 格/.test(x)));
 const arena=JSON.parse((await d.locator('#stage canvas').getAttribute('data-arena-bounds'))??'[]') as number[];assert.equal(arena.length,4);assert.ok(arena.every(n=>n>=0&&n<=1),`arena clipped ${arena}`);const sidebar=await d.locator('aside').boundingBox(),footer=await d.locator('footer').boundingBox();assert.ok(sidebar&&footer);assert.ok(arena[2]*1600<sidebar.x,`sidebar overlaps arena ${arena}`);assert.ok(arena[3]*900<footer.y,`host toolbar overlaps arena ${arena}`);
 const bounds=JSON.parse((await p1.locator('#stage canvas').getAttribute('data-player-with-markers-bounds'))??'[]') as number[];assert.equal(bounds.length,4);assert.ok(bounds.every(n=>n>=0&&n<=1),`player clipped ${bounds}`);
 await shot(p1,'06-playing-phone.png');await shot(d,'07-playing-display.png');
 // A late entrant must remain a spectator, and must not receive "晋级".
 const spectator=await browser.newPage({viewport:{width:844,height:390},hasTouch:true});spectator.on('pageerror',e=>errors.push(e.message));await spectator.goto(joinUrl.toString());await spectator.locator('input[name=name]').fill('观众');await spectator.locator('form button').click();await spectator.locator('#entry').waitFor({state:'hidden'});
 await p1.waitForFunction(()=>document.querySelector('#status')?.getAttribute('data-phase')==='result',null,{timeout:75000});
 const outcome=backend.game.match!.results[0];assert.equal(outcome.levelId,'01-jinshi');assert.equal(outcome.reason,'timeout');assert.equal(outcome.qualifiedIds.length+outcome.eliminatedIds.length,11);
 const minimum=Math.min(...data.teams.map(team=>team.tileCount));const eliminatedTeam=data.teams.find(team=>team.playerIds.every(pid=>outcome.eliminatedIds.includes(pid)));assert.ok(eliminatedTeam);assert.equal(eliminatedTeam.tileCount,minimum);
 for(const [page,pid] of [[p1,id],[p2,JSON.parse((await p2.evaluate(()=>localStorage.getItem('jinjiang-session')))! ).playerId]] as const){const expected=outcome.qualifiedIds.includes(pid)?'本关晋级':'本关淘汰';await page.waitForFunction(v=>document.querySelector('#message')?.textContent===v,expected);}
 await d.waitForFunction(expected=>Array.from(document.querySelectorAll('#teams .team')).map(x=>Number(x.textContent?.match(/(\d+) 格/)?.[1])).every((n,i)=>n===expected[i]),data.teams.map(team=>team.tileCount),{timeout:5000});const finalLabels=await d.locator('#teams .team').allTextContents();assert.deepEqual(finalLabels.map(x=>Number(x.match(/(\d+) 格/)?.[1])),data.teams.map(team=>team.tileCount));
 await p1.waitForFunction(()=>((window as any).__audioEvents as any[]).some(e=>e.type==='played'&&e.src.includes('result-v1.wav')),null,{timeout:5000});
 await spectator.waitForFunction(()=>document.querySelector('#message')?.textContent==='观战中');await d.waitForFunction(n=>document.querySelector('#message')?.textContent===`本关结束 · 晋级 ${n} 人`,outcome.qualifiedIds.length);
 await shot(p1,'08-result-phone.png');await shot(d,'09-result-display.png');await shot(spectator,'10-result-spectator.png');
 assert.deepEqual(errors,[]);console.log(`Jinshi: ${data.teams.length} teams, ${outcome.qualifiedIds.length} qualified, ${outcome.eliminatedIds.length} eliminated; 15s intro and 60s play completed`);
});
