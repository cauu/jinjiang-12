import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, defaults } from '../src/game.js';

function make(count:number){const game=new Game({...defaults,introMs:0,cardMs:0,countdownMs:0,playMs:1000,levels:['01-jinshi']});const ids=Array.from({length:count},(_,i)=>game.join(`玩家${i}`,null).playerId);game.start(1000);game.step(1000,1/30);game.step(1001,1/30);return {game,ids};}
test('Jinshi team counts follow two, four and eight player thresholds',()=>{
 for(const [n,expected] of [[2,2],[3,3],[4,2],[7,2],[8,4],[32,4]]){const {game,ids}=make(n);assert.equal(game.match!.level.data.teams.length,expected);for(const [i,id] of ids.entries())assert.ok(game.match!.level.data.teams[i%expected].playerIds.includes(id));}
});
test('Jinshi tied lowest areas eliminate the later reached team, then later team index when timestamps tie',()=>{
 for(const [times,expectedLoser] of [[[1100,1200],1],[[1100,1100],1]] as const){
  const {game,ids}=make(4);const data=game.match!.level.data;
  data.teams[0].tileCount=1;data.teams[1].tileCount=1;data.teams[0].reachedAt=times[0];data.teams[1].reachedAt=times[1];data.owners[0]=data.teams[0].id;data.owners[1]=data.teams[1].id;
  for(const id of ids){const a=game.players.get(id)!.avatar!;a.position.y=5;a.grounded=false;a.velocity.y=0;}
  game.step(2100,1/30);assert.equal(game.match!.phase,'result');assert.deepEqual(game.match!.results[0].eliminatedIds,data.teams[expectedLoser].playerIds);
 }
});
