// Input: PNG already resized to 1024x1024. Output: a soft-filtered-at-render clothing mask.
import fs from 'node:fs';
import {PNG} from 'pngjs';
const [input,output]=process.argv.slice(2);if(!input||!output)throw new Error('usage: node mask.mjs resized-color.png mask.png');
const image=PNG.sync.read(fs.readFileSync(input)),mask=new PNG({width:image.width,height:image.height});
for(let i=0;i<image.data.length;i+=4){const r=image.data[i]/255,g=image.data[i+1]/255,b=image.data[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b);const selected=r>.48&&r>g*1.04&&g>b*1.48&&g>.23&&max-min>.17;mask.data[i]=mask.data[i+1]=mask.data[i+2]=selected?255:0;mask.data[i+3]=255;}
fs.writeFileSync(output,PNG.sync.write(mask));
