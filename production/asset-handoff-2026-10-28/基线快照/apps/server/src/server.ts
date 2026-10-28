import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { createReadStream, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { defaults, Game, GameError, type Options } from './game.js';
import { DemoBots } from './bots.js';

type Ack = (response: unknown) => void;
export function createGameServer(overrides: Partial<Options> = {}, mediaDirectory = process.env.MEDIA_DIR ?? fileURLToPath(new URL('../../../assets/video/', import.meta.url))) {
  const options = { ...defaults, ...overrides };
  type InputStats = {received:number;accepted:number;rejected:number;reasons:Record<string,number>;lastAcceptedAt:number|null;lastRejectedAt:number|null;lastRejectedReason:string|null};
  const inputStats=new Map<string,InputStats>();let unboundRejected=0,lastTickAt:number|null=null,lastBroadcastAt:number|null=null;
  const http = createServer((req, res) => {
    if (req.url === '/admin/bootstrap' && req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ roomId: game.roomId, token: game.hostToken })); }
    else if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true })); }
    else if (req.url === '/admin/diagnostics' && req.method === 'GET') {
      if (!game.checkHost(req.headers['x-host-token'])) { res.writeHead(403); res.end(); return; }
      const time=now(),state=game.diagnostics(time);
      res.writeHead(200, {'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify({...state,simulation:{tickRate:options.tickRate,broadcastRate:options.broadcastRate,lastTickAt,lastBroadcastAt,tickAgeMs:lastTickAt===null?null:time-lastTickAt,broadcastAgeMs:lastBroadcastAt===null?null:time-lastBroadcastAt},unboundRejected,players:state.players.map(p=>({...p,transport:inputStats.get(p.id)??null}))}));
    }
    else if ((req.method === 'GET' || req.method === 'HEAD') && /^\/media\/(intro|wind|rebirth|ending)(_phone)?\.mp4$/.test(req.url ?? '')) {
      const filename = (req.url ?? '').slice('/media/'.length);
      const file = resolve(mediaDirectory, filename);
      let size: number; try { size = statSync(file).size; } catch { res.writeHead(404); res.end(); return; }
      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        const start = match ? Number(match[1]) : -1, end = match && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
        if (!match || start >= size || start < 0 || end < start) { res.writeHead(416, {'Content-Range': `bytes */${size}`}); res.end(); return; }
        res.writeHead(206, {'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});
        if (req.method === 'HEAD') res.end(); else createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
      } else {
        res.writeHead(200, {'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':size});
        if (req.method === 'HEAD') res.end(); else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
      }
    } else { res.writeHead(404); res.end(); }
  });
  const io = new Server(http, { serveClient: false });
  const game = new Game(options);
  const bots = new DemoBots(game);
  const sockets = new Map<string, string>();
  const commandResults = new Map<string, unknown>();
  const epoch = Date.now(), origin = performance.now();
  const now = () => Math.round(epoch + performance.now() - origin);
  const publish = () => io.to(game.roomId).emit('room:snapshot', game.snapshot(now()));
  const reply = (ack: unknown, work: () => unknown) => {
    if (typeof ack !== 'function') return;
    try { (ack as Ack)({ ok: true, data: work() }); }
    catch (error) { (ack as Ack)({ ok: false, code: error instanceof GameError ? error.code : 'INTERNAL_ERROR' }); }
  };
  io.on('connection', socket => {
    let playerId: string | null = null, host = false;
    const bind = (id: string) => {
      if (!socket.connected) throw new GameError('CONNECTION_CLOSED');
      if (playerId && playerId !== id) throw new GameError('ALREADY_BOUND');
      const previous = sockets.get(id); sockets.set(id, socket.id); playerId = id;
      socket.join(game.roomId);
      if (previous && previous !== socket.id) io.sockets.sockets.get(previous)?.disconnect(true);
    };
    socket.on('host:attach', (data: unknown, ack: unknown) => reply(ack, () => {
      const d = data as { token?: unknown } | null;
      if (!game.checkHost(d?.token)) throw new GameError('HOST_DENIED');
      host = true; socket.join(game.roomId); return { roomId: game.roomId, snapshot: game.snapshot(now()) };
    }));
    socket.on('room:join', (data: unknown, ack: unknown) => reply(ack, () => {
      if (playerId) throw new GameError('ALREADY_BOUND');
      const d = data as { roomId?: unknown; name?: unknown; color?: unknown } | null;
      if (d?.roomId !== game.roomId) throw new GameError('ROOM_NOT_FOUND');
      const session = game.join(d?.name, d?.color); bind(session.playerId);
      const snapshot = game.snapshot(now()); publish(); return { ...session, snapshot };
    }));
    socket.on('session:resume', (data: unknown, ack: unknown) => reply(ack, () => {
      const d = data as { roomId?: unknown; playerId?: unknown; resumeToken?: unknown } | null;
      if (d?.roomId !== game.roomId) throw new GameError('ROOM_NOT_FOUND');
      if (!socket.connected) throw new GameError('CONNECTION_CLOSED');
      if (playerId && playerId !== d?.playerId) throw new GameError('ALREADY_BOUND');
      const id = game.resume(d?.playerId, d?.resumeToken); bind(id);
      const snapshot = game.snapshot(now()); publish(); return { playerId: id, snapshot, inputCursor: game.inputCursor(id) };
    }));
    socket.on('host:start', (_data: unknown, ack: unknown) => reply(ack, () => { if (!host) throw new GameError('HOST_DENIED'); game.start(now()); publish(); return game.snapshot(now()); }));
    for (const [event, action] of [['host:bots:add', () => bots.add(9)], ['host:bots:clear', () => bots.clear()]] as const) socket.on(event, (_data: unknown, ack: unknown) => reply(ack, () => { if (!host) throw new GameError('HOST_DENIED'); action(); publish(); return game.snapshot(now()); }));
    socket.on('time:ping', (_data: unknown, ack: unknown) => reply(ack, () => ({serverTime: now()})));
    socket.on('media:status', (data: unknown, ack: unknown) => reply(ack, () => { if (!playerId && !host) throw new GameError('NOT_JOINED'); const d = data as { matchId?: unknown; phaseId?: unknown; status?: unknown } | null; if (!game.match || d?.matchId !== game.match.id || d?.phaseId !== game.match.phaseId || !['playing','failed','ended'].includes(String(d?.status))) throw new GameError('INVALID_MEDIA_STATUS'); return { received: true }; }));
    for (const [event, action] of [
      ['host:skip', () => game.skip(now())], ['host:finish', () => game.finishNow(now())], ['host:reset', () => game.reset()]
    ] as const) socket.on(event, (data: unknown, ack: unknown) => reply(ack, () => {
      if (!host) throw new GameError('HOST_DENIED');
      const d = data as { requestId?: unknown; matchId?: unknown; phaseId?: unknown } | null;
      if (typeof d?.requestId !== 'string' || !d.requestId || d.requestId.length > 100) throw new GameError('INVALID_REQUEST');
      const key = `${event}:${d.requestId}`;
      if (commandResults.has(key)) return commandResults.get(key);
      if (!game.match || d.matchId !== game.match.id || d.phaseId !== game.match.phaseId) throw new GameError('STALE_PHASE');
      action(); const result = game.snapshot(now()); commandResults.set(key, result);
      if (commandResults.size > 1000) commandResults.delete(commandResults.keys().next().value!);
      publish(); return result;
    }));
    socket.on('room:snapshot', (_data: unknown, ack: unknown) => reply(ack, () => { if (!playerId && !host) throw new GameError('NOT_JOINED'); return game.snapshot(now()); }));
    socket.on('input', (data: unknown, ack?: unknown) => {
      let stats:InputStats|undefined;if(playerId){stats=inputStats.get(playerId);if(!stats){stats={received:0,accepted:0,rejected:0,reasons:{},lastAcceptedAt:null,lastRejectedAt:null,lastRejectedReason:null};inputStats.set(playerId,stats);}stats.received++;}
      try { if (!playerId || sockets.get(playerId) !== socket.id) throw new GameError('NOT_JOINED');const time=now();game.input(playerId, data, time);if(stats){stats.accepted++;stats.lastAcceptedAt=time;}if (typeof ack === 'function') (ack as Ack)({ ok: true }); }
      catch (error) {const code=error instanceof GameError?error.code:'INTERNAL_ERROR';if(stats){stats.rejected++;stats.lastRejectedAt=now();stats.lastRejectedReason=code;stats.reasons[code]=(stats.reasons[code]??0)+1;}else unboundRejected++;if (typeof ack === 'function') (ack as Ack)({ ok: false, code }); }
    });
    socket.on('disconnect', () => { if (playerId && sockets.get(playerId) === socket.id) { sockets.delete(playerId); game.disconnect(playerId); publish(); } });
  });
  let timer: NodeJS.Timeout | null = null;
  const listen = (port = 0, hostname = '127.0.0.1') => new Promise<number>((resolve, reject) => {
    http.once('error', reject); http.listen(port, hostname, () => {
      http.off('error', reject);
      let previous = performance.now(), accumulator = 0, lastBroadcast = previous, lastSnapshot = previous, pendingSnapshot = false, lastPhaseId = game.match?.phaseId ?? 0;
      const dt = 1000 / options.tickRate;
      timer = setInterval(() => {
        const current = performance.now(); accumulator += Math.min(current - previous, 250); previous = current;
        let changed = false, steps = 0;
        while (accumulator >= dt && steps++ < 8) { const stepTime=now() - Math.round(accumulator - dt); bots.step(stepTime); changed = game.step(stepTime, dt / 1000) || changed;lastTickAt=stepTime; accumulator -= dt; }
        if (changed) pendingSnapshot = true;
        const phaseId = game.match?.phaseId ?? 0;
        if (pendingSnapshot && (phaseId !== lastPhaseId || current - lastSnapshot >= 100)) { publish(); pendingSnapshot = false; lastSnapshot = current; lastPhaseId = phaseId; }
        if (current - lastBroadcast >= 1000 / options.broadcastRate) { io.to(game.roomId).volatile.emit('world:state', game.world()); lastBroadcast = current;lastBroadcastAt=now(); }
      }, Math.max(2, Math.floor(dt / 2)));
      const address = http.address(); if (!address || typeof address === 'string') return reject(new Error('No TCP address')); resolve(address.port);
    });
  });
  const close = () => new Promise<void>((resolve, reject) => { if (timer) clearInterval(timer); io.close(err => err ? reject(err) : resolve()); });
  return { game, listen, close };
}
