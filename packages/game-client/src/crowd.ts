import * as THREE from 'three';
import { atlasMaskUrls, atlasUrls, type Gender } from './character.js';

/** A background townsperson. Standing ones face `facing`; walkers pace between `from` and `to`.
 * Facing uses the gameplay convention: atan2(dx, -dz), 0 = north (up the screen). */
export type Townsperson = { gender: Gender; color: string; x: number; z: number; facing?: number; to?: [number, number]; speed?: number };

/** Same sprite size and anchor as remote players (character.ts), standing on the street at `ground`. */
const SIZE = 1.175, LIFT = .5 - .077;
const COLUMNS = 8, ROWS = 9;

const vertexShader = /* glsl */`
attribute vec3 instanceCentre;
attribute vec2 instanceCell;
attribute vec3 instanceCloth;
uniform float size;
varying vec2 vUv;
varying vec3 vCloth;
void main() {
 // Camera-facing card like THREE.Sprite, positioned by its centre.
 vec4 view = modelViewMatrix * vec4(instanceCentre, 1.0);
 view.xy += position.xy * size;
 gl_Position = projectionMatrix * view;
 vUv = uv / vec2(${COLUMNS}.0, ${ROWS}.0) + instanceCell;
 vCloth = instanceCloth;
}`;

const fragmentShader = /* glsl */`
uniform sampler2D atlas;
uniform sampler2D clothMask;
varying vec2 vUv;
varying vec3 vCloth;
void main() {
 vec4 texel = texture2D(atlas, vUv);
 if (texel.a < 0.5) discard;
 // Same garment recolouring as the player sprites.
 float cloth = texture2D(clothMask, vUv).r;
 float light = clamp(dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722)) * 1.65, 0.15, 1.0);
 gl_FragColor = vec4(mix(texel.rgb, vCloth * light, cloth), 1.0);
 #include <colorspace_fragment>
}`;

/** Background crowd: one instanced draw call per gender, animated from the crowd sprite atlases. */
export function createCrowd(people: readonly Townsperson[], ground: number) {
 const group = new THREE.Group(); group.name = 'crowd';
 const loader = new THREE.TextureLoader(), card = new THREE.PlaneGeometry(1, 1);
 const parts = (['boy', 'girl'] as const).map(gender => {
  const members = people.map((p, index) => ({ ...p, phase: (index * .618) % 1 })).filter(p => p.gender === gender);
  const atlas = loader.load(atlasUrls[gender]), mask = loader.load(atlasMaskUrls[gender]);
  atlas.colorSpace = THREE.SRGBColorSpace; mask.colorSpace = THREE.NoColorSpace;
  const geometry = new THREE.InstancedBufferGeometry().copy(card as unknown as THREE.InstancedBufferGeometry);
  geometry.instanceCount = members.length;
  const centre = new THREE.InstancedBufferAttribute(new Float32Array(members.length * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const cell = new THREE.InstancedBufferAttribute(new Float32Array(members.length * 2), 2).setUsage(THREE.DynamicDrawUsage);
  const cloth = new THREE.InstancedBufferAttribute(new Float32Array(members.length * 3), 3), colour = new THREE.Color();
  members.forEach((p, i) => { colour.set(p.color); cloth.setXYZ(i, colour.r, colour.g, colour.b); });
  geometry.setAttribute('instanceCentre', centre); geometry.setAttribute('instanceCell', cell); geometry.setAttribute('instanceCloth', cloth);
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { atlas: { value: atlas }, clothMask: { value: mask }, size: { value: SIZE } } });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = `crowd-${gender}`; mesh.frustumCulled = false;
  mesh.raycast = () => {}; // the card sits at the origin until the shader places it; never pick it
  group.add(mesh);
  return { members, geometry, material, atlas, mask, centre, cell };
 });
 const columnOf = (facing: number) => ((Math.round((Math.PI - facing) / (Math.PI / 4)) % 8) + 8) % 8;
 function update(seconds: number) {
  for (const part of parts) {
   part.members.forEach((p, i) => {
    let x = p.x, z = p.z, facing = p.facing ?? Math.PI, row = 0;
    if (p.to) {
     const dx = p.to[0] - p.x, dz = p.to[1] - p.z, length = Math.hypot(dx, dz), period = 2 * length / (p.speed ?? 1.1);
     // Walkers stagger their start (phase) so they never pace in lockstep.
     const t = ((seconds / period + p.phase) % 1) * 2, out = t < 1, f = out ? t : 2 - t;
     x += dx * f; z += dz * f; facing = out ? Math.atan2(dx, -dz) : Math.atan2(-dx, dz);
     row = 1 + Math.floor(seconds * 4 + i) % 4;
    }
    part.centre.setXYZ(i, x, ground + LIFT, z);
    part.cell.setXY(i, columnOf(facing) / COLUMNS, (ROWS - 1 - row) / ROWS);
   });
   part.centre.needsUpdate = true; part.cell.needsUpdate = true;
  }
 }
 update(0);
 return {
  group, update,
  dispose() { card.dispose(); for (const part of parts) { part.geometry.dispose(); part.material.dispose(); part.atlas.dispose(); part.mask.dispose(); } },
 };
}
