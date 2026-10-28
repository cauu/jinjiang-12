import { Game, GameError } from './game.js';

type Bot = { id: string; number: number; seq: number; jump: number; lastJumpAt: number; lastInputAt: number };
type Point = { x: number; z: number };
const colors = ['#5a9bd5', '#efa34a', '#a06ec1', '#65b98b', '#e67585', '#67bdc2'];
const nearest = (from: Point, points: Point[]) => points.sort((a, b) => Math.hypot(a.x-from.x,a.z-from.z)-Math.hypot(b.x-from.x,b.z-from.z))[0];

/** Simple demo opponents use the same input and simulation as a human player. */
export class DemoBots {
 private bots = new Map<string, Bot>();
 private nextNumber = 1;
 private matchId: string | null = null;
 constructor(private game: Game) {}
 add(count: number) {
  if (this.game.match) throw new GameError('MATCH_EXISTS');
  const waiting = [...this.game.players.values()].filter(p => p.status === 'waiting').length;
  const humans = [...this.game.players.values()].filter(p => p.status === 'waiting' && !this.bots.has(p.id)).length;
  const available = Math.max(0, 32 - waiting - (humans === 0 ? 1 : 0));
  if (!available) throw new GameError('ROOM_FULL');
  for (let i = 0; i < Math.min(count, available); i++) {
   const number = this.nextNumber++;
   const { playerId } = this.game.join(`机器人${number}`, colors[(number-1)%colors.length]);
   this.bots.set(playerId, { id: playerId, number, seq: 0, jump: 0, lastJumpAt: 0, lastInputAt: 0 });
  }
 }
 clear() {
  if (this.game.match) throw new GameError('MATCH_EXISTS');
  for (const id of this.bots.keys()) this.game.removeWaitingPlayer(id);
  this.bots.clear();
 }
 step(now: number) {
  const match = this.game.match;
  if (!match || !['countdown', 'playing'].includes(match.phase)) return;
  if (this.matchId !== match.id) {
   this.matchId = match.id;
   for (const bot of this.bots.values()) { bot.seq = 0; bot.jump = 0; bot.lastJumpAt = 0; bot.lastInputAt = 0; }
  }
  for (const bot of this.bots.values()) {
   const player = this.game.players.get(bot.id), avatar = player?.avatar;
   if (!avatar || player?.status !== 'playing' || now-bot.lastInputAt < 100) continue;
   bot.lastInputAt = now;
   const pos = avatar.position, data = match.level.data;
   let target: Point | undefined;
   switch (match.level.id) {
    case '01-jinshi': {
     const angle = Math.floor(now / 2200 + bot.number) * 2.4;
     target = { x: Math.cos(angle)*7, z: Math.sin(angle)*7 }; break;
    }
    case '02-dengshi': target = { x: [-7,0,7][(bot.number + data.questionIndex)%3], z: 0 }; break;
    case '03-qibaoshi': target = nearest(pos, Object.values(data.items).filter(item => item.landsAt <= now && item.expiresAt > now)); break;
    case '04-shisan': {
     const angle = Math.floor(now / 1800 + bot.number) * 2.4;
     target = { x: Math.cos(angle)*6, z: Math.sin(angle)*6 }; break;
    }
    case '05-jiushi': {
     const carrying = Object.values(data.sacks).some(s => s.carrierId === bot.id);
     target = carrying ? nearest(pos, [{x:-8,z:-8},{x:-8,z:8},{x:8,z:-8},{x:8,z:8}]) : nearest(pos, Object.values(data.sacks).filter(s => s.carrierId === null)); break;
    }
    case '06-guishi': target = { x: 0, z: -15 }; break;
   }
   const dx = (target?.x ?? pos.x)-pos.x, dz = (target?.z ?? pos.z)-pos.z, length = Math.hypot(dx,dz);
   const jump = match.level.id === '06-guishi' && avatar.grounded && now-bot.lastJumpAt >= 650;
   if (jump) { bot.jump++; bot.lastJumpAt = now; }
   this.game.input(bot.id, { matchId: match.id, phaseId: match.phaseId, seq: ++bot.seq, x: length>.2?dx/length:0, z: length>.2?dz/length:0, jumpHeld: now-bot.lastJumpAt<150, jumpPressSeq: bot.jump }, now);
  }
 }
}
