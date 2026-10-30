import { createServer, createConnection, type Server, type Socket } from 'node:net';
import { performance } from 'node:perf_hooks';

type Link = { close: () => void };
function generator(seed:number) { let x=seed>>>0; return () => {x=(Math.imul(x,1664525)+1013904223)>>>0;return x/0x100000000;}; }

/** TCP byte-stream proxy: applies independent one-way latency and jitter without reordering or corrupting bytes. */
export async function createNetworkProxy(targetPort:number, seed:number) {
 const servers:Server[]=[], ports:number[]=[], links=Array.from({length:30},()=>new Set<Link>());
 for(let i=0;i<30;i++) {
  const server=createServer({allowHalfOpen:true},downstream=>{
   const upstream=createConnection({port:targetPort,host:'127.0.0.1',allowHalfOpen:true});downstream.setNoDelay(true);upstream.setNoDelay(true);
   const rand=generator(seed+i*103+(links[i].size+1)*17);const base=i<20?25+i*2:i<27?70+(i-20)*5:120+(i-27)*20;
   const timers=new Set<NodeJS.Timeout>();let closed=false;
   const link:Link={close:()=>{if(closed)return;closed=true;for(const timer of timers)clearTimeout(timer);timers.clear();downstream.destroy();upstream.destroy();links[i].delete(link);}};
   links[i].add(link);
   downstream.on('error',()=>link.close());upstream.on('error',()=>link.close());// HTTP clients may half-close after sending a request; only tear down once both directions finished.
   let ended=0;const finish=()=>{if(++ended===2)link.close();};downstream.on('close',()=>link.close());upstream.on('close',()=>link.close());
   function transmit(source:Socket,destination:Socket) {
    let lastDue=0, scheduled:NodeJS.Timeout|null=null;
    const queue:{due:number;data:Buffer|null}[]=[];
    const drain=()=>{
     scheduled=null;
     while(queue.length && queue[0].due <= performance.now()) {
      const entry=queue.shift()!; if(closed||destination.destroyed)continue; if(entry.data)destination.write(entry.data); else {destination.end();finish();}
     }
     schedule();
    };
    const schedule=()=>{
     if(closed||scheduled||!queue.length)return;
     const timer=setTimeout(()=>{timers.delete(timer);drain();},Math.max(0,Math.ceil(queue[0].due-performance.now())));
     scheduled=timer;timers.add(timer);
    };
    source.on('data',buffer=>{
     const delay=base+rand()*35+(rand()<.02?200+rand()*100:0);
     // One FIFO queue per direction preserves TCP byte order, including when an earlier chunk is delayed.
     const due=Math.max(performance.now()+delay,lastDue);lastDue=due;
     queue.push({due,data:buffer});schedule();
    });
    source.on('end',()=>{queue.push({due:Math.max(performance.now(),lastDue),data:null});schedule();});
   }
   transmit(downstream,upstream);transmit(upstream,downstream);
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
  const address=server.address();if(!address||typeof address==='string')throw new Error('No proxy port');servers.push(server);ports.push(address.port);
 }
 return {
  urlFor:(index:number)=>`http://127.0.0.1:${ports[index]}`,
  cut:(index:number)=>{for(const link of [...links[index]])link.close();},
  close:async()=>{for(const group of links)for(const link of [...group])link.close();await Promise.all(servers.map(s=>new Promise<void>(resolve=>s.close(()=>resolve()))));}
 };
}
