/** Export the runtime's exact procedural Jinshi group as a GLB reference asset. */
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { resolve, dirname } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const output=resolve(process.argv[2]??'assets/jinshi/jinshi-environment-v1.glb');
const server=await createServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0}});
await server.listen();const address=server.httpServer.address();if(!address||typeof address==='string')throw Error('Vite port unavailable');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${address.port}/`);
 const source='/@fs/'+resolve('packages/game-client/src/jinshi-scene.ts').replace(/^\//,'');
 const exporter='/@fs/'+resolve('node_modules/three/examples/jsm/exporters/GLTFExporter.js').replace(/^\//,'');
 const base64=await page.evaluate(async ({source,exporter})=>{
  const {createJinshiScene}=await import(source);const {GLTFExporter}=await import(exporter);const scene=createJinshiScene();
  const maps=[];scene.group.traverse(object=>{if(object.material?.map)maps.push(object.material.map);});for(let i=0;i<200&&maps.some(map=>!map.image||(map.image instanceof HTMLImageElement&&(!map.image.complete||!map.image.naturalWidth)));i++)await new Promise(resolve=>setTimeout(resolve,50));if(maps.some(map=>!map.image||(map.image instanceof HTMLImageElement&&!map.image.naturalWidth)))throw new Error('scene textures did not load');
  const bytes=await new Promise((resolve,reject)=>new GLTFExporter().parse(scene.group,resolve,reject,{binary:true}));
  const blob=new Blob([bytes],{type:'model/gltf-binary'});const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});scene.dispose();return data.split(',')[1];
 },{source,exporter});
 await mkdir(dirname(output),{recursive:true});await writeFile(output,Buffer.from(base64,'base64'),{flag:'wx'});console.log(`Exported ${output}`);
} finally {await browser.close();await server.close();}
