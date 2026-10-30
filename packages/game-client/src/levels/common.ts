/** Building blocks shared by the per-level views. A level view owns everything level-specific
 * in the 3D scene (floor look, props, items, effects) so SceneView only handles players and camera. */
import * as THREE from 'three';
import type { LevelData, Match } from '@jinjiang/shared';
import type { Connection } from '../net.js';

/** `camera` is last frame's view; levels may use it to skip scenery the current shot cannot see. */
export type LevelFrame = { now: number; tick: number; dt: number; match: Match | null | undefined; data: LevelData | undefined; connection: Connection; mode: 'mobile' | 'display'; revision: number; camera: THREE.Camera };
export interface LevelView {
 readonly group: THREE.Group;
 /** Clear colour behind the level. */
 readonly background: number;
 /** Shown in data-environment for tests and diagnostics. */
 readonly environment: string;
 /** Objects the phone camera must not be hidden behind (camera occlusion metrics). */
 readonly occluders?: THREE.Object3D[];
 /** Phone follow camera: extra look-ahead and target height. */
 readonly camera?: { lookAhead: number; lift: number };
 /** Fixed display/spectator shot; defaults to looking down on the whole arena. */
 readonly overview?: { position: THREE.Vector3; target: THREE.Vector3 };
 /** Establishing shot played on every screen during the level card and countdown; it ends on the gameplay camera. */
 readonly flyover?: { position: THREE.Curve<THREE.Vector3>; target: THREE.Curve<THREE.Vector3> };
 update(frame: LevelFrame): void;
 dispose(): void;
}

export const TEAM_COLORS = [0xe55751, 0x4c88d8, 0xe8b64d, 0x69a96e];
export const BOUNDED = ['01-jinshi', '02-dengshi', '03-qibaoshi', '05-jiushi'];

/** Release GPU memory for everything under `root` (geometries, materials, textures). */
export function disposeTree(root: THREE.Object3D) {
 root.traverse(object => {
  const mesh = object as THREE.Mesh;
  mesh.geometry?.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
  for (const material of materials) { for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose(); material.dispose(); }
 });
}

/** The server-owned tile grid as one instanced mesh. Levels decide colour, visibility and per-tile offsets. */
export class TileFloor {
 readonly mesh: THREE.InstancedMesh;
 readonly stairs: boolean;
 private temp = new THREE.Object3D(); private color = new THREE.Color();
 // Last written state per tile: unchanged tiles are skipped, so a static floor costs nothing per frame.
 private lastColor: Float64Array; private lastY: Float64Array; private dirty = false;
 constructor(levelId: string, material: THREE.Material) {
  this.stairs = levelId === '06-guishi';
  this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.97, .15, .97), material, this.stairs ? 200 : 400);
  this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.name = 'tile-floor';
  this.lastColor = new Float64Array(this.mesh.count).fill(-1); this.lastY = new Float64Array(this.mesh.count).fill(NaN);
 }
 get count() { return this.mesh.count; }
 rowCol(i: number) { const cols = this.stairs ? 10 : 20; return { row: Math.floor(i / cols), col: i % cols }; }
 /** Write one tile. `offset` lifts/drops it; `shake` jitters it sideways for warnings. */
 set(i: number, visible: boolean, color: number, offset = 0, shake = 0) {
  const { row, col } = this.rowCol(i), t = this.temp, y = visible ? (this.stairs ? row * .35 : -.075) + offset : -100;
  if (!shake && this.lastColor[i] === color && this.lastY[i] === y) return;
  this.lastColor[i] = color; this.lastY[i] = shake ? NaN : y; this.dirty = true;
  t.position.set(this.stairs ? col - 4.5 : col - 9.5, y, this.stairs ? 9.4 - row * 1.2 : row - 9.5);
  if (shake) { t.position.x += (Math.random() - .5) * shake; t.position.z += (Math.random() - .5) * shake; }
  t.scale.set(1, 1, this.stairs ? 1.23 : 1); t.updateMatrix();
  this.mesh.setMatrixAt(i, t.matrix); this.mesh.setColorAt(i, this.color.setHex(color));
 }
 commit() { if (!this.dirty) return; this.dirty = false; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
}

/** Low railings around the bounded square arenas; purely visual, Rapier has its own walls. */
export function rails(color = 0xb35138) {
 const group = new THREE.Group(), material = new THREE.MeshBasicMaterial({ color });
 for (const [x, z, w, d] of [[0, -10, 20, .14], [0, 10, 20, .14], [-10, 0, .14, 20], [10, 0, .14, 20]]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(w, .3, d), material); rail.position.set(x, .15, z); group.add(rail); }
 return group;
}

/** A canvas-text sprite, e.g. answer-zone letters. */
export function textSprite(text: string, color = '#233b36', size = .8) {
 const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128; const c = canvas.getContext('2d')!;
 c.fillStyle = color; c.font = 'bold 96px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 64, 64);
 const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true })); sprite.scale.set(size, size, 1); return sprite;
}

/** Simple pooled meshes keyed by server ids (items, sacks). */
export class MeshPool {
 private meshes = new Map<string, THREE.Object3D>(); private seen = new Set<string>();
 constructor(private parent: THREE.Group, private make: (id: string) => THREE.Object3D) {}
 begin() { this.seen.clear(); }
 get(id: string) { let mesh = this.meshes.get(id); if (!mesh) { mesh = this.make(id); this.meshes.set(id, mesh); this.parent.add(mesh); } this.seen.add(id); return mesh; }
 /** Remove meshes not touched since begin(); returns the removed ids. */
 end(onRemove?: (id: string, mesh: THREE.Object3D) => void) { for (const [id, mesh] of this.meshes) if (!this.seen.has(id)) { onRemove?.(id, mesh); this.parent.remove(mesh); this.meshes.delete(id); } }
}
