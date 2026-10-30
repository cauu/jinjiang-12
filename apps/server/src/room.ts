import { Room, ServerError, type Client, type MessageContext } from '@colyseus/core';
import { InputCommand, type RoomState } from '@jinjiang/shared';
import { Game, GameError, type Options } from './game.js';
import { DemoBots } from './bots.js';
import { StateMirror } from './mirror.js';

type Seat = { playerId: string | null; resumeToken?: string; host: boolean };
type InputStats = { received: number; accepted: number; rejected: number; reasons: Record<string, number>; lastAcceptedAt: number | null; lastRejectedAt: number | null; lastRejectedReason: string | null };
export type GameRuntime = { game: Game; bots: DemoBots; options: Options; room: GameRoom | null; inputStats: Map<string, InputStats>; lastTickAt: number | null; lastPatchAt: number | null };
/** Room instances look up their Game here; matchmaking options only carry the key. */
export const runtimes = new Map<string, GameRuntime>();
/** Close code for a session taken over by the same player elsewhere; clients must not auto-rejoin. */
export const REPLACED = 4100;

const fail = (error: unknown): never => { throw new ServerError(4400, error instanceof GameError ? error.code : error instanceof Error ? error.message : 'INTERNAL_ERROR'); };

/** One authoritative room per process. Movement runs on Colyseus' fixed timestep; inputs are consumed one per predicted client step. */
export class GameRoom extends Room<{ state: RoomState; input: InputCommand }> {
 inputs = this.defineInput(InputCommand, { bufferMaxSize: 64, sanitize: { x: [-1, 1], z: [-1, 1] } });
 private runtime!: GameRuntime;
 private mirror!: StateMirror;
 private commandResults = new Map<string, unknown>();
 autoDispose = false;
 get game() { return this.runtime.game; }
 now() { return Math.round(this.clock.elapsedTime); }

 onCreate(options: { runtime: string }) {
  this.runtime = runtimes.get(options.runtime)!;
  this.runtime.room = this;
  this.roomId = this.game.roomId;
  this.maxClients = 200;
  this.mirror = new StateMirror(this.game);
  this.setState(this.mirror.state);
  this.setPatchRate(1000 / this.runtime.options.broadcastRate);
  this.setFixedTimestep(ctx => this.tick(ctx.dt), this.runtime.options.tickRate);
  this.onMessage('session', client => { const seat = client.userData as Seat; return { playerId: seat.playerId, resumeToken: seat.resumeToken ?? null, host: seat.host }; });
  this.onMessage('host:start', client => this.host(client, () => this.game.start(this.now())));
  this.onMessage('host:bots:add', client => this.host(client, () => this.runtime.bots.add(9)));
  this.onMessage('host:bots:clear', client => this.host(client, () => this.runtime.bots.clear()));
  for (const [type, action] of [['host:skip', () => this.game.skip(this.now())], ['host:finish', () => this.game.finishNow(this.now())], ['host:reset', () => this.game.reset()]] as const)
   this.onMessage(type, (client, data: { requestId?: unknown; matchId?: unknown; phaseId?: unknown } | null, ctx: MessageContext) => this.host(client, () => {
    if (typeof data?.requestId !== 'string' || !data.requestId || data.requestId.length > 100) throw new GameError('INVALID_REQUEST');
    const key = `${type}:${data.requestId}`; if (this.commandResults.has(key)) return;
    const m = this.game.match; if (!m || data.matchId !== m.id || data.phaseId !== m.phaseId) throw new GameError('STALE_PHASE');
    action(); this.commandResults.set(key, true); if (this.commandResults.size > 1000) this.commandResults.delete(this.commandResults.keys().next().value!);
   }, ctx));
  this.onMessage('media:status', (client, data: { matchId?: unknown; phaseId?: unknown; status?: unknown } | null, ctx: MessageContext) => {
   const m = this.game.match; if (!m || data?.matchId !== m.id || data?.phaseId !== m.phaseId || !['playing', 'failed', 'ended'].includes(String(data?.status))) return ctx.reject('INVALID_MEDIA_STATUS');
   return { received: true };
  });
 }
 private host(client: Client, action: () => void, ctx?: MessageContext) {
  if (!(client.userData as Seat | undefined)?.host) return ctx ? ctx.reject('HOST_DENIED') : fail(new GameError('HOST_DENIED'));
  try { action(); this.mirror.sync(this.now()); return { revision: this.game.revision }; }
  catch (error) { if (ctx) return ctx.reject(error instanceof GameError ? error.code : 'INTERNAL_ERROR'); return fail(error); }
 }
 onJoin(client: Client, options: { host?: unknown; name?: unknown; color?: unknown; resume?: { playerId?: unknown; resumeToken?: unknown } } = {}) {
  try {
   if (options.host !== undefined) { if (!this.game.checkHost(options.host)) throw new GameError('HOST_DENIED'); client.userData = { playerId: null, host: true } satisfies Seat; return; }
   let seat: Seat;
   if (options.resume) seat = { playerId: this.game.resume(options.resume.playerId, options.resume.resumeToken), resumeToken: String(options.resume.resumeToken), host: false };
   else { const session = this.game.join(options.name, options.color); seat = { playerId: session.playerId, resumeToken: session.resumeToken, host: false }; }
   for (const other of this.clients) if (other !== client && (other.userData as Seat | undefined)?.playerId === seat.playerId) { (other.userData as Seat).playerId = null; other.leave(REPLACED, 'REPLACED'); }
   client.userData = seat;
   this.mirror.sync(this.now());
  } catch (error) { fail(error); }
 }
 onDrop(client: Client) {
  const id = (client.userData as Seat | undefined)?.playerId;
  if (id) { this.game.disconnect(id); this.mirror.sync(this.now()); }
  // The SDK reconnects automatically within this window and keeps the same session.
  // Rejected when the window expires or the room shuts down; onLeave then finalizes.
  void this.allowReconnection(client, 20).catch(() => {});
 }
 onReconnect(client: Client) { const id = (client.userData as Seat | undefined)?.playerId; if (id) { this.game.reconnect(id); this.mirror.sync(this.now()); } }
 onLeave(client: Client) { const id = (client.userData as Seat | undefined)?.playerId; if (id && !this.clients.some(c => c !== client && (c.userData as Seat | undefined)?.playerId === id)) { this.game.disconnect(id); this.mirror.sync(this.now()); } }
 onBeforePatch() { this.mirror.sync(this.now()); this.runtime.lastPatchAt = this.now(); }
 private tick(dt: number) {
  const now = this.now(), game = this.game;
  for (const client of this.clients) {
   const id = (client.userData as Seat | undefined)?.playerId; if (!id) continue;
   let stats = this.runtime.inputStats.get(id);
   for (const command of this.inputs.get(client.sessionId)) {
    stats ??= { received: 0, accepted: 0, rejected: 0, reasons: {}, lastAcceptedAt: null, lastRejectedAt: null, lastRejectedReason: null }; this.runtime.inputStats.set(id, stats); stats.received++;
    try { game.input(id, { x: command.x, z: command.z, jump: command.jump, held: command.held }, now); stats.accepted++; stats.lastAcceptedAt = now; }
    catch (error) { const code = error instanceof GameError ? error.code : 'INTERNAL_ERROR'; stats.rejected++; stats.lastRejectedAt = now; stats.lastRejectedReason = code; stats.reasons[code] = (stats.reasons[code] ?? 0) + 1; }
   }
  }
  this.runtime.bots.step(now);
  game.step(now, dt);
  this.runtime.lastTickAt = now;
 }
}
