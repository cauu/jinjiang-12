import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { io, gameProxy, type Socket } from '../../test/support/game-client.js';
import { createGameServer } from '../src/server.js';
import { LEVELS } from '../src/levels.js';
import { createNetworkProxy } from './support/network-proxy.js';

type Reply = { ok:boolean; code?:string; data:any };
const wait = (ms:number) => new Promise(resolve=>setTimeout(resolve,ms));
const call = (socket:Socket,event:string,payload:unknown):Promise<Reply> => new Promise((resolve,reject)=>socket.timeout(5000).emit(event,payload,(err:Error|null,result:Reply)=>err?reject(new Error(`${event}: ${err.message}`)):resolve(result)));
const connect = async (url:string) => { const s=io(url,{forceNew:true,reconnection:false,transports:['websocket'],timeout:5000});await new Promise<void>((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s; };
const percentile=(numbers:number[],q:number) => [...numbers].sort((a,b)=>a-b)[Math.ceil(numbers.length*q)-1];

test('30 players with independent delay, jitter, intermittent spikes and network cuts recover and agree on a complete game', {timeout:90000}, async t=>{
 const game=createGameServer({introMs:0,cardMs:650,countdownMs:650,playMs:1800,quizMs:4500,quizRevealMs:350,quizRestoreMs:350,shuffleQuestions:false,resultMs:650,transitionMs:650,windMs:900,rebirthMs:900,endingMs:800,protectionMs:2500,collapseMs:300,itemFallMs:100,itemLifeMs:1200,sackRespawnMs:150});
 const port=await game.listen(); const proxy=await createNetworkProxy(port,12345); const clients:Socket[]=[]; let timer:NodeJS.Timeout|undefined;
 t.after(async()=>{ if(timer)clearInterval(timer);for(const s of clients)s.disconnect();await proxy.close();await game.close(); });
 const host=await connect(`http://127.0.0.1:${port}`);clients.push(host);
 const attached=await call(host,'host:attach',{token:game.game.hostToken});const roomId=attached.data.roomId;
 const players=await Promise.all(Array.from({length:30},(_,i)=>connect(proxy.urlFor(i))));clients.push(...players);
 const joined=await Promise.all(players.map((s,i)=>call(s,'room:join',{roomId,name:`网络玩家${i+1}`})));assert.ok(joined.every(r=>r.ok));
 const state:any[]=Array(30).fill(null), worlds:any[]=Array(30).fill(null), seen=new Set<string>();let hostState:any=null;
 host.on('room:snapshot',s=>{hostState=s;const m=s.room.match;if(m?.phase==='playing')seen.add(m.level.id);});
 const bind=(s:Socket,i:number)=>{s.on('room:snapshot',snapshot=>{if(!state[i] || snapshot.revision>=state[i].revision)state[i]=snapshot;});s.on('world:state',world=>worlds[i]=world);};
 players.forEach(bind);
 const rtts=await Promise.all(players.map(async s=>{const start=performance.now();assert.ok((await call(s,'time:ping',{})).ok);return performance.now()-start;}));
 assert.ok(percentile(rtts,.5)>50,'proxy must introduce measurable round-trip latency');
 assert.ok((await call(host,'host:start',{})).ok);
 const accepted=Array(30).fill(0), rejected=Array(30).fill(0), rejectionReasons:Record<string,number>={};let seq=0;timer=setInterval(()=>{seq++;for(let i=0;i<30;i++){const m=state[i]?.room.match,p=state[i]?.room.players[joined[i].data.playerId];if(m?.phase!=='playing'||p?.status!=='playing')continue;const target=([-7,0,7,-7,0] as const)[m.level.data.questionIndex];const pos=worlds[i]?.phaseId===m.phaseId?(worlds[i].players[p.id]?.avatar.position??p.avatar.position):p.avatar.position;const dx=m.level.id==='02-dengshi'?target-pos.x:0;const x=m.level.id==='02-dengshi'?(Math.abs(dx)>.8?Math.sign(dx):0):i%2?.12:-.12;const input={matchId:m.id,phaseId:m.phaseId,seq,x,z:0,jumpHeld:false,jumpPressSeq:0};if(seq%5===0)players[i].volatile.emit('input',input,(response:Reply)=>{if(response.ok)accepted[i]++;else {rejected[i]++;const reason=response.code??'unknown';rejectionReasons[reason]=(rejectionReasons[reason]??0)+1;}});else players[i].volatile.emit('input',input);}},120);
 let cut=false,recovered=0;const deadline=Date.now()+70000;
 while(Date.now()<deadline&&hostState?.room.match?.phase!=='finished'){
  if(!cut&&hostState?.room.match?.level.id==='03-qibaoshi'&&hostState.room.match.phase==='playing'){
   cut=true;
   const targets=[0,10,20];for(const i of targets)proxy.cut(i);
   await wait(250);
   for(const i of targets){ const replacement=await connect(proxy.urlFor(i));clients.push(replacement);players[i]=replacement;bind(replacement,i);const session=joined[i].data;const resumed=await call(replacement,'session:resume',{roomId,playerId:session.playerId,resumeToken:session.resumeToken});assert.ok(resumed.ok);state[i]=resumed.data.snapshot;recovered++; }
  }
  await wait(50);
 }
 assert.ok(cut);assert.equal(recovered,3);assert.ok(accepted.every(n=>n>0),`all clients must have accepted inputs: ${accepted}`);assert.equal(hostState?.room.match?.phase,'finished');assert.deepEqual([...seen],LEVELS);
 const final=hostState.room.match;assert.ok(final.championId);assert.equal(final.results.length,6);
 const snapshots=await Promise.all(players.map(s=>call(s,'room:snapshot',{})));
 for(const snapshot of snapshots){assert.equal(snapshot.ok,true);assert.equal(snapshot.data.room.match.phase,'finished');assert.equal(snapshot.data.room.match.championId,final.championId);assert.deepEqual(snapshot.data.room.match.results,final.results);}
 t.diagnostic(`seed=12345, RTT ms min=${Math.round(Math.min(...rtts))}, p50=${Math.round(percentile(rtts,.5))}, p95=${Math.round(percentile(rtts,.95))}, max=${Math.round(Math.max(...rtts))}; network cuts recovered=${recovered}; clients=${players.length}; sampled inputs accepted=${accepted.reduce((a,b)=>a+b,0)}, rejected=${rejected.reduce((a,b)=>a+b,0)}, rejection codes=${JSON.stringify(rejectionReasons)}`);
});
