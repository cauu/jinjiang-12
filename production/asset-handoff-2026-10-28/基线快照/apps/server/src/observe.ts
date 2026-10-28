/** Read-only live diagnosis. Usage: node --import tsx apps/server/src/observe.ts http://127.0.0.1:3500 [player-name] */
const base=(process.argv[2]??'http://127.0.0.1:3000').replace(/\/$/,'');
export {};
const playerName=process.argv[3];let token:string|undefined;const previous=new Map<string,{phaseId:number;x:number;z:number}>();
async function poll(){
 try{
  if(!token){const response=await fetch(`${base}/admin/bootstrap`);if(!response.ok)throw new Error(`bootstrap HTTP ${response.status}`);token=(await response.json() as {token:string}).token;}
  const response=await fetch(`${base}/admin/diagnostics`,{headers:{'x-host-token':token!},signal:AbortSignal.timeout(3000)});
  if(response.status===403){token=undefined;throw new Error('诊断令牌已更换，将重新连接');}if(!response.ok)throw new Error(`diagnostics HTTP ${response.status}`);
  const d=await response.json() as any;const players=d.players.filter((p:any)=>playerName?p.name===playerName:!p.name.startsWith('机器人'));
  if(!players.length){previous.clear();console.log(JSON.stringify({time:new Date(d.serverTime).toISOString(),roomId:d.roomId,phase:d.match?.phase??'lobby',level:d.match?.level??null,message:'未发现指定玩家',tick:d.tick}));return;}
  for(const p of players){const a=p.avatar,input=p.input,phase=d.match?.phase,phaseId=d.match?.phaseId,prior=previous.get(p.id);const displacement=a&&prior&&prior.phaseId===phaseId?Math.hypot(a.position.x-prior.x,a.position.z-prior.z):null;
   const moving=!!input&&Math.hypot(input.x,input.z)>.001&&!input.expired;const bounded=!!a&&!!input&&['01-jinshi','02-dengshi','03-qibaoshi','05-jiushi'].includes(d.match?.level)&&((a.position.x>=9.59&&input.x>0)||(a.position.x<=-9.59&&input.x<0)||(a.position.z>=9.59&&input.z>0)||(a.position.z<=-9.59&&input.z<0));
   const nearby=a?d.players.filter((other:any)=>other.id!==p.id&&other.status==='playing'&&other.avatar).map((other:any)=>({name:other.name,distance:Math.hypot(a.position.x-other.avatar.position.x,a.position.y-other.avatar.position.y,a.position.z-other.avatar.position.z)})).filter((other:any)=>other.distance<1.1).sort((a:any,b:any)=>a.distance-b.distance).slice(0,4):[];
   const hint=!p.connected?'disconnected':p.status!=='playing'?`player_${p.status}`:!['playing','countdown'].includes(phase)?'phase_disables_control':d.simulation.tickAgeMs>500?'server_tick_delayed':!input?'no_motion_state':input.expired?'input_expired':!moving?'neutral_input':displacement===null?'awaiting_next_sample':bounded&&displacement<.02?'possible_boundary':nearby.length&&displacement<.02?'possible_player_collision':displacement<.02?'nonzero_input_low_net_displacement':'moving';
   console.log(JSON.stringify({time:new Date(d.serverTime).toISOString(),roomId:d.roomId,level:d.match?.level,phase,phaseId,player:p.name,connected:p.connected,status:p.status,position:a?.position,velocity:a?.velocity,input,transport:p.transport,nearby,displacement,hint,tick:d.tick,tickAgeMs:d.simulation.tickAgeMs,broadcastAgeMs:d.simulation.broadcastAgeMs}));
   if(a)previous.set(p.id,{phaseId,x:a.position.x,z:a.position.z});else previous.delete(p.id);
  }
 }catch(error){console.error(JSON.stringify({time:new Date().toISOString(),error:error instanceof Error?error.message:String(error)}));}
}
while(true){await poll();await new Promise(r=>setTimeout(r,1000));}
