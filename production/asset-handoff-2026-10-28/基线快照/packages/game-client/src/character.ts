import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
const heroUrl = new URL('./assets/hanfu-boy.glb', import.meta.url).href;
const maskUrl = new URL('./assets/hanfu-cloth-mask.png', import.meta.url).href;
const atlasUrl = new URL('./assets/hanfu-crowd-atlas.png', import.meta.url).href;
const atlasMaskUrl = new URL('./assets/hanfu-crowd-mask.png', import.meta.url).href;

type Animation = 'idle'|'walk'|'jump';
type Character = {root:THREE.Group;model:THREE.Object3D;quality:'hero'|'crowd';color:string;animation:Animation;elapsed:number;mixer?:THREE.AnimationMixer;walk?:THREE.AnimationAction;jump?:THREE.AnimationAction;meshes?:THREE.SkinnedMesh[];spriteMaterial?:THREE.SpriteMaterial;uniforms?:{offset:{value:THREE.Vector2};color:{value:THREE.Color}}};

/** One skinned model for the local player; an animated model-derived atlas for the crowd. */
export class Characters {
 private hero:GLTF|null=null;private mask:THREE.Texture|null=null;private atlas:THREE.Texture|null=null;private atlasMask:THREE.Texture|null=null;
 private materials=new Map<string,THREE.Material>();readonly ready:Promise<void>;
 constructor(){
  const loader=new GLTFLoader(),textures=new THREE.TextureLoader();
  this.ready=Promise.all([loader.loadAsync(heroUrl),textures.loadAsync(maskUrl),textures.loadAsync(atlasUrl),textures.loadAsync(atlasMaskUrl)]).then(([hero,mask,atlas,atlasMask])=>{
   if(!hero.animations.some(a=>a.name==='Walk_Cycle')||!hero.animations.some(a=>a.name==='Jump_InPlace'))throw new Error('角色动画缺失');mask.flipY=false;mask.colorSpace=THREE.NoColorSpace;atlas.colorSpace=THREE.SRGBColorSpace;atlasMask.colorSpace=THREE.NoColorSpace;this.hero=hero;this.mask=mask;this.atlas=atlas;this.atlasMask=atlasMask;
  });
 }
 create(self:boolean):Character|null {
  if(!this.hero||!this.mask||!this.atlas||!this.atlasMask)return null;
  const root=new THREE.Group();
  if(!self){
   const material=new THREE.SpriteMaterial({map:this.atlas,transparent:true,depthWrite:false});
   const uniforms={offset:{value:new THREE.Vector2(0,8/9)},color:{value:new THREE.Color('#ffffff')}};const atlasMask=this.atlasMask;
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
   };material.customProgramCacheKey=()=> 'hanfu-crowd-atlas-v1';
   const sprite=new THREE.Sprite(material);sprite.scale.set(1.175,1.175,1);sprite.position.y=-.077;root.add(sprite);
   return {root,model:sprite,quality:'crowd',color:'',animation:'idle',elapsed:0,spriteMaterial:material,uniforms};
  }
  const model=clone(this.hero.scene);model.scale.setScalar(.47);model.position.y=-.5;root.add(model);
  const mixer=new THREE.AnimationMixer(model),walkClip=this.hero.animations.find(a=>a.name==='Walk_Cycle'),jumpSource=this.hero.animations.find(a=>a.name==='Jump_InPlace');
  if(!walkClip||!jumpSource)throw new Error('角色动画缺失');
  const jumpClip=THREE.AnimationUtils.subclip(jumpSource,'Jump_Active',18,55,30);jumpClip.tracks=jumpClip.tracks.filter(t=>!t.name.endsWith('Root.position'));
  const walk=mixer.clipAction(walkClip),jump=mixer.clipAction(jumpClip);jump.setLoop(THREE.LoopOnce,1);jump.clampWhenFinished=true;jump.timeScale=2.25;
  const meshes:THREE.SkinnedMesh[]=[];model.traverse(o=>{if(o instanceof THREE.SkinnedMesh)meshes.push(o);});
  return {root,model,mixer,walk,jump,meshes,quality:'hero',color:'',animation:'idle',elapsed:0};
 }
 setColor(c:Character,color:string){
  if(c.color===color)return;c.color=color;
  if(c.uniforms){c.uniforms.color.value.set(color);return;}
  for(const mesh of c.meshes??[]){
   const base=mesh.userData.originalMaterial??mesh.material;mesh.userData.originalMaterial=base;let material=this.materials.get(color);
   if(!material){material=(base as THREE.MeshStandardMaterial).clone();const tint=new THREE.Color(color),mask=this.mask!;
    material.onBeforeCompile=shader=>{
     shader.uniforms.clothMask={value:mask};shader.uniforms.clothColor={value:tint};
     shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D clothMask;\nuniform vec3 clothColor;');
     shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n#ifdef USE_MAP\n float clothAmount = texture2D(clothMask, vMapUv).r;\n float clothLight = clamp(dot(diffuseColor.rgb, vec3(0.2126,0.7152,0.0722))*1.65, 0.15, 1.0);\n diffuseColor.rgb = mix(diffuseColor.rgb, clothColor * clothLight, clothAmount);\n#endif');
    };material.customProgramCacheKey=()=> 'hanfu-cloth-v1';this.materials.set(color,material);
   }
   mesh.material=material;
  }
 }
 update(c:Character,dt:number,animation:Animation,facing:number){
  if(c.animation!==animation)c.elapsed=0;c.elapsed+=dt;if(c.quality==='crowd'){
   const col=((Math.round((facing+Math.PI)/(Math.PI/4))%8)+8)%8,row=animation==='walk'?1+Math.floor(c.elapsed*4)%4:animation==='jump'?5+Math.min(3,Math.floor(c.elapsed/.14)):0;
   c.uniforms!.offset.value.set(col/8,(8-row)/9);c.animation=animation;return;
  }
  c.model.rotation.y=facing+Math.PI;
  if(c.animation!==animation){c.walk!.stop();c.jump!.stop();if(animation==='walk')c.walk!.reset().play();else if(animation==='jump')c.jump!.reset().play();c.animation=animation;}
  c.mixer!.update(dt);
 }
 dispose(c:Character){c.mixer?.stopAllAction();c.mixer?.uncacheRoot(c.model);c.spriteMaterial?.dispose();}
 disposeAll(){for(const m of this.materials.values())m.dispose();this.mask?.dispose();this.atlas?.dispose();this.atlasMask?.dispose();}
}
export type {Character};
