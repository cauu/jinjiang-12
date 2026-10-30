/** Background asset preloader. Files are fetched into three.js' cache (THREE.Cache), which the
 * TextureLoader and GLTFLoader consult by URL, so a level built later starts from memory.
 * Order: characters, then each level in play order; anything still missing keeps loading during
 * cards and story videos. Progress is reported so the host can see which phones are ready. */
import * as THREE from 'three';
import { CHARACTER_ASSETS } from './character.js';
import { LEVEL_ASSETS } from './levels/index.js';

THREE.Cache.enabled = true;
const ORDER = ['lobby', '01-jinshi', '02-dengshi', '03-qibaoshi', '04-shisan', '05-jiushi', '06-guishi'];
const CONCURRENCY = 3;

export class Preloader extends EventTarget {
 progress = 0;
 private started = false;
 /** Extra files (e.g. the sound sprite) loaded right after the characters. */
 constructor(private extra: string[] = []) { super(); }
 start() {
  if (this.started) return; this.started = true;
  const urls = [...new Set([...CHARACTER_ASSETS, ...this.extra, ...ORDER.flatMap(id => LEVEL_ASSETS[id] ?? [])])];
  let done = 0, next = 0;
  const one = (url: string) => (/\.(glb|gltf|bin|mp3|m4a|json)(\?|$)/.test(url) ? new THREE.FileLoader().setResponseType('arraybuffer').loadAsync(url) : new THREE.ImageLoader().loadAsync(url)).catch(() => null);
  const worker = async () => { while (next < urls.length) { await one(urls[next++]); done++; this.progress = done / urls.length; this.dispatchEvent(new Event('progress')); } };
  if (!urls.length) { this.progress = 1; this.dispatchEvent(new Event('progress')); return; }
  for (let i = 0; i < CONCURRENCY; i++) void worker();
 }
}
