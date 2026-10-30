/** Client networking: Colyseus room, server clock, local prediction and remote interpolation.
 * Movement uses Colyseus' fixed-step input pipeline: one input per server tick, predicted
 * locally with the server's own Rapier step and reconciled against acknowledged state. */
import { Client, type Room } from '@colyseus/sdk';
import { Predict, type Reconciler } from '@colyseus/sdk/predict';
import { initPhysics, MotionWorld, type Command, type MotionState, type PlayerState, type RoomState, type Snapshot, type Match, type Player } from '@jinjiang/shared';

type Session = { roomId: string; playerId: string; resumeToken: string; name: string };
export type Pose = { x: number; y: number; z: number; facing: number; grounded: boolean };
type HostCommand = 'host:start' | 'host:skip' | 'host:finish' | 'host:reset' | 'host:bots:add' | 'host:bots:clear';
const MOTION_FIELDS = ['x', 'y', 'z', 'vy', 'facing', 'grounded', 'jumpT'] as const;
/** Interpolation buffer for other players: a little over two 50 ms patches. */
export const INTERPOLATION_DELAY = 120;
const PATCH_MS = 50;

const errorCode = (error: unknown) => { const e = error as { reason?: unknown; message?: unknown; code?: unknown } | null; return String(e?.reason ?? e?.message ?? '连接失败'); };

/** Builds the JSON snapshot the UI renders from the replicated schema. Missing optional values become null. */
export function toSnapshot(state: RoomState, serverTime: number): Snapshot {
 const json = state.toJSON() as any, players: Record<string, Player> = {};
 for (const [id, p] of Object.entries<any>(json.players ?? {})) players[id] = { id: p.id, name: p.name, color: p.color, connected: p.connected, status: p.status, loaded: p.loaded, avatar: p.active ? { position: { x: p.x, y: p.y, z: p.z }, velocity: { x: 0, y: p.vy, z: 0 }, facing: p.facing, grounded: p.grounded, jumpHeld: false } : null };
 let match: Match | null = null;
 if (json.match) {
  const m = json.match, d = m.level.data;
  match = { ...m, phaseEndsAt: m.phaseEndsAt ?? null, transitionId: m.transitionId ?? null, championId: m.championId ?? null, media: m.media ?? null,
   level: { id: m.level.id, startedAt: m.level.startedAt ?? null, targetCount: m.level.targetCount ?? null, data: { ...d,
    tiles: d.tiles.map((t: any) => ({ disappearsAt: t.disappearsAt ?? null })), owners: d.owners.map((o: string) => o || null),
    teams: d.teams.map((t: any) => ({ ...t, reachedAt: t.reachedAt ?? null })), scores: Object.fromEntries(Object.entries<any>(d.scores).map(([k, v]) => [k, { count: v.count, reachedAt: v.reachedAt ?? null }])),
    sacks: Object.fromEntries(Object.entries<any>(d.sacks).map(([k, v]) => [k, { x: v.x, z: v.z, carrierId: v.carrierId ?? null }])),
    question: d.question ?? null, answer: d.answer ?? null, roundResult: d.roundResult ?? null } } };
 }
 return { serverTime, revision: json.revision, room: { id: json.id, players, match } };
}

export class Connection extends EventTarget {
 /** Latest stick/button state; sampled once per fixed step. `jump` counts presses. */
 intent = { x: 0, z: 0, held: false, jump: 0 };
 snapshot: Snapshot | null = null; session: Session | null = null; room: Room<any, RoomState> | null = null;
 private client = new Client(`${location.protocol}//${location.host}/colyseus`);
 private predict: Predict<RoomState> | null = null;
 private input: ReturnType<Room['input']> | null = null;
 private me: Reconciler<MotionState, Command> | null = null; private meKey = '';
 private physics: MotionWorld | null = null;
 private pendingJumps = 0; private wasGrounded: boolean | null = null; private lastVy = 0; private revision = -1; private host: string | null = null; private generation = 0; private recovering = false;
 private refreshKey = ''; private lastRefresh = 0; private refreshTimer: ReturnType<typeof setTimeout> | undefined;
 constructor() { super(); void initPhysics().then(() => { this.physics = new MotionWorld(); }); }
 get connected() { return !!this.room && !this.room.reconnection.isReconnecting && this.room.connection.isOpen; }
 serverNow() { return this.room ? this.room.clock.serverNow() : performance.now(); }
 private emit(type: string) { this.dispatchEvent(new Event(type)); }
 private bind(room: Room<any, RoomState>) {
  this.room?.removeAllListeners(); this.predict?.dispose(); this.me = null; this.meKey = '';
  this.room = room; this.revision = -1; this.input = null;
  this.predict = Predict.get(room, { mode: 'lerp', delay: INTERPOLATION_DELAY });
  // Arrival times snap to the patch grid so network jitter never changes playback speed; a short
  // output spring keeps velocity continuous when a late patch does starve the buffer.
  const smooth = { mode: 'lerp', delay: INTERPOLATION_DELAY, tickInterval: PATCH_MS, smoothMs: 65, snap: 3 } as const;
  this.predict.attachAll('players', { x: smooth, y: smooth, z: smooth } as any);
  this.predict.attachAll('players', { facing: { ...smooth, snap: 0, angle: true } } as any);
  room.onStateChange(state => { if (state.revision !== this.revision) this.refresh(state); this.emit('world'); });
  // Reconnect the same session (and keep prediction state) even shortly after joining; see recover() for longer outages.
  room.reconnection.minUptime = 1000;
  room.onDrop(() => { this.releaseIntent(); this.emit('disconnected'); });
  room.onReconnect(() => this.emit('connected'));
  room.onLeave(code => { if (this.room !== room) return; this.releaseIntent(); this.emit('disconnected'); /* 4100: taken over by another tab */ if (code !== 1000 && code !== 4000 && code !== 4100) void this.recover(); });
  this.emit('connected');
 }
 /** Rebuild the UI snapshot. Phase and roster changes apply at once; score/tile churn (every tick in
  * Jinshi) is coalesced to 10 Hz, since every rebuild re-renders the HUD, minimap and floor. */
 private refresh(state: RoomState) {
  const key = `${state.match?.id}:${state.match?.phaseId}:${state.players.size}`, now = performance.now();
  if (key !== this.refreshKey || now - this.lastRefresh >= 100 || this.revision < 0) {
   clearTimeout(this.refreshTimer); this.refreshTimer = undefined; this.refreshKey = key; this.lastRefresh = now;
   this.revision = state.revision; this.snapshot = toSnapshot(state, this.serverNow()); this.emit('snapshot');
  } else this.refreshTimer ??= setTimeout(() => { this.refreshTimer = undefined; if (this.room?.state === state && state.revision !== this.revision) this.refresh(state); }, 100 - (now - this.lastRefresh));
 }
 private releaseIntent() { this.intent.x = 0; this.intent.z = 0; this.intent.held = false; this.pendingJumps = 0; }
 /** The room was lost beyond automatic reconnection: rejoin with the stored identity. */
 private async recover() {
  // A drop while already recovering is picked up by the running loop: it retries until a room stays open.
  if (this.recovering) return; this.recovering = true;
  try { for (let attempt = 0; this.recovering; attempt++) { try { if (this.host) await this.attach(this.host); else if (this.session) await this.resume(this.session); else return; if (this.connected) return; } catch (error) { if ((error as Error).message === 'INVALID_SESSION') return; await new Promise(r => setTimeout(r, Math.min(5000, 300 * 2 ** attempt))); } } }
  finally { this.recovering = false; }
 }
 async join(roomId: string, name: string, color = '#e66b55') {
  this.generation++;
  const room = await this.client.joinById<any>(roomId, { name, color }); this.bind(room as Room<any, RoomState>);
  const data = await room.request('session') as { playerId: string; resumeToken: string };
  this.session = { roomId, name, playerId: data.playerId, resumeToken: data.resumeToken }; localStorage.setItem('jinjiang-session', JSON.stringify(this.session));
  await this.firstState(room);
 }
 async resume(session: Session) {
  const generation = ++this.generation;
  let room: Room;
  try { room = await this.client.joinById<any>(session.roomId, { resume: { playerId: session.playerId, resumeToken: session.resumeToken } }); }
  catch (error) { throw new Error(errorCode(error)); }
  if (generation !== this.generation) { void room.leave(); throw new Error('STALE_RESUME'); }
  this.session = session; this.bind(room as Room<any, RoomState>); await this.firstState(room);
 }
 async attach(token: string) {
  this.host = token; this.generation++;
  const config = await (await fetch('/admin/bootstrap')).json() as { roomId: string };
  const room = await this.client.joinById<any>(config.roomId, { host: token }); this.bind(room as Room<any, RoomState>); await this.firstState(room);
  return { roomId: config.roomId };
 }
 /** Resolves on the first state of `room`; rejects if the room is left before that, so callers never hang. */
 private firstState(room: Room) {
  return new Promise<void>((resolve, reject) => {
   if (this.snapshot && this.room === room && this.revision >= 0) return resolve();
   const done = () => { if (this.room === room && this.revision >= 0) { cleanup(); resolve(); } };
   const left = () => { cleanup(); reject(new Error('ROOM_LEFT')); };
   const cleanup = () => { this.removeEventListener('snapshot', done); room.onLeave.remove(left); };
   room.onLeave(left);
   this.addEventListener('snapshot', done);
  });
 }
 /** Stage the live stick state. A press is queued and delivered on the next fixed step. */
 setIntent(x: number, z: number, held: boolean, pressed = false) {
  this.intent.x = x; this.intent.z = z; this.intent.held = held;
  if (pressed && this.controlling()) { this.intent.jump++; this.pendingJumps++; this.emit('jinjiang:jump'); }
 }
 async command(event: HostCommand) {
  const m = this.snapshot?.room.match, room = this.room; if (!room) throw new Error('连接中断');
  const payload = event === 'host:start' || event.startsWith('host:bots:') ? {} : { requestId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`, matchId: m?.id, phaseId: m?.phaseId };
  try { await room.request(event, payload); } catch (error) { throw new Error(errorCode(error)); }
 }
 private self(): PlayerState | undefined { const id = this.session?.playerId; return id ? this.room?.state.players?.get(id) : undefined; }
 /** Local input drives the avatar only while the server accepts it. */
 controlling() { const m = this.room?.state.match, p = this.self(); return !!m && m.phase === 'playing' && p?.status === 'playing' && p.active && !!this.physics; }
 /** Advance prediction for this render frame. Order matters: tick, then send, then read. */
 update(now: number) {
  const predict = this.predict, room = this.room; if (!predict || !room) return;
  const steps = predict.tick(now), m = room.state.match, self = this.self(), physics = this.physics;
  if (!this.controlling() || !self || !physics || !m || !this.connected) { this.pendingJumps = 0; return; }
  const key = `${m.id}:${m.level.id}`;
  this.input ??= room.input();
  if (!this.me) this.me = predict.reconciler(self as unknown as MotionState, { input: this.input as any, fields: MOTION_FIELDS as any, smoothMs: 90, snap: 2.5, step: (ctx, state, command) => physics.step(state, command as Command, ctx.dt) }) as unknown as Reconciler<MotionState, Command>;
  if (key !== this.meKey) { this.meKey = key; this.me.reset(); this.wasGrounded = null; }
  physics.setLevel(m.level.id); physics.updateTiles(m.level.data.tiles as any, m.level.data.gaps as any, this.serverNow());
  const keep = new Set<string>();
  for (const [id, p] of room.state.players) { if (id === this.session!.playerId || !p.active || p.status !== 'playing') continue; keep.add(id); physics.setObstacle(id, predict.value(p, 'x'), predict.value(p, 'y'), predict.value(p, 'z')); }
  physics.retainObstacles(keep);
  for (let i = 0; i < steps; i++) {
   const data = this.input.data as Command;
   data.x = this.intent.x; data.z = this.intent.z; data.held = this.intent.held; data.jump = this.pendingJumps > 0;
   if (this.pendingJumps > 0) this.pendingJumps--;
   this.input.send();
   // Each send is one live predicted step (replays never pass through here), so feedback is immediate.
   const st = this.me.state;
   if (this.wasGrounded === false && st.grounded) this.dispatchEvent(new CustomEvent('local:land', { detail: { speed: -this.lastVy } }));
   this.wasGrounded = st.grounded; this.lastVy = st.vy;
  }
 }
 /** Render pose: own avatar from prediction, everyone else interpolated in the past. */
 pose(id: string): Pose | null {
  const p = this.room?.state.players?.get(id); if (!p || !p.active) return null;
  if (id === this.session?.playerId && this.me && this.controlling()) { const me = this.me; return { x: me.value('x'), y: me.value('y'), z: me.value('z'), facing: me.state.facing, grounded: me.state.grounded }; }
  const predict = this.predict!; return { x: predict.value(p, 'x'), y: predict.value(p, 'y'), z: predict.value(p, 'z'), facing: predict.value(p, 'facing'), grounded: p.grounded };
 }
 /** Tell the server how much of the game's assets this phone has downloaded (0–100). */
 reportLoad(percent: number) { if (this.room?.connection.isOpen) this.room.send('client:load', Math.round(percent)); }
 /** Reconciliation telemetry: per-patch correction size and drift (persistent vs jitter). */
 netStats() { const me = this.me as unknown as { lastCorrectionMag: number; drift: { ema: number; peak: number }; reconcileSeq: number } | null; return { correction: me?.lastCorrectionMag ?? 0, reconciles: me?.reconcileSeq ?? 0, driftEma: me?.drift.ema ?? 0, driftPeak: me?.drift.peak ?? 0, rtt: this.room?.clock.rtt() ?? 0 }; }
 /** Latest authoritative motion, e.g. for audio cues and the minimap. */
 avatarOf(id: string) { const p = this.room?.state.players?.get(id); return p?.active ? p : null; }
}
