/** Game audio on Howler (Web Audio): one sound sprite for all effects, one music loop.
 *
 * Who plays what:
 *  - phone: only sounds about *you* — your jump/landing/footsteps (from local prediction, zero
 *    latency), your pickups, deliveries, warnings, fall and result — plus the countdown, quietly;
 *  - display (venue speakers): music, phase cues and level ambience (quiz ticks, collapses, gong).
 * Repeated sounds pick a random variant and a slightly random pitch so they never sound mechanical. */
import { Howl, Howler } from 'howler';
import type { RoomState } from '@jinjiang/shared';
import type { Connection } from './net.js';
import spriteData from './assets/audio/sfx.json';

const sfxUrl = new URL('./assets/audio/sfx.mp3', import.meta.url).href;
const musicUrl = new URL('./assets/audio/market-loop.mp3', import.meta.url).href;
export const AUDIO_ASSETS = [sfxUrl, musicUrl];
type SoundId = keyof typeof spriteData.variants;
type Mode = 'mobile' | 'display';
/** Floor material per level, for footsteps. */
const SURFACE: Record<string, SoundId> = { '01-jinshi': 'step-cloth', '02-dengshi': 'step-wood', '03-qibaoshi': 'step-wood', '04-shisan': 'step-stone', '05-jiushi': 'step-earth', '06-guishi': 'step-wood', lobby: 'step-cloth' };
const STEP_INTERVAL = .3; // seconds between footsteps at full speed

class Sfx {
 private howl = new Howl({ src: [sfxUrl], sprite: spriteData.sprite as unknown as Record<string, [number, number]>, preload: true });
 private last = new Map<string, number>();
 constructor(private master: number) {}
 /** Play one variant of `id`. `gap` (ms) suppresses rapid repeats of the same sound. */
 play(id: SoundId, volume = 1, { pitch = .06, gap = 0 } = {}) {
  const now = performance.now(); if (gap && now - (this.last.get(id) ?? -Infinity) < gap) return; this.last.set(id, now);
  const variants = spriteData.variants[id], key = variants[Math.floor(Math.random() * variants.length)];
  const handle = this.howl.play(key); this.howl.volume(Math.min(1, volume * this.master), handle); this.howl.rate(1 + (Math.random() * 2 - 1) * pitch, handle);
  const log = (window as unknown as { __jjAudio?: string[] }).__jjAudio ??= []; log.push(id); if (log.length > 200) log.splice(0, log.length - 200);
 }
}

export function attachAudio(connection: Connection, mode: Mode) {
 const sfx = new Sfx(mode === 'mobile' ? .7 : 1);
 const music = mode === 'display' ? new Howl({ src: [musicUrl], loop: true, volume: .28, html5: true, preload: true }) : null;
 // Keyed memory of the last state we reacted to, so each event sounds exactly once.
 let phaseKey = '', countdownShown = 0, quizTick = -1, lastStatus = '', lastScore = -1, carrying = false, revealKey = '', tilesGone = 0, crackSeen = new Set<number>(), stepClock = 0, lastFrame = performance.now(), paintCount = -1;
 const selfId = () => (mode === 'mobile' ? connection.session?.playerId : undefined);

 // Your own jump and landing come straight from local prediction.
 if (mode === 'mobile') {
  connection.addEventListener('jinjiang:jump', () => sfx.play('jump', .8));
  connection.addEventListener('local:land', event => { const speed = (event as CustomEvent<{ speed: number }>).detail.speed; sfx.play('land', Math.min(1, .35 + speed / 10)); });
 }

 /** Phase cues and per-level reactions, evaluated on every state patch. */
 const onState = () => {
  const state = connection.room?.state as RoomState | undefined, m = state?.match, snap = connection.snapshot?.room.match;
  const id = selfId(), me = id ? state?.players.get(id) : undefined;
  if (!m || !snap) { phaseKey = ''; return; }
  const key = `${m.id}:${m.phaseId}`, entered = key !== phaseKey; phaseKey = key;
  if (entered) {
   crackSeen = new Set(); quizTick = -1; revealKey = ''; tilesGone = 0;
   if (m.phase === 'card') sfx.play('card', mode === 'mobile' ? .5 : .9);
   if (m.phase === 'playing') sfx.play('go', mode === 'mobile' ? .6 : 1, { pitch: 0 });
   if (m.phase === 'result') {
    const result = snap.results.find(r => r.levelId === snap.level.id), final = !!snap.championId;
    if (mode === 'display') sfx.play(final ? 'champion' : 'qualify', 1, { pitch: 0 });
    else if (id && result) { const won = result.qualifiedIds.includes(id); sfx.play(final && won ? 'champion' : won ? 'qualify' : result.eliminatedIds.includes(id) ? 'eliminate' : 'qualify', .9, { pitch: 0 }); }
    if (final) sfx.play('gong', mode === 'mobile' ? .5 : 1, { pitch: 0 });
   }
  }
  const d = m.level.data;
  // Your own progress (phone only).
  if (id && me && m.phase === 'playing') {
   const score = d.scores.get(id)?.count ?? 0;
   if (lastScore >= 0 && score > lastScore) sfx.play(m.level.id === '05-jiushi' ? 'deliver' : 'coin', .9);
   lastScore = score;
   const nowCarrying = [...d.sacks.values()].some(s => s.carrierId === id); if (nowCarrying && !carrying) sfx.play('sack', .9); carrying = nowCarrying;
   if (m.level.id === '01-jinshi') { const team = d.teams.find(t => t.playerIds.includes(id)); const count = team?.tileCount ?? 0; if (paintCount >= 0 && count > paintCount) sfx.play('paint', .6, { gap: 160, pitch: .12 }); paintCount = count; }
   if (me.status !== lastStatus) { if (me.status === 'eliminated') sfx.play('fall', 1); if (me.status === 'qualified') sfx.play('qualify', .9, { pitch: 0 }); }
   // A crack warning when the tile you stand on starts to give way (Shisan, Guishi).
   if ((m.level.id === '04-shisan' || m.level.id === '06-guishi') && me.status === 'playing') {
    const cell = m.level.id === '06-guishi' ? { col: Math.floor(me.x + 5), row: Math.floor((10 - me.z) / 1.2), cols: 10 } : { col: Math.floor(me.x + 10), row: Math.floor(me.z + 10), cols: 20 };
    const index = cell.row * cell.cols + cell.col, tile = d.tiles[index];
    if (tile?.disappearsAt != null && !crackSeen.has(index)) { crackSeen.add(index); sfx.play('crack', .8, { gap: 120 }); }
   }
   if (m.level.id === '02-dengshi' && d.questionPhase === 'revealing' && d.roundResult?.savedIds.includes(id) && revealKey !== `${key}:${d.questionIndex}`) { revealKey = `${key}:${d.questionIndex}`; sfx.play('saved', .9, { pitch: 0 }); }
  } else { lastScore = -1; carrying = false; paintCount = -1; }
  lastStatus = me?.status ?? '';
  // Venue ambience (display only).
  if (mode === 'display' && m.phase === 'playing') {
   if (m.level.id === '02-dengshi' && d.questionPhase === 'revealing' && revealKey !== `${key}:${d.questionIndex}`) { revealKey = `${key}:${d.questionIndex}`; sfx.play('gong', 1, { pitch: 0 }); if (d.roundResult && d.roundResult.eliminatedIds.length) sfx.play('crumble', .9); }
   if (m.level.id === '04-shisan' || m.level.id === '06-guishi') {
    const now = connection.serverNow(); let gone = 0; for (const t of d.tiles) if (t.disappearsAt != null && t.disappearsAt <= now) gone++;
    if (gone > tilesGone) sfx.play(m.level.id === '06-guishi' ? 'rumble' : 'crumble', .7, { gap: 280 }); tilesGone = gone;
   }
  }
 };

 /** Time-driven sounds: countdown ticks, the last seconds of a quiz question, footsteps, music. */
 const frame = () => {
  requestAnimationFrame(frame);
  const t = performance.now(), dt = Math.min(.1, (t - lastFrame) / 1000); lastFrame = t;
  const m = connection.room?.state?.match, now = connection.serverNow();
  if (music) { const want = !m || (!m.media && m.level.id !== '04-shisan' && m.phase !== 'finished'); if (want && !music.playing()) music.play(); else if (!want && music.playing()) music.pause(); (window as unknown as { __jjMusicPlaying?: boolean }).__jjMusicPlaying = music.playing(); }
  if (!m) return;
  if (m.phase === 'countdown') { const n = Math.max(1, Math.ceil(((m.phaseEndsAt ?? now) - now) / 1000)); if (n !== countdownShown) { countdownShown = n; sfx.play('tick', mode === 'mobile' ? .6 : 1, { pitch: 0 }); } } else countdownShown = 0;
  if (mode === 'display' && m.level.id === '02-dengshi' && m.phase === 'playing' && m.level.data.questionPhase === 'answering') {
   const left = Math.ceil((m.level.data.questionPhaseEndsAt - now) / 1000); if (left <= 3 && left >= 1 && left !== quizTick) { quizTick = left; sfx.play('quiz-tick', 1, { pitch: 0 }); }
  }
  // Footsteps follow your own stick while you are on the ground.
  if (mode === 'mobile' && connection.controlling()) {
   const id = selfId(), pose = id ? connection.pose(id) : null, push = Math.min(1, Math.hypot(connection.intent.x, connection.intent.z));
   if (pose?.grounded && push > .25) { stepClock -= dt * push; if (stepClock <= 0) { stepClock = STEP_INTERVAL; sfx.play(SURFACE[m.level.id] ?? 'step-wood', .45 * push, { pitch: .1 }); } } else stepClock = 0;
  }
 };
 connection.addEventListener('world', onState);
 requestAnimationFrame(frame);
 // Phones and browsers require a user gesture before audio; Howler unlocks on the first tap/click.
 Howler.autoUnlock = true;
}
