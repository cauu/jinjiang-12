import test from 'node:test';
import assert from 'node:assert/strict';
import { io, gameProxy, type Socket } from '../../test/support/game-client.js';
import { createGameServer } from '../src/server.js';
import { LEVELS } from '../src/levels.js';

type Reply = {ok:boolean;code?:string;data:any};
const wait = (ms:number) => new Promise(r=>setTimeout(r,ms));
const connect = async (url:string) => {const s=io(url,{forceNew:true,reconnection:false,transports:['websocket']});await new Promise<void>((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s;};
const call = (s:Socket,event:string,payload:unknown):Promise<Reply>=>new Promise((resolve,reject)=>s.timeout(3000).emit(event,payload,(e:Error|null,r:Reply)=>e?reject(e):resolve(r)));

test('30 clients complete the six real rules, videos on server timeline and identical championship', {timeout:60000}, async t=>{
 const server=createGameServer({introMs:250,cardMs:80,countdownMs:80,playMs:1300,quizMs:4000,quizRevealMs:80,quizRestoreMs:80,shuffleQuestions:false,resultMs:90,transitionMs:80,windMs:160,rebirthMs:160,endingMs:150,protectionMs:2000,collapseMs:250,itemFallMs:50,itemLifeMs:700,sackRespawnMs:80,tickRate:30,broadcastRate:10});
 const port=await server.listen(),url=`http://127.0.0.1:${port}`;const all:Socket[]=[];let timer:NodeJS.Timeout|undefined;
 t.after(async()=>{if(timer)clearInterval(timer);for(const s of all)s.disconnect();await server.close();});
 const host=await connect(url);all.push(host);const attached=await call(host,'host:attach',{token:server.game.hostToken});const roomId=attached.data.roomId;
 const clients=await Promise.all(Array.from({length:30},()=>connect(url)));all.push(...clients);
 const joined=await Promise.all(clients.map((s,i)=>call(s,'room:join',{roomId,name:`玩家${i}`})));assert.ok(joined.every(r=>r.ok));
 let latest:any=null,world:any=null;host.on('world:state',w=>world=w);const seenLevels=new Set<string>(),seenTransitions=new Set<string>(),seenPhases=new Set<string>(),seenMedia=new Set<string>();const results=new Map<string,any>();
 host.on('room:snapshot',snapshot=>{latest=snapshot;const m=snapshot.room.match;if(!m)return;seenPhases.add(m.phase);if(m.media)seenMedia.add(m.media.id);if(m.phase==='playing')seenLevels.add(m.level.id);if(m.phase==='transition')seenTransitions.add(m.transitionId);for(const result of m.results)results.set(result.levelId,result);});
 const started=await call(host,'host:start',{});assert.equal(started.ok,true);
 let sequence=0;
 timer=setInterval(()=>{if(latest?.room.match?.phase!=='playing')return;const m=latest.room.match;sequence++;for(let i=0;i<clients.length;i++){if(latest.room.players[joined[i].data.playerId].status!=='playing')continue;const player=latest.room.players[joined[i].data.playerId];const target=([-7,0,7,-7,0] as const)[m.level.data.questionIndex];const pos=world?.phaseId===m.phaseId?(world.players[player.id]?.avatar.position??player.avatar.position):player.avatar.position;const dx=m.level.id==='02-dengshi'?target-pos.x:0;const x=m.level.id==='02-dengshi'?(Math.abs(dx)>.6?Math.sign(dx):0):i%2?.15:-.15;clients[i].volatile.emit('input',{matchId:m.id,phaseId:m.phaseId,seq:sequence,x,z:0,jumpHeld:false,jumpPressSeq:0});}},100);
 const end=Date.now()+45000;let recovered=false, mediaFailureTested=false;
 while(Date.now()<end&&latest?.room.match?.phase!=='finished'){
  if(!recovered&&latest?.room.match?.level.id==='03-qibaoshi'&&latest.room.match.phase==='playing'){
   recovered=true;const old=clients[0];old.disconnect();const next=await connect(url);all.push(next);clients[0]=next;
   const resume=await call(next,'session:resume',{roomId,playerId:joined[0].data.playerId,resumeToken:joined[0].data.resumeToken});assert.equal(resume.ok,true);assert.equal(resume.data.snapshot.room.match.id,latest.room.match.id);
  }
  if(!mediaFailureTested&&latest?.room.match?.transitionId==='wind'){
   mediaFailureTested=true;const phaseId=latest.room.match.phaseId;const status=await call(clients[1],'media:status',{matchId:latest.room.match.id,phaseId,status:'failed'});assert.equal(status.ok,true);const check=await call(host,'room:snapshot',{});assert.equal(check.data.room.match.phaseId,phaseId);
  }
  await wait(25);
 }
 assert.ok(recovered,'disconnect and resume reached');assert.ok(mediaFailureTested,'video failure path reached');assert.equal(latest?.room.match?.phase,'finished');
 assert.deepEqual([...seenLevels],LEVELS);assert.deepEqual([...results.keys()],LEVELS);assert.ok(seenTransitions.has('wind')&&seenTransitions.has('rebirth'));assert.ok(seenPhases.has('ending'));assert.deepEqual([...seenMedia],['intro','wind','rebirth','ending']);
 const final=latest.room.match;assert.ok(final.championId);assert.equal(final.results.at(-1).qualifiedIds[0],final.championId);assert.ok(final.results[0].eliminatedIds.length>0);
 const checks=await Promise.all(clients.map(s=>call(s,'room:snapshot',{})));for(const c of checks){assert.equal(c.data.room.match.phase,'finished');assert.equal(c.data.room.match.championId,final.championId);assert.deepEqual(c.data.room.match.results,final.results);}
 const reset=await call(host,'host:reset',{requestId:'reset-1',matchId:final.id,phaseId:final.phaseId});assert.equal(reset.data.room.match,null);const retry=await call(host,'host:reset',{requestId:'reset-1',matchId:final.id,phaseId:final.phaseId});assert.equal(retry.ok,true);assert.equal(retry.data.room.match,null);assert.ok(Object.values(reset.data.room.players).every((p:any)=>p.status==='waiting'));
});

test('host commands are phase checked and retrying a skip does not skip twice',async t=>{
 const server=createGameServer({introMs:0,cardMs:10000});const port=await server.listen(),url=`http://127.0.0.1:${port}`;
 const clients=await Promise.all(Array.from({length:3},()=>connect(url)));t.after(async()=>{for(const s of clients)s.disconnect();await server.close();});
 const [host,a,b]=clients;const room=await call(host,'host:attach',{token:server.game.hostToken});const roomId=room.data.roomId;
 await call(a,'room:join',{roomId,name:'a'});await call(b,'room:join',{roomId,name:'b'});
 const start=await call(host,'host:start',{}),m=start.data.room.match;
 const command={requestId:'skip-once',matchId:m.id,phaseId:m.phaseId};const first=await call(host,'host:skip',command),retry=await call(host,'host:skip',command);
 assert.equal(first.ok,true);assert.equal(retry.ok,true);assert.equal(retry.data.room.match.phaseId,first.data.room.match.phaseId);assert.equal(first.data.room.match.results.length,1);
 const stale=await call(host,'host:skip',{...command,requestId:'skip-stale'});assert.equal(stale.code,'STALE_PHASE');
});
