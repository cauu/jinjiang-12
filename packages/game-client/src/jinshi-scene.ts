import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildStreet, decalMesh, modelUrls, placeLocal, type Decal, type ModelName, type Placement } from './scene-models.js';
import { createCrowd, type Townsperson } from './crowd.js';
import { buildProps, type Prop } from './market-props.js';
import { BANNERS, SIGN_RECTS } from './jinshi-signs.js';

// The arena remains server-owned. These lightweight, non-colliding decorations
// sit outside the 20×20 playfield and are shared by the lobby and Jinshi.
const groundUrl = new URL('./assets/jinshi/ground-earth-v2.webp', import.meta.url).href;
const brickUrl = new URL('./assets/jinshi/plaza-brick-v1.webp', import.meta.url).href;
const skirtUrl = new URL('./assets/jinshi/stage-skirt-v1.webp', import.meta.url).href;
const panoramaUrl = new URL('./assets/jinshi/far-panorama-v2.webp', import.meta.url).href;
const signsUrl = new URL('./assets/jinshi/signs-v1.webp', import.meta.url).href;
const bannersUrl = new URL('./assets/jinshi/banners-v2.webp', import.meta.url).href;
const motifUrl = new URL('./assets/jinshi/brocade-motif-v1.webp', import.meta.url).href;
const nearGoodsUrls = [
 new URL('./assets/jinshi/near-silk-goods-v1.webp', import.meta.url).href,
 new URL('./assets/jinshi/near-baskets-vats-v1.webp', import.meta.url).href,
];
const textures = {
 silk: new URL('./assets/jinshi/texture-silk-base-v1.webp', import.meta.url).href,
 red: new URL('./assets/jinshi/texture-brocade-red-v1.webp', import.meta.url).href,
 indigo: new URL('./assets/jinshi/texture-brocade-indigo-v1.webp', import.meta.url).href,
 wood: new URL('./assets/jinshi/texture-aged-wood-v1.webp', import.meta.url).href,
 linen: new URL('./assets/jinshi/texture-linen-v1.webp', import.meta.url).href,
 roof: new URL('./assets/jinshi/texture-roof-v2.webp', import.meta.url).href,
 bamboo: new URL('./assets/jinshi/texture-bamboo-v1.webp', import.meta.url).href,
} as const;

// Han market street around the arena, built from the finalised models. Fronts face the arena.
// Phones look north from just behind the player and only ever see the bottom ~3 m of these
// (counters, goods, people); the roofline and back street are for the display and the flyover.
const W = Math.PI / 2;
/** Street level: the stage top is y = 0 and the market around it is 0.45 m lower. */
const GROUND = -.45;
const row = (chunk: string, z: number, items: readonly (readonly [number, ModelName])[]) => items.map(([x, model]): Placement => ({ model, chunk, x, z }));
const side = (chunk: string, x: number, yaw: number, items: readonly (readonly [number, ModelName])[]) => items.map(([z, model]): Placement => ({ model, chunk, x, z, yaw }));
/** Never in the phones' gameplay view: shown on the display and during the flyover only. */
const FAR_CHUNKS = ['back', 'outer-west', 'outer-east', 'south'];
const JINSHI_STREET: Placement[] = ([
 // North: the market tower (市楼) on the phones' sight line, the brocade workshop framed behind it.
 { model: 'gate_tower', chunk: 'north', x: 0, z: -14.6 },
 { model: 'front_workshop', chunk: 'north', x: 0, z: -21.5 },
 ...row('north', -20, [[-7.4, 'street_shop'], [-14.5, 'street_house'], [-21.6, 'street_shop'], [7.4, 'street_house'], [14.5, 'street_shop'], [21.6, 'street_house']]),
 // Back street: only its roofs show, giving the display a skyline above the north street.
 ...row('back', -29, [[-3.6, 'street_house'], [3.6, 'street_shop'], [-10.8, 'street_shop'], [10.8, 'street_house'], [-18, 'street_house'], [18, 'street_shop']]),
 // West and east streets, and roof-only outer rows so the display shows town rather than bare ground.
 ...side('west', -19.5, W, [[-10.6, 'street_house'], [-3.5, 'street_shop'], [3.6, 'street_house'], [10.7, 'street_shop']]),
 ...side('east', 19.5, -W, [[-10.6, 'street_shop'], [-3.5, 'street_house'], [3.6, 'street_shop'], [10.7, 'street_house']]),
 ...side('outer-west', -27.5, W, [[-17.7, 'street_house'], [-10.6, 'street_shop'], [-3.5, 'street_house'], [3.6, 'street_shop'], [10.7, 'street_house']]),
 ...side('outer-east', 27.5, -W, [[-17.7, 'street_house'], [-10.6, 'street_shop'], [-3.5, 'street_house'], [3.6, 'street_shop'], [10.7, 'street_house']]),
 // Market stalls just outside the railing.
 ...side('stalls-west', -13.5, W, [-7.5, -2.5, 2.5, 7.5].map(z => [z, 'canopy_stall'] as const)),
 ...side('stalls-east', 13.5, -W, [-7.5, -2.5, 2.5, 7.5].map(z => [z, 'canopy_stall'] as const)),
 // South: the archway the market is entered through (and the flyover flies through).
 { model: 'ceremonial_archway', chunk: 'south', x: 0, z: 16.5 },
] as Placement[]).map(p => ({ ...p, y: GROUND }));

/** Writable face of each model's blank sign, in the model's frame (front = +z), from the GLB exports. */
const SIGN_FACES: Partial<Record<ModelName, { x: number; y: number; z: number; w: number; h: number }[]>> = {
 street_shop: [{ x: 0, y: 2.29, z: 3.172, w: 1.48, h: .2 }],
 front_workshop: [{ x: 0, y: 2.24, z: 5.118, w: 1.29, h: .18 }],
 gate_tower: [{ x: 0, y: 4.05, z: 1.292, w: 1.47, h: .47 }],
 canopy_stall: [{ x: 0, y: 2.54, z: 1.38, w: .68, h: .14 }],
 ceremonial_archway: [{ x: 0, y: 3.72, z: .313, w: 2.23, h: .25 }, { x: -2.235, y: 3.02, z: .313, w: 1.37, h: .25 }, { x: 2.235, y: 3.02, z: .313, w: 1.37, h: .25 }],
};
const SHOP_SIGNS = ['蜀錦', '絲帛', '彩線', '染坊', '漆器', '布肆', '陶器', '蜀鹽'], STALL_SIGNS = ['錦', '絲', '繡', '染', '繒'];
/** What each shop and stall sells (its sign); they cycle through the lists along the street. */
const TRADE = new Map<Placement, string>();
{ let shop = 0, stall = 0; for (const p of JINSHI_STREET) { if (p.model === 'street_shop') TRADE.set(p, SHOP_SIGNS[shop++ % SHOP_SIGNS.length]); if (p.model === 'canopy_stall') TRADE.set(p, STALL_SIGNS[stall++ % STALL_SIGNS.length]); } }
/** Which sign each blank face shows. */
function signDecals(far: boolean) {
 const decals: Decal[] = [];
 for (const p of JINSHI_STREET) {
  if (FAR_CHUNKS.includes(p.chunk) !== far) continue;
  const keys = p.model === 'street_shop' ? [`shop:${TRADE.get(p)}`] : p.model === 'canopy_stall' ? [`stall:${TRADE.get(p)}`]
   : p.model === 'front_workshop' ? ['workshop'] : p.model === 'gate_tower' ? ['gate'] : p.model === 'ceremonial_archway' ? ['arch', 'arch-left', 'arch-right'] : [];
  keys.forEach((key, i) => { const f = SIGN_FACES[p.model]![i]; decals.push({ at: placeLocal(p, f.x, f.y, f.z), yaw: p.yaw ?? 0, w: f.w, h: f.h, uv: SIGN_RECTS[key] }); });
 }
 return decals;
}
const bannerUv = (text: string): Decal['uv'] => { const i = Math.max(0, BANNERS.indexOf(text)); return [i / BANNERS.length, 0, 1 / BANNERS.length, 1]; };
/** Which flag (幌子) each trade flies. */
const FLAG: Record<string, string> = { 錦: '錦', 繡: '錦', 蜀錦: '錦', 絲: '絲', 彩線: '絲', 絲帛: '絲', 繒: '帛', 布肆: '帛', 染: '帛', 染坊: '帛', 漆器: '市', 陶器: '市', 蜀鹽: '市' };
/** Where a stall's or shop's flag pole stands, in its own frame. */
const POLE: Partial<Record<ModelName, [number, number, number]>> = { canopy_stall: [1.85, 3.5, 1.25], street_shop: [3.25, 3.6, 2.95] };
/** Banners under the eaves of the houses beside the door, and a flag on a pole for every shop and stall. */
function bannerDecals() {
 const houses = JINSHI_STREET.filter(p => p.model === 'street_house' && !FAR_CHUNKS.includes(p.chunk)).map((p, i): Decal => ({
  at: placeLocal(p, i % 2 ? 1.55 : -1.55, 2.32, 2.36), yaw: p.yaw ?? 0, w: .62, h: .78, uv: [(i % BANNERS.length) / BANNERS.length, 0, 1 / BANNERS.length, 1],
 }));
 const flags = [...TRADE].filter(([p]) => !FAR_CHUNKS.includes(p.chunk)).map(([p, trade]): Decal => {
  const [x, h, z] = POLE[p.model]!;
  return { at: placeLocal(p, x + .36, h - .55, z), yaw: p.yaw ?? 0, w: .56, h: .7, uv: bannerUv(FLAG[trade]) };
 });
 return [...houses, ...flags];
}

/** Goods, flag poles, drying racks of brocade and carts, built from simple shapes and the existing textures. */
const DYES = [0xe9d9b8, 0xd8b45c, 0x9fb3a0, 0xc98f86, 0xa9b9cf];
const BRIGHT = [0xc0392b, 0x2e6fb0, 0xe0b23a, 0x3f8f55, 0x7d4b8f, 0xd9772b];
function marketProps() {
 const props: Prop[] = [];
 type At = Pick<Placement, 'x' | 'z' | 'yaw' | 'y'>;
 const put = (p: At, shape: Prop['shape'], surface: string, x: number, y: number, z: number, size: Prop['size'], extra: Partial<Prop> = {}) =>
  props.push({ shape, surface, at: placeLocal(p, x, y, z), size, ...extra, yaw: (p.yaw ?? 0) + (extra.yaw ?? 0) });
 const cloth = (i: number) => (['red', 'indigo', 'linen'] as const)[i % 3];
 const bolts = (p: At, x: number, y: number, z: number, n: number, plain = false) => { for (let i = 0; i < n; i++) put(p, 'box', plain ? 'linen' : cloth(i + Math.round(x * 3)), x, y + .036 + i * .072, z, [.42, .07, .3], { color: plain || cloth(i + Math.round(x * 3)) === 'linen' ? DYES[(i + n) % DYES.length] : 0xffffff, yaw: (i % 2) * .08 }); };
 const rolls = (p: At, x: number, y: number, z: number, n: number, surface = 'linen') => { for (let i = 0; i < n; i++) put(p, 'cylinder', surface, x, y + .07, z + (i - (n - 1) / 2) * .15, [.14, .46, .14], { roll: W, color: DYES[(i * 2 + Math.round(x * 5)) % DYES.length] }); };
 const skeins = (p: At, x: number, y: number, z: number) => { for (let i = 0; i < 6; i++) put(p, 'box', 'plain', x + (i % 3 - 1) * .14, y + .04, z + (i < 3 ? -.08 : .08), [.11, .08, .11], { color: BRIGHT[i] }); };
 const vat = (p: At, x: number, y: number, z: number, dye: number, s = 1) => { put(p, 'cylinder', 'plain', x, y + .18 * s, z, [.5 * s, .36 * s, .5 * s], { color: 0x6b4a33 }); put(p, 'cylinder', 'plain', x, y + .365 * s, z, [.42 * s, .02, .42 * s], { color: dye }); };
 const jars = (p: At, x: number, y: number, z: number, n: number, s = 1) => { for (let i = 0; i < n; i++) put(p, 'jar', 'plain', x + (i - (n - 1) / 2) * .28 * s, y + .15 * s, z, [.24 * s, .3 * s, .24 * s], { color: [0xa0522d, 0x8b6d4b, 0xb07a4a][i % 3] }); };
 const lacquer = (p: At, x: number, y: number, z: number) => { put(p, 'box', 'plain', x - .12, y + .05, z, [.24, .1, .18], { color: 0x231c18 }); put(p, 'box', 'plain', x - .12, y + .12, z, [.2, .04, .15], { color: 0xa8322a }); put(p, 'cylinder', 'plain', x + .17, y + .035, z - .05, [.18, .07, .18], { color: 0xa8322a }); put(p, 'cylinder', 'plain', x + .17, y + .035, z + .12, [.14, .06, .14], { color: 0x231c18 }); };
 const sacks = (p: At, x: number, y: number, z: number, n: number) => { for (let i = 0; i < n; i++) put(p, 'box', 'linen', x + (i % 2 - .5) * .3, y + .14 + Math.floor(i / 2) * .26, z, [.28, .27, .24], { color: 0xf0ede4, yaw: i * .2 }); };
 const hang = (p: At, x: number, top: number, z: number, length: number, surface: string, color = 0xffffff) => put(p, 'box', surface, x, top - length / 2, z, [.5, length, .02], { color });
 const pole = (p: At, [x, h, z]: [number, number, number]) => { put(p, 'cylinder', 'wood', x, h / 2, z, [.08, h, .08]); put(p, 'box', 'wood', x + .36, h - .12, z, [.78, .05, .05]); };
 for (const [p, trade] of TRADE) {
  if (FAR_CHUNKS.includes(p.chunk)) continue;
  pole(p, POLE[p.model]!);
  if (p.model === 'canopy_stall') {
   const top = 1.11, z = .58;
   for (const x of [-1, 0, 1]) bolts(p, x, 1.17, -.77, 2, true);                          // rear shelf
   if (trade === '錦') { bolts(p, -1, top, z, 4); bolts(p, -.35, top, z, 3); rolls(p, .7, top, z, 3, 'red'); hang(p, -1.25, 2.45, 1.12, .95, 'red'); hang(p, 1.25, 2.45, 1.12, .95, 'indigo'); }
   if (trade === '絲') { rolls(p, -.9, top, z, 3); skeins(p, 0, top, z); rolls(p, .9, top, z, 3); hang(p, -1.25, 2.45, 1.12, .9, 'linen', DYES[3]); hang(p, 1.25, 2.45, 1.12, .9, 'linen', DYES[4]); }
   if (trade === '繡') { bolts(p, -.9, top, z, 2); for (const x of [.1, .75]) put(p, 'box', 'red', x, top + .2, z + .2, [.36, .38, .02], { roll: 0, yaw: x * .3 }); hang(p, 1.25, 2.45, 1.12, .8, 'red'); }
   if (trade === '染') { vat(p, -.8, top, z, 0x2c4f7c, .8); vat(p, .2, top, z, 0x9c2f2a, .8); hang(p, -1.25, 2.45, 1.12, 1, 'linen', 0x5878a8); hang(p, 1.25, 2.45, 1.12, 1, 'linen', 0xd8b45c); }
   if (trade === '繒') { bolts(p, -1, top, z, 5, true); bolts(p, -.3, top, z, 4, true); bolts(p, .5, top, z, 3, true); }
  } else {
   const top = 1.42, z = 1.96;
   for (const side of [-1, 1]) {
    const a = side * 2.4, b = side * 1.5;
    if (['蜀錦', '絲帛', '布肆'].includes(trade)) { bolts(p, a, top, z, 4, trade === '布肆'); bolts(p, b, top, z, 3, trade === '布肆'); }
    if (trade === '彩線') { skeins(p, a, top, z); skeins(p, b, top, z); }
    if (trade === '染坊') { bolts(p, a, top, z, 3, true); vat(p, side * 2.5, 0, 2.95, side > 0 ? 0x2c4f7c : 0x9c2f2a, 1.5); }
    if (trade === '漆器') { lacquer(p, a, top, z); lacquer(p, b, top, z); }
    if (trade === '陶器') { jars(p, a, top, z, 2); jars(p, side * 2.5, 0, 2.95, 2, 2.2); }
    if (trade === '蜀鹽') { sacks(p, a, top, z, 2); sacks(p, side * 2.5, 0, 2.95, 4); }
   }
  }
 }
 // Drying racks hung with brocade, in the open corners of the market and by the entrance.
 for (const [x, z] of [[-14.6, -13.6], [14.6, -13.6], [-14.8, 13.4], [14.8, 13.4], [-7.5, 15.6], [7.5, 15.6]]) {
  const p = { x, z, y: GROUND };
  for (const px of [-1.5, 1.5]) put(p, 'box', 'wood', px, 1.3, 0, [.12, 2.6, .12]);
  put(p, 'box', 'wood', 0, 2.55, 0, [3.2, .1, .1]);
  [-1.05, -.35, .35, 1.05].forEach((px, i) => hang(p, px, 2.5, 0, 1.7, ['red', 'indigo', 'linen', 'linen'][i], i === 2 ? 0xd8b45c : i === 3 ? 0x8fae8a : 0xffffff));
 }
 // Hand carts loaded with bolts and sacks.
 for (const [x, z, yaw] of [[-6.5, 13.4, .3], [10.6, 14.6, -.4], [-15.4, 16, 1.2]]) {
  const p = { x, z, yaw, y: GROUND };
  put(p, 'box', 'wood', 0, .62, 0, [1.6, .12, 1]); put(p, 'box', 'wood', 0, .78, .48, [1.6, .2, .05]); put(p, 'box', 'wood', 0, .78, -.48, [1.6, .2, .05]);
  for (const s of [-1, 1]) { put(p, 'cylinder', 'plain', 0, .42, s * .56, [.84, .07, .84], { pitch: W, color: 0x5a3d28 }); put(p, 'box', 'wood', 1.35, .55, s * .38, [1.3, .06, .06], { roll: .25 }); }
  bolts(p, -.4, .68, 0, 3); sacks(p, .35, .68, 0, 3);
 }
 return props;
}

/** Townsfolk around the stalls, the loom, the cloth rack and the tower, and walkers along the streets. */
const MUTED = ['#8a6f5a', '#6f7f86', '#9a7b4f', '#7c8a6a', '#a4847a', '#5f6b78', '#b39c7a', '#8b5e57', '#6d7a6e', '#9c8a6c'];
const E = Math.PI / 2, S = Math.PI, N = 0, Wf = -Math.PI / 2;
const JINSHI_CROWD: Townsperson[] = (() => {
 const out: Townsperson[] = [];
 const add = (x: number, z: number, facing: number, to?: [number, number], speed?: number) => out.push({ gender: out.length % 2 ? 'girl' : 'boy', color: MUTED[(out.length * 3) % MUTED.length], x, z, facing, to, speed });
 for (const z of [-7.5, -2.5, 2.5, 7.5]) {
  add(-14.1, z, E); add(-11.6, z - .5, Wf); if (z !== 2.5) add(-11.5, z + .6, Wf);  // seller, customers (west)
  add(14.1, z, Wf); add(11.6, z + .5, E); if (z !== -2.5) add(11.5, z - .6, E);     // east
 }
 add(-6, -13.1, S); add(-7.7, -12.4, E);                              // weaver at the loom, helper with thread
 add(6.2, -12.7, S); add(5.3, -11.2, N); add(6.9, -11.1, N);          // showing brocade on the rack
 add(-8.4, -13.8, N); add(-9.7, -14.3, E); add(8.4, -13.8, N); add(9.7, -14.2, Wf);  // goods by the tower
 add(-2.2, -12.7, S); add(2.2, -12.7, S);                             // market officials under the tower
 add(-15.6, -11, S, [-15.6, 11], 1.1); add(-15.9, 9, N, [-15.9, -9], .9);   // walkers, west street
 add(15.6, 11, N, [15.6, -11], 1.0); add(15.9, -8, S, [15.9, 9], 1.2);      // east street
 add(-20, -16.5, E, [-5, -16.5], 1.0); add(19, -16.6, Wf, [5, -16.6], 1.1); // north street
 // Onlookers watching the game from the paving round the stage, a second row on the south side.
 const watch = (x: number, z: number) => add(x, z, Math.atan2(-x, z) + Math.sin(x * 7.3 + z) * .25);
 for (const x of [-9.4, -8.3, -4.4, -3.4, -1.3, -.2, 1.1, 3.6, 4.4, 8.4, 9.5]) watch(x, -11 + Math.sin(x) * .15);
 for (let x = -9.6; x <= 9.7; x += 1.2) watch(x + Math.sin(x * 3) * .2, 11 + Math.cos(x) * .15);
 for (const x of [-7.8, -5.2, -2.9, -1.6, 1.9, 3.1, 5.6, 8.2]) watch(x, 11.9);
 for (const z of [-9.8, -5, 0, 5, 9.8]) { watch(-10.95, z); watch(10.95, z + .3); }
 for (const [x, z] of [[-1.4, 13.2], [1.5, 13.6], [-11.4, 11.6], [11.5, 11.4], [-11.4, -11.4], [11.3, -11.6]]) watch(x, z);
 add(.7, 24, N, [.7, 12.2], 1.0); add(-.8, 21, N, [-.8, 12.6], .9); add(-4, 13.5, Wf, [4, 13.5], .8); // through the archway
 return out;
})();
const JINSHI_MODELS = [...new Set(JINSHI_STREET.map(p => p.model))] as ModelName[];
/** Every file the Jinshi scene loads, for preloading during the lobby. */
export const JINSHI_ASSETS = [...modelUrls(JINSHI_MODELS), groundUrl, brickUrl, skirtUrl, panoramaUrl, signsUrl, bannersUrl, motifUrl, ...nearGoodsUrls, ...Object.values(textures)];
type Box = { x:number; y:number; z:number; w:number; h:number; d:number; color:number; rotation?:number; tilt?:number; surface?:'linen'|'bamboo' };

export function createJinshiScene() {
 const group = new THREE.Group(); group.name = 'jinshi-environment';
 const boxes: Box[] = [];
 const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number,rotation=0,tilt=0,surface?:Box['surface'])=>boxes.push({x,y,z,w,h,d,color,rotation,tilt,surface});
 const wood=0x936545, pale=0xf0dfb4, roof=0x56564d, ochre=0xc99a57;
 // The raised paper stage side is decorative and does not change tile heights.
 for(const [x,z,w,d] of [[0,-10.2,20.5,.4],[0,10.2,20.5,.4],[-10.2,0,.4,20.5],[10.2,0,.4,20.5]]) {
  box(x,-.22,z,w,.42,d,0xc8b18d);box(x,.06,z,w,.12,d,0xe8d2a6);
 }
 // Low paper-wood railing posts are kept outside the playable square.
 for(let i=0;i<=8;i++){const v=-10+i*2.5;box(v,.40,-10.35,.13,.8,.13,wood);box(-10.35,.40,v,.13,.8,.13,wood);box(10.35,.40,v,.13,.8,.13,wood);}box(0,.72,-10.35,20.4,.11,.11,wood);box(-10.35,.72,0,.11,.11,20.4,wood);box(10.35,.72,0,.11,.11,20.4,wood);
 // The market drum hangs on the market tower's upper floor, beside the 錦市 plaque.
 const drumGeometry=new THREE.CylinderGeometry(.42,.42,.3,20);const drumMaterial=new THREE.MeshLambertMaterial({color:0xb5463a});const drum=new THREE.Mesh(drumGeometry,drumMaterial);drum.rotation.x=Math.PI/2;drum.position.set(1.75,3.75+GROUND,-13.05);drum.name='jinshi-gate-drum';group.add(drum);
 // Props off the stage stand on the street (GROUND); the railing stands on the stage.
 const onStreet=(x:number,y:number,z:number,w:number,h:number,d:number,c:number,rotation=0,tilt=0,surface?:Box['surface'])=>box(x,y+GROUND,z,w,h,d,c,rotation,tilt,surface);
 // Loom at (-6,-12): frame, heddle, and individual coloured warp threads.
 for(const x of [-7,-5])for(const z of [-12.5,-11.55])onStreet(x,1.05,z,.13,2.1,.13,wood);
 for(const y of [.25,1.75])for(const z of [-12.5,-11.55])onStreet(-6,y,z,2.15,.12,.12,wood);
 for(let i=0;i<13;i++)onStreet(-6.9+i*.15,1.05,-12.0,.035,1.35,.035,[0xb23c30,0x325c68,0xe1ba65][i%3]);
 onStreet(-6,.48,-11.7,1.85,.08,.7,ochre);
 // Brocade display rack at (6,-12).
 for(const x of [5,7])onStreet(x,1.0,-12,.14,2,.14,wood);
 onStreet(6,1.85,-12,2.15,.14,.14,wood);onStreet(6,.14,-12,2.15,.14,.55,wood);
 // Small pots, woven baskets and boxes remain below the gameplay sightline.
 for(const [x,z] of [[-11.4,-10],[11.4,-10],[-11.4,10],[11.4,10],[-8.8,-12],[8.8,-12]]){
  onStreet(x,.38,z,.62,.76,.62,ochre);onStreet(x,.78,z,.65,.10,.65,wood);
  onStreet(x+.65,.23,z+.25,.46,.46,.46,pale,0,0,'bamboo');
 }
 // Texture and background are on separate, noninteractive geometry.
 const loader=new THREE.TextureLoader();
 const loadTexture=(url:string)=>{const texture=loader.load(url);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;return texture;};
 const maps={red:loadTexture(textures.red),indigo:loadTexture(textures.indigo),wood:loadTexture(textures.wood),linen:loadTexture(textures.linen),roof:loadTexture(textures.roof),bamboo:loadTexture(textures.bamboo)};
 const clothMaterial=new THREE.MeshBasicMaterial({map:maps.red,side:THREE.DoubleSide});
 const indigoMaterial=new THREE.MeshBasicMaterial({map:maps.indigo,side:THREE.DoubleSide});
 const clothGeometry=new THREE.PlaneGeometry(1.7,1.18);
 const cloth=new THREE.Mesh(clothGeometry,clothMaterial);cloth.position.set(6,1.13+GROUND,-11.91);group.add(cloth);
 const geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshLambertMaterial({color:0xffffff});
 const instances=new THREE.InstancedMesh(geometry,material,boxes.length);instances.name='jinshi-modular-props';
 instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);const dummy=new THREE.Object3D(),color=new THREE.Color();
 const surfaceFor=(b:Box):'wood'|'linen'|'roof'|'bamboo'|null=>b.surface??(b.color===wood?'wood':b.color===roof?'roof':null);
 boxes.forEach((b,i)=>{dummy.position.set(b.x,b.y,b.z);const hidden=surfaceFor(b)!==null;dummy.scale.set(hidden?0:b.w,hidden?0:b.h,hidden?0:b.d);dummy.rotation.set(0,b.rotation??0,b.tilt??0);dummy.updateMatrix();instances.setMatrixAt(i,dummy.matrix);instances.setColorAt(i,color.setHex(b.color));});
 instances.instanceMatrix.needsUpdate=true;if(instances.instanceColor)instances.instanceColor.needsUpdate=true;group.add(instances);
 const surfaceMaterials:THREE.MeshLambertMaterial[]=[];
 for(const surface of ['wood','linen','roof','bamboo'] as const){
  const matching=boxes.filter(b=>surfaceFor(b)===surface);const surfaceMaterial=new THREE.MeshLambertMaterial({map:maps[surface]});surfaceMaterials.push(surfaceMaterial);
  const mesh=new THREE.InstancedMesh(geometry,surfaceMaterial,matching.length);mesh.name=`jinshi-${surface}-props`;
  matching.forEach((b,i)=>{dummy.position.set(b.x,b.y,b.z);dummy.scale.set(b.w,b.h,b.d);dummy.rotation.set(0,b.rotation??0,b.tilt??0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(surface==='linen')mesh.setColorAt(i,color.setHex(b.color));});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;group.add(mesh);
 }
 // A quiet procedural sky dome surrounds the real-time market. It is deliberately
 // separate from the distant market strip, so neither contains gameplay geometry.
 const skyGeometry=new THREE.SphereGeometry(60,32,16),positions=skyGeometry.attributes.position,skyColors=[];const low=new THREE.Color('#edc692'),high=new THREE.Color('#cce3df');for(let i=0;i<positions.count;i++){const f=THREE.MathUtils.clamp((positions.getY(i)/60+1)*.5,0,1);const c=low.clone().lerp(high,f);skyColors.push(c.r,c.g,c.b);}skyGeometry.setAttribute('color',new THREE.Float32BufferAttribute(skyColors,3));const skyMaterial=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,depthWrite:false});const sky=new THREE.Mesh(skyGeometry,skyMaterial);sky.name='jinshi-sky';sky.renderOrder=-2;group.add(sky);
 // Rammed-earth street around the server-owned 20×20 floor (one texture repeat ≈ 6 m); no collision.
 const groundTexture=loadTexture(groundUrl);groundTexture.wrapS=groundTexture.wrapT=THREE.RepeatWrapping;groundTexture.repeat.set(25,25);
 const groundGeometry=new THREE.PlaneGeometry(150,150),groundMaterial=new THREE.MeshLambertMaterial({map:groundTexture});const ground=new THREE.Mesh(groundGeometry,groundMaterial);ground.rotation.x=-Math.PI/2;ground.position.y=-.45;ground.name='jinshi-street';group.add(ground);
 // Fired-brick paving only where an official market would have it: a ring round the stage, the
 // forecourt of the market tower, and the way in from the archway. World-space UVs, 4 bricks ≈ 2.4 m.
 const brickTexture=loadTexture(brickUrl);brickTexture.wrapS=brickTexture.wrapT=THREE.RepeatWrapping;
 const paving=[[-12,-12,12,-10.4],[-12,10.4,12,12],[-12,-10.4,-10.4,10.4],[10.4,-10.4,12,10.4],[-4.5,-16.2,4.5,-12],[-2.2,12,2.2,19]].map(([x0,z0,x1,z1])=>{const g=new THREE.PlaneGeometry(x1-x0,z1-z0);g.rotateX(-Math.PI/2);g.translate((x0+x1)/2,-.44,(z0+z1)/2);const uv=g.attributes.uv,pos=g.attributes.position;for(let i=0;i<uv.count;i++)uv.setXY(i,pos.getX(i)/2.4,-pos.getZ(i)/2.4);return g;});
 const pavingGeometry=mergeGeometries(paving)!;paving.forEach(g=>g.dispose());const pavingMaterial=new THREE.MeshLambertMaterial({map:brickTexture});const pavingMesh=new THREE.Mesh(pavingGeometry,pavingMaterial);pavingMesh.name='jinshi-street';group.add(pavingMesh);
 // Layered paper side of the raised stage (one texture repeat ≈ 1.7 m along the edge).
 const skirtTexture=loadTexture(skirtUrl);skirtTexture.wrapS=THREE.RepeatWrapping;
 const skirtGeometry=new THREE.PlaneGeometry(20.84,.57);skirtGeometry.attributes.uv.array.forEach((_,i,a)=>{if(i%2===0)(a as Float32Array)[i]*=12.2;});
 const skirtMaterial=new THREE.MeshLambertMaterial({map:skirtTexture});
 for(let i=0;i<4;i++){const side=new THREE.Mesh(skirtGeometry,skirtMaterial);side.rotation.y=i*Math.PI/2;side.position.set(Math.sin(i*Math.PI/2)*10.42,-.165,Math.cos(i*Math.PI/2)*10.42);side.name='jinshi-stage-side';group.add(side);}
 // Goods cutouts in front of the north street, either side of the market tower.
 const nearTextures=nearGoodsUrls.map(loadTexture);
 const nearMaterials=nearTextures.map(map=>new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.5,side:THREE.DoubleSide}));
 const nearGeometries=[new THREE.PlaneGeometry(5.4,3.04),new THREE.PlaneGeometry(5.2,2.93)];
 const nearPlacements=[[-8.4,-15.4,1],[8.4,-15.4,0]];
 for(const [x,z,index] of nearPlacements){const mesh=new THREE.Mesh(nearGeometries[index],nearMaterials[index]);mesh.position.set(x,1.47+GROUND,z);if(x>0)mesh.scale.x=-1;mesh.name=`jinshi-near-goods-${index}`;group.add(mesh);}
 // Han Chengdu painted on a far curved band round the north, behind every building; it repeats
 // three times (the art wraps) and its sky fades into the dome. Seen from inside, so u runs mirrored.
 const horizon=loadTexture(panoramaUrl);horizon.wrapS=THREE.RepeatWrapping;horizon.repeat.set(-3,1);
 const skylineGeometry=new THREE.CylinderGeometry(55,55,26,72,1,true,Math.PI*.55,Math.PI*.9),skylineMaterial=new THREE.MeshBasicMaterial({map:horizon,side:THREE.BackSide,transparent:true,depthWrite:false});
 const skyline=new THREE.Mesh(skylineGeometry,skylineMaterial);skyline.position.y=10;skyline.renderOrder=-1;skyline.name='jinshi-north-skyline';group.add(skyline);
 // Plaques on every blank signboard, and banners on the houses: one draw call each.
 const signsTexture=loadTexture(signsUrl),bannersTexture=loadTexture(bannersUrl);
 const signMaterial=new THREE.MeshLambertMaterial({map:signsTexture}),bannerMaterial=new THREE.MeshLambertMaterial({map:bannersTexture,alphaTest:.5,side:THREE.DoubleSide});
 const signs=decalMesh(signDecals(false),signMaterial,'jinshi-signs'),farSigns=decalMesh(signDecals(true),signMaterial,'jinshi-signs-far'),banners=decalMesh(bannerDecals(),bannerMaterial,'jinshi-banners');
 group.add(signs,farSigns,banners);
 const crowd=createCrowd(JINSHI_CROWD,GROUND);group.add(crowd.group);
 const plain=new THREE.MeshLambertMaterial({color:0xffffff});
 const propMaterials:Record<string,THREE.Material>={plain,red:new THREE.MeshLambertMaterial({map:maps.red}),indigo:new THREE.MeshLambertMaterial({map:maps.indigo}),linen:new THREE.MeshLambertMaterial({map:maps.linen}),wood:new THREE.MeshLambertMaterial({map:maps.wood}),bamboo:new THREE.MeshLambertMaterial({map:maps.bamboo})};
 const goods=buildProps(marketProps(),propMaterials,'jinshi-goods');group.add(goods.group);
 // The street models arrive asynchronously (normally already in THREE.Cache from preloading).
 let street:Awaited<ReturnType<typeof buildStreet>>|null=null,disposed=false;
 buildStreet(JINSHI_STREET).then(built=>{if(disposed)return built.dispose();street=built;group.add(built.group);}).catch(error=>console.error('锦市建筑模型加载失败',error));
 return { group, update(now:number,showFar=true){if(street)for(const name of FAR_CHUNKS){const chunk=street.chunks.get(name);if(chunk)chunk.visible=showFar;}farSigns.visible=showFar;crowd.update(now/1000);},
  dispose(){disposed=true;street?.dispose();crowd.dispose();for(const d of [drumGeometry,drumMaterial,geometry,material,clothGeometry,clothMaterial,indigoMaterial,...surfaceMaterials,...Object.values(maps),...nearGeometries,...nearMaterials,...nearTextures,skylineGeometry,skylineMaterial,horizon,skyGeometry,skyMaterial,groundGeometry,groundMaterial,groundTexture,pavingGeometry,pavingMaterial,brickTexture,skirtGeometry,skirtMaterial,skirtTexture,signsTexture,bannersTexture,signMaterial,bannerMaterial,signs.geometry,farSigns.geometry,banners.geometry,...Object.values(propMaterials)])d.dispose();goods.dispose();} };
}

/** Silk floor tiles; once a team paints a tile, its Han cloud-and-deer brocade shows through in a
 * lighter shade of the team colour. Painted tiles are told apart by the saturation of their instance colour. */
export function createJinshiFloorMaterial() {
 const loader=new THREE.TextureLoader(),silk=loader.load(textures.silk),motif=loader.load(motifUrl);
 silk.colorSpace=THREE.SRGBColorSpace;silk.anisotropy=2;motif.colorSpace=THREE.NoColorSpace;motif.anisotropy=2;
 const material=new THREE.MeshBasicMaterial({map:silk});
 material.onBeforeCompile=shader=>{
  shader.uniforms.motifMap={value:motif};
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D motifMap;').replace('#include <color_fragment>',`#include <color_fragment>
  #ifdef USE_COLOR // the fragment stage sees instance colours as USE_COLOR / vColor
   float top = max(vColor.r, max(vColor.g, vColor.b));
   float painted = smoothstep(.5, .6, top > 0. ? (top - min(vColor.r, min(vColor.g, vColor.b))) / top : 0.);
   diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(1.), .32), texture2D(motifMap, vMapUv).r * painted);
  #endif`);
 };
 material.customProgramCacheKey=()=>'jinshi-floor-v1';
 return { material, dispose(){material.dispose();silk.dispose();motif.dispose();} };
}
