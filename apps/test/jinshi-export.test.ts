import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer as viteServer } from 'vite';
import { resolve } from 'node:path';
test('exported Jinshi GLB reloads with textured meshes and instanced colored props',{timeout:60000},async t=>{
 const vite=await viteServer({configFile:false,root:resolve('apps/mobile'),server:{host:'127.0.0.1',port:0}});await vite.listen();const address=vite.httpServer!.address();assert.ok(address&&typeof address!=='string');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});t.after(async()=>{await browser.close();await vite.close();});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${address.port}/`);const loader='/@fs/'+resolve('node_modules/three/examples/jsm/loaders/GLTFLoader.js').replace(/^\//,'');const file='/@fs/'+resolve('assets/jinshi/jinshi-environment-v5.glb').replace(/^\//,'');
 const result=await page.evaluate(async ({loader,file})=>{const {GLTFLoader}=await import(loader);const gltf=await new GLTFLoader().loadAsync(file);let meshes=0,instances=0,colored=0,textured=0;gltf.scene.traverse((obj:any)=>{if(obj.isMesh){meshes++;if(obj.isInstancedMesh){instances+=obj.count;if(obj.instanceColor)colored++;}if(obj.material?.map)textured++;}});return {meshes,instances,colored,textured};},{loader,file});
 assert.ok(result.meshes>=5,JSON.stringify(result));assert.ok(result.instances>100,JSON.stringify(result));assert.ok(result.colored>=1,JSON.stringify(result));assert.ok(result.textured>=2,JSON.stringify(result));
});
