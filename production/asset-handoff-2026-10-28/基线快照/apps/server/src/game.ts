import { randomUUID, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { LEVELS, QUESTIONS, makeLevel, type LevelId, type LevelState, type Question } from './levels.js';

import { resolvePlayerMotion, type PlayerInput as Input, type Avatar } from '@jinjiang/shared';
export type { PlayerInput as Input } from '@jinjiang/shared';
type Player = { id: string; name: string; color: string; connected: boolean; status: 'waiting' | 'playing' | 'eliminated' | 'qualified' | 'spectating'; avatar: Avatar | null };
type Motion = { x: number; z: number; lastSeq: number; pendingSeq: number; lastProcessedSeq: number; jumpPressSeq: number; processedJumpPressSeq: number; pendingJump: boolean; lastInputAt: number; jumpTime: number };
type Result = { levelId: LevelId; qualifiedIds: string[]; eliminatedIds: string[]; scores: Record<string, number>; reason: 'normal' | 'timeout' | 'survival' | 'host_skip' };
type Phase = 'intro' | 'card' | 'countdown' | 'playing' | 'result' | 'transition' | 'ending' | 'finished';
type Match = { id: string; phase: Phase; phaseId: number; phaseEndsAt: number | null; transitionId: 'normal' | 'wind' | 'rebirth' | null; participants: string[]; activeIds: string[]; level: LevelState; results: Result[]; championId: string | null };
export type Options = { introMs: number; cardMs: number; countdownMs: number; playMs: number; quizMs: number; quizRevealMs: number; quizRestoreMs: number; resultMs: number; transitionMs: number; windMs: number; rebirthMs: number; endingMs: number; protectionMs: number; collapseMs: number; tickRate: number; broadcastRate: number; inputTimeoutMs: number; shuffleQuestions: boolean; levels: readonly LevelId[]; itemFallMs: number; itemLifeMs: number; sackRespawnMs: number };
export const defaults: Options = { introMs:15000, cardMs:6000, countdownMs:3000, playMs:60000, quizMs:10000, quizRevealMs:2000, quizRestoreMs:2000, resultMs:5000, transitionMs:2000, windMs:8000, rebirthMs:6000, endingMs:50000, protectionMs:1000, collapseMs:600, tickRate:30, broadcastRate:10, inputTimeoutMs:300, shuffleQuestions:true, levels:LEVELS, itemFallMs:2000, itemLifeMs:8000, sackRespawnMs:1000 };
export class GameError extends Error { constructor(public code:string) { super(code); } }
const token = () => randomBytes(24).toString('base64url');
const equalToken = (a:string,b:string) => { const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); };
const distance = (a:{x:number;z:number},b:{x:number;z:number}) => Math.hypot(a.x-b.x,a.z-b.z);

export class Game {
 readonly roomId = randomUUID(); readonly hostToken = token();
 players = new Map<string,Player>(); private tokens = new Map<string,string>(); private motions = new Map<string,Motion>();
 match:Match|null = null; revision=0; tick=0; private levelIndex=0; private finishCandidateAt:number|null=null;
 private spawnCounter=0; private nextSpawnAt=0; private pendingSacks:number[]=[]; private questionOrder:Question[]=[...QUESTIONS];
 constructor(readonly opts:Options=defaults) {}
 checkHost(value:unknown) { return typeof value==='string' && equalToken(value,this.hostToken); }
 snapshot(now:number) { const m=this.match; const mediaId=m?.phase==='intro'?'intro':m?.phase==='ending'?'ending':m?.phase==='transition'&&(m.transitionId==='wind'||m.transitionId==='rebirth')?m.transitionId:null; const match=m?{...m,media:mediaId?{id:mediaId,endsAt:m.phaseEndsAt!,durationMs:mediaId==='intro'?this.opts.introMs:mediaId==='wind'?this.opts.windMs:mediaId==='rebirth'?this.opts.rebirthMs:this.opts.endingMs,displayUrl:`/media/${mediaId}.mp4`,phoneUrl:`/media/${mediaId}_phone.mp4`}:null}:null; return structuredClone({serverTime:now,revision:this.revision,room:{id:this.roomId,players:Object.fromEntries(this.players),match}}); }
 join(name:unknown,color:unknown) {
  if(typeof name!=='string'||!name.trim()||name.trim().length>24) throw new GameError('INVALID_NAME');
  const id=randomUUID(),secret=token();
  const player:Player={id,name:name.trim(),color:typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color)?color:'#e66b55',connected:true,status:this.match||[...this.players.values()].filter(p=>p.status==='waiting').length>=32?'spectating':'waiting',avatar:null};
  this.players.set(id,player); this.tokens.set(id,secret); this.revision++; return {playerId:id,resumeToken:secret};
 }
 resume(id:unknown,secret:unknown) { if(typeof id!=='string'||typeof secret!=='string') throw new GameError('INVALID_SESSION'); const expected=this.tokens.get(id),p=this.players.get(id); if(!expected||!p||!equalToken(secret,expected)) throw new GameError('INVALID_SESSION'); p.connected=true; if(!this.match)this.fillWaitingSlots(); this.revision++; return p.id; }
 disconnect(id:string) { const p=this.players.get(id); if(p?.connected){p.connected=false;const m=this.motions.get(id);if(m){m.x=0;m.z=0;m.pendingSeq=-1;if(m.pendingJump)m.jumpPressSeq=m.processedJumpPressSeq;m.pendingJump=false;} if(p.avatar)p.avatar.jumpHeld=false;if(!this.match&&p.status==='waiting'){p.status='spectating';this.fillWaitingSlots();}this.revision++;} }
 private fillWaitingSlots(){let available=32-[...this.players.values()].filter(p=>p.status==='waiting').length;for(const p of this.players.values())if(available>0&&p.connected&&p.status==='spectating'){p.status='waiting';available--;}}
 removeWaitingPlayer(id:string) { if(this.match) throw new GameError('MATCH_EXISTS'); if(this.players.delete(id)){this.tokens.delete(id);this.motions.delete(id);this.fillWaitingSlots();this.revision++;} }
 start(now:number) {
  if(this.match) throw new GameError('MATCH_EXISTS'); const players=[...this.players.values()].filter(p=>p.connected&&p.status==='waiting'); if(players.length<2) throw new GameError('NEED_TWO_PLAYERS');
  const ids=players.map(p=>p.id); this.levelIndex=0; this.match={id:randomUUID(),phase:'card',phaseId:1,phaseEndsAt:now+this.opts.cardMs,transitionId:null,participants:ids,activeIds:[...ids],level:makeLevel(this.opts.levels[0],ids),results:[],championId:null};
  for(const p of players) this.motions.set(p.id,{x:0,z:0,lastSeq:-1,pendingSeq:-1,lastProcessedSeq:-1,jumpPressSeq:0,processedJumpPressSeq:0,pendingJump:false,lastInputAt:now,jumpTime:0});
  this.prepareLevel(now); if(this.opts.introMs>0)this.setPhase('intro',now,this.opts.introMs); this.revision++;
 }
 private prepareLevel(now:number) {
  const m=this.match!; m.level=makeLevel(this.opts.levels[this.levelIndex],m.activeIds); this.finishCandidateAt=null;this.spawnCounter=0;this.nextSpawnAt=now;this.pendingSacks=[];this.questionOrder=[...QUESTIONS];if(this.opts.shuffleQuestions)for(let i=this.questionOrder.length-1;i>0;i--){const j=randomInt(i+1);[this.questionOrder[i],this.questionOrder[j]]=[this.questionOrder[j],this.questionOrder[i]];}this.questionOrder=this.questionOrder.slice(0,5);
  for(const [i,id] of m.activeIds.entries()) {const p=this.players.get(id)!;p.status='playing';p.avatar={position:{x:(i%8)-3.5,y:.5,z:m.level.id==='06-guishi'?9:Math.floor(i/8)},velocity:{x:0,y:0,z:0},facing:0,grounded:true,jumpHeld:false}; const move=this.motions.get(id)!;move.x=0;move.z=0;move.pendingSeq=-1;move.processedJumpPressSeq=move.jumpPressSeq;move.pendingJump=false;move.lastInputAt=now;}
 }
 input(id:string,value:unknown,now:number) {
  const m=this.match,p=this.players.get(id),move=this.motions.get(id);if(!m||!['playing','countdown'].includes(m.phase)||!p||!p.connected||p.status!=='playing'||!move||!value||typeof value!=='object') throw new GameError('INPUT_NOT_ALLOWED');
  const a=value as Input;if(a.matchId!==m.id||a.phaseId!==m.phaseId||!Number.isSafeInteger(a.seq)||a.seq<=move.lastSeq||!Number.isSafeInteger(a.jumpPressSeq)||a.jumpPressSeq<0||typeof a.jumpHeld!=='boolean'||!Number.isFinite(a.x)||!Number.isFinite(a.z))throw new GameError('INVALID_INPUT');
  const len=Math.hypot(a.x,a.z),s=len>1?1/len:1;move.x=a.x*s;move.z=a.z*s;move.lastSeq=a.seq;move.pendingSeq=a.seq;move.lastInputAt=now;if(a.jumpPressSeq>move.jumpPressSeq){move.jumpPressSeq=a.jumpPressSeq;move.pendingJump=true;}p.avatar!.jumpHeld=a.jumpHeld;
 }
 inputCursor(id:string){const move=this.motions.get(id);return {seq:move?.lastSeq??-1,jumpPressSeq:move?.jumpPressSeq??0};}
 diagnostics(now:number){
  const m=this.match;
  return {serverTime:now,roomId:this.roomId,tick:this.tick,revision:this.revision,match:m?{id:m.id,phase:m.phase,phaseId:m.phaseId,phaseEndsAt:m.phaseEndsAt,level:m.level.id,participants:m.participants.length,active:m.activeIds.length}:null,
   players:[...this.players.values()].map(p=>{const move=this.motions.get(p.id);return {id:p.id,name:p.name,connected:p.connected,status:p.status,avatar:p.avatar,input:move?{x:move.x,z:move.z,lastReceivedSeq:move.lastSeq,lastProcessedSeq:move.lastProcessedSeq,lastInputAt:move.lastInputAt,ageMs:Math.max(0,now-move.lastInputAt),expired:now-move.lastInputAt>this.opts.inputTimeoutMs,pendingJump:move.pendingJump}:null};})};
 }
 world(){return {tick:this.tick,matchId:this.match?.id??null,phaseId:this.match?.phaseId??null,players:Object.fromEntries([...this.players.values()].filter(p=>p.avatar).map(p=>[p.id,{avatar:p.avatar!,lastProcessedInputSeq:this.motions.get(p.id)?.lastProcessedSeq??-1,jumpPressSeq:this.motions.get(p.id)?.jumpPressSeq??0}]))};}
 private setPhase(phase:Phase, now:number, duration:number|null){const m=this.match!;m.phase=phase;m.phaseId++;m.phaseEndsAt=duration===null?null:now+duration;}
 private startPlaying(now:number){
  const m=this.match!,l=m.level,d=l.data;l.startedAt=now;this.setPhase('playing',now,this.opts.playMs);this.nextSpawnAt=now;
  if(l.id==='02-dengshi'){this.nextQuestion(now);m.phaseEndsAt=null;}
  if(l.id==='05-jiushi') for(let i=0;i<Math.max(6,m.activeIds.length*2);i++)this.spawnSack();
 }
 private nextQuestion(now:number) {const d=this.match!.level.data,q=this.questionOrder[d.questionIndex];d.question={id:q.id,text:q.text,options:q.options};d.answer=null;d.roundResult=null;d.questionPhase='answering';d.questionPhaseEndsAt=now+this.opts.quizMs;}
 private spawnSack(){const d=this.match!.level.data,i=this.spawnCounter++;const x=randomInt(-65,66)/10,z=randomInt(-65,66)/10;d.sacks[`s${i}`]={x,z,originalX:x,originalZ:z,carrierId:null};}
 private spawnItem(now:number){const d=this.match!.level.data,i=this.spawnCounter++;const x=randomInt(-90,91)/10,z=randomInt(-90,91)/10;d.items[`j${i}`]={x,z,spawnedAt:now,landsAt:now+this.opts.itemFallMs,expiresAt:now+this.opts.itemFallMs+this.opts.itemLifeMs};}
 private scoreOrder(ids:string[]){const d=this.match!.level.data;return [...ids].sort((a,b)=>(d.scores[b]?.count??0)-(d.scores[a]?.count??0)||(d.scores[a]?.reachedAt??Infinity)-(d.scores[b]?.reachedAt??Infinity)||this.match!.participants.indexOf(a)-this.match!.participants.indexOf(b));}
 private score(id:string,now:number){const s=this.match!.level.data.scores[id];s.count++;s.reachedAt=now;}
 private finish(qualified:string[],reason:Result['reason'],now:number){
  const m=this.match!, current=[...m.activeIds], set=new Set(qualified); qualified=current.filter(id=>set.has(id));
  const eliminated=current.filter(id=>!set.has(id));for(const id of qualified)this.players.get(id)!.status='qualified';for(const id of eliminated)this.players.get(id)!.status='eliminated';
  const scores=Object.fromEntries(current.map(id=>[id,m.level.id==='01-jinshi'?(m.level.data.teams.find(t=>t.playerIds.includes(id))?.tileCount??0):(m.level.data.scores[id]?.count??0)]));m.results.push({levelId:m.level.id,qualifiedIds:qualified,eliminatedIds:eliminated,scores,reason});m.activeIds=qualified;
  if(m.level.id==='06-guishi')m.championId=qualified[0]??null;
  this.setPhase('result',now,this.opts.resultMs);
 }
 private finishEnding(now:number){const m=this.match!;if(!m.championId)m.championId=m.activeIds.find(id=>this.players.get(id)?.status!=='eliminated')??null;this.setPhase('ending',now,this.opts.endingMs);}
 reset(){this.match=null;this.motions.clear();let slots=0;for(const p of this.players.values()){p.status=p.connected&&slots++<32?'waiting':'spectating';p.avatar=null;}this.revision++;}
 skip(now:number){const m=this.match;if(!m)throw new GameError('NO_MATCH');if(m.phase==='finished'||m.phase==='ending')throw new GameError('INVALID_PHASE');if(m.phase==='intro'){this.setPhase('card',now,this.opts.cardMs);this.revision++;return;}if(m.phase==='result'){this.advance(now);this.revision++;return;}if(m.phase==='transition'){m.transitionId=null;this.setPhase('card',now,this.opts.cardMs);this.revision++;return;}const ids=m.activeIds.filter(id=>this.players.get(id)!.status!=='eliminated');this.finish(ids,'host_skip',now);this.revision++;}
 finishNow(now:number){const m=this.match;if(!m)throw new GameError('NO_MATCH'); if(m.phase==='finished')throw new GameError('INVALID_PHASE');const ids=m.activeIds.filter(id=>this.players.get(id)?.status!=='eliminated');m.championId=(m.level.id==='01-jinshi'?[...ids].sort((a,b)=>(m.level.data.teams.find(t=>t.playerIds.includes(b))?.tileCount??0)-(m.level.data.teams.find(t=>t.playerIds.includes(a))?.tileCount??0)||m.participants.indexOf(a)-m.participants.indexOf(b)):this.scoreOrder(ids))[0]??null;this.finishEnding(now);this.revision++;}
 private advance(now:number){const m=this.match!;if(m.championId||m.activeIds.length<=1||this.levelIndex>=this.opts.levels.length-1){this.finishEnding(now);return;}const prev=m.level.id;this.levelIndex++;this.prepareLevel(now);m.transitionId=prev==='03-qibaoshi'?'wind':prev==='04-shisan'?'rebirth':'normal';this.setPhase('transition',now,m.transitionId==='wind'?this.opts.windMs:m.transitionId==='rebirth'?this.opts.rebirthMs:this.opts.transitionMs);}
 private simulatePlayer(id:string,now:number,dt:number,inPlay=true):boolean {
  const m=this.match!,l=m.level,d=l.data,p=this.players.get(id)!,a=p.avatar!,move=this.motions.get(id)!;if(p.status!=='playing')return false;
  if(!p.connected||now-move.lastInputAt>this.opts.inputTimeoutMs){move.x=0;move.z=0;move.pendingSeq=-1;a.jumpHeld=false;move.processedJumpPressSeq=move.jumpPressSeq;move.pendingJump=false;}else if(move.pendingSeq>=0)move.lastProcessedSeq=move.pendingSeq;
  if(move.pendingJump){if(a.grounded){a.velocity.y=Math.sqrt(2*25*.7);a.grounded=false;move.jumpTime=0;}move.processedJumpPressSeq=move.jumpPressSeq;move.pendingJump=false;}
  const speed=a.grounded?5:4;a.velocity.x=move.x*speed;a.velocity.z=move.z*speed;if(move.x||move.z)a.facing=Math.atan2(move.x,-move.z);
  const oldX=a.position.x,oldZ=a.position.z,oldY=a.position.y;a.position.x+=a.velocity.x*dt;a.position.z+=a.velocity.z*dt;
  const bounded=['01-jinshi','02-dengshi','03-qibaoshi','05-jiushi'].includes(l.id);
  if(bounded){a.position.x=Math.max(-9.6,Math.min(9.6,a.position.x));a.position.z=Math.max(-9.6,Math.min(9.6,a.position.z));}
  const obstacles=m.activeIds.filter(other=>other!==id&&this.players.get(other)?.status==='playing').map(other=>this.players.get(other)!.avatar!.position);const resolved=resolvePlayerMotion({x:oldX,y:oldY,z:oldZ},a.position,obstacles);
  if(bounded&&(Math.abs(resolved.x)>9.6||Math.abs(resolved.z)>9.6)){a.position.x=oldX;a.position.z=oldZ;}else Object.assign(a.position,resolved);
  if(!a.grounded){move.jumpTime+=dt;if(a.jumpHeld&&move.jumpTime<.15&&a.velocity.y>0)a.velocity.y+=18*dt;a.velocity.y-=25*dt;a.position.y+=a.velocity.y*dt;}
  let col:number,row:number,index:number,height=0;
  if(l.id==='06-guishi'){col=Math.floor(a.position.x+5);row=Math.floor((10-a.position.z)/1.2);index=row*10+col;height=Math.max(0,row)*.35;}
  else {col=Math.floor(a.position.x+10);row=Math.floor(a.position.z+10);index=row*20+col;}
  let tile=(l.id==='06-guishi'?(row>=0&&row<20&&col>=0&&col<10):(row>=0&&row<20&&col>=0&&col<20))?d.tiles[index]:undefined;
  let solid=!!tile && !d.gaps.includes(index) && (tile.disappearsAt===null||now<tile.disappearsAt);
  if(l.id==='06-guishi' && row>=20 && row<24 && col>=0 && col<10){solid=true;height=7;tile=undefined;}
  if(l.id==='06-guishi'&&solid&&height>oldY-.5+.05&&oldY>height-.8&&(a.position.x!==oldX||a.position.z!==oldZ)){a.position.x=oldX;a.position.z=oldZ;col=Math.floor(oldX+5);row=Math.floor((10-oldZ)/1.2);index=row*10+col;height=Math.max(0,row)*.35;tile=(row>=0&&row<20&&col>=0&&col<10)?d.tiles[index]:undefined;solid=!!tile&&!d.gaps.includes(index)&&(tile.disappearsAt===null||now<tile.disappearsAt);}
  if(a.grounded&&(!solid||height<oldY-.5-.05))a.grounded=false;
  if(!a.grounded&&solid&&a.velocity.y<=0&&oldY-.5>=height-.05&&a.position.y-.5<=height){a.position.y=height+.5;a.velocity.y=0;a.grounded=true;}
  // Falling players can land on another avatar instead of becoming embedded in it.
  if(a.velocity.y<=0)for(const other of obstacles){
   const dx=a.position.x-other.x,dz=a.position.z-other.z,horizontal=Math.hypot(dx,dz);
   if(horizontal>=.84)continue;
   const surface=other.y+Math.sqrt(.84*.84-horizontal*horizontal);
   if(oldY>=surface-.001&&a.position.y<=surface){a.position.y=surface;a.velocity.y=0;a.grounded=true;}
  }
  let changed=false;
  if(!inPlay)return false;
  if(a.grounded&&tile&&Math.abs(a.position.y-height-.5)<.05&&l.id==='01-jinshi'){const team=d.teams.find(t=>t.playerIds.includes(id))!;const old=d.owners[index];if(old!==team.id){if(old){const previous=d.teams.find(t=>t.id===old)!;previous.tileCount--;previous.reachedAt=now;}team.tileCount++;team.reachedAt=now;d.owners[index]=team.id;changed=true;}}
  if(a.grounded&&tile&&Math.abs(a.position.y-height-.5)<.05&&l.id==='04-shisan'&&now>=l.startedAt!+this.opts.protectionMs&&tile.disappearsAt===null){tile.disappearsAt=now+this.opts.collapseMs;changed=true;}
  if(a.grounded&&tile&&Math.abs(a.position.y-height-.5)<.05&&l.id==='06-guishi'&&tile.disappearsAt===null){tile.disappearsAt=now+800;changed=true;}
  if(a.position.y < -5){p.status='eliminated';d.fellAt[id]=now;for(const s of Object.values(d.sacks))if(s.carrierId===id){s.carrierId=null;s.x=s.originalX;s.z=s.originalZ;}changed=true;}
  if(l.id==='06-guishi'&&distance(a.position,{x:0,z:-15})<=1&&a.position.y>=7){this.finish([id],'normal',now);changed=true;}
  return changed;
 }
 private updateLevel(now:number):boolean {
  const m=this.match!,l=m.level,d=l.data;let changed=false;const alive=()=>m.activeIds.filter(id=>this.players.get(id)!.status==='playing');
  if(l.id==='02-dengshi'){
   if(d.questionPhase==='answering'&&now>=d.questionPhaseEndsAt){
    const correct=this.questionOrder[d.questionIndex].answer, players=alive(); d.answer=correct;
    const area=(x:number)=>x< -4?'A':x<4?'B':'C';
    const eliminated=players.filter(id=>area(this.players.get(id)!.avatar!.position.x)!==correct);
    for(const id of eliminated)this.players.get(id)!.status='eliminated';
    d.roundResult={void:false,eliminatedIds:eliminated,savedIds:[]};d.questionPhase='revealing';d.questionPhaseEndsAt=now+this.opts.quizRevealMs;changed=true;
   } else if(d.questionPhase==='revealing'&&now>=d.questionPhaseEndsAt){
    if(alive().length<=1||d.questionIndex>=this.questionOrder.length-1){this.finish(alive(),'normal',now);return true;}
    d.questionPhase='restoring';d.questionPhaseEndsAt=now+this.opts.quizRestoreMs;changed=true;
   } else if(d.questionPhase==='restoring'&&now>=d.questionPhaseEndsAt){
    d.questionIndex++;this.nextQuestion(now);changed=true;
   }
  }
  if(l.id==='03-qibaoshi'){
   const interval=1000/Math.max(.5,alive().length*.5);let steps=0;while(now>=this.nextSpawnAt&&steps++<32){this.spawnItem(this.nextSpawnAt);this.nextSpawnAt+=interval;changed=true;}
   for(const [itemId,item] of Object.entries(d.items)){
    if(now>=item.expiresAt){delete d.items[itemId];changed=true;continue;}
    if(now<item.landsAt)continue;
    const winner=alive().find(id=>distance(this.players.get(id)!.avatar!.position,item)<=.8);
    if(winner){delete d.items[itemId];this.score(winner,now);changed=true;}
   }
  }
  if(l.id==='05-jiushi'){
   while(this.pendingSacks.length&&this.pendingSacks[0]<=now){this.pendingSacks.shift();this.spawnSack();changed=true;}
   for(const id of alive()){
    const p=this.players.get(id)!,pos=p.avatar!.position;let entry=Object.entries(d.sacks).find(([,s])=>s.carrierId===id);
    if(!entry){entry=Object.entries(d.sacks).find(([,s])=>s.carrierId===null&&distance(pos,s)<=.8);if(entry){entry[1].carrierId=id;this.pendingSacks.push(now+this.opts.sackRespawnMs);changed=true;}}
    if(entry&&[[-8,-8],[-8,8],[8,-8],[8,8]].some(([x,z])=>distance(pos,{x,z})<=1.5)){
      delete d.sacks[entry[0]];this.score(id,now);changed=true;
      if(d.scores[id].count>=3){p.status='qualified';d.qualifiedIds.push(id);if(d.qualifiedIds.length>=l.targetCount!){this.finish(d.qualifiedIds,'normal',now);return true;}}
    }
   }
  }
  if(l.id==='06-guishi'&&l.startedAt!==null){
   let t=l.startedAt+3000;for(let row=0;row<20;row++){if(now>=t){for(let c=0;c<10;c++){const tile=d.tiles[row*10+c];if(tile.disappearsAt===null||tile.disappearsAt>t){tile.disappearsAt=t;changed=true;}}}t+=1500-(900*row/19);}
  }
  if(l.id==='04-shisan'||l.id==='06-guishi'){
   if(alive().length<=(l.targetCount??0)&&this.finishCandidateAt===null)this.finishCandidateAt=now;
   if(this.finishCandidateAt!==null&&now>=this.finishCandidateAt+200){
    let survivors=alive();if(!survivors.length){const falls=Object.entries(d.fellAt).sort((a,b)=>b[1]-a[1]);if(falls.length)survivors=falls.filter(([,at])=>falls[0][1]-at<=200).map(([id])=>id);}
    if(l.id==='06-guishi')survivors=survivors.sort((a,b)=>this.players.get(a)!.avatar!.position.z-this.players.get(b)!.avatar!.position.z||m.participants.indexOf(a)-m.participants.indexOf(b)).slice(0,1);
    this.finish(survivors.length?survivors:[m.activeIds[0]],'survival',now);return true;
   }
  }
  if(m.phaseEndsAt!==null&&now>=m.phaseEndsAt){
   let qualified:string[];
   if(l.id==='01-jinshi'){
    const teams=[...d.teams].sort((a,b)=>a.tileCount-b.tileCount||(b.reachedAt??Infinity)-(a.reachedAt??Infinity)||d.teams.indexOf(b)-d.teams.indexOf(a));
    const eliminated=new Set(teams[0].playerIds);qualified=m.activeIds.filter(id=>!eliminated.has(id));
   } else if(l.id==='03-qibaoshi')qualified=this.scoreOrder(alive()).slice(0,l.targetCount!);
   else if(l.id==='05-jiushi')qualified=[...d.qualifiedIds,...this.scoreOrder(alive()).slice(0,Math.max(0,l.targetCount!-d.qualifiedIds.length))];
   else if(l.id==='06-guishi')qualified=alive().sort((a,b)=>this.players.get(a)!.avatar!.position.z-this.players.get(b)!.avatar!.position.z||m.participants.indexOf(a)-m.participants.indexOf(b)).slice(0,1);
   else qualified=alive();
   if(!qualified.length)qualified=[m.activeIds[0]];
   this.finish(qualified,'timeout',now);return true;
  }
  return changed;
 }
 step(now:number,dt:number){
  this.tick++;const m=this.match;if(!m)return false;let changed=false;
  if(m.phase==='intro'&&now>=m.phaseEndsAt!){this.setPhase('card',now,this.opts.cardMs);changed=true;}
  else if(m.phase==='card'&&now>=m.phaseEndsAt!){this.setPhase('countdown',now,this.opts.countdownMs);changed=true;}
  else if(m.phase==='countdown'&&now>=m.phaseEndsAt!){this.startPlaying(now);changed=true;}
  else if(m.phase==='result'&&now>=m.phaseEndsAt!&&this.opts.levels.length>1){this.advance(now);changed=true;}
  else if(m.phase==='transition'&&now>=m.phaseEndsAt!){m.transitionId=null;this.setPhase('card',now,this.opts.cardMs);changed=true;}
  else if(m.phase==='ending'&&now>=m.phaseEndsAt!){this.setPhase('finished',now,null);changed=true;}
  if(m.phase==='countdown'){for(const id of m.activeIds)this.simulatePlayer(id,now,dt,false);}
  if(m.phase==='playing'){
   for(const id of m.activeIds){changed=this.simulatePlayer(id,now,dt)||changed;if(m.phase!=='playing')break;}
   if(m.phase==='playing')changed=this.updateLevel(now)||changed;
  }
  if(changed)this.revision++;return changed;
 }
}
