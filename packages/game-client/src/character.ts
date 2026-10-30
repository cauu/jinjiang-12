import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const heroBoyUrl = new URL('./assets/models/hanfu_boy.glb', import.meta.url).href;
const heroGirlUrl = new URL('./assets/models/hanfu_girl.glb', import.meta.url).href;
const boyMaskUrl = new URL('./assets/hanfu-boy-cloth-mask.webp', import.meta.url).href;
const girlMaskUrl = new URL('./assets/hanfu-girl-cloth-mask.webp', import.meta.url).href;
const atlasUrls = { boy: new URL('./assets/hanfu-boy-crowd-atlas.webp', import.meta.url).href, girl: new URL('./assets/hanfu-girl-crowd-atlas.webp', import.meta.url).href };
const atlasMaskUrls = { boy: new URL('./assets/hanfu-boy-crowd-mask.webp', import.meta.url).href, girl: new URL('./assets/hanfu-girl-crowd-mask.webp', import.meta.url).href };
/** Character files, loaded first by the preloader. */
export const CHARACTER_ASSETS = [heroBoyUrl, heroGirlUrl, boyMaskUrl, girlMaskUrl, ...Object.values(atlasUrls), ...Object.values(atlasMaskUrls)];

export type Animation = 'idle'|'walk'|'run'|'jump'|'hit';
export type Gender = 'boy'|'girl';
type Character = {root:THREE.Group;model:THREE.Object3D;quality:'hero'|'crowd';gender:Gender;color:string;animation:Animation;elapsed:number;column?:number;mixer?:THREE.AnimationMixer;walk?:THREE.AnimationAction;run?:THREE.AnimationAction;jump?:THREE.AnimationAction;hit?:THREE.AnimationAction;meshes?:THREE.SkinnedMesh[];spriteMaterial?:THREE.SpriteMaterial;uniforms?:{offset:{value:THREE.Vector2};color:{value:THREE.Color}}};

/** Skinned models for local player (boy/girl selectable); sprite atlas for crowd. */
export class Characters {
 private heroBoy:GLTF|null=null;private heroGirl:GLTF|null=null;private masks:Partial<Record<Gender,THREE.Texture>>={};private atlases:Partial<Record<Gender,THREE.Texture>>={};private atlasMasks:Partial<Record<Gender,THREE.Texture>>={};
 private materials=new Map<string,THREE.Material>();readonly ready:Promise<void>;
 constructor(){
  // Hero GLB files are shipped meshopt-compressed with WebP textures (see tools/export-models.mjs).
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),textures=new THREE.TextureLoader();
  this.ready=Promise.all([loader.loadAsync(heroBoyUrl),loader.loadAsync(heroGirlUrl),textures.loadAsync(boyMaskUrl),textures.loadAsync(girlMaskUrl),textures.loadAsync(atlasUrls.boy),textures.loadAsync(atlasUrls.girl),textures.loadAsync(atlasMaskUrls.boy),textures.loadAsync(atlasMaskUrls.girl)]).then(([boy,girl,boyMask,girlMask,boyAtlas,girlAtlas,boyAtlasMask,girlAtlasMask])=>{
   const required=['Walk_Cycle','Run_Cycle','Jump_InPlace','Hit_Reaction'];
   for(const [name,gltf] of [['boy',boy],['girl',girl]]as const){for(const anim of required)if(!gltf.animations.some(a=>a.name===anim))throw new Error(`${name} 角色缺少 ${anim} 动画`);}
   for(const m of [boyMask,girlMask]){m.flipY=false;m.colorSpace=THREE.NoColorSpace;}for(const a of [boyAtlas,girlAtlas])a.colorSpace=THREE.SRGBColorSpace;for(const m of [boyAtlasMask,girlAtlasMask])m.colorSpace=THREE.NoColorSpace;this.heroBoy=boy;this.heroGirl=girl;this.masks={boy:boyMask,girl:girlMask};this.atlases={boy:boyAtlas,girl:girlAtlas};this.atlasMasks={boy:boyAtlasMask,girl:girlAtlasMask};
  });
 }
 create(self:boolean,gender:Gender='boy'):Character|null {
  const hero=gender==='girl'?this.heroGirl:this.heroBoy;
  const atlas=this.atlases[gender],atlasMask=this.atlasMasks[gender];
  if(!hero||!this.masks.boy||!atlas||!atlasMask)return null;
  const root=new THREE.Group();
  if(!self){
   const material=new THREE.SpriteMaterial({map:atlas,transparent:true,depthWrite:false});
   const uniforms={offset:{value:new THREE.Vector2(0,8/9)},color:{value:new THREE.Color('#ffffff')}};
   material.onBeforeCompile=shader=>{
    shader.uniforms.atlasOffset=uniforms.offset;shader.uniforms.clothColor=uniforms.color;shader.uniforms.clothMask={value:atlasMask};
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec2 atlasOffset;\nuniform vec3 clothColor;\nuniform sampler2D clothMask;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
     vec2 atlasUV = vMapUv / vec2(8.0, 9.0) + atlasOffset;
     vec4 texelColor = texture2D(map, atlasUV);
     diffuseColor *= texelColor;
     float clothAmount = texture2D(clothMask, atlasUV).r;
     float clothLight = clamp(dot(diffuseColor.rgb, vec3(0.2126,0.7152,0.0722))*1.65, 0.15, 1.0);
     diffuseColor.rgb = mix(diffuseColor.rgb, clothColor * clothLight, clothAmount);
    #endif`);
   };material.customProgramCacheKey=()=> `hanfu-crowd-atlas-${gender}-v1`;
   const sprite=new THREE.Sprite(material);sprite.scale.set(1.175,1.175,1);sprite.position.y=-.077;root.add(sprite);
   return {root,model:sprite,quality:'crowd',gender,color:'',animation:'idle',elapsed:0,spriteMaterial:material,uniforms};
  }
  const model=clone(hero.scene);model.scale.setScalar(.47);model.position.y=-.5;root.add(model);
  const mixer=new THREE.AnimationMixer(model);
  const clip=(name:string)=>{const c=hero.animations.find(a=>a.name===name);if(!c)throw new Error(`角色动画缺失: ${name}`);return c;};
  // Root motion is stripped from the one-shot clips so the capsule, not the animation, moves the body.
  const inPlace=(c:THREE.AnimationClip)=>{c.tracks=c.tracks.filter(t=>!t.name.endsWith('Root.position'));return c;};
  const jumpClip=inPlace(THREE.AnimationUtils.subclip(clip('Jump_InPlace'),'Jump_Active',18,55,30)),hitClip=inPlace(THREE.AnimationClip.parse(THREE.AnimationClip.toJSON(clip('Hit_Reaction'))));
  const walk=mixer.clipAction(clip('Walk_Cycle')),run=mixer.clipAction(clip('Run_Cycle')),jump=mixer.clipAction(jumpClip),hit=mixer.clipAction(hitClip);
  jump.setLoop(THREE.LoopOnce,1);jump.clampWhenFinished=true;jump.timeScale=2.25;hit.setLoop(THREE.LoopOnce,1);hit.clampWhenFinished=true;
  const meshes:THREE.SkinnedMesh[]=[];model.traverse(o=>{if(o instanceof THREE.SkinnedMesh)meshes.push(o);});
  return {root,model,mixer,walk,run,jump,hit,meshes,quality:'hero',gender,color:'',animation:'idle',elapsed:0};
 }
 setColor(c:Character,color:string){
  if(c.color===color)return;c.color=color;
  if(c.uniforms){c.uniforms.color.value.set(color);return;}
  for(const mesh of c.meshes??[]){
   const base=mesh.userData.originalMaterial??mesh.material;mesh.userData.originalMaterial=base;const cacheKey=`${c.gender}:${color}`;let material=this.materials.get(cacheKey);
   if(!material){material=(base as THREE.MeshStandardMaterial).clone();const tint=new THREE.Color(color),mask=this.masks[c.gender]!;
    material.onBeforeCompile=shader=>{
     shader.uniforms.clothMask={value:mask};shader.uniforms.clothColor={value:tint};
     shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D clothMask;\nuniform vec3 clothColor;');
     shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n#ifdef USE_MAP\n float clothAmount = texture2D(clothMask, vMapUv).r;\n float clothLight = clamp(dot(diffuseColor.rgb, vec3(0.2126,0.7152,0.0722))*1.65, 0.15, 1.0);\n diffuseColor.rgb = mix(diffuseColor.rgb, clothColor * clothLight, clothAmount);\n#endif');
    };material.customProgramCacheKey=()=> 'hanfu-cloth-v1';this.materials.set(cacheKey,material);
   }
   mesh.material=material;
  }
 }
 update(c:Character,dt:number,animation:Animation,facing:number,speed=5){
  if(c.animation!==animation)c.elapsed=0;c.elapsed+=dt*(animation==='walk'?Math.max(.6,speed/5):1);if(c.quality==='crowd'){
   // Eight atlas directions baked at model yaw col·π/4 (same mapping as the hero); only switch once the
   // smoothed yaw is clearly inside the next sector.
   const sector=(Math.PI-facing)/(Math.PI/4),current=c.column??((Math.round(sector)%8)+8)%8;let delta=((sector-current)%8+12)%8-4;
   const col=Math.abs(delta)>.62?((Math.round(sector)%8)+8)%8:current;c.column=col;
   const row=animation==='walk'?1+Math.floor(c.elapsed*4)%4:animation==='jump'?5+Math.min(3,Math.floor(c.elapsed/.14)):0;
   c.uniforms!.offset.value.set(col/8,(8-row)/9);c.animation=animation;return;
  }
  // Gameplay facing is atan2(x,-z) (0 = up the screen, clockwise); the model faces +z, so yaw = π − facing.
  c.model.rotation.y=Math.PI-facing;
  const actionOf=(a:Animation)=>a==='walk'?c.walk!:a==='run'?c.run!:a==='jump'?c.jump!:a==='hit'?c.hit!:null;
  if(c.animation!==animation){
   // Crossfade instead of stop/play so starting, stopping and landing never pop a pose.
   const from=actionOf(c.animation),to=actionOf(animation),fade=animation==='jump'||animation==='hit'?.08:.18;
   if(to){to.reset().setEffectiveWeight(1).play();if(from)from.crossFadeTo(to,fade,false);else to.fadeIn(fade);}else from?.fadeOut(fade);
   c.animation=animation;
  }
  // Gait speed follows how fast the body really moves: walk cycle ~5 u/s, run cycle plays at its own pace.
  c.walk!.timeScale=Math.max(.6,speed/5);c.run!.timeScale=Math.max(.6,speed/7);
  c.mixer!.update(dt);
 }
 dispose(c:Character){c.mixer?.stopAllAction();c.mixer?.uncacheRoot(c.model);c.spriteMaterial?.dispose();}
 disposeAll(){for(const m of this.materials.values())m.dispose();this.masks.boy?.dispose();this.masks.girl?.dispose();for(const t of [...Object.values(this.atlases),...Object.values(this.atlasMasks)])t?.dispose();}
}
export type {Character};
