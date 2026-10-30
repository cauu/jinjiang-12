/** Player movement shared by the authoritative server and client prediction.
 * Both sides run the same Rapier build and the same fixed-step function, so a
 * replayed input sequence reproduces the server's result. */
import type RapierModule from '@dimforge/rapier3d-compat';
type Rapier = typeof RapierModule;

export type MotionState = { x: number; y: number; z: number; vy: number; facing: number; grounded: boolean; jumpT: number };
export type Command = { x: number; z: number; jump: boolean; held: boolean };
export type TileLike = { disappearsAt: number | null | undefined };

export const MOTION = { radius: .42, halfHeight: .08, offset: .01, groundSpeed: 5, airSpeed: 4, gravity: 25, jumpVelocity: Math.sqrt(2 * 25 * .7), holdBoost: 18, holdTime: .15, facingDeadzone: .2 } as const;
/** Avatar centre height above the surface it stands on. */
export const STAND_HEIGHT = MOTION.halfHeight + MOTION.radius + MOTION.offset;
export const BOUNDED_LEVELS: readonly string[] = ['01-jinshi', '02-dengshi', '03-qibaoshi', '05-jiushi'];
export const NEUTRAL: Command = { x: 0, z: 0, jump: false, held: false };

let RAPIER: Rapier;
let ready: Promise<void> | null = null;
/** Loads the Rapier WASM module once (a large chunk, so it is imported lazily and never blocks page start).
 * Await before constructing a MotionWorld. */
export function initPhysics() { return ready ??= import('@dimforge/rapier3d-compat').then(async module => { await module.default.init(); RAPIER = module.default; }); }

/** Grid cell under a point, using the same layout as the floor renderer. */
export function tileAt(levelId: string, x: number, z: number) {
 if (levelId === '06-guishi') {
  const col = Math.floor(x + 5), row = Math.floor((10 - z) / 1.2);
  if (row >= 20 && row < 24 && col >= 0 && col < 10) return { index: -1, height: 7, platform: true };
  return row >= 0 && row < 20 && col >= 0 && col < 10 ? { index: row * 10 + col, height: row * .35, platform: false } : null;
 }
 const col = Math.floor(x + 10), row = Math.floor(z + 10);
 return row >= 0 && row < 20 && col >= 0 && col < 20 ? { index: row * 20 + col, height: 0, platform: false } : null;
}
/** Every tile cell a standing capsule rests on: cells whose footprint meets the capsule's base circle. */
export function tilesUnder(levelId: string, x: number, z: number, radius: number = MOTION.radius * .9) {
 const found: number[] = [];
 for (const dx of [-radius, 0, radius]) for (const dz of [-radius, 0, radius]) {
  if (dx && dz && Math.hypot(dx, dz) > radius) { const k = radius / Math.SQRT2; const cell = tileAt(levelId, x + Math.sign(dx) * k, z + Math.sign(dz) * k); if (cell && !cell.platform && !found.includes(cell.index)) found.push(cell.index); continue; }
  const cell = tileAt(levelId, x + dx, z + dz); if (cell && !cell.platform && !found.includes(cell.index)) found.push(cell.index);
 }
 return found;
}
/** Whether a tile still supports players at `now`. */
export const tileSolid = (tile: TileLike | undefined, gap: boolean, now: number) => !!tile && !gap && (tile.disappearsAt == null || now < tile.disappearsAt);

/** A Rapier world holding one level's static geometry plus the other players as obstacles. */
export class MotionWorld {
 private world = new RAPIER.World({ x: 0, y: 0, z: 0 });
 private controller: RapierModule.KinematicCharacterController;
 private probe: RapierModule.Collider;
 private tiles: RapierModule.Collider[] = [];
 private statics: RapierModule.Collider[] = [];
 private obstacles = new Map<string, RapierModule.Collider>();
 private dirty = true;
 private self: RapierModule.Collider | null = null;
 level = '';
 constructor() {
  this.controller = this.world.createCharacterController(MOTION.offset);
  this.controller.enableSnapToGround(.1);
  this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
  this.controller.setApplyImpulsesToDynamicBodies(false);
  this.probe = this.world.createCollider(RAPIER.ColliderDesc.capsule(MOTION.halfHeight, MOTION.radius).setTranslation(0, -100, 0));
 }
 private box(x: number, y: number, z: number, hx: number, hy: number, hz: number) { return this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z)); }
 /** Rebuild static geometry for a level. Cheap enough to call on every level change. */
 setLevel(level: string) {
  if (level === this.level) return;
  for (const c of [...this.tiles, ...this.statics]) this.world.removeCollider(c, false);
  this.tiles = []; this.statics = []; this.level = level; this.dirty = true;
  if (level === '06-guishi') {
   for (let i = 0; i < 200; i++) { const col = i % 10, row = Math.floor(i / 10), top = row * .35, half = row ? .175 : .075; this.tiles.push(this.box(col - 4.5, top - half, 9.4 - row * 1.2, .5, half, .6)); }
   this.statics.push(this.box(0, 7 - .175, -16.4, 5, .175, 2.4));
   return;
  }
  for (let i = 0; i < 400; i++) this.tiles.push(this.box(i % 20 - 9.5, -.075, Math.floor(i / 20) - 9.5, .5, .075, .5));
  if (BOUNDED_LEVELS.includes(level)) for (const [x, z, hx, hz] of [[10.5, 0, .5, 11], [-10.5, 0, .5, 11], [0, 10.5, 11, .5], [0, -10.5, 11, .5]]) this.statics.push(this.box(x, 1.5, z, hx, 2, hz));
 }
 /** Enable only tiles that currently support players. */
 updateTiles(tiles: readonly TileLike[] | undefined, gaps: readonly number[] | undefined, now: number) {
  for (const [i, collider] of this.tiles.entries()) {
   const solid = tileSolid(tiles?.[i] ?? { disappearsAt: null }, !!gaps?.includes(i), now);
   if (collider.isEnabled() !== solid) { collider.setEnabled(solid); this.dirty = true; }
  }
 }
 /** Place or move another player's body; ids missing from `keep` are removed. */
 setObstacle(id: string, x: number, y: number, z: number) {
  let c = this.obstacles.get(id);
  if (!c) { c = this.world.createCollider(RAPIER.ColliderDesc.capsule(MOTION.halfHeight, MOTION.radius).setTranslation(x, y, z)); this.obstacles.set(id, c); this.dirty = true; return; }
  const t = c.translation();
  if (t.x !== x || t.y !== y || t.z !== z) { c.setTranslation({ x, y, z }); this.dirty = true; }
 }
 retainObstacles(keep: ReadonlySet<string>) { for (const [id, c] of this.obstacles) if (!keep.has(id)) { this.world.removeCollider(c, false); this.obstacles.delete(id); this.dirty = true; } }
 /** Advance one player by one fixed step. `selfId` excludes the mover's own obstacle body. */
 step(s: MotionState, cmd: Command, dt: number, selfId?: string) {
  if (this.dirty) { this.world.step(); this.dirty = false; }
  const length = Math.hypot(cmd.x, cmd.z), scale = length > 1 ? 1 / length : 1, mx = cmd.x * scale, mz = cmd.z * scale;
  if (cmd.jump && s.grounded) { s.vy = MOTION.jumpVelocity; s.grounded = false; s.jumpT = 0; }
  const speed = s.grounded ? MOTION.groundSpeed : MOTION.airSpeed;
  if (!s.grounded) { s.jumpT += dt; if (cmd.held && s.jumpT < MOTION.holdTime && s.vy > 0) s.vy += MOTION.holdBoost * dt; s.vy -= MOTION.gravity * dt; }
  if (length > MOTION.facingDeadzone) s.facing = Math.atan2(mx, -mz);
  this.self = selfId ? this.obstacles.get(selfId) ?? null : null;
  this.probe.setTranslation({ x: s.x, y: s.y, z: s.z });
  this.controller.computeColliderMovement(this.probe, { x: mx * speed * dt, y: s.grounded ? -.02 : s.vy * dt, z: mz * speed * dt }, undefined, undefined, this.exclude);
  const moved = this.controller.computedMovement(), grounded = this.controller.computedGrounded();
  // Without stick input nothing moves sideways; otherwise sliding on tile seams creeps a standing player.
  if (mx || mz) { s.x = Math.fround(s.x + moved.x); s.z = Math.fround(s.z + moved.z); }
  s.y = Math.fround(s.y + moved.y);
  if (grounded && (s.grounded || s.vy <= 0)) { s.vy = 0; s.grounded = true; }
  else { if (s.grounded) { s.vy = 0; s.jumpT = MOTION.holdTime; } s.grounded = false; }
  s.vy = Math.fround(s.vy); s.jumpT = Math.fround(Math.min(s.jumpT, 10)); s.facing = Math.fround(s.facing);
 }
 private exclude = (c: RapierModule.Collider) => c !== this.self;
 dispose() { this.world.free(); }
}
