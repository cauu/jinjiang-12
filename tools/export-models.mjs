/** Exports every final .blend in assets/models to a compressed runtime .glb.
 *
 *   node tools/export-models.mjs [name ...]      (default: all)
 *
 * Per model: Blender removes studio cruft (cameras, lights, ground, reference images), shrinks
 * oversized textures to 1024 px and, for the two characters, decimates to 10 % of the triangles;
 * then gltf-transform converts textures to WebP and compresses geometry with meshopt. The runtime
 * loader enables MeshoptDecoder (see packages/game-client/src/character.ts).
 * The .blend sources stay local (they are git-ignored); only the .glb files are committed. */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = process.env.MODELS_DIR ?? join(root, 'assets/models');
const out = join(root, 'packages/game-client/src/assets/models');
const blender = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const CHARACTERS = { hanfu_boy_animated: ['hanfu_boy', 0.1], hanfu_girl_animated: ['hanfu_girl', 0.1] };
const work = join(tmpdir(), 'jj-export-models');
rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true }); mkdirSync(out, { recursive: true });

const wanted = process.argv.slice(2);
const models = readdirSync(source).filter(f => f.endsWith('.blend')).map(f => f.replace(/\.blend$/, '')).filter(n => !wanted.length || wanted.includes(n));
if (!models.length) { console.error(`No models found in ${source}`); process.exit(1); }
const gt = (...args) => execFileSync('npx', ['-y', '@gltf-transform/cli@4.5.1', ...args], { stdio: 'pipe' });
const kb = file => `${Math.round(statSync(file).size / 1024)} KB`;

for (const name of models) {
 const [target, ratio] = CHARACTERS[name] ?? [name, 1];
 const raw = join(work, `${target}.raw.glb`), webp = join(work, `${target}.webp.glb`), final = join(out, `${target}.glb`);
 execFileSync(blender, ['-b', join(source, `${name}.blend`), '--python', join(root, 'tools/export-models.py'), '--', String(ratio), raw], { stdio: 'pipe' });
 gt('webp', raw, webp, '--quality', '88'); gt('meshopt', webp, final);
 console.log(`${name.padEnd(22)} -> ${target}.glb  ${kb(raw)} -> ${kb(final)}`);
}
rmSync(work, { recursive: true, force: true });
