import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, defaults } from '../src/game.js';
import { DemoBots } from '../src/bots.js';
import { LEVELS } from '../src/levels.js';
import { STAND_HEIGHT } from '@jinjiang/shared';

test('bot input is accepted by the simulation in each level', () => {
 for (const level of LEVELS) {
  const game = new Game({...defaults,levels:[level],introMs:0,cardMs:0,countdownMs:0,protectionMs:10000});
  const bots = new DemoBots(game);bots.add(9);game.join('真人',null);game.start(10000);
  for(let tick=0;tick<80;tick++){const now=10000+tick*34;bots.step(now);game.step(now,1/30);}
  const bot=[...game.players.values()].find(p=>p.name==='机器人1')!;
  assert.ok(game.inputCursor(bot.id).processed>0,`${level}: bot input was applied`);
 }
});

test('bots respect capacity, reserve a place for a human and can be removed', () => {
 const game=new Game(),bots=new DemoBots(game);for(let i=0;i<4;i++)bots.add(9);
 assert.equal(game.players.size,31);assert.throws(()=>bots.add(9),/ROOM_FULL/);
 const human=game.join('真人',null);assert.equal(game.players.get(human.playerId)!.status,'waiting');
 bots.clear();assert.equal(game.players.size,1);assert.ok(game.players.has(human.playerId));
});

test('clearing bots promotes connected spectators into available slots for the next game', () => {
 const game=new Game(),bots=new DemoBots(game);for(let i=0;i<4;i++)bots.add(9);
 const first=game.join('玩家1',null), second=game.join('玩家2',null);
 assert.equal(game.players.get(second.playerId)!.status,'spectating');
 bots.clear();
 assert.equal(game.players.get(first.playerId)!.status,'waiting');
 assert.equal(game.players.get(second.playerId)!.status,'waiting');
 game.start(10000);
 assert.deepEqual(game.match!.participants,[first.playerId,second.playerId]);
});

test('a disconnected spectator takes a free slot when resuming in the lobby', () => {
 const game=new Game(),bots=new DemoBots(game);for(let i=0;i<4;i++)bots.add(9);
 game.join('玩家1',null);const second=game.join('玩家2',null);
 game.disconnect(second.playerId);bots.clear();
 assert.equal(game.players.get(second.playerId)!.status,'spectating');
 game.resume(second.playerId,second.resumeToken);
 assert.equal(game.players.get(second.playerId)!.status,'waiting');
});

test('a disconnected lobby player gives up the slot to the earliest connected spectator', () => {
 const game=new Game();const joined=Array.from({length:34},(_,i)=>game.join(`玩家${i}`,null));
 game.disconnect(joined[0].playerId);
 assert.equal(game.players.get(joined[0].playerId)!.status,'spectating');
 assert.equal(game.players.get(joined[32].playerId)!.status,'waiting');
 assert.equal(game.players.get(joined[33].playerId)!.status,'spectating');
 game.resume(joined[0].playerId,joined[0].resumeToken);
 assert.equal(game.players.get(joined[0].playerId)!.status,'spectating','a full lobby keeps the current waiting players');
 game.disconnect(joined[1].playerId);
 assert.equal(game.players.get(joined[0].playerId)!.status,'waiting','the earliest connected spectator takes the next available slot');
});

test('reset gives waiting slots to connected players without changing participants mid-match', () => {
 const game=new Game();const joined=Array.from({length:34},(_,i)=>game.join(`玩家${i}`,null));
 game.start(10000);game.disconnect(joined[0].playerId);game.disconnect(joined[1].playerId);
 assert.equal(game.players.get(joined[32].playerId)!.status,'spectating');
 assert.deepEqual(game.match!.participants,joined.slice(0,32).map(p=>p.playerId));
 game.reset();
 assert.equal(game.players.get(joined[0].playerId)!.status,'spectating');
 assert.equal(game.players.get(joined[1].playerId)!.status,'spectating');
 assert.equal(game.players.get(joined[32].playerId)!.status,'waiting');
 assert.equal(game.players.get(joined[33].playerId)!.status,'waiting');
 assert.equal([...game.players.values()].filter(p=>p.status==='waiting').length,32);
});

test('bots do not replay the previous match jump in a new match', () => {
 const game=new Game({...defaults,levels:['06-guishi'],introMs:0,cardMs:0,countdownMs:0});
 const bots=new DemoBots(game);bots.add(1);game.join('真人',null);game.start(10000);
 game.step(10000,1/30);bots.step(10100);game.step(10100,1/30);
 const bot=[...game.players.values()].find(p=>p.name==='机器人1')!;
 assert.ok(game.inputCursor(bot.id).jumpPressSeq>0);
 game.reset();game.opts.levels=['01-jinshi'];game.start(20000);
 game.step(20000,1/30);bots.step(20100);game.step(20100,1/30);
 assert.equal(game.inputCursor(bot.id).jumpPressSeq,0);
 assert.equal(bot.avatar!.grounded,true);
 assert.ok(Math.abs(bot.avatar!.position.y-STAND_HEIGHT)<1e-3);
});
