import * as THREE from 'three';
import { easing } from 'maath';
import { Characters, type Character, type Animation } from './character.js';
import { createLevel, DEFAULT_BG, type LevelView } from './levels/index.js';
import { TEAM_COLORS } from './levels/common.js';
import { Connection } from './net.js';
import { MOTION } from '@jinjiang/shared';
export { LEVEL_NAMES, LEVEL_RULES } from '@jinjiang/shared';
export { attachAudio } from './audio.js';
export { Connection } from './net.js';
export { mountStage } from './stage.js';
export { Preloader } from './preload.js';

/** Presentation-only state per avatar: smoothed yaw, planar speed and debounced animation. */
type Visual = { yaw: number; speed: number; last: THREE.Vector3; airborne: number; animation: Animation };
/** Maximum rendered turn rate (rad/s): a full reversal takes about a quarter second. */
const TURN_SPEED = 12;
/** Rate used for turns sharper than 120° (rad/s): a reversal completes in about 0.15 s. */
const REVERSE_TURN_SPEED = 22;
/** Server card and countdown lengths (apps/server/src/game.ts defaults); the level flyover spans both. */
const INTRO_CARD_MS = 7000, INTRO_COUNTDOWN_MS = 3000;

/** Shared whitebox renderer. Gameplay remains authoritative on the server. */
export class SceneView {
 private renderer:THREE.WebGLRenderer;private scene=new THREE.Scene();private camera=new THREE.PerspectiveCamera(50,1,.1,150);private level:LevelView|null=null;private levelId='';private players=new Map<string,THREE.Group>();private characters=new Map<string,Character>();private characterAssets=new Characters();private modelState="loading";private target=new THREE.Vector3();private raf=0;private lastFrame=performance.now();private visuals=new Map<string,Visual>();
 private sphere=new THREE.SphereGeometry(.42,12,8);private selfRingGeometry=new THREE.TorusGeometry(.50,.035,6,32);private selfMarkerMaterial=new THREE.MeshBasicMaterial({color:0xffffff,depthTest:true,depthWrite:false});private inspectCamera=new URLSearchParams(location.search).get('cameraMetrics')==='1';private netMetrics=new URLSearchParams(location.search).get('netMetrics')==='1';private lastControlCheck=0;private flyPoint=new THREE.Vector3();
 constructor(private container:HTMLElement,private connection:Connection,private mode:'mobile'|'display'){
  this.renderer=new THREE.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setClearColor(0xcce7e5);container.append(this.renderer.domElement);this.scene.background=new THREE.Color(0xd3eae4);this.scene.add(new THREE.HemisphereLight(0xffffff,0x988979,2));const light=new THREE.DirectionalLight(0xffffff,1.5);light.position.set(3,8,5);this.scene.add(light);this.characterAssets.ready.then(()=>{this.modelState='ready';}).catch(error=>{this.modelState='error';console.error('角色模型加载失败',error);const notice=document.createElement('div');notice.textContent='角色资源加载失败，已使用简化角色';notice.setAttribute('role','status');notice.style.cssText='position:fixed;bottom:8px;left:50%;transform:translateX(-50%);z-index:12;background:#233b36e8;color:white;padding:5px 10px;border-radius:6px;font-size:12px;pointer-events:none';this.container.append(notice);});
  window.addEventListener('resize',this.resize);this.resize();this.frame();
 }
 private resize=()=>{const w=this.container.clientWidth||innerWidth,h=this.container.clientHeight||innerHeight;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();};
 /** Swap the level-specific scene; everything level-specific lives in ./levels. */
 private switchLevel(id:string){if(this.level){this.scene.remove(this.level.group);this.level.dispose();}this.level=createLevel(id);this.scene.add(this.level.group);this.scene.background=new THREE.Color(this.level.background??DEFAULT_BG);this.levelId=id;}
 private frame=()=>{
  this.raf=requestAnimationFrame(this.frame);const tick=performance.now(),dt=Math.min(.05,Math.max(0,(tick-this.lastFrame)/1000));this.lastFrame=tick;this.connection.update(tick);const snap=this.connection.snapshot,match=snap?.room.match,level=match?.level,levelId=level?.id??'lobby';if(match?.media)return;if(levelId!==this.levelId)this.switchLevel(levelId);this.renderer.domElement.dataset.sceneLevel=levelId;this.renderer.domElement.dataset.environment=this.level!.environment;
  const stairs=levelId==='06-guishi',now=this.connection.serverNow(),d=level?.data;
  this.level!.update({now,tick,dt,match,data:d,connection:this.connection,mode:this.mode,revision:snap?.revision??-1,camera:this.camera});
  const activeIds=new Set<string>(),selfId=this.connection.session?.playerId,controlling=this.connection.controlling();
  for(const [id,p] of Object.entries(snap?.room.players??{})){
   // Players who qualify early (Jiushi) leave the field until the round ends.
   const pose=this.connection.pose(id);if(!pose||p.status==='spectating'||p.status==='eliminated'||p.status==='qualified'&&match?.phase==='playing')continue;activeIds.add(id);
   const self=this.mode==='mobile'&&id===selfId;let mesh=this.players.get(id);
   if(!mesh){mesh=new THREE.Group();const placeholder=new THREE.Mesh(this.sphere,new THREE.MeshBasicMaterial({color:p.color}));placeholder.name='placeholder';mesh.add(placeholder);this.players.set(id,mesh);this.scene.add(mesh);}
   // Rapier keeps a small skin between the capsule and the floor; hide it visually.
   mesh.position.set(pose.x,pose.y-MOTION.offset,pose.z);
   let visual=this.visuals.get(id);if(!visual){visual={yaw:pose.facing,speed:0,last:mesh.position.clone(),airborne:0,animation:'idle'};this.visuals.set(id,visual);}
   // Facing and gait come from what is drawn, not from raw network values, so they never pop.
   const planar=dt>0?Math.hypot(mesh.position.x-visual.last.x,mesh.position.z-visual.last.z)/dt:0;visual.last.copy(mesh.position);
   const intended=self&&controlling?Math.min(1,Math.hypot(this.connection.intent.x,this.connection.intent.z))*MOTION.groundSpeed:planar;
   easing.damp(visual,'speed',Math.min(intended,8),self?.04:.1,dt);// Reversals turn faster so a quick change of direction never lags behind the body.
   const turn=Math.abs(((pose.facing-visual.yaw)%(2*Math.PI)+3*Math.PI)%(2*Math.PI)-Math.PI);easing.dampAngle(visual,'yaw',pose.facing,self?.07:.1,dt,turn>2.1?REVERSE_TURN_SPEED:TURN_SPEED);
   visual.airborne=pose.grounded?0:visual.airborne+dt;
   visual.animation=visual.airborne>.06?'jump':visual.animation==='walk'?(visual.speed>.35?'walk':'idle'):(visual.speed>.8?'walk':'idle');
   let character=this.characters.get(id);if(!character&&this.modelState==='ready'){character=this.characterAssets.create(self,p.gender??'boy')??undefined;if(character){const placeholder=mesh.getObjectByName('placeholder');if(placeholder){mesh.remove(placeholder);((placeholder as THREE.Mesh).material as THREE.Material).dispose();}mesh.add(character.root);this.characters.set(id,character);}}
   if(character){const teamIndex=levelId==='01-jinshi'?d?.teams.findIndex(t=>t.playerIds.includes(id))??-1:-1;const clothes=teamIndex>=0?`#${TEAM_COLORS[teamIndex%TEAM_COLORS.length].toString(16).padStart(6,'0')}`:p.color;this.characterAssets.setColor(character,clothes);this.characterAssets.update(character,dt,visual.animation,visual.yaw,visual.speed);if(self){this.renderer.domElement.dataset.modelColor=clothes;this.renderer.domElement.dataset.modelAnimation=visual.animation;}}
   if(self&&controlling){const canvas=this.renderer.domElement,server=this.connection.avatarOf(id);canvas.dataset.playerX=String(mesh.position.x);canvas.dataset.playerY=String(mesh.position.y);canvas.dataset.playerZ=String(mesh.position.z);if(server){canvas.dataset.serverX=String(server.x);canvas.dataset.serverY=String(server.y);canvas.dataset.serverZ=String(server.z);}}
  }
  for(const id of this.visuals.keys())if(!activeIds.has(id))this.visuals.delete(id);
  if(this.netMetrics){const w=window as unknown as {__jjNet?:unknown[]},frames=(w.__jjNet??=[]) as unknown[];frames.push({t:tick,players:Object.fromEntries([...this.players].map(([id,mesh])=>[id,[mesh.position.x,mesh.position.y,mesh.position.z,this.visuals.get(id)?.yaw??0,this.visuals.get(id)?.animation]])),self:selfId,net:this.connection.netStats()});if(frames.length>4000)frames.splice(0,frames.length-4000);}
  for(const [id,mesh] of this.players)if(!activeIds.has(id)){this.scene.remove(mesh);const character=this.characters.get(id);if(character){this.characterAssets.dispose(character);this.characters.delete(id);}const placeholder=mesh.getObjectByName('placeholder') as THREE.Mesh|undefined;if(placeholder)(placeholder.material as THREE.Material).dispose();const label=mesh.getObjectByName('self-label') as THREE.Sprite|undefined;if(label){label.material.map?.dispose();label.material.dispose();}this.players.delete(id);}this.renderer.domElement.dataset.modelState=this.modelState;this.renderer.domElement.dataset.modelCount=String(this.characters.size);
  const self=this.connection.session?.playerId,avatar=self?this.connection.pose(self):null;
  const ownMesh=self?this.players.get(self):undefined;
  const restTarget=new THREE.Vector3(),restPosition=new THREE.Vector3();let following=false;
  if(this.mode==='mobile'&&avatar&&ownMesh&&snap?.room.players[self!]?.status==='playing'){
   if(!ownMesh.getObjectByName('self-ring')){const ring=new THREE.Mesh(this.selfRingGeometry,this.selfMarkerMaterial);ring.name='self-ring';ring.rotation.x=Math.PI/2;ring.position.y=-.47;ring.renderOrder=9;ownMesh.add(ring);}const selfName=snap?.room.players[self!]?.name??'';const index=match?.participants.indexOf(self!)??-1;const text=index>=0?`${selfName} · ${String(index+1).padStart(2,'0')}`:selfName;let label=ownMesh.getObjectByName('self-label') as THREE.Sprite|undefined;if(!label||label.userData.text!==text){if(label){ownMesh.remove(label);label.material.map?.dispose();label.material.dispose();}const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d')!;ctx.font='bold 45px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=7;ctx.strokeStyle='#243a38';ctx.strokeText(text,256,48,480);ctx.fillStyle='#fff';ctx.fillText(text,256,48,480);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));label.name='self-label';label.userData.text=text;label.position.y=.78;label.scale.set(1.7,.32,1);label.renderOrder=10;ownMesh.add(label);this.renderer.domElement.dataset.selfLabel=text;}
   const rendered=ownMesh.position,view=this.level!.camera;restTarget.set(rendered.x,rendered.y+(view?.lift??0),rendered.z-(view?.lookAhead??1.2));restPosition.set(rendered.x,rendered.y+3.4,rendered.z+4.6);following=true;
  }else{const overview=this.level!.overview;restTarget.copy(overview?.target??restTarget.set(0,0,stairs?-2:0));restPosition.copy(overview?.position??restPosition.set(0,26,25));}
  // The level's establishing shot spans the card and countdown on every screen (server-timed),
  // then eases into the gameplay camera so play starts from exactly where the shot ends.
  const intro=this.introProgress(match,now),flyover=this.level!.flyover;
  if(intro!==null&&flyover){const t=THREE.MathUtils.smootherstep(intro,0,.8),hand=THREE.MathUtils.smootherstep(intro,.7,1);this.camera.position.copy(flyover.position.getPoint(t,this.flyPoint).lerp(restPosition,hand));this.target.copy(flyover.target.getPoint(t,this.flyPoint).lerp(restTarget,hand));}
  else if(following){const follow=1-Math.exp(-dt*6.3);this.target.lerp(restTarget,follow);this.camera.position.lerp(restPosition,follow);}
  else{this.target.copy(restTarget);this.camera.position.lerp(restPosition,1-Math.exp(-dt*5));}
  this.camera.lookAt(this.target);this.renderer.render(this.scene,this.camera);
  // Keep the primary touch targets usable, but fade them when they cover another
  // player's projected body. The touch hit box itself never moves or shrinks.
  if(this.mode==='mobile'&&tick-this.lastControlCheck>120){this.lastControlCheck=tick;const controls=document.querySelector<HTMLElement>('#controls');const rect=this.renderer.domElement.getBoundingClientRect();const candidates=[...this.players].filter(([id])=>id!==self);for(const selector of ['#stick','#jump']){const control=document.querySelector<HTMLElement>(selector);if(!control)continue;const area=control.getBoundingClientRect();let overlap=false;if(controls&&!controls.hidden&&levelId==='01-jinshi')for(const [,mesh] of candidates){const middle=mesh.position.clone().project(this.camera);if(middle.z< -1||middle.z>1)continue;const points=[[-.45,-.4],[.45,-.4],[-.45,.55],[.45,.55]].map(([x,y])=>mesh.position.clone().add(new THREE.Vector3(x,y,0)).project(this.camera));const left=rect.left+Math.min(...points.map(p=>(p.x+1)*.5))*rect.width,right=rect.left+Math.max(...points.map(p=>(p.x+1)*.5))*rect.width,top=rect.top+Math.min(...points.map(p=>(1-p.y)*.5))*rect.height,bottom=rect.top+Math.max(...points.map(p=>(1-p.y)*.5))*rect.height;if(left<area.right&&right>area.left&&top<area.bottom&&bottom>area.top){overlap=true;break;}}control.classList.toggle('player-overlap',overlap);}}
  if(this.inspectCamera&&this.mode==='display'&&levelId==='01-jinshi'){const points=[[-10,-10],[-10,10],[10,-10],[10,10]].map(([x,z])=>new THREE.Vector3(x,0,z).project(this.camera));this.renderer.domElement.dataset.arenaBounds=JSON.stringify([Math.min(...points.map(p=>(p.x+1)/2)),Math.min(...points.map(p=>(1-p.y)/2)),Math.max(...points.map(p=>(p.x+1)/2)),Math.max(...points.map(p=>(1-p.y)/2))]);}if(new URLSearchParams(location.search).get('characterMetrics')==='1'){this.renderer.domElement.dataset.drawCalls=String(this.renderer.info.render.calls);this.renderer.domElement.dataset.triangles=String(this.renderer.info.render.triangles);this.renderer.domElement.dataset.characterRoster=JSON.stringify([...this.characters].map(([id,c])=>({id,color:c.color,quality:c.quality,animation:c.animation,ownRing:!!this.players.get(id)?.getObjectByName('self-ring'),ownLabel:!!this.players.get(id)?.getObjectByName('self-label')})));}
  if(this.inspectCamera&&this.mode==='mobile'&&ownMesh&&avatar&&snap?.room.players[self!]?.status==='playing'){
   if(this.level?.occluders){const occluders=this.level.occluders;const ray=new THREE.Raycaster();const hits:string[]=[];for(const dy of [-.3,0,.45]){const point=ownMesh.position.clone().add(new THREE.Vector3(0,dy,0));const direction=point.clone().sub(this.camera.position);ray.set(this.camera.position,direction.clone().normalize());ray.far=Math.max(0,direction.length()-.03);const hit=ray.intersectObjects(occluders,true).find(v=>v.object.name!=='jinshi-street');if(hit)hits.push(hit.object.name||hit.object.type);}this.renderer.domElement.dataset.environmentOcclusion=JSON.stringify(hits);}
   const positions=this.sphere.attributes.position,point=new THREE.Vector3();let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
   for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(ownMesh.matrixWorld).project(this.camera);const x=(point.x+1)/2,y=(1-point.y)/2;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
   const canvas=this.renderer.domElement;canvas.dataset.playerScreenX=String((left+right)/2);canvas.dataset.playerScreenY=String((top+bottom)/2);canvas.dataset.playerScreenHeight=String(bottom-top);canvas.dataset.playerScreenBounds=JSON.stringify([left,top,right,bottom]);
   for(const child of ownMesh.children){if(!(child instanceof THREE.Mesh))continue;const vertices=child.geometry.attributes.position;for(let i=0;i<vertices.count;i++){point.fromBufferAttribute(vertices,i).applyMatrix4(child.matrixWorld).project(this.camera);const x=(point.x+1)/2,y=(1-point.y)/2;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}canvas.dataset.playerWithMarkersBounds=JSON.stringify([left,top,right,bottom]);
  }
  this.renderer.domElement.dispatchEvent(new Event('jinjiang:render')); 
 };
 /** 0→1 across the level card and countdown, or null outside them. */
 private introProgress(match:{phase:string;phaseEndsAt:number|null}|null|undefined,now:number){
  if(!match||match.phaseEndsAt==null||(match.phase!=='card'&&match.phase!=='countdown'))return null;
  const end=match.phaseEndsAt+(match.phase==='card'?INTRO_COUNTDOWN_MS:0);return THREE.MathUtils.clamp(1-(end-now)/(INTRO_CARD_MS+INTRO_COUNTDOWN_MS),0,1);
 }
 destroy(){if(this.level){this.scene.remove(this.level.group);this.level.dispose();this.level=null;}cancelAnimationFrame(this.raf);window.removeEventListener('resize',this.resize);for(const character of this.characters.values())this.characterAssets.dispose(character);this.characters.clear();this.characterAssets.disposeAll();this.selfRingGeometry.dispose();this.selfMarkerMaterial.dispose();this.renderer.dispose();this.container.replaceChildren();}
}
