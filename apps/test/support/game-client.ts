/** Test-only adapter: the old request/ack call shape on top of the Colyseus SDK, so tests
 * keep describing behaviour ("join", "start", "send input") rather than transport details. */
import { Client, type Room } from '@colyseus/sdk';
import type { RoomState, Snapshot } from '@jinjiang/shared';
import { toSnapshot } from '../../../packages/game-client/src/net.js';
export { gameProxy } from '../../mobile/vite.config.js';

type Response = any;
type Listener = (payload: any) => void;
const codeOf = (error: any) => String(error?.reason ?? error?.message ?? 'INTERNAL_ERROR');

export class TestSocket {
 room: Room<any, RoomState> | null = null; connected = true; playerId: string | null = null;
 private client: Client; private listeners = new Map<string, Set<Listener>>(); private revision = -1; private host = false;
 private intent = { x: 0, z: 0, held: false, jumpPressSeq: 0 }; private sentJumps = 0; private sender: NodeJS.Timeout | null = null;
 constructor(private url: string) { this.client = new Client(url); }
 on(event: string, cb: Listener) { if (event === 'connect') { setTimeout(() => cb(undefined), 0); return this; } let set = this.listeners.get(event); if (!set) this.listeners.set(event, set = new Set()); set.add(cb); return this; }
 once(event: string, cb: Listener) { if (event === 'connect' || event === 'connect_error') { if (event === 'connect') setTimeout(() => cb(undefined), 0); return this; } const wrap = (p: any) => { this.listeners.get(event)?.delete(wrap); cb(p); }; return this.on(event, wrap); }
 off(event: string, cb: Listener) { this.listeners.get(event)?.delete(cb); return this; }
 private fire(event: string, payload: any) { for (const cb of [...this.listeners.get(event) ?? []]) cb(payload); }
 snapshot(): Snapshot { return toSnapshot(this.room!.state, this.room!.clock.serverNow()); }
 timeout(_ms: number) { return { emit: (event: string, data: unknown, cb: (err: Error | null, r: Response) => void) => { this.call(event, data).then(r => cb(null, r), e => cb(e, undefined as any)); } }; }
 get volatile() { return this; }
 emit(event: string, data: any, cb?: (r: Response) => void) { if (event === 'input') { this.setInput(data); cb?.({ ok: true }); return; } void this.call(event, data).then(r => cb?.(r)); }
 private bind(room: Room<any, RoomState>) {
  this.room = room; this.revision = -1;
  room.onStateChange(state => { if (state.revision !== this.revision) { this.revision = state.revision; this.fire('room:snapshot', this.snapshot()); } this.fire('world:state', this.world()); });
  room.onLeave(() => { this.connected = false; this.stopSender(); this.fire('disconnect', undefined); });
 }
 world() { const s = this.room!.state; return { tick: 0, matchId: s.match?.id ?? null, phaseId: s.match?.phaseId ?? null, players: Object.fromEntries([...s.players].filter(([, p]) => p.active).map(([id, p]) => [id, { avatar: { position: { x: p.x, y: p.y, z: p.z }, velocity: { x: 0, y: p.vy, z: 0 }, facing: p.facing, grounded: p.grounded, jumpHeld: false } }])) }; }
 /** The legacy "intent" input: the latest stick state is sent once per fixed step until changed. */
 private setInput(data: { x?: number; z?: number; jumpHeld?: boolean; jumpPressSeq?: number; jump?: boolean; held?: boolean }) {
  this.intent.x = Number(data.x ?? 0); this.intent.z = Number(data.z ?? 0); this.intent.held = !!(data.jumpHeld ?? data.held);
  if (typeof data.jumpPressSeq === 'number') this.intent.jumpPressSeq = Math.max(this.intent.jumpPressSeq, data.jumpPressSeq); else if (data.jump) this.intent.jumpPressSeq++;
  if (!this.sender && this.room) { const input = this.room.input(); this.sender = setInterval(() => { if (!this.connected) return; const d = input.data as any; d.x = this.intent.x; d.z = this.intent.z; d.held = this.intent.held; d.jump = this.intent.jumpPressSeq > this.sentJumps; if (d.jump) this.sentJumps = this.intent.jumpPressSeq; input.send(); }, input.stepMs ?? 1000 / 30); }
 }
 private stopSender() { if (this.sender) clearInterval(this.sender); this.sender = null; }
 private async settle(revision?: number) { if (revision === undefined) return; const end = Date.now() + 2000; while (this.room && this.room.state.revision < revision && Date.now() < end) await new Promise(r => setTimeout(r, 10)); }
 async call(event: string, data: any): Promise<Response> {
  try {
   switch (event) {
    case 'host:attach': {
     const boot = await (await fetch(`${this.url}/admin/bootstrap`)).json() as { roomId: string };
     const room = await this.client.joinById<any>(boot.roomId, { host: data?.token ?? '' }); this.bind(room); this.host = true; await this.firstState();
     return { ok: true, data: { roomId: boot.roomId, snapshot: this.snapshot() } };
    }
    case 'room:join': case 'session:resume': {
     if (this.playerId && (event === 'room:join' || data?.playerId !== this.playerId)) return { ok: false, code: 'ALREADY_BOUND' };
     const options = event === 'room:join' ? { name: data?.name, color: data?.color } : { resume: { playerId: data?.playerId, resumeToken: data?.resumeToken } };
     const room = await this.client.joinById<any>(String(data?.roomId), options); this.bind(room); await this.firstState();
     const session = await room.request('session') as { playerId: string; resumeToken: string }; this.playerId = session.playerId;
     return { ok: true, data: event === 'room:join' ? { playerId: session.playerId, resumeToken: session.resumeToken, snapshot: this.snapshot() } : { playerId: session.playerId, snapshot: this.snapshot(), inputCursor: { seq: 0, jumpPressSeq: 0 } } };
    }
    // A ping round trip first: TCP ordering guarantees every earlier patch has been applied.
    case 'room:snapshot': { const room = this.room; if (!room) return { ok: false, code: 'NOT_JOINED' }; await new Promise<number>(resolve => room.ping(resolve)); return { ok: true, data: this.snapshot() }; }
    case 'time:ping': { const room = this.room; if (room) await new Promise<number>(resolve => room.ping(resolve)); return { ok: true, data: { serverTime: room?.clock.serverNow() ?? 0 } }; }
    default: {
     if (!this.room) return { ok: false, code: event.startsWith('host:') ? 'HOST_DENIED' : 'NOT_JOINED' };
     const reply = await this.room.request(event, data ?? {}) as { revision?: number } | undefined; await this.settle(reply?.revision);
     return { ok: true, data: event.startsWith('host:') ? this.snapshot() : reply };
    }
   }
  } catch (error) { return { ok: false, code: codeOf(error) }; }
 }
 private firstState() { return new Promise<void>(resolve => { const check = () => this.room && this.room.state.revision !== undefined && this.room.state.id ? resolve() : setTimeout(check, 5); check(); }); }
 disconnect() { this.stopSender(); this.connected = false; if (this.room) { this.room.reconnection.enabled = false; this.room.leave().catch(() => {}); } return this; }
}
export const io = (url: string, _options?: unknown) => new TestSocket(url);
export type Socket = TestSocket;
