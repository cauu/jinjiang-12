/** Builds the game's sound sprite: every clip in sounds.json is decoded, gain-adjusted, trimmed of
 * leading silence and packed into one mono MP3 plus a JSON map of [startMs, durationMs] per variant.
 * One file means one request and one decode on phones. Background music is encoded separately.
 * Usage: node tools/audio/build-audio.mjs   (uses the ffmpeg binary from ffmpeg-static) */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ffmpeg = createRequire(import.meta.url)('ffmpeg-static');
const here = dirname(fileURLToPath(import.meta.url)), out = join(here, '../../packages/game-client/src/assets/audio');
const RATE = 44100, GAP = Math.round(RATE * .08);
mkdirSync(out, { recursive: true });
const decode = (file, gainDb) => {
 const buf = execFileSync(ffmpeg, ['-v', 'error', '-i', join(here, 'source', file), '-af', `silenceremove=start_periods=1:start_threshold=-50dB,volume=${gainDb}dB`, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 64 << 20 });
 return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
};
const manifest = JSON.parse(readFileSync(join(here, 'sounds.json'), 'utf8'));
const parts = [], sprite = {}, variants = {};
let cursor = 0;
for (const [id, { files, gainDb }] of Object.entries(manifest)) {
 variants[id] = [];
 files.forEach((file, i) => {
  const samples = decode(file, gainDb), key = `${id}#${i}`;
  // +40 ms covers the MP3 encoder delay; the silent gap after each clip absorbs it.
  sprite[key] = [Math.round(cursor / RATE * 1000), Math.round(samples.length / RATE * 1000) + 40];
  variants[id].push(key); parts.push(samples, new Float32Array(GAP)); cursor += samples.length + GAP;
 });
}
const all = new Float32Array(cursor); let at = 0; for (const p of parts) { all.set(p, at); at += p.length; }
execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '64k', join(out, 'sfx.mp3')], { input: Buffer.from(all.buffer) });
writeFileSync(join(out, 'sfx.json'), JSON.stringify({ sprite, variants }));
// Background music: the original synthesized market loop, re-encoded small.
execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', join(here, '../../packages/game-client/src/assets/jinshi/audio/market-loop-v1.wav'), '-c:a', 'libmp3lame', '-b:a', '64k', join(out, 'market-loop.mp3')]);
console.log(`sfx.mp3: ${Object.keys(sprite).length} clips, ${(cursor / RATE).toFixed(1)} s`);
