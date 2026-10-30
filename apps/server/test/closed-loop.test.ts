import test from 'node:test';
import assert from 'node:assert/strict';
import { io, gameProxy, type Socket } from '../../test/support/game-client.js';
import { createGameServer } from '../src/server.js';
import { Game, defaults } from '../src/game.js';

type Response = { ok: boolean; code?: string; data: any };
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function connect(url: string): Promise<Socket> {
  const socket = io(url, { forceNew: true, reconnection: false });
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
}
async function call(socket: Socket, event: string, data: unknown): Promise<Response> {
  return await new Promise((resolve, reject) => socket.timeout(1500).emit(event, data, (err: Error | null, response: Response) => err ? reject(err) : resolve(response)));
}
async function until<T>(fn: () => Promise<T | null>, timeoutMs = 6000): Promise<T> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { const result = await fn(); if (result !== null) return result; await delay(25); }
  throw new Error('Timed out waiting for condition');
}

test('two real clients join, move and jump, trigger tiles, reconnect and finish with the same result', async t => {
  const server = createGameServer({introMs:0, levels: ['04-shisan'], cardMs: 80, countdownMs: 80, playMs: 5000, protectionMs: 500, collapseMs: 400, inputTimeoutMs: 400, tickRate: 30, broadcastRate: 15 });
  const port = await server.listen(); const url = `http://127.0.0.1:${port}`;
  const sockets: Socket[] = []; let keepMoving: NodeJS.Timeout | undefined;
  t.after(async () => { if (keepMoving) clearInterval(keepMoving); for (const s of sockets) s.disconnect(); await server.close(); });
  const host = await connect(url), a = await connect(url), b = await connect(url); sockets.push(host, a, b);
  const unauthorized = await call(a, 'host:start', {}); assert.equal(unauthorized.code, 'HOST_DENIED');
  const attached = await call(host, 'host:attach', { token: server.game.hostToken }); assert.equal(attached.ok, true);
  const roomId = attached.data.roomId;
  const ja = await call(a, 'room:join', { roomId, name: '小明' });
  const jb = await call(b, 'room:join', { roomId, name: '小明' });
  assert.ok(ja.ok && jb.ok); assert.notEqual(ja.data.playerId, jb.data.playerId);
  const started = await call(host, 'host:start', {}); assert.equal(started.ok, true);
  const active = await until(async () => { const s = await call(host, 'room:snapshot', {}); return s.data.room.match?.phase === 'playing' ? s.data : null; });
  const match = active.room.match, idA = ja.data.playerId, idB = jb.data.playerId;
  let seq = 0; let current = a;
  const input = () => current.emit('input', { matchId: match.id, phaseId: match.phaseId, seq: ++seq, x: 0, z: -0.7, jumpHeld: seq < 4, jumpPressSeq: 1 }); // north, away from the idle player
  input(); keepMoving = setInterval(input, 65);
  await until(async () => { const s = await call(host, 'room:snapshot', {}); const av = s.data.room.players[idA].avatar; return av.position.y > 0.55 && av.position.z < 0 ? av : null; });
  clearInterval(keepMoving); keepMoving = undefined; a.disconnect();
  await until(async () => { const s = await call(host, 'room:snapshot', {}); return s.data.room.players[idA].connected === false ? s.data : null; });
  const resumed = await connect(url); sockets.push(resumed);
  const wrong = await call(resumed, 'session:resume', { roomId, playerId: idA, resumeToken: 'bad' }); assert.equal(wrong.code, 'INVALID_SESSION');
  const recovery = await call(resumed, 'session:resume', { roomId, playerId: idA, resumeToken: ja.data.resumeToken });
  assert.equal(recovery.ok, true); assert.equal(recovery.data.playerId, idA); assert.equal(recovery.data.snapshot.room.players[idA].connected, true);
  assert.equal(recovery.data.snapshot.room.match.id, match.id); current = resumed;
  input(); keepMoving = setInterval(input, 65);
  const tileSnapshot = await until(async () => { const s = await call(host, 'room:snapshot', {}); return s.data.room.match.level.data.tiles.some((tile: { disappearsAt: number | null }) => tile.disappearsAt !== null) ? s.data : null; });
  assert.ok(tileSnapshot.room.match.level.data.tiles.some((tile: { disappearsAt: number | null }) => tile.disappearsAt !== null));
  const done = await until(async () => { const s = await call(host, 'room:snapshot', {}); return s.data.room.match.phase === 'result' ? s.data : null; });
  clearInterval(keepMoving); keepMoving = undefined;
  const result = done.room.match.results[0];
  assert.equal(result.reason, 'survival'); assert.deepEqual(result.qualifiedIds, [idA]); assert.deepEqual(result.eliminatedIds, [idB]);
  assert.ok(done.room.match.level.data.fellAt[idB]);
  for (const client of [resumed, b]) {
    const state = await call(client, 'room:snapshot', {});
    assert.deepEqual(state.data.room.match.results, done.room.match.results);
    assert.equal(state.data.room.players[idB].status, 'eliminated');
    assert.equal(state.data.room.players[idA].status, 'qualified');
  }
  b.disconnect();
  const observer = await connect(url); sockets.push(observer);
  const back = await call(observer, 'session:resume', { roomId, playerId: idB, resumeToken: jb.data.resumeToken });
  assert.equal(back.data.snapshot.room.players[idB].status, 'eliminated');
  assert.deepEqual(back.data.snapshot.room.match.results, done.room.match.results);
  // Input after the level ended is dropped by the server and counted as rejected.
  resumed.emit('input', { x: 1, z: 0, jumpHeld: false, jumpPressSeq: 2 }); await delay(300); resumed.disconnect();
  const diagnostics = await (await fetch(`${url}/admin/diagnostics`, { headers: { 'x-host-token': server.game.hostToken } })).json() as any;
  assert.ok(diagnostics.players.find((p: any) => p.id === idA).transport.reasons.INPUT_NOT_ALLOWED > 0);
});

test('stationary tile triggers after protection; jump does not trigger a tile while airborne', () => {
  const game = new Game({ ...defaults,introMs:0, levels: ['04-shisan'], cardMs: 0, countdownMs: 0, protectionMs: 1000, collapseMs: 600 });
  const a = game.join('a', '#ffffff'), b = game.join('b', '#000000'); game.start(10000);
  game.step(10000, 1 / 30); game.step(10001, 1 / 30);
  const m = game.match!; const playerA = game.players.get(a.playerId)!;
  const pos = playerA.avatar!.position; const tile = Math.floor(pos.z + 10) * 20 + Math.floor(pos.x + 10);
  game.step(10500, 1 / 30); assert.equal(m.level.data.tiles[tile].disappearsAt, null);
  game.step(11001, 1 / 30); assert.equal(m.level.data.tiles[tile].disappearsAt, 11601);
  const pb = game.players.get(b.playerId)!; const idx = Math.floor(pb.avatar!.position.z + 10) * 20 + Math.floor(pb.avatar!.position.x + 10);
  assert.equal(m.level.data.tiles[idx].disappearsAt, 11601);
  const airborneTile = idx + 20; pb.avatar!.position.z += 1; pb.avatar!.position.y = 1; pb.avatar!.grounded = false; pb.avatar!.velocity.y = 1;
  game.step(11034, 1 / 30); assert.equal(m.level.data.tiles[airborneTile].disappearsAt, null);
});
