import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, defaults } from '../src/game.js';
import { QUESTIONS, type LevelId } from '../src/levels.js';

function setup(level:LevelId,count=4) {
 const g=new Game({...defaults,introMs:0,levels:[level],shuffleQuestions:false,cardMs:0,countdownMs:0,playMs:10000,quizMs:50,quizRevealMs:50,quizRestoreMs:50,protectionMs:0,collapseMs:600,itemFallMs:2000});
 const ids=Array.from({length:count},(_,i)=>g.join(`p${i}`,null).playerId);
 g.start(1000);g.step(1000,1/30);g.step(1001,1/30);return {g,ids};
}
const step=(g:Game,now:number)=>g.step(now,1/30);

test('jinshi paints and transfers a tile, and eliminates the lowest team',()=>{
 const {g,ids}=setup('01-jinshi',4),d=g.match!.level.data;
 for(const id of ids)g.players.get(id)!.avatar!.position.x=-3.5;
 step(g,1035);const idx=10*20+6;assert.equal(d.owners[idx],'team-1');assert.equal(d.teams[1].tileCount,d.owners.filter(owner=>owner==='team-1').length);assert.equal(d.teams[0].tileCount,d.owners.filter(owner=>owner==='team-0').length);
 step(g,12000);assert.equal(g.match!.phase,'result');assert.ok(g.match!.results[0].eliminatedIds.length===2);
});

test('dengshi saves the players nearest the right answer to keep the survivor floor, then ends at the quota',()=>{
 const {g,ids}=setup('02-dengshi',4),d=g.match!.level.data;
 assert.equal(g.match!.level.targetCount,3);
 // A player may change their position until the deadline.
 for(const id of ids)g.players.get(id)!.avatar!.position.x=0;
 step(g,1050);assert.equal(d.answer,null);
 g.players.get(ids[0])!.avatar!.position.x=-7;g.players.get(ids[1])!.avatar!.position.x=-7;g.players.get(ids[2])!.avatar!.position.x=-3.5;
 step(g,1052);assert.deepEqual(d.roundResult?.eliminatedIds,[ids[3]]);assert.deepEqual(d.roundResult?.savedIds,[ids[2]]);
 assert.equal(g.players.get(ids[2])!.status,'playing');
 step(g,1103);assert.equal(g.match!.phase,'result');assert.deepEqual(g.match!.results[0].qualifiedIds,ids.slice(0,3));
});

test('dengshi keeps asking while the field is above the floor and needs no restore pause',()=>{
 const {g,ids}=setup('02-dengshi',8),d=g.match!.level.data;g.opts.quizRestoreMs=0;
 assert.equal(g.match!.level.targetCount,6);
 for(const [i,id] of ids.entries())g.players.get(id)!.avatar!.position.x=i<7?-7:7;
 step(g,1052);assert.deepEqual(d.roundResult?.eliminatedIds,[ids[7]]);
 step(g,1103);assert.equal(g.match!.phase,'playing');assert.equal(d.questionIndex,1);assert.equal(d.questionPhase,'answering');
});

test('dengshi ends after revealing when a two-player round is decided',()=>{
 const {g,ids}=setup('02-dengshi',2),d=g.match!.level.data;
 g.players.get(ids[0])!.avatar!.position.x=-7;g.players.get(ids[1])!.avatar!.position.x=0;
 step(g,1052);assert.equal(d.questionPhase,'revealing');assert.equal(g.match!.phase,'playing');
 step(g,1103);assert.equal(g.match!.phase,'result');assert.equal(d.questionIndex,0);
 assert.deepEqual(g.match!.results[0].qualifiedIds,[ids[0]]);
});

test('a question everyone misses is void and nobody is eliminated',()=>{
 const {g,ids}=setup('02-dengshi',4),d=g.match!.level.data;
 for(const id of ids)g.players.get(id)!.avatar!.position.x=0;
 step(g,1052);assert.equal(d.roundResult?.void,true);assert.deepEqual(d.roundResult?.eliminatedIds,[]);
 assert.ok(ids.every(id=>g.players.get(id)!.status==='playing'));
 step(g,1103);step(g,1154);assert.equal(g.match!.phase,'playing');assert.equal(d.questionIndex,1);
});

test('host skip or finish after a void question keeps every player',()=>{
 for(const action of ['skip','finish'] as const){
  const {g,ids}=setup('02-dengshi',4);
  for(const id of ids)g.players.get(id)!.avatar!.position.x=0;
  step(g,1052);
  if(action==='skip'){g.skip(1053);assert.deepEqual(g.match!.activeIds,ids);}
  else {g.finishNow(1053);assert.equal(g.match!.phase,'ending');assert.ok(g.match!.championId);}
  assert.ok(ids.every(id=>g.players.get(id)!.status!=='eliminated'));
 }
});

test('dengshi limits a larger question bank to five questions',()=>{
 QUESTIONS.push({id:'extra',text:'extra',options:['a','b','c'],answer:'A'});
 try{
  const {g,ids}=setup('02-dengshi',4),correctX=[-7,0,7,-7,0];let now=1052;
  for(const x of correctX){for(const id of ids)g.players.get(id)!.avatar!.position.x=x;step(g,now);step(g,now+51);if(g.match!.phase==='playing')step(g,now+102);now+=153;}
  assert.equal(g.match!.phase,'result');assert.equal(g.match!.level.data.questionIndex,4);assert.deepEqual(g.match!.results[0].qualifiedIds,ids);
 }finally{QUESTIONS.pop();}
});

test('dengshi locks boundary positions including airborne players',()=>{
 const {g,ids}=setup('02-dengshi',4);
 const x=[-4.001,-4,3.999,4];
 for(const [i,id] of ids.entries()){const a=g.players.get(id)!.avatar!;a.position.x=x[i];a.position.y=1.5;a.grounded=false;a.velocity.y=0;}
 step(g,1052);const r=g.match!.level.data.roundResult!;assert.deepEqual([...r.eliminatedIds,...r.savedIds].sort(),ids.slice(1).sort());assert.deepEqual(r.savedIds,[ids[1],ids[2]],'nearest wrong players are saved first');
});

test('dengshi allows everyone to qualify when nobody is eliminated',()=>{
 const {g,ids}=setup('02-dengshi',4),d=g.match!.level.data;
 const correctX=[-7,0,7,-7,0];let now=1052;
 for(let i=0;i<5;i++){
  for(const id of ids)g.players.get(id)!.avatar!.position.x=correctX[i];
  step(g,now);step(g,now+51);if(i<4)step(g,now+102);now+=153;
 }
 assert.deepEqual(g.match!.results[0].qualifiedIds,ids);assert.deepEqual(g.match!.results[0].eliminatedIds,[]);
});

test('qibaoshi awards a contested landed item once and never awards an airborne one',()=>{
 const {g,ids}=setup('03-qibaoshi',3),d=g.match!.level.data;
 for(const id of ids)Object.assign(g.players.get(id)!.avatar!.position,{x:0,z:0});
 d.items={landed:{x:0,z:0,spawnedAt:0,landsAt:0,expiresAt:9999},air:{x:0,z:0,spawnedAt:0,landsAt:9000,expiresAt:9999}};
 step(g,1035);assert.equal(Object.values(d.scores).reduce((n,s)=>n+s.count,0),1);assert.ok(!d.items.landed);assert.ok(d.items.air);
});

test('jiushi carries one sack, delivers at all four corners, and completes at three deliveries',()=>{
 for(const [x,z] of [[-8,-8],[-8,8],[8,-8],[8,8]]){
  const {g,ids}=setup('05-jiushi',4),d=g.match!.level.data,id=ids[0],a=g.players.get(id)!.avatar!;
  for(const other of ids.slice(1))g.players.get(other)!.status='eliminated';
  for(let n=0;n<3;n++){
   const key=`manual-${n}`;Object.assign(a.position,{x:0,y:.5,z:0});a.grounded=true;d.sacks={ [key]:{x:0,z:0,originalX:0,originalZ:0,carrierId:null} };
   step(g,1040+n*100);assert.equal(d.sacks[key].carrierId,id);
   Object.assign(a.position,{x,y:.5,z});step(g,1070+n*100);
   assert.equal(d.scores[id].count,n+1);assert.ok(!d.sacks[key]);
  }
  assert.ok(d.qualifiedIds.includes(id));assert.equal(g.players.get(id)!.status,'qualified');
 }
});

test('guishi goal selects the champion; all-fall and timeout paths terminate',()=>{
 const first=setup('06-guishi',3),p=first.g.players.get(first.ids[0])!.avatar!;
 Object.assign(p.position,{x:0,y:7.5,z:-14.1});p.grounded=true;step(first.g,1035);
 assert.equal(first.g.match!.championId,first.ids[0]);assert.deepEqual(first.g.match!.results[0].qualifiedIds,[first.ids[0]]);
 const fall=setup('06-guishi',3);for(const id of fall.ids){const a=fall.g.players.get(id)!.avatar!;a.position.y=-6;a.grounded=false;}
 step(fall.g,1035);step(fall.g,1250);assert.ok(fall.g.match!.championId);assert.equal(fall.g.match!.results[0].qualifiedIds.length,1);
 const timeout=setup('06-guishi',3);step(timeout.g,12000);assert.ok(timeout.g.match!.championId);assert.equal(timeout.g.match!.results[0].reason,'timeout');
});

test('guishi staircase can be climbed through ordinary directional and jump inputs',()=>{
 const {g,ids}=setup('06-guishi',3),m=g.match!,id=ids[0],a=g.players.get(id)!.avatar!;
 a.position.x=-4.5; m.level.data.gaps=[...Array.from({length:3},(_,i)=>5*10+3+i),...Array.from({length:3},(_,i)=>10*10+3+i),...Array.from({length:3},(_,i)=>15*10+3+i)];
 for(let tick=0;tick<300&&m.phase==='playing';tick++){
  g.input(id,{x:a.position.z<=-15 ? 1 : 0,z:a.position.z<=-15 ? 0 : -1,jump:tick%14===0,held:tick%14<5},1002+tick*33);
  g.step(1002+tick*33,1/30);
 }
 assert.equal(m.championId,id,`climber reached ${JSON.stringify(a.position)}; phase=${m.phase}`);
});
