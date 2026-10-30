/** Copies the authoritative Game into the replicated Colyseus state. Schema
 * fields only emit a delta when a value actually changes, so a full pass per
 * tick sends little more than the moving avatars. */
import { ArraySchema, MapSchema } from '@colyseus/schema';
import { ItemState, LevelState, MatchState, MediaState, PlayerState, QuestionState, ResultState, RoomState, RoundResultState, SackState, ScoreState, TeamState, TileState } from '@jinjiang/shared';
import type { Game } from './game.js';

type Ctor<T> = new () => T;
function syncList<T>(list: ArraySchema<T>, values: readonly T[]) {
 while (list.length > values.length) list.pop();
 for (let i = 0; i < values.length; i++) { if (i >= list.length) list.push(values[i]); else if (list[i] !== values[i]) list[i] = values[i]; }
}
function syncChildren<T, V>(list: ArraySchema<T>, values: readonly V[], type: Ctor<T>, update: (target: T, value: V) => void) {
 while (list.length > values.length) list.pop();
 for (let i = 0; i < values.length; i++) { if (i >= list.length) list.push(new type()); update(list[i], values[i]); }
}
function syncMap<T, V>(map: MapSchema<T>, record: Record<string, V>, type: Ctor<T>, update: (target: T, value: V) => void) {
 for (const key of [...map.keys()]) if (!(key in record)) map.delete(key);
 for (const [key, value] of Object.entries(record)) { let target = map.get(key); if (!target) { target = new type(); update(target, value); map.set(key, target); } else update(target, value); }
}
function syncValues(map: MapSchema<number>, record: Record<string, number>) {
 for (const key of [...map.keys()]) if (!(key in record)) map.delete(key);
 for (const [key, value] of Object.entries(record)) if (map.get(key) !== value) map.set(key, value);
}
const opt = <T>(value: T | null | undefined) => value ?? undefined;

export class StateMirror {
 readonly state = new RoomState();
 private revision = -1;
 constructor(private game: Game) { this.state.id = game.roomId; }
 /** Motion every call; everything else only when the game revision moved. */
 sync(now: number) {
  const game = this.game, players = this.state.players;
  if (game.revision !== this.revision) this.syncStructure(now);
  for (const [id, target] of players) {
   const motion = game.motionOf(id);
   target.active = !!motion;
   if (!motion) continue;
   target.x = motion.x; target.y = motion.y; target.z = motion.z; target.vy = motion.vy; target.facing = motion.facing; target.grounded = motion.grounded; target.jumpT = motion.jumpT;
  }
 }
 private syncStructure(now: number) {
  const game = this.game, snapshot = game.snapshot(now), state = this.state;
  this.revision = game.revision; state.revision = game.revision;
  syncMap(state.players, snapshot.room.players, PlayerState, (t, p) => { t.id = p.id; t.name = p.name; t.color = p.color; t.connected = p.connected; t.status = p.status; t.loaded = p.loaded ?? 0; });
  const m = snapshot.room.match;
  if (!m) { state.match = undefined; return; }
  if (!state.match || state.match.id !== m.id) state.match = new MatchState();
  const match = state.match;
  match.id = m.id; match.phase = m.phase; match.phaseId = m.phaseId; match.phaseEndsAt = opt(m.phaseEndsAt); match.transitionId = opt(m.transitionId); match.championId = opt(m.championId);
  syncList(match.participants, m.participants); syncList(match.activeIds, m.activeIds);
  syncChildren(match.results, m.results, ResultState, (t, r) => { t.levelId = r.levelId; t.reason = r.reason; syncList(t.qualifiedIds, r.qualifiedIds); syncList(t.eliminatedIds, r.eliminatedIds); syncValues(t.scores, r.scores); });
  if (m.media) { match.media ??= new MediaState(); Object.assign(match.media, m.media); } else match.media = undefined;
  const l = m.level, d = l.data;
  if (!match.level || match.level.id !== l.id) match.level = new LevelState();
  const level = match.level, data = level.data;
  level.id = l.id; level.startedAt = opt(l.startedAt); level.targetCount = opt(l.targetCount);
  syncChildren(data.tiles, d.tiles, TileState, (t, v) => { if (t.disappearsAt !== opt(v.disappearsAt)) t.disappearsAt = opt(v.disappearsAt); });
  syncList(data.owners, d.owners.map(o => o ?? ''));
  syncChildren(data.teams, d.teams, TeamState, (t, v) => { t.id = v.id; t.tileCount = v.tileCount; t.reachedAt = opt(v.reachedAt); syncList(t.playerIds, v.playerIds); });
  syncMap(data.scores, d.scores, ScoreState, (t, v) => { t.count = v.count; t.reachedAt = opt(v.reachedAt); });
  syncValues(data.fellAt, d.fellAt);
  syncMap(data.items, d.items, ItemState, (t, v) => { t.x = v.x; t.z = v.z; t.spawnedAt = v.spawnedAt; t.landsAt = v.landsAt; t.expiresAt = v.expiresAt; });
  syncMap(data.sacks, d.sacks, SackState, (t, v) => { t.x = v.x; t.z = v.z; t.carrierId = opt(v.carrierId); });
  syncList(data.gaps, d.gaps); syncList(data.qualifiedIds, d.qualifiedIds);
  data.questionIndex = d.questionIndex; data.questionPhase = d.questionPhase; data.questionPhaseEndsAt = d.questionPhaseEndsAt; data.answer = opt(d.answer);
  if (d.question) { if (data.question?.id !== d.question.id) { data.question = new QuestionState(); data.question.id = d.question.id; data.question.text = d.question.text; syncList(data.question.options, d.question.options); } } else data.question = undefined;
  if (d.roundResult) { data.roundResult ??= new RoundResultState(); data.roundResult.void = d.roundResult.void; syncList(data.roundResult.eliminatedIds, d.roundResult.eliminatedIds); syncList(data.roundResult.savedIds, d.roundResult.savedIds); } else data.roundResult = undefined;
 }
}
