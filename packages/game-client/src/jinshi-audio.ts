import type { Connection } from './index.js';

const loopUrl=new URL('./assets/jinshi/audio/market-loop-v1.wav',import.meta.url).href;
const jumpUrl=new URL('./assets/jinshi/audio/jump-v1.wav',import.meta.url).href;
const landUrl=new URL('./assets/jinshi/audio/land-v1.wav',import.meta.url).href;
const dyeUrl=new URL('./assets/jinshi/audio/dye-v1.wav',import.meta.url).href;
const resultUrl=new URL('./assets/jinshi/audio/result-v1.wav',import.meta.url).href;

/** Background music belongs to the display; phones play quiet, local cues. */
export function attachJinshiAudio(connection:Connection,mode:'mobile'|'display') {
 const music=new Audio(loopUrl), jump=new Audio(jumpUrl), land=new Audio(landUrl), dye=new Audio(dyeUrl), result=new Audio(resultUrl);
 music.loop=true;music.volume=.16;jump.volume=.12;land.volume=.10;dye.volume=.08;result.volume=.12;
 let unlocked=false, previousPhase='',lastArea:number|null=null,lastDyeAt=0,groundedKey='',lastGrounded:boolean|null=null;
 const play=(clip:HTMLAudioElement)=>{if(!unlocked)return;clip.currentTime=0;void clip.play().catch(()=>{});};
 const update=()=>{
  const match=connection.snapshot?.room.match;
  const active=!match || (match.level.id==='01-jinshi'&&!match.media&&['card','countdown','playing','result'].includes(match.phase));
  if(mode==='display'&&active&&unlocked){if(music.paused)void music.play().catch(()=>{});}else music.pause();
  if(mode==='mobile'&&match?.level.id==='01-jinshi'){
   const self=connection.session?.playerId, team=match.level.data.teams.find(t=>t.playerIds.includes(self??''));
   if(match.phase==='playing'&&team){const now=performance.now();if(lastArea!==null&&team.tileCount>lastArea&&now-lastDyeAt>450){play(dye);lastDyeAt=now;}lastArea=team.tileCount;}else lastArea=null;
   const key=`${match.id}:${match.phaseId}`;if(match.phase==='result'&&previousPhase&&previousPhase!==key)play(result);previousPhase=key;
  }else {lastArea=null;previousPhase='';}
 };
 const unlock=()=>{if(unlocked)return;unlocked=true;document.removeEventListener('pointerdown',unlock);document.removeEventListener('keydown',unlock);update();};
 document.addEventListener('pointerdown',unlock);document.addEventListener('keydown',unlock);
 connection.addEventListener('snapshot',update);connection.addEventListener('disconnected',update);
 if(mode==='mobile'){
  connection.addEventListener('jinjiang:jump',()=>{const m=connection.snapshot?.room.match;if(m?.level.id==='01-jinshi'&&m.phase==='playing')play(jump);});
  // Listen to authoritative world updates rather than animation frames. A busy
  // renderer may otherwise miss the airborne → grounded transition entirely.
  connection.addEventListener('world',()=>{const m=connection.snapshot?.room.match,id=connection.session?.playerId;if(!m||m.level.id!=='01-jinshi'||m.phase!=='playing'||!id){lastGrounded=null;groundedKey='';return;}const avatar=connection.avatarOf(id);if(!avatar)return;const key=`${m.id}:${m.phaseId}`;if(key!==groundedKey){lastGrounded=null;groundedKey=key;}if(lastGrounded===false&&avatar.grounded)play(land);lastGrounded=avatar.grounded;});
 }
 update();
}
