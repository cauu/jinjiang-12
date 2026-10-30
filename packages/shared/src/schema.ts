/** Colyseus state and input schemas shared by the server and both clients.
 * Field names mirror the JSON `Snapshot` so that `toJSON()` yields the same shape. */
import { schema, t, type SchemaType } from '@colyseus/schema';

/** One fixed-step input frame. Must stay flat: Colyseus inputs are primitives only. */
export const InputCommand = schema({ x: t.float32(), z: t.float32(), jump: t.boolean(), held: t.boolean() }, 'InputCommand');
export type InputCommand = SchemaType<typeof InputCommand>;

/** Identity, participation and the motion state the client predicts. */
export const PlayerState = schema({
 id: t.string(), name: t.string(), color: t.string(), connected: t.boolean(), status: t.string(), active: t.boolean(),
 x: t.float32(), y: t.float32(), z: t.float32(), vy: t.float32(), facing: t.float32(), grounded: t.boolean(), jumpT: t.float32()
}, 'PlayerState');
export type PlayerState = SchemaType<typeof PlayerState>;

export const TeamState = schema({ id: t.string(), playerIds: t.array('string'), tileCount: t.int16(), reachedAt: t.number().optional() }, 'TeamState');
export const ScoreState = schema({ count: t.int16(), reachedAt: t.number().optional() }, 'ScoreState');
export const ItemState = schema({ x: t.float32(), z: t.float32(), spawnedAt: t.number(), landsAt: t.number(), expiresAt: t.number() }, 'ItemState');
export const SackState = schema({ x: t.float32(), z: t.float32(), carrierId: t.string().optional() }, 'SackState');
export const QuestionState = schema({ id: t.string(), text: t.string(), options: t.array('string') }, 'QuestionState');
export const RoundResultState = schema({ void: t.boolean(), eliminatedIds: t.array('string'), savedIds: t.array('string') }, 'RoundResultState');
export const TileState = schema({ disappearsAt: t.number().optional() }, 'TileState');

export const LevelDataState = schema({
 tiles: t.array(TileState), owners: t.array('string'), teams: t.array(TeamState), scores: t.map(ScoreState), fellAt: t.map('number'),
 items: t.map(ItemState), sacks: t.map(SackState), gaps: t.array('uint16'), qualifiedIds: t.array('string'),
 questionIndex: t.uint8(), questionPhase: t.string(), questionPhaseEndsAt: t.number(), question: t.ref(QuestionState).optional(),
 answer: t.string().optional(), roundResult: t.ref(RoundResultState).optional()
}, 'LevelDataState');
export const LevelState = schema({ id: t.string(), startedAt: t.number().optional(), targetCount: t.int16().optional(), data: LevelDataState }, 'LevelState');
export const ResultState = schema({ levelId: t.string(), qualifiedIds: t.array('string'), eliminatedIds: t.array('string'), scores: t.map('number'), reason: t.string() }, 'ResultState');
export const MediaState = schema({ id: t.string(), endsAt: t.number(), durationMs: t.number(), displayUrl: t.string(), phoneUrl: t.string() }, 'MediaState');
export const MatchState = schema({
 id: t.string(), phase: t.string(), phaseId: t.uint32(), phaseEndsAt: t.number().optional(), transitionId: t.string().optional(),
 participants: t.array('string'), activeIds: t.array('string'), championId: t.string().optional(), level: LevelState,
 results: t.array(ResultState), media: t.ref(MediaState).optional()
}, 'MatchState');
export const RoomState = schema({ id: t.string(), revision: t.uint32(), players: t.map(PlayerState), match: t.ref(MatchState).optional() }, 'RoomState');
export type RoomState = SchemaType<typeof RoomState>;
