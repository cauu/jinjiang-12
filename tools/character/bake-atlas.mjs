import {mkdtemp,readFile,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
async function bake(modelSrc,maskSrc,imageOut,maskOut){
 const root=resolve('.'),temp=await mkdtemp(join(tmpdir(),'hanfu-atlas-'));let vite,browser;
 try{
  await symlink(join(root,'node_modules'),join(temp,'node_modules'));
  await symlink(join(root,modelSrc),join(temp,'model.glb'));
  await symlink(join(root,maskSrc),join(temp,'mask.png'));
  await writeFile(join(temp,'bake.js'),await readFile(join(root,'tools/character/bake-atlas.js')));
  await writeFile(join(temp,'index.html'),'<!DOCTYPE html><html><body><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script><script type="module" src="/bake.js"></script></body></html>');
  vite=await createServer({configFile:false,root:temp,server:{host:'127.0.0.1',port:0,fs:{allow:[temp,root]}}});await vite.listen();const address=vite.httpServer.address();
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=swiftshader','--enable-webgl']});const page=await browser.newPage();page.on('pageerror',e=>console.error(e.message));await page.goto(`http://127.0.0.1:${address.port}/`);await page.waitForFunction(()=>window.output,null,{timeout:90000});const images=await page.evaluate(()=>window.output);
  for(const [name,file] of [['image',imageOut],['mask',maskOut]])await writeFile(join(root,'packages/game-client/src/assets',file),Buffer.from(images[name].split(',')[1],'base64'));
 }finally{await browser?.close();await vite?.close();await rm(temp,{recursive:true,force:true});}
}
await bake('packages/game-client/src/assets/hanfu-boy-low.glb','tools/character/hanfu-boy-cloth-mask.png','hanfu-boy-crowd-atlas.png','hanfu-boy-crowd-mask.png');
await bake('packages/game-client/src/assets/hanfu-girl-low.glb','tools/character/hanfu-girl-cloth-mask.png','hanfu-girl-crowd-atlas.png','hanfu-girl-crowd-mask.png');
