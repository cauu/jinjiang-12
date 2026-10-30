/** Per-level scene views. Each level declares its assets (for preloading) and owns its props,
 * floor look and gameplay feedback (telegraphs, pickups, collapses). Hard-coded on purpose. */
import * as THREE from 'three';
import { createJinshiScene, createJinshiTileTexture, JINSHI_ASSETS } from '../jinshi-scene.js';
import { MeshPool, TEAM_COLORS, TileFloor, disposeTree, rails, textSprite, type LevelFrame, type LevelView } from './common.js';
export type { LevelFrame, LevelView } from './common.js';

const DEFAULT_BG = 0xd3eae4;
/** Blend two 0xRRGGBB colours without allocating (called for hundreds of tiles per frame). */
const lerpHex = (a: number, b: number, t: number) => { t = Math.max(0, Math.min(1, t)); const mix = (shift: number) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t); return (mix(16) << 16) | (mix(8) << 8) | mix(0); };

/** Assets each level needs; preloaded in the lobby, and lazily during cards and videos. */
export const LEVEL_ASSETS: Record<string, string[]> = { lobby: JINSHI_ASSETS, '01-jinshi': JINSHI_ASSETS, '02-dengshi': [], '03-qibaoshi': [], '04-shisan': [], '05-jiushi': [], '06-guishi': [] };

/** Collapsing tiles: shake while counting down, crack (darken), then drop away for a moment before hiding. */
function crumble(floor: TileFloor, i: number, base: number, disappearsAt: number | null | undefined, now: number, warnMs: number) {
 if (disappearsAt == null) return floor.set(i, true, base);
 const left = disappearsAt - now;
 if (left > 0) { const t = 1 - Math.min(1, left / warnMs); return floor.set(i, true, lerpHex(lerpHex(base, 0xe57852, .6), 0x5b3a2e, t), 0, .025 + .07 * t); }
 const since = -left; if (since > 450) return floor.set(i, false, base);
 floor.set(i, true, 0x5b3a2e, -12.5 * (since / 1000) ** 2); // falls under the game's 25 m/s² gravity
}

/** Lobby and Jinshi share the paper-market environment; Jinshi also paints team colours. */
function jinshi(lobby: boolean): LevelView {
 const env = createJinshiScene(), tile = createJinshiTileTexture(), floor = new TileFloor('01-jinshi', new THREE.MeshBasicMaterial({ map: tile }));
 const group = new THREE.Group(); group.add(env.group, floor.mesh, rails());
 const owners: (string | null)[] = [], paintedAt = new Float64Array(400);
 return { group, background: 0xf4d9a8, environment: 'jinshi', occluders: env.group.children, camera: { lookAhead: 1.45, lift: .2 },
  update({ tick, data }) {
   env.update(tick);
   for (let i = 0; i < 400; i++) {
    const { row, col } = floor.rowCol(i), owner = lobby ? null : data?.owners[i] ?? null;
    if (owner !== (owners[i] ?? null)) { if (owner) paintedAt[i] = tick; owners[i] = owner; }
    const team = owner ? data!.teams.findIndex(t => t.id === owner) : -1, base = team >= 0 ? TEAM_COLORS[team % 4] : (row + col) % 2 ? 0xe2d1af : 0xeee0c2;
    // A freshly painted tile pops up and flashes lighter for a quarter second.
    const age = tick - paintedAt[i], pop = owner && age < 250 ? Math.sin(Math.PI * age / 250) : 0;
    floor.set(i, true, pop ? lerpHex(base, 0xffffff, .45 * pop) : base, .08 * pop);
   }
   floor.commit();
  },
  dispose() { env.dispose(); tile.dispose(); disposeTree(floor.mesh); disposeTree(group); } };
}

/** Lantern quiz: three answer zones; the last seconds pulse, the answer lights its lantern and the wrong zones sink. */
function dengshi(): LevelView {
 const floor = new TileFloor('02-dengshi', new THREE.MeshBasicMaterial()), group = new THREE.Group(); group.add(floor.mesh, rails());
 const zones = [{ key: 'A', x: -7, col: [0, 6], color: 0xe9b4ac }, { key: 'B', x: 0, col: [6, 14], color: 0xf0d38d }, { key: 'C', x: 7, col: [14, 20], color: 0xaec6e9 }];
 const lanterns = zones.map(zone => {
  const label = textSprite(zone.key); label.position.set(zone.x, 1.2, 0); group.add(label);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.55, 16, 12), new THREE.MeshBasicMaterial({ color: 0x8a5a3c })); lamp.scale.y = 1.2; lamp.position.set(zone.x, 3.2, -9.2); group.add(lamp);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 2.2), new THREE.MeshBasicMaterial({ color: 0x5b4a3c })); cord.position.set(zone.x, 4.9, -9.2); group.add(cord);
  return lamp;
 });
 return { group, background: 0xb9c6d8, environment: 'default', // dusk; kept light so the HUD stays legible
  update({ now, data }) {
   const phase = data?.questionPhase, left = (data?.questionPhaseEndsAt ?? 0) - now, answer = data?.answer, reveal = phase === 'revealing' && !!answer;
   const revealT = reveal ? 1 - Math.max(0, left) / 2000 : 0, pulse = phase === 'answering' && left < 3000 && left > 0 ? .5 + .5 * Math.sin(now / 90) : 0;
   for (let i = 0; i < 400; i++) {
    const { col } = floor.rowCol(i), zone = zones.findIndex(z => col >= z.col[0] && col < z.col[1]), z = zones[zone], right = reveal && z.key === answer;
    const color = right ? lerpHex(z.color, 0xfff1b8, .6) : reveal ? lerpHex(z.color, 0x3a3a46, Math.min(1, revealT * 2)) : lerpHex(z.color, 0xffffff, .25 * pulse);
    floor.set(i, true, color, reveal && !right && !data?.roundResult?.void ? -1.2 * Math.min(1, revealT * 1.6) ** 2 : 0);
   }
   floor.commit();
   lanterns.forEach((lamp, k) => { const lit = reveal && zones[k].key === answer; (lamp.material as THREE.MeshBasicMaterial).color.setHex(lit ? 0xffd25e : 0x8a5a3c); lamp.scale.setScalar(lit ? 1.15 + .08 * Math.sin(now / 120) : 1).setY(lit ? 1.4 : 1.2); });
  },
  dispose() { disposeTree(group); } };
}

/** Falling jiaozi notes: a ground marker shows where each lands; landed notes bob, blink before expiring and burst when taken. */
function qibaoshi(): LevelView {
 const floor = new TileFloor('03-qibaoshi', new THREE.MeshBasicMaterial()), group = new THREE.Group(); group.add(floor.mesh, rails());
 for (let i = 0; i < 400; i++) { const { row, col } = floor.rowCol(i); floor.set(i, true, (row + col) % 2 ? 0xd8c7a4 : 0xe7d9b8); } floor.commit();
 const noteGeometry = new THREE.BoxGeometry(.5, .04, .28), noteMaterial = new THREE.MeshBasicMaterial({ color: 0xf2c94c }), markGeometry = new THREE.RingGeometry(.22, .3, 20), markMaterial = new THREE.MeshBasicMaterial({ color: 0xa36b1f, transparent: true, opacity: .6, side: THREE.DoubleSide });
 const notes = new MeshPool(group, () => { const g = new THREE.Group(), note = new THREE.Mesh(noteGeometry, noteMaterial), mark = new THREE.Mesh(markGeometry, markMaterial.clone()); note.name = 'note'; mark.name = 'mark'; mark.rotation.x = -Math.PI / 2; g.add(note, mark); return g; });
 const bursts: { mesh: THREE.Mesh; born: number }[] = [], burstGeometry = new THREE.OctahedronGeometry(.35);
 return { group, background: 0xe9dcc0, environment: 'default',
  update({ now, tick, data }) {
   notes.begin();
   for (const [id, item] of Object.entries(data?.items ?? {})) {
    const g = notes.get(id), note = g.getObjectByName('note')!, mark = g.getObjectByName('mark') as THREE.Mesh, falling = now < item.landsAt;
    const t = falling ? (now - item.spawnedAt) / Math.max(1, item.landsAt - item.spawnedAt) : 1;
    g.position.set(item.x, 0, item.z);
    note.position.set(Math.sin(now / 160 + item.x) * .25 * (1 - t), falling ? 6 * (1 - t) + .18 : .2 + .05 * Math.sin(now / 200 + item.z), 0);
    note.rotation.set(falling ? Math.sin(now / 120) * .9 : 0, now / 400, falling ? Math.cos(now / 140) * .6 : 0);
    note.visible = falling || item.expiresAt - now > 1500 || Math.floor(now / 120) % 2 === 0;
    mark.visible = falling; mark.position.y = .02; (mark.material as THREE.MeshBasicMaterial).opacity = .25 + .5 * t;
   }
   notes.end((id, g) => { const burst = new THREE.Mesh(burstGeometry, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true })); burst.position.copy(g.position).setY(.4); group.add(burst); bursts.push({ mesh: burst, born: tick }); disposeTree(g.getObjectByName('mark')!); });
   for (let k = bursts.length - 1; k >= 0; k--) { const b = bursts[k], age = (tick - b.born) / 350; if (age >= 1) { group.remove(b.mesh); (b.mesh.material as THREE.Material).dispose(); bursts.splice(k, 1); continue; } b.mesh.scale.setScalar(.4 + age * 1.6); b.mesh.position.y = .4 + age; (b.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - age; }
  },
  dispose() { disposeTree(group); } };
}

/** Sand-stone slabs: every slab that will vanish shakes, cracks and drops away. */
function shisan(): LevelView {
 const floor = new TileFloor('04-shisan', new THREE.MeshBasicMaterial()), group = new THREE.Group(); group.add(floor.mesh);
 return { group, background: 0x9c8f7e, environment: 'default',
  update({ now, data }) {
   for (let i = 0; i < 400; i++) { const { row, col } = floor.rowCol(i); crumble(floor, i, (row + col) % 2 ? 0xa89b8d : 0xc0b2a3, data?.tiles[i]?.disappearsAt, now, 600); }
   floor.commit();
  },
  dispose() { disposeTree(group); } };
}

/** Grain sacks and wine jars: carried sacks ride on the carrier, deliveries puff smoke from the jar. */
function jiushi(): LevelView {
 const floor = new TileFloor('05-jiushi', new THREE.MeshBasicMaterial()), group = new THREE.Group(); group.add(floor.mesh, rails());
 for (let i = 0; i < 400; i++) { const { row, col } = floor.rowCol(i); floor.set(i, true, (row + col) % 2 ? 0xcdb48e : 0xdcc6a2); } floor.commit();
 const corners = [[-8, -8], [-8, 8], [8, -8], [8, 8]] as const, rings: THREE.Mesh[] = [];
 for (const [x, z] of corners) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, .08, 6, 32), new THREE.MeshBasicMaterial({ color: 0xc65b3d })); ring.rotation.x = -Math.PI / 2; ring.position.set(x, .12, z); group.add(ring); rings.push(ring);
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(.55, .45, 1.1, 16), new THREE.MeshLambertMaterial({ color: 0x7a4a2e })); jar.position.set(x + Math.sign(x) * 1.9, .55, z + Math.sign(z) * 1.9); group.add(jar);
 }
 const sackGeometry = new THREE.BoxGeometry(.5, .32, .38), sackMaterial = new THREE.MeshLambertMaterial({ color: 0xb07a48 });
 const sacks = new MeshPool(group, () => new THREE.Mesh(sackGeometry, sackMaterial)), carried = new Map<string, { x: number; z: number }>();
 const puffs: { mesh: THREE.Mesh; born: number }[] = [], puffGeometry = new THREE.SphereGeometry(.45, 10, 8);
 return { group, background: 0xd8c9a8, environment: 'default',
  update({ tick, data, connection, mode }) {
   sacks.begin(); const nowCarried = new Map<string, { x: number; z: number }>();
   for (const [id, sack] of Object.entries(data?.sacks ?? {})) {
    const mesh = sacks.get(id), carrier = sack.carrierId ? connection.pose(sack.carrierId) : null;
    if (carrier) { mesh.position.set(carrier.x, carrier.y + .75, carrier.z); nowCarried.set(id, { x: carrier.x, z: carrier.z }); } else mesh.position.set(sack.x, .18, sack.z);
   }
   sacks.end();
   // A carried sack that vanished was delivered: puff from the nearest jar.
   for (const [id, at] of carried) if (!nowCarried.has(id)) { const [x, z] = corners.reduce((a, b) => Math.hypot(b[0] - at.x, b[1] - at.z) < Math.hypot(a[0] - at.x, a[1] - at.z) ? b : a); const puff = new THREE.Mesh(puffGeometry, new THREE.MeshBasicMaterial({ color: 0xf3efe6, transparent: true })); puff.position.set(x + Math.sign(x) * 1.9, 1.3, z + Math.sign(z) * 1.9); group.add(puff); puffs.push({ mesh: puff, born: tick }); }
   carried.clear(); for (const [id, at] of nowCarried) carried.set(id, at);
   for (let k = puffs.length - 1; k >= 0; k--) { const p = puffs[k], age = (tick - p.born) / 900; if (age >= 1) { group.remove(p.mesh); (p.mesh.material as THREE.Material).dispose(); puffs.splice(k, 1); continue; } p.mesh.scale.setScalar(.6 + age * 1.8); p.mesh.position.y = 1.3 + age * 1.6; (p.mesh.material as THREE.MeshBasicMaterial).opacity = .8 * (1 - age); }
   // On the phone, the delivery rings pulse while you carry a sack.
   const self = mode === 'mobile' ? connection.session?.playerId : undefined, carrying = !!self && Object.values(data?.sacks ?? {}).some(s => s.carrierId === self);
   for (const ring of rings) { (ring.material as THREE.MeshBasicMaterial).color.setHex(carrying ? 0xffc24a : 0xc65b3d); ring.scale.setScalar(carrying ? 1 + .06 * Math.sin(tick / 120) : 1); }
  },
  dispose() { disposeTree(group); } };
}

/** The final staircase: rows about to collapse glow red and shake; the osmanthus branch on top glows. */
function guishi(): LevelView {
 const floor = new TileFloor('06-guishi', new THREE.MeshBasicMaterial()), group = new THREE.Group(); group.add(floor.mesh);
 const top = new THREE.Mesh(new THREE.BoxGeometry(10, .35, 4.8), new THREE.MeshBasicMaterial({ color: 0xdbc5a5 })); top.position.set(0, 7 - .175, -16.4); group.add(top);
 const goal = new THREE.Mesh(new THREE.TorusGeometry(.8, .15, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffbe20 })); goal.position.set(0, 8, -15); group.add(goal);
 const branch = new THREE.Mesh(new THREE.IcosahedronGeometry(.45, 0), new THREE.MeshBasicMaterial({ color: 0xffe27a })); branch.position.set(0, 8, -15); group.add(branch);
 return { group, background: 0xcdc6dc, environment: 'default', // mid-autumn evening
  update({ now, data }) {
   for (let i = 0; i < 200; i++) { const gone = !!data?.gaps.includes(i); if (gone) { floor.set(i, false, 0); continue; } crumble(floor, i, 0xdbc5a5, data?.tiles[i]?.disappearsAt, now, 1000); }
   floor.commit(); goal.rotation.y = now / 600; branch.rotation.y = -now / 400; branch.scale.setScalar(1 + .12 * Math.sin(now / 180));
  },
  dispose() { disposeTree(group); } };
}

export function createLevel(id: string): LevelView {
 switch (id) {
  case '01-jinshi': return jinshi(false);
  case '02-dengshi': return dengshi();
  case '03-qibaoshi': return qibaoshi();
  case '04-shisan': return shisan();
  case '05-jiushi': return jiushi();
  case '06-guishi': return guishi();
  default: return jinshi(true);
 }
}
export { DEFAULT_BG };
