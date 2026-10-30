import test from 'node:test';
import assert from 'node:assert/strict';
import { io, gameProxy, type Socket } from '../../test/support/game-client.js';
import { createGameServer } from '../src/server.js';

const call=(s:Socket,event:string,data:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(3000).emit(event,data,(err:Error|null,result:any)=>err?reject(err):resolve(result)));
test('diagnostics report accepted, rejected and sampled player inputs without exposing tokens', {timeout:12000},async t=>{
 const backend=createGameServer({introMs:0,cardMs:400,countdownMs:10,playMs:60000});const port=await backend.listen();const url=`http://127.0.0.1:${port}`;
 const host=io(url,{forceNew:true}),player=io(url,{forceNew:true}),other=io(url,{forceNew:true});t.after(async()=>{host.disconnect();player.disconnect();other.disconnect();await backend.close();});
 await Promise.all([host,player,other].map(s=>new Promise<void>(resolve=>s.once('connect',resolve))));
 assert.equal((await fetch(url+'/admin/diagnostics')).status,403);
 assert.ok((await call(host,'host:attach',{token:backend.game.hostToken})).ok);
 const joined=await call(player,'room:join',{roomId:backend.game.roomId,name:'诊断玩家'});await call(other,'room:join',{roomId:backend.game.roomId,name:'另一玩家'});assert.ok((await call(host,'host:start',{})).ok);
 // Inputs sent while the server does not accept them (card phase) are rejected; during play they are consumed one per tick.
 player.emit('input',{x:1,z:0,jumpHeld:false,jumpPressSeq:0});
 const end2=Date.now()+3000;while(backend.game.inputCursor(joined.data.playerId).processed<5&&Date.now()<end2)await new Promise(r=>setTimeout(r,20));
 player.disconnect();await new Promise(r=>setTimeout(r,100));
 const response=await fetch(url+'/admin/diagnostics',{headers:{'x-host-token':backend.game.hostToken}});assert.equal(response.status,200);const text=await response.text();assert.ok(!text.includes(backend.game.hostToken));assert.ok(!text.includes(joined.data.resumeToken));const state=JSON.parse(text),p=state.players.find((p:any)=>p.id===joined.data.playerId);
 assert.equal(state.match.level,'01-jinshi');assert.equal(p.connected,false);assert.ok(p.input.processed>=5);assert.equal(p.input.dropped,0);assert.ok(p.transport.accepted>=5);assert.ok(p.transport.reasons.INPUT_NOT_ALLOWED>0,'inputs during the card phase are rejected');assert.ok(state.simulation.tickAgeMs<1000);assert.ok(state.simulation.broadcastAgeMs<1000);
});
