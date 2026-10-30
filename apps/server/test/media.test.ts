import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../src/server.js';
import { Game, defaults } from '../src/game.js';

test('media HTTP serves byte ranges and missing files produce a fallback signal',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'jinjiang-media-'));writeFileSync(join(dir,'wind.mp4'),Buffer.from('0123456789'));
 const s=createGameServer({introMs:0,},dir);const port=await s.listen();t.after(async()=>{await s.close();rmSync(dir,{recursive:true,force:true});});
 const url=`http://127.0.0.1:${port}`;const part=await fetch(`${url}/media/wind.mp4`,{headers:{Range:'bytes=2-5'}});
 assert.equal(part.status,206);assert.equal(part.headers.get('content-range'),'bytes 2-5/10');assert.equal(await part.text(),'2345');
 assert.equal((await fetch(`${url}/media/ending.mp4`)).status,404);
 assert.equal((await fetch(`${url}/media/wind.mp4`,{headers:{Range:'bytes=22-'}})).status,416);
});

test('server owns video deadline and resume snapshot, and a late client cannot extend it',()=>{
 const g=new Game({...defaults,introMs:0,levels:['03-qibaoshi','04-shisan'],cardMs:0,countdownMs:0,playMs:10,resultMs:10,windMs:8000,protectionMs:100000});
 const ids=Array.from({length:4},(_,i)=>g.join(`p${i}`,null));g.start(1000);g.step(1000,1/30);g.step(1001,1/30);g.step(1012,1/30);g.step(1023,1/30);
 assert.equal(g.match!.phase,'transition');assert.equal(g.match!.transitionId,'wind');const deadline=g.match!.phaseEndsAt;
 g.disconnect(ids[0].playerId);g.step(5023,1/30);g.resume(ids[0].playerId,ids[0].resumeToken);
 const snap=g.snapshot(5023);assert.equal(snap.room.match!.media!.id,'wind');assert.equal(snap.room.match!.media!.endsAt,deadline);
 g.step(deadline!,1/30);assert.equal(g.match!.phase,'card');
});

test('default game begins with the fifteen-second opening and follows the server timeline',()=>{
 const g=new Game({...defaults,levels:['04-shisan']});g.join('a',null);g.join('b',null);g.start(1000);
 const snap=g.snapshot(1000);assert.equal(snap.room.match!.phase,'intro');assert.equal(snap.room.match!.media!.id,'intro');assert.equal(snap.room.match!.phaseEndsAt,16000);
 g.step(15999,1/30);assert.equal(g.match!.phase,'intro');g.step(16000,1/30);assert.equal(g.match!.phase,'card');
});
