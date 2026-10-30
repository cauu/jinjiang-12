import * as THREE from 'three';

// The arena remains server-owned. These lightweight, non-colliding decorations
// sit outside the 20×20 playfield and are shared by the lobby and Jinshi.
const mobileGroundUrl = new URL('./assets/jinshi/mobile-ground-v1.webp', import.meta.url).href;
const mobileMarketUrl = new URL('./assets/jinshi/mobile-market-cutout-v1.webp', import.meta.url).href;
const mobileHorizonUrl = new URL('./assets/jinshi/mobile-far-backdrop-v1.webp', import.meta.url).href;
const variedShopsUrl = new URL('./assets/jinshi/near-varied-shops-v1.webp', import.meta.url).href;
const nearGoodsUrls = [
 new URL('./assets/jinshi/near-silk-goods-v1.webp', import.meta.url).href,
 new URL('./assets/jinshi/near-baskets-vats-v1.webp', import.meta.url).href,
 new URL('./assets/jinshi/near-market-cart-v1.webp', import.meta.url).href,
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
type Box = { x:number; y:number; z:number; w:number; h:number; d:number; color:number; rotation?:number; tilt?:number; surface?:'linen'|'bamboo' };

export function createJinshiScene() {
 const group = new THREE.Group(); group.name = 'jinshi-environment';
 const boxes: Box[] = [];
 const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number,rotation=0,tilt=0,surface?:Box['surface'])=>boxes.push({x,y,z,w,h,d,color,rotation,tilt,surface});
 const wood=0x936545, dark=0x54463b, pale=0xf0dfb4, red=0xa34935, roof=0x56564d, ochre=0xc99a57;
 // The raised paper stage side is decorative and does not change tile heights.
 for(const [x,z,w,d] of [[0,-10.2,20.5,.4],[0,10.2,20.5,.4],[-10.2,0,.4,20.5],[10.2,0,.4,20.5]]) {
  box(x,-.22,z,w,.42,d,0xc8b18d);box(x,.06,z,w,.12,d,0xe8d2a6);
 }
 // Low paper-wood railing posts are kept outside the playable square.
 for(let i=0;i<=8;i++){const v=-10+i*2.5;box(v,.40,-10.35,.13,.8,.13,wood);box(-10.35,.40,v,.13,.8,.13,wood);box(10.35,.40,v,.13,.8,.13,wood);}box(0,.72,-10.35,20.4,.11,.11,wood);box(-10.35,.72,0,.11,.11,20.4,wood);box(10.35,.72,0,.11,.11,20.4,wood);
 // North gate and drum at (0,-12), open beneath so the horizon is visible.
 for(const x of [-1.6,1.6]){box(x,1.45,-12,.25,2.9,.32,red);box(x,.15,-12,.48,.3,.5,wood);}
 box(0,2.9,-12,3.6,.24,.42,red);box(0,3.15,-12,4.05,.22,.72,roof);box(0,3.30,-12,3.6,.12,.5,ochre);
 // A small circular drum sits on the lintel; the passage below stays open.
 const drumGeometry=new THREE.CylinderGeometry(.27,.27,.18,16);const drumMaterial=new THREE.MeshLambertMaterial({color:0xc08453});const drum=new THREE.Mesh(drumGeometry,drumMaterial);drum.rotation.x=Math.PI/2;drum.position.set(0,3.2,-11.72);drum.name='jinshi-gate-drum';group.add(drum);
 // Loom at (-6,-12): frame, heddle, and individual coloured warp threads.
 for(const x of [-7,-5])for(const z of [-12.5,-11.55])box(x,1.05,z,.13,2.1,.13,wood);
 for(const y of [.25,1.75])for(const z of [-12.5,-11.55])box(-6,y,z,2.15,.12,.12,wood);
 for(let i=0;i<13;i++)box(-6.9+i*.15,1.05,-12.0,.035,1.35,.035,[0xb23c30,0x325c68,0xe1ba65][i%3]);
 box(-6,.48,-11.7,1.85,.08,.7,ochre);
 // Brocade display rack at (6,-12).
 for(const x of [5,7])box(x,1.0,-12,.14,2,.14,wood);
 box(6,1.85,-12,2.15,.14,.14,wood);box(6,.14,-12,2.15,.14,.55,wood);
 // Two stalls along each side; all parts stay outside |x|=10.5.
 const stall=(x:number,z:number)=>{
  for(const dx of [-.85,.85])for(const dz of [-.7,.7])box(x+dx,.85,z+dz,.12,1.7,.12,wood);
  const canopyColors=[0xffffff,0xeed2bd,0xd9e2d5,0xefe0bb,0xe8c8bd];const canopy=canopyColors[([-8,-5,0,5,8].indexOf(z)+(x>0?2:0))%canopyColors.length];
  box(x,1.75,z,2.05,.12,1.75,dark);box(x-.55,1.93,z,1.28,.11,1.95,canopy,0,.16,'linen');box(x+.55,1.93,z,1.28,.11,1.95,canopy,0,-.16,'linen');
  box(x,.66,z,1.85,.16,1.3,wood);box(x,.79,z,.70,.10,.42,red);box(x+.6,.79,z,.38,.10,.42,0x345c60);
 };
 for(const x of [-12,12])for(const z of [-8,-5,0,5,8])stall(x,z);
 // Small pots, woven baskets and boxes remain below the gameplay sightline.
 for(const [x,z] of [[-12,-8],[12,-8],[-12,8],[12,8],[-8,-12],[8,-12]]){
  box(x,.38,z,.62,.76,.62,ochre);box(x,.78,z,.65,.10,.65,wood);
  box(x+.65,.23,z+.25,.46,.46,.46,pale,0,0,'bamboo');
 }
 // The near market facade is supplied as a layered image behind the landmarks.
 // Paper-cut market-goers are decorative, static, and outside the playfield.
 // Their silhouettes are modest in height so neither camera loses the arena.
 const crowdStart=boxes.length;
 const people=[[-9,-14],[-7.5,-14.2],[-4,-14],[3.4,-14.4],[8.7,-14.1],[-12.2,-2.2],[-12.3,2.0],[12.2,-2.3],[12.4,2.2],[-14,-7],[14,-7],[-14,6],[14,6]];
 const garments=[0x6c8171,0xb04d39,0x6d87a3,0xd2a155,0xddd1b5];
 people.forEach(([x,z],i)=>{box(x,.45,z,.36,.85,.20,garments[i%garments.length]);box(x,.97,z,.30,.30,.20,0xe4b995);box(x,1.16,z,.34,.11,.23,0x44463d);box(x-.22,.48,z,.12,.55,.15,garments[i%garments.length],0,-.20);box(x+.22,.48,z,.12,.55,.15,garments[i%garments.length],0,.20);});
 // Shrubs and low crates create market depth without intruding on the field.
 for(const x of [-16,16])for(const z of [-11,-3,4]){box(x,.45,z,.18,.9,.18,wood);box(x,1.02,z,1.15,.65,.65,0x637e64);box(x-.36,1.2,z,.60,.54,.50,0x78926e);}
 // Texture and background are on separate, noninteractive geometry.
 const loader=new THREE.TextureLoader();
 const loadTexture=(url:string)=>{const texture=loader.load(url);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;return texture;};
 const maps={red:loadTexture(textures.red),indigo:loadTexture(textures.indigo),wood:loadTexture(textures.wood),linen:loadTexture(textures.linen),roof:loadTexture(textures.roof),bamboo:loadTexture(textures.bamboo)};
 const clothMaterial=new THREE.MeshBasicMaterial({map:maps.red,side:THREE.DoubleSide});
 const indigoMaterial=new THREE.MeshBasicMaterial({map:maps.indigo,side:THREE.DoubleSide});
 const clothGeometry=new THREE.PlaneGeometry(1.7,1.18);
 const cloth=new THREE.Mesh(clothGeometry,clothMaterial);cloth.position.set(6,1.13,-11.91);group.add(cloth);
 for(const x of [-12,12])for(const z of [-8,-5,0,5,8]){
  const hanging=new THREE.Mesh(clothGeometry,(Math.abs(z)%2===0?indigoMaterial:clothMaterial));hanging.scale.set(.56,.55,1);hanging.position.set(x,1.23,z-.72);group.add(hanging);
 }
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
 // Earthen street surrounds the server-owned 20×20 floor; no gameplay collision.
 const groundTexture=loadTexture(mobileGroundUrl);groundTexture.wrapS=groundTexture.wrapT=THREE.RepeatWrapping;groundTexture.repeat.set(15,26.65);
 const groundGeometry=new THREE.PlaneGeometry(150,150),groundMaterial=new THREE.MeshLambertMaterial({map:groundTexture});const ground=new THREE.Mesh(groundGeometry,groundMaterial);ground.rotation.x=-Math.PI/2;ground.position.y=-.45;ground.name='jinshi-street';group.add(ground);
 // Painted market facades sit beyond the existing gate and loom. Alpha testing
 // preserves the real silhouettes and allows depth testing against 3D landmarks.
 const marketTexture=loadTexture(mobileMarketUrl);
 const marketGeometry=new THREE.PlaneGeometry(20,7.5),marketMaterial=new THREE.MeshBasicMaterial({map:marketTexture,transparent:true,alphaTest:.5,side:THREE.DoubleSide});
 const variedShopsTexture=loadTexture(variedShopsUrl);const variedShopsGeometry=new THREE.PlaneGeometry(20,8.28);const variedShopsMaterial=new THREE.MeshBasicMaterial({map:variedShopsTexture,transparent:true,alphaTest:.5,side:THREE.DoubleSide});
 for(const [x,z] of [[-19,-17.2],[0,-19.4],[19,-17.2]]){const market=x<0?new THREE.Mesh(variedShopsGeometry,variedShopsMaterial):new THREE.Mesh(marketGeometry,marketMaterial);market.position.set(x,3.15,z);if(x>0)market.scale.x=-1;market.name='jinshi-market-layer';group.add(market);}
 // Distinct cutouts sit behind the side stalls, outside the playfield. Keep
 // the near side of each stall and the arena clear for later 3D models.
 const nearTextures=nearGoodsUrls.map(loadTexture);
 const nearMaterials=nearTextures.map(map=>new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.5,side:THREE.DoubleSide}));
 const nearGeometries=[new THREE.PlaneGeometry(5.4,3.04),new THREE.PlaneGeometry(5.2,2.93),new THREE.PlaneGeometry(5.0,3.33)];
 const nearPlacements=[[-16.5,-11,0],[-16.5,-5,1],[-16.5,1,2],[-16.5,7,0],[16.5,-11,1],[16.5,-5,2],[16.5,1,0],[16.5,7,1],[-8.4,-15.4,1],[8.4,-15.4,0]];
 for(const [x,z,index] of nearPlacements){const mesh=new THREE.Mesh(nearGeometries[index],nearMaterials[index]);mesh.position.set(x,1.25,z);if(x>0)mesh.scale.x=-1;mesh.name=`jinshi-near-goods-${index}`;group.add(mesh);}
 // One distant painting joins sky and city; it is not treated as 360° skybox.
 const horizon=loadTexture(mobileHorizonUrl);const skylineGeometry=new THREE.PlaneGeometry(96,32),skylineMaterial=new THREE.MeshBasicMaterial({map:horizon,side:THREE.FrontSide});const skyline=new THREE.Mesh(skylineGeometry,skylineMaterial);skyline.position.set(0,13.5,-42);skyline.name='jinshi-north-skyline';group.add(skyline);
 let lastCrowdUpdate=0;return { group, update(now:number){if(now-lastCrowdUpdate<120)return;lastCrowdUpdate=now;for(let person=0;person<people.length;person++)for(let part=0;part<5;part++){const index=crowdStart+person*5+part,b=boxes[index],sway=Math.sin(now/1100+person*.8)*.035;dummy.position.set(b.x+sway,b.y+(part===1?.015*Math.sin(now/700+person):0),b.z);dummy.scale.set(b.w,b.h,b.d);dummy.rotation.set(0,b.rotation??0,(b.tilt??0)+(part>=3?sway*1.7:0));dummy.updateMatrix();instances.setMatrixAt(index,dummy.matrix);}instances.instanceMatrix.needsUpdate=true;}, dispose(){drumGeometry.dispose();drumMaterial.dispose();geometry.dispose();material.dispose();clothGeometry.dispose();clothMaterial.dispose();indigoMaterial.dispose();surfaceMaterials.forEach(material=>material.dispose());Object.values(maps).forEach(map=>map.dispose());marketGeometry.dispose();marketMaterial.dispose();marketTexture.dispose();variedShopsGeometry.dispose();variedShopsMaterial.dispose();variedShopsTexture.dispose();nearGeometries.forEach(geometry=>geometry.dispose());nearMaterials.forEach(material=>material.dispose());nearTextures.forEach(texture=>texture.dispose());skylineGeometry.dispose();skylineMaterial.dispose();horizon.dispose();skyGeometry.dispose();skyMaterial.dispose();groundGeometry.dispose();groundMaterial.dispose();groundTexture.dispose();} };
}

export function createJinshiTileTexture() {
 const texture=new THREE.TextureLoader().load(textures.silk);
 texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;
 return texture;
}
