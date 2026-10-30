import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { initPhysics } from '@jinjiang/shared';
import { defaults, Game, type Options } from './game.js';
import { DemoBots } from './bots.js';
import { GameRoom, runtimes, type GameRuntime } from './room.js';

/** HTTP for admin/media plus the Colyseus room. One process hosts one room. */
export function createGameServer(overrides: Partial<Options> = {}, mediaDirectory = process.env.MEDIA_DIR ?? fileURLToPath(new URL('../../../assets/video/', import.meta.url))) {
  const options = { ...defaults, ...overrides };
  const game = new Game(options);
  const runtime: GameRuntime = { game, bots: new DemoBots(game), options, room: null, inputStats: new Map(), lastTickAt: null, lastPatchAt: null };
  const key = game.roomId; runtimes.set(key, runtime);
  const serveMedia = (req: IncomingMessage, res: ServerResponse) => {
      const filename = (req.url ?? '').slice('/media/'.length);
      // Prefer the authored Jinshi intro while retaining the original test cards.
      // A custom media directory can continue to provide the standard filenames.
      const authored = filename === 'intro.mp4' ? 'jinshi-intro-v1.mp4' : filename === 'intro_phone.mp4' ? 'jinshi-intro-v1_phone.mp4' : null;
      const candidate = authored ? resolve(mediaDirectory, authored) : null;
      const file = candidate && existsSync(candidate) ? candidate : resolve(mediaDirectory, filename);
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
  };
  const json = (res: ServerResponse, status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  const http = createServer();
  const colyseus = new Server({
    transport: new WebSocketTransport({ server: http, pingInterval: 2000, pingMaxRetries: 3 }), greet: false, gracefullyShutdown: false,
    // Colyseus answers /matchmake and the room WebSocket; these are ours.
    express: app => {
      app.get('/admin/bootstrap', (_req, res) => json(res, 200, { roomId: game.roomId, token: game.hostToken }));
      app.get('/health', (_req, res) => json(res, 200, { ok: true }));
      app.get('/admin/diagnostics', (req, res) => {
        if (!game.checkHost(req.headers['x-host-token'])) { res.writeHead(403); res.end(); return; }
        const time = runtime.room?.now() ?? 0, state = game.diagnostics(time);
        json(res, 200, { ...state, simulation: { tickRate: options.tickRate, broadcastRate: options.broadcastRate, lastTickAt: runtime.lastTickAt, lastBroadcastAt: runtime.lastPatchAt, tickAgeMs: runtime.lastTickAt === null ? null : time - runtime.lastTickAt, broadcastAgeMs: runtime.lastPatchAt === null ? null : time - runtime.lastPatchAt }, players: state.players.map(p => ({ ...p, transport: runtime.inputStats.get(p.id) ?? null })) });
      });
      app.get(/^\/media\/(intro|wind|rebirth|ending)(_phone)?\.mp4$/, serveMedia);
      app.head(/^\/media\/(intro|wind|rebirth|ending)(_phone)?\.mp4$/, serveMedia);
    }
  });
  colyseus.define('game', GameRoom);
  const listen = async (port = 0, hostname = '127.0.0.1') => {
    await initPhysics();
    await colyseus.listen(port, hostname);
    if (!matchMaker.getLocalRoomById(game.roomId)) await matchMaker.createRoom('game', { runtime: key });
    const address = http.address(); if (!address || typeof address === 'string') throw new Error('No TCP address');
    return address.port;
  };
  const close = async () => { runtimes.delete(key); await colyseus.gracefullyShutdown(false); };
  return { game, listen, close, now: () => runtime.room?.now() ?? 0 };
}
