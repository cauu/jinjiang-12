/** Public protocol shared by server and both clients. Times are server room-clock milliseconds. */
export * from './motion.js';
export * from './schema.js';
export type Vector3 = {x:number; y:number; z:number};
export type Avatar = {position:Vector3; velocity:Vector3; facing:number; grounded:boolean; jumpHeld:boolean};
export type Player = {id:string; name:string; color:string; gender?:'boy'|'girl'; connected:boolean; status:'waiting'|'playing'|'eliminated'|'qualified'|'spectating'; avatar:Avatar|null; loaded?:number};
export type LevelId='01-jinshi'|'02-dengshi'|'03-qibaoshi'|'04-shisan'|'05-jiushi'|'06-guishi';
export type LevelData={tiles:{disappearsAt:number|null}[]; owners:(string|null)[]; teams:{id:string;playerIds:string[];tileCount:number;reachedAt:number|null}[]; scores:Record<string,{count:number;reachedAt:number|null}>; fellAt:Record<string,number>; items:Record<string,{x:number;z:number;spawnedAt:number;landsAt:number;expiresAt:number}>; sacks:Record<string,{x:number;z:number;carrierId:string|null}>; gaps:number[];qualifiedIds:string[];questionIndex:number;questionPhase:'answering'|'revealing'|'restoring';questionPhaseEndsAt:number;question:{id:string;text:string;options:[string,string,string]}|null;answer:'A'|'B'|'C'|null;roundResult:{void:boolean;eliminatedIds:string[];savedIds:string[]}|null};
export type Match={id:string; phase:'intro'|'card'|'countdown'|'playing'|'result'|'transition'|'ending'|'finished';phaseId:number;phaseEndsAt:number|null;transitionId:'normal'|'wind'|'rebirth'|null;participants:string[];activeIds:string[];championId:string|null;level:{id:LevelId;startedAt:number|null;targetCount:number|null;data:LevelData};results:{levelId:LevelId;qualifiedIds:string[];eliminatedIds:string[];scores:Record<string,number>;reason:string}[];media:{id:string;endsAt:number;durationMs:number;displayUrl:string;phoneUrl:string}|null};
export type Snapshot={serverTime:number; revision:number; room:{id:string;players:Record<string,Player>;match:Match|null}};
export type Ack<T>={ok:true;data:T}|{ok:false;code:string};
export const LEVEL_NAMES:Record<LevelId,string>={'01-jinshi':'锦市','02-dengshi':'灯市','03-qibaoshi':'七宝市','04-shisan':'市散','05-jiushi':'酒市','06-guishi':'桂市'};
export const LEVEL_RULES:Record<LevelId,string>={'01-jinshi':'走过的格子会染上本队颜色，时间到时面积最小的一队淘汰。','02-dengshi':'限时跑到正确的答案区，答错淘汰；最多 5 题，人数降到晋级名额即结束。','03-qibaoshi':'捡起落地的交子，时间到时按数量排名，捡得少的淘汰。','04-shisan':'踩过的石板很快会化为沙土，掉下去即淘汰；坚持到人数降到晋级名额。','05-jiushi':'扛起粮袋运进四角的酒坛，最先运满 3 袋的人晋级。','06-guishi':'跳上台阶、绕过缺口，第一个摘到楼顶桂枝的人夺冠；台阶会从下往上塌落。'};
/** Era shown on the pre-level card. */
export const LEVEL_ERAS:Record<LevelId,string>={'01-jinshi':'汉 · 锦官城','02-dengshi':'盛唐 · 上元灯会','03-qibaoshi':'北宋 · 交子','04-shisan':'宋元之际','05-jiushi':'清初 · 湖广填四川','06-guishi':'清末民初 · 东门码头中秋'};
/** Historical note on the pre-level card (from docs/levels; 【演绎】 marks dramatisation). */
export const LEVEL_FACTS:Record<LevelId,string>={'01-jinshi':'【史实】汉代设锦官专管蜀锦，成都因此被称为“锦官城”。','02-dengshi':'【演绎】唐代上元节，满城观灯、猜灯谜。','03-qibaoshi':'【史实】北宋时，成都出现交子，被视为世界上最早的纸币之一。','04-shisan':'【史实】宋元之际，战火入城。此后，十二月市渐渐衰落。','05-jiushi':'【史实】清初“湖广填四川”，各地移民入川重建家园；水井坊遗址留下了明清酿酒的完整流程。','06-guishi':'【演绎】中秋夜，东门码头灯楼。东门码头今为成都十二月市博物馆所在地。'};

