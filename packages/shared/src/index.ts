/** Public protocol shared by server and both clients. Times are server room-clock milliseconds. */
export * from './motion.js';
export * from './schema.js';
export type Vector3 = {x:number; y:number; z:number};
export type Avatar = {position:Vector3; velocity:Vector3; facing:number; grounded:boolean; jumpHeld:boolean};
export type Player = {id:string; name:string; color:string; connected:boolean; status:'waiting'|'playing'|'eliminated'|'qualified'|'spectating'; avatar:Avatar|null};
export type LevelId='01-jinshi'|'02-dengshi'|'03-qibaoshi'|'04-shisan'|'05-jiushi'|'06-guishi';
export type LevelData={tiles:{disappearsAt:number|null}[]; owners:(string|null)[]; teams:{id:string;playerIds:string[];tileCount:number;reachedAt:number|null}[]; scores:Record<string,{count:number;reachedAt:number|null}>; fellAt:Record<string,number>; items:Record<string,{x:number;z:number;spawnedAt:number;landsAt:number;expiresAt:number}>; sacks:Record<string,{x:number;z:number;carrierId:string|null}>; gaps:number[];qualifiedIds:string[];questionIndex:number;questionPhase:'answering'|'revealing'|'restoring';questionPhaseEndsAt:number;question:{id:string;text:string;options:[string,string,string]}|null;answer:'A'|'B'|'C'|null;roundResult:{void:boolean;eliminatedIds:string[];savedIds:string[]}|null};
export type Match={id:string; phase:'intro'|'card'|'countdown'|'playing'|'result'|'transition'|'ending'|'finished';phaseId:number;phaseEndsAt:number|null;transitionId:'normal'|'wind'|'rebirth'|null;participants:string[];activeIds:string[];championId:string|null;level:{id:LevelId;startedAt:number|null;targetCount:number|null;data:LevelData};results:{levelId:LevelId;qualifiedIds:string[];eliminatedIds:string[];scores:Record<string,number>;reason:string}[];media:{id:string;endsAt:number;durationMs:number;displayUrl:string;phoneUrl:string}|null};
export type Snapshot={serverTime:number; revision:number; room:{id:string;players:Record<string,Player>;match:Match|null}};
export type Ack<T>={ok:true;data:T}|{ok:false;code:string};
export const LEVEL_NAMES:Record<LevelId,string>={'01-jinshi':'锦市','02-dengshi':'灯市','03-qibaoshi':'七宝市','04-shisan':'市散','05-jiushi':'酒市','06-guishi':'桂市'};
export const LEVEL_RULES:Record<LevelId,string>={'01-jinshi':'走过地砖为队伍染色，面积最小的队伍淘汰。','02-dengshi':'限时走到答案区，答错淘汰，最多 5 题后存活者晋级。','03-qibaoshi':'拾取落地的交子，收集数量决定排名。','04-shisan':'站过的地砖会消失，留在平台上。','05-jiushi':'捡起粮袋，送到四角酒坛，交满三袋晋级。','06-guishi':'跳上台阶，绕过缺口，最先摘到桂枝夺冠。'};

