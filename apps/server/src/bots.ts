import { Game, GameError } from './game.js';

type Bot = { id: string; number: number; lastJumpAt: number; checkAt: number; checkX: number; checkZ: number; sidestepUntil: number };
type Point = { x: number; z: number };
const colors = ['#5a9bd5', '#efa34a', '#a06ec1', '#65b98b', '#e67585', '#67bdc2'];
/** Waypoints on a ring; a bot that has already reached the current one heads for the next, so it never idles. */
const wander = (phase: number, radius: number, from: Point) => { for (let k = Math.floor(phase); ; k++) { const angle = k * 2.4, p = { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }; if (Math.hypot(p.x - from.x, p.z - from.z) > 1) return p; } };
const nearest = (from: Point, points: Point[]) => points.sort((a, b) => Math.hypot(a.x-from.x,a.z-from.z)-Math.hypot(b.x-from.x,b.z-from.z))[0];

/** Simple demo opponents use the same fixed-step commands and simulation as a human player. */
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
   const { playerId } = this.game.join(`机器人${number}`, colors[(number-1)%colors.length], number % 2 ? 'boy' : 'girl');
   this.game.players.get(playerId)!.loaded = 100; // bots download nothing
   this.bots.set(playerId, { id: playerId, number, lastJumpAt: 0, checkAt: 0, checkX: 0, checkZ: 0, sidestepUntil: 0 });
  }
 }
 clear() {
  if (this.game.match) throw new GameError('MATCH_EXISTS');
  for (const id of this.bots.keys()) this.game.removeWaitingPlayer(id);
  this.bots.clear();
 }
 step(now: number) {
  const match = this.game.match;
  if (!match || match.phase !== 'playing') return;
  if (this.matchId !== match.id) {
   this.matchId = match.id;
   for (const bot of this.bots.values()) { bot.lastJumpAt = 0; bot.checkAt = 0; bot.sidestepUntil = 0; }
  }
  for (const bot of this.bots.values()) {
   const player = this.game.players.get(bot.id), avatar = player?.avatar;
   if (!avatar || player?.status !== 'playing') continue;
   const pos = avatar.position, data = match.level.data;
   let target: Point | undefined;
   switch (match.level.id) {
    case '01-jinshi': {
     target = wander(now / 2200 + bot.number, 7, pos); break;
    }
    case '02-dengshi': target = { x: [-7,0,7][(bot.number + data.questionIndex)%3], z: 0 }; break;
    case '03-qibaoshi': target = nearest(pos, Object.values(data.items).filter(item => item.landsAt <= now && item.expiresAt > now)); break;
    case '04-shisan': {
     target = wander(now / 1800 + bot.number, 6, pos); break;
    }
    case '05-jiushi': {
     const carrying = Object.values(data.sacks).some(s => s.carrierId === bot.id);
     target = carrying ? nearest(pos, [{x:-8,z:-8},{x:-8,z:8},{x:8,z:-8},{x:8,z:8}]) : nearest(pos, Object.values(data.sacks).filter(s => s.carrierId === null)); break;
    }
    case '06-guishi': target = { x: 0, z: -15 }; break;
   }
   const dx = (target?.x ?? pos.x)-pos.x, dz = (target?.z ?? pos.z)-pos.z, length = Math.hypot(dx,dz);
   const jump = match.level.id === '06-guishi' && avatar.grounded && now-bot.lastJumpAt >= 650;
   if (jump) bot.lastJumpAt = now;
   // One command per simulation tick, exactly like a predicting client.
   let mx = length>.2?dx/length:0, mz = length>.2?dz/length:0;
   // Two bots walking into each other head-on can deadlock; a bot that barely moved while trying sidesteps briefly.
   if (now - bot.checkAt >= 400) { if ((mx || mz) && Math.hypot(pos.x-bot.checkX, pos.z-bot.checkZ) < .15) bot.sidestepUntil = now + 500; bot.checkAt = now; bot.checkX = pos.x; bot.checkZ = pos.z; }
   if (now < bot.sidestepUntil) { const side = bot.number % 2 ? 1 : -1; [mx, mz] = [-mz*side, mx*side]; }
   this.game.input(bot.id, { x: mx, z: mz, jump, held: now-bot.lastJumpAt<150 }, now);
  }
 }
}
