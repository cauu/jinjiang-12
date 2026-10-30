import * as THREE from 'three';

/** Simple market goods (bolts, rolls, jars, vats, poles, carts) as a handful of instanced meshes:
 * one per shape × material, so hundreds of small props cost a few draw calls. */
export type Shape = 'box' | 'cylinder' | 'jar';
/** `pitch` turns about x (wheels), `roll` about z (bolts and rolls lying sideways), applied after `yaw`. */
export type Prop = { shape: Shape; surface: string; at: THREE.Vector3; size: [number, number, number]; yaw?: number; pitch?: number; roll?: number; color?: number };

const geometries: Record<Shape, () => THREE.BufferGeometry> = {
 box: () => new THREE.BoxGeometry(1, 1, 1),
 cylinder: () => new THREE.CylinderGeometry(.5, .5, 1, 12),
 // A pot: narrow foot, round belly, short neck; base at y = -0.5 like the others.
 jar: () => new THREE.LatheGeometry([[0, 0], [.3, 0], [.45, .25], [.5, .5], [.42, .78], [.28, .9], [.3, 1]].map(([r, y]) => new THREE.Vector2(r, y - .5)), 12),
};

export function buildProps(props: readonly Prop[], materials: Record<string, THREE.Material>, name: string) {
 const group = new THREE.Group(); group.name = name;
 const made: THREE.BufferGeometry[] = [], dummy = new THREE.Object3D(), colour = new THREE.Color();
 const buckets = new Map<string, Prop[]>();
 for (const p of props) { const key = `${p.shape}|${p.surface}`; buckets.set(key, [...buckets.get(key) ?? [], p]); }
 for (const [key, list] of buckets) {
  const [shape, surface] = key.split('|') as [Shape, string], geometry = geometries[shape](); made.push(geometry);
  const mesh = new THREE.InstancedMesh(geometry, materials[surface], list.length); mesh.name = `${name}-${surface}`;
  list.forEach((p, i) => {
   dummy.position.copy(p.at); dummy.rotation.set(p.pitch ?? 0, p.yaw ?? 0, p.roll ?? 0, 'YXZ'); dummy.scale.set(...p.size); dummy.updateMatrix();
   mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, colour.setHex(p.color ?? 0xffffff));
  });
  mesh.computeBoundingSphere(); group.add(mesh);
 }
 return { group, dispose() { made.forEach(g => g.dispose()); } };
}
