import { randomInt } from 'node:crypto';
export const LEVELS = ['01-jinshi', '02-dengshi', '03-qibaoshi', '04-shisan', '05-jiushi', '06-guishi'] as const;
export type LevelId = typeof LEVELS[number];
export type Score = { count: number; reachedAt: number | null };
export type Tile = { disappearsAt: number | null };
export type Team = { id: string; playerIds: string[]; tileCount: number; reachedAt: number | null };
export type Item = { x: number; z: number; spawnedAt: number; landsAt: number; expiresAt: number };
export type Sack = { x: number; z: number; originalX: number; originalZ: number; carrierId: string | null };
export type Question = { id: string; text: string; options: [string, string, string]; answer: 'A' | 'B' | 'C' };
// Demonstration questions are placeholders pending content review.
export const QUESTIONS: Question[] = [
 {id:'q1', text:'蜀锦主要与哪座城市有关？', options:['成都','苏州','广州'], answer:'A'},
 {id:'q2', text:'交子最早出现于哪里？', options:['长安','成都','洛阳'], answer:'B'},
 {id:'q3', text:'灯市与什么节日相关？', options:['端午','重阳','上元'], answer:'C'},
 {id:'q4', text:'桂市与哪种植物有关？', options:['桂花','荷花','梅花'], answer:'A'},
 {id:'q5', text:'锦通常是什么？', options:['瓷器','织物','木器'], answer:'B'}
];
export type LevelData = {
 tiles: Tile[]; owners: (string | null)[]; teams: Team[]; scores: Record<string, Score>;
 fellAt: Record<string, number>; items: Record<string, Item>; sacks: Record<string, Sack>;
 gaps: number[]; qualifiedIds: string[];
 questionIndex: number; questionPhase: 'answering' | 'revealing' | 'restoring'; questionPhaseEndsAt: number;
 question: { id: string; text: string; options: [string,string,string] } | null; answer: 'A' | 'B' | 'C' | null;
 roundResult: { void: boolean; eliminatedIds: string[]; savedIds: string[] } | null;
};
export type LevelState = { id: LevelId; startedAt: number | null; targetCount: number | null; data: LevelData };
export const rank = (n: number, ratio: number) => n === 2 ? 1 : Math.min(n - 1, Math.max(2, Math.round(n * ratio)));
export function makeLevel(id: LevelId, players: string[]): LevelState {
 const ratio = id === '02-dengshi' ? .7 : id === '03-qibaoshi' ? .65 : .6;
 // Lantern Market uses its target as a survivor floor; Jinshi eliminates a team and Guishi crowns one player.
 const targetCount = id === '01-jinshi' || id === '06-guishi' ? null : rank(players.length, ratio);
 const data: LevelData = { tiles: Array.from({length: id === '06-guishi' ? 200 : 400}, () => ({disappearsAt:null})), owners: Array(400).fill(null), teams: [], scores: {}, fellAt:{}, items:{}, sacks:{}, gaps:[], qualifiedIds:[], questionIndex:0, questionPhase:'answering', questionPhaseEndsAt:0, question:null, answer:null, roundResult:null };
 for (const pid of players) data.scores[pid] = { count:0, reachedAt:null };
 if (id === '01-jinshi') {
   const size = players.length >= 8 ? 4 : players.length >= 4 ? 2 : players.length;
   data.teams = Array.from({length:size}, (_, i) => ({id: `team-${i}`, playerIds: [], tileCount:0, reachedAt:null}));
   players.forEach((p,i) => data.teams[i % size].playerIds.push(p));
 }
 if (id === '06-guishi') { for (const row of [5,10,15]) { const width=randomInt(3,5), start=randomInt(0,11-width); for(let col=start;col<start+width;col++) data.gaps.push(row*10+col); } }
 return { id, startedAt: null, targetCount, data };
}
