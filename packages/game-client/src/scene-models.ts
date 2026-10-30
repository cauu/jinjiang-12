import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Finalised environment models (tools/export-models.mjs). Origin is at the base centre, the
 * front faces +Z, and units are metres. */
const MODEL_URLS = {
 street_shop: new URL('./assets/models/street_shop.glb', import.meta.url).href,
 street_house: new URL('./assets/models/street_house.glb', import.meta.url).href,
 front_workshop: new URL('./assets/models/front_workshop.glb', import.meta.url).href,
 gate_tower: new URL('./assets/models/gate_tower.glb', import.meta.url).href,
 canopy_stall: new URL('./assets/models/canopy_stall.glb', import.meta.url).href,
 ceremonial_archway: new URL('./assets/models/ceremonial_archway.glb', import.meta.url).href,
} as const;
export type ModelName = keyof typeof MODEL_URLS;
export const modelUrls = (names: readonly ModelName[]) => names.map(name => MODEL_URLS[name]);

/** One building in a layout: model, base position, and yaw (0 = front faces +Z / south). Buildings
 * sharing a chunk are merged together, so each chunk can be frustum-culled or hidden on its own. */
export type Placement = { model: ModelName; chunk: string; x: number; z: number; yaw?: number; y?: number; scale?: number };

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<ModelName, Promise<THREE.Object3D>>();
/** Material library shared by every model: the exports reuse names such as roof_slate and
 * warm_timber, so each look is uploaded once and a retextured library restyles all buildings. */
const library = new Map<string, THREE.Material>();

function load(name: ModelName) {
 let model = cache.get(name);
 if (!model) {
  model = loader.loadAsync(MODEL_URLS[name]).then(gltf => {
   gltf.scene.traverse(object => {
    const mesh = object as THREE.Mesh; if (!mesh.isMesh) return;
    const own = mesh.material as THREE.MeshStandardMaterial, key = own.name || `${name}:${own.uuid}`;
    let shared = library.get(key);
    if (!shared) { shared = lambert(own); library.set(key, shared); }
    if (shared.userData.source !== own.uuid) disposeMaterial(own);
    mesh.material = shared;
   });
   gltf.scene.updateMatrixWorld(true);
   return gltf.scene;
  });
  cache.set(name, model);
 }
 return model;
}

/** Phones render dozens of buildings: Lambert keeps the colour map and drops the PBR terms and the
 * subtle paper normal map. The exports are all marked double-sided, but the buildings are closed
 * shapes seen from outside, so back faces are culled to halve the rasterisation. */
function lambert(source: THREE.MeshStandardMaterial) {
 const material = new THREE.MeshLambertMaterial({ name: source.name, color: source.color, map: source.map, transparent: source.transparent, alphaTest: source.alphaTest, side: THREE.FrontSide });
 material.userData.source = source.uuid; source.normalMap?.dispose(); source.dispose();
 return material;
}

function disposeMaterial(material: THREE.Material) {
 for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
 material.dispose();
}

/** Dequantised copy (meshopt exports use normalised integers) holding only what the materials read. */
function plain(source: THREE.BufferGeometry, matrix: THREE.Matrix4) {
 const geometry = new THREE.BufferGeometry(), count = source.attributes.position.count;
 for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]] as const) {
  const attribute = source.getAttribute(name), array = new Float32Array(count * size);
  if (attribute) for (let i = 0; i < count; i++) for (let c = 0; c < size; c++) array[i * size + c] = attribute.getComponent(i, c);
  geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
 }
 geometry.setIndex(source.index ? Array.from(source.index.array) : [...Array(count).keys()]);
 geometry.applyMatrix4(matrix);
 return geometry;
}

/** Places the layout and merges each chunk per material: a street block costs one draw call per look. */
export async function buildStreet(placements: readonly Placement[]) {
 const models = new Map(await Promise.all([...new Set(placements.map(p => p.model))].map(async name => [name, await load(name)] as const)));
 const parts = new Map<string, Map<THREE.Material, THREE.BufferGeometry[]>>(), place = new THREE.Matrix4(), world = new THREE.Matrix4();
 for (const p of placements) {
  const s = p.scale ?? 1;
  place.compose(new THREE.Vector3(p.x, p.y ?? 0, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw ?? 0), new THREE.Vector3(s, s, s));
  models.get(p.model)!.traverse(object => {
   const mesh = object as THREE.Mesh; if (!mesh.isMesh) return;
   const chunk = parts.get(p.chunk) ?? new Map(), material = mesh.material as THREE.Material, list = chunk.get(material) ?? [];
   list.push(plain(mesh.geometry, world.multiplyMatrices(place, mesh.matrixWorld))); chunk.set(material, list); parts.set(p.chunk, chunk);
  });
 }
 const group = new THREE.Group(), chunks = new Map<string, THREE.Group>(); group.name = 'street-models';
 for (const [name, materials] of parts) {
  const chunk = new THREE.Group(); chunk.name = `street-${name}`; chunks.set(name, chunk); group.add(chunk);
  for (const [material, geometries] of materials) {
   const merged = mergeGeometries(geometries)!; geometries.forEach(g => g.dispose());
   const mesh = new THREE.Mesh(merged, material); mesh.name = `street-${name}-${material.name || 'material'}`; mesh.matrixAutoUpdate = false; chunk.add(mesh);
  }
 }
 // Materials and textures belong to the shared library; only the merged geometry is per level.
 return { group, chunks, dispose() { group.traverse(object => (object as THREE.Mesh).geometry?.dispose()); } };
}

/** World position of a point given in a placed model's own frame. */
export function placeLocal(p: Pick<Placement, 'x' | 'z' | 'yaw' | 'y'>, x: number, y: number, z: number) {
 const c = Math.cos(p.yaw ?? 0), s = Math.sin(p.yaw ?? 0);
 return new THREE.Vector3(p.x + x * c + z * s, (p.y ?? 0) + y, p.z - x * s + z * c);
}

/** A flat textured card facing the model's front (signs, banners). `uv` is [u, v, width, height]. */
export type Decal = { at: THREE.Vector3; yaw: number; w: number; h: number; uv: readonly [number, number, number, number] };

/** All decals of one material merged into a single mesh. */
export function decalMesh(decals: readonly Decal[], material: THREE.Material, name: string) {
 const position: number[] = [], normal: number[] = [], uv: number[] = [], index: number[] = [];
 decals.forEach((d, i) => {
  const c = Math.cos(d.yaw), s = Math.sin(d.yaw), [u, v, uw, vh] = d.uv;
  for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
   const dx = cx * d.w / 2, dy = cy * d.h / 2;
   position.push(d.at.x + dx * c, d.at.y + dy, d.at.z - dx * s); normal.push(s, 0, c);
   uv.push(u + (cx + 1) / 2 * uw, v + (cy + 1) / 2 * vh);
  }
  index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
 });
 const geometry = new THREE.BufferGeometry();
 geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
 geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
 geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
 geometry.setIndex(index);
 const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.matrixAutoUpdate = false;
 return mesh;
}
