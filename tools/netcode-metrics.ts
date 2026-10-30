/** Smoothness metrics: 9 bots + 1 scripted browser player through the jitter proxy.
 * Usage: node --import tsx tools/netcode-metrics.ts [lane]   (needs local Chrome) */
import { chromium } from 'playwright-core';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
import { createGameServer } from '../apps/server/src/server.ts';
import { createNetworkProxy } from '../apps/server/test/support/network-proxy.ts';
import { gameProxy } from '../apps/mobile/vite.config.ts';
const lane = Number(process.argv[2] ?? 10); // proxy lane: higher = more latency, see network-proxy.ts

const backend = createGameServer({ introMs: 0, cardMs: 300, countdownMs: 300, playMs: 30000, levels: ['04-shisan'], protectionMs: 60000 });
const port = await backend.listen(0); const proxy = await createNetworkProxy(port, 7); const target = proxy.urlFor(lane);
const mk = async (app: string) => { const v = await viteServer({ configFile: false, root: resolve(`apps/${app}`), logLevel: 'error', server: { host: '127.0.0.1', port: 0, proxy: gameProxy(target) } }); await v.listen(); const a = v.httpServer!.address() as any; return { v, url: `http://127.0.0.1:${a.port}` }; };
const display = await mk('display'), mobile = await mk('mobile');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-webgl'] });
const d = await browser.newPage({ viewport: { width: 1200, height: 700 } }); await d.goto(display.url + '/?netMetrics=1'); await d.locator('#qr img').waitFor({ timeout: 30000 });
await d.locator('#add-bots').click(); await d.waitForFunction(() => Number(document.querySelector('#count')?.textContent) >= 9);
const m = await browser.newPage({ viewport: { width: 844, height: 390 } }); m.on('pageerror', e => console.log('pageerror', e.message));
await m.goto(`${mobile.url}/?netMetrics=1&room=${backend.game.roomId}`); await m.locator('input[name=name]').fill('测'); await m.locator('form button').click(); await m.locator('#entry').waitFor({ state: 'hidden', timeout: 30000 });
await d.locator('#start').click(); await m.waitForFunction(() => document.querySelector('#status')?.getAttribute('data-phase') === 'playing', null, { timeout: 30000 });
await m.waitForTimeout(500); await m.evaluate(() => { (window as any).__jjNet = []; }); await d.evaluate(() => { (window as any).__jjNet = []; });
const press = async (keys: string[], ms: number) => { for (const k of keys) await m.keyboard.down(k); await m.waitForTimeout(ms); for (const k of keys) await m.keyboard.up(k); };
await press(['d'], 900); await press(['w'], 700); await press(['a'], 700); await press(['s', 'd'], 700); await press(['a'], 400); await press(['d'], 400); await m.waitForTimeout(500);
await m.keyboard.down(' '); await m.waitForTimeout(120); await m.keyboard.up(' '); await m.waitForTimeout(900);
const analyse = (frames: any[], who: string, selfOnly: boolean) => {
 const ids = new Set<string>(); for (const f of frames) for (const id of Object.keys(f.players)) ids.add(id);
 const self = frames[0]?.self; let overspeed = 0, accelSpikes = 0, moving = 0, yawMax = 0, yawRateMax = 0, n = 0; const dts: number[] = [];
 for (const id of ids) { if (selfOnly ? id !== self : id === self) continue; let pv = -1;
  for (let i = 1; i < frames.length; i++) { const a = frames[i - 1].players[id], b = frames[i].players[id]; if (!a || !b) { pv = -1; continue; } const dt = (frames[i].t - frames[i - 1].t) / 1000; if (dt <= 0) continue; dts.push(dt * 1000);
   const v = Math.hypot(b[0] - a[0], b[2] - a[2]) / dt; n++; if (v > .5) moving++; if (v > 6.5) overspeed++; if (pv >= 0 && Math.abs(v - pv) > 4 && dt < .05) accelSpikes++; pv = v;
   let dy = Math.abs(b[3] - a[3]) % (2 * Math.PI); if (dy > Math.PI) dy = 2 * Math.PI - dy; yawMax = Math.max(yawMax, dy); yawRateMax = Math.max(yawRateMax, dy / dt); } }
 dts.sort((a, b) => a - b);
 return `${who}: frames=${n} medianFrame=${dts[dts.length >> 1]?.toFixed(1)}ms moving=${moving} overspeed(>6.5u/s)=${overspeed} speedSpikes(|Δv|>4u/s per frame)=${accelSpikes} maxYawStep=${(yawMax * 180 / Math.PI).toFixed(1)}° maxYawRate=${(yawRateMax * 180 / Math.PI).toFixed(0)}°/s`;
};
const mf = await m.evaluate(() => (window as any).__jjNet), df = await d.evaluate(() => (window as any).__jjNet);
const corr = mf.map((f: any) => f.net).filter((n: any, i: number, a: any[]) => i === 0 || n.reconciles !== a[i - 1].reconciles).map((n: any) => n.correction).sort((a: number, b: number) => a - b);
const last = mf[mf.length - 1].net;
console.log(`lane ${lane} rtt≈${last.rtt.toFixed(0)}ms reconciles=${corr.length} correction p50=${(corr[corr.length >> 1] * 100).toFixed(2)}cm p95=${(corr[Math.floor(corr.length * .95)] * 100).toFixed(2)}cm max=${(corr[corr.length - 1] * 100).toFixed(2)}cm driftEma=${(last.driftEma * 100).toFixed(2)}cm`);
console.log(analyse(mf, 'mobile self   ', true)); console.log(analyse(mf, 'mobile remotes', false)); console.log(analyse(df, 'display all   ', false));
for (const [label, frames] of [['mobile', mf], ['display', df]] as const) { const v: number[] = []; const win: number[] = [];
 const ids = Object.keys(frames[frames.length - 1].players).filter(id => id !== frames[0].self);
 for (const id of ids) for (let i = 1; i < frames.length; i++) { const a = frames[i-1].players[id], b = frames[i].players[id]; if (a && b) v.push(Math.hypot(b[0]-a[0], b[2]-a[2]) / (frames[i].t - frames[i-1].t) * 1000);
  if (i >= 4) { const c = frames[i-4].players[id]; if (c && b) win.push(Math.hypot(b[0]-c[0], b[2]-c[2]) / (frames[i].t - frames[i-4].t) * 1000); } }
 v.sort((a, b) => a - b); win.sort((a, b) => a - b);
 const q = (arr: number[], p: number) => arr[Math.floor(arr.length * p)].toFixed(2);
 console.log(`${label} remote per-frame speed p50=${q(v,.5)} p95=${q(v,.95)} p99=${q(v,.99)} max=${v[v.length-1].toFixed(2)} | 4-frame window p99=${q(win,.99)} max=${win[win.length-1].toFixed(2)}`); }
await browser.close(); await display.v.close(); await mobile.v.close(); await proxy.close(); await backend.close(); process.exit(0);
