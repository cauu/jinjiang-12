import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, defaults } from '../src/game.js';
import { MotionWorld, MOTION, type MotionState } from '@jinjiang/shared';

const DT = 1 / 30;
function setup(level: '01-jinshi' | '04-shisan' = '01-jinshi') {
 const g = new Game({ ...defaults, levels: [level], introMs: 0, cardMs: 0, countdownMs: 0, playMs: 60000, protectionMs: 60000 });
 const a = g.join('a', null).playerId; g.join('b', null); g.start(1000); g.step(1000, DT); g.step(1001, DT);
 return { g, a, avatar: g.players.get(a)!.avatar! };
}
const go = { x: -1, z: 0, jump: false, held: false }; // away from the neighbour spawned 2 m to the east

test('each command advances exactly one fixed step, even when several arrive in one tick', () => {
 const { g, a, avatar } = setup(), x0 = avatar.position.x;
 g.input(a, go, 1010); g.step(1034, DT);
 assert.ok(Math.abs(x0 - avatar.position.x - MOTION.groundSpeed * DT) < 1e-4, `one step: ${x0 - avatar.position.x}`);
 for (let i = 0; i < 3; i++) g.input(a, go, 1040); g.step(1067, DT);
 assert.ok(Math.abs(x0 - avatar.position.x - 4 * MOTION.groundSpeed * DT) < 1e-4, 'bunched commands are all applied, not merged');
 assert.equal(g.inputCursor(a).processed, 4);
});

test('a player whose input is briefly late waits; one whose input stopped falls under gravity', () => {
 const { g, a, avatar } = setup('04-shisan'), x0 = avatar.position.x;
 g.input(a, go, 1010); g.step(1034, DT); g.step(1067, DT); g.step(1100, DT);
 assert.ok(Math.abs(x0 - avatar.position.x - MOTION.groundSpeed * DT) < 1e-4, 'no movement is invented while waiting for input');
 for (const tile of g.match!.level.data.tiles) tile.disappearsAt = 1200;
 for (let now = 1400; now < 2400; now += 33) g.step(now, DT);
 assert.ok(avatar.position.y < -5 || g.players.get(a)!.status === 'eliminated', 'a silent player still falls');
});

test('commands are rejected outside play and cleared between levels', () => {
 const { g, a } = setup();
 g.skip(2000); assert.throws(() => g.input(a, go, 2001), /INPUT_NOT_ALLOWED/);
 assert.throws(() => setup().g.input(a, { x: Number.NaN, z: 0, jump: false, held: false }, 1010), /INPUT_NOT_ALLOWED|INVALID_INPUT/);
});

// Contacts with other players use their interpolated (past) positions on the client, so those are
// corrected by reconciliation; against level geometry the prediction must match exactly.
test('client prediction with the shared step reproduces the server bit for bit', () => {
 const { g, a, avatar } = setup('01-jinshi');
 const other = g.players.get([...g.players.keys()].find(id => id !== a)!)!.avatar!; other.position = { x: 9, y: other.position.y, z: 9 };
 const world = new MotionWorld(); world.setLevel('01-jinshi'); world.updateTiles(g.match!.level.data.tiles, g.match!.level.data.gaps, 1001); world.setObstacle('b', 9, other.position.y, 9);
 const local: MotionState = { x: avatar.position.x, y: avatar.position.y, z: avatar.position.z, vy: 0, facing: 0, grounded: true, jumpT: 0 };
 let now = 1001;
 for (let i = 0; i < 240; i++) {
  const command = { x: Math.sin(i / 9), z: i < 120 ? -1 : Math.cos(i / 13), jump: i % 40 === 0, held: i % 40 < 5 }; // includes running into the rail
  world.step(local, command, DT); now += 33; g.input(a, command, now); g.step(now, DT);
  assert.deepEqual([avatar.position.x, avatar.position.y, avatar.position.z, avatar.grounded], [local.x, local.y, local.z, local.grounded], `diverged at step ${i}`);
 }
});
