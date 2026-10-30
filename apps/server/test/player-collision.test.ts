import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,defaults} from '../src/game.js';

function setup(){
 const g=new Game({...defaults,levels:['01-jinshi'],introMs:0,cardMs:0,countdownMs:0,playMs:60000});
 const a=g.join('a',null).playerId,b=g.join('b',null).playerId;g.start(1000);g.step(1000,1/30);g.step(1001,1/30);
 Object.assign(g.players.get(a)!.avatar!.position,{x:-2,y:.5,z:0});Object.assign(g.players.get(b)!.avatar!.position,{x:0,y:.5,z:0});
 let now=1001;function move(x:number,z:number,ticks:number){for(let i=0;i<ticks;i++){now+=33;g.input(a,{x,z,jump:false,held:false},now);g.step(now,1/30);}}
 return {g,a,b,move};
}

test('active players block one another and can move around or away',()=>{
 const {g,a,b,move}=setup();const p=g.players.get(a)!.avatar!,other=g.players.get(b)!.avatar!;
 // Walking into someone slides along their body (no sticking) but never overlaps or shoves them.
 for(let i=0;i<50;i++){move(1,0,1);assert.ok(Math.hypot(p.position.x-other.position.x,p.position.z-other.position.z)>=.839,`overlap at tick ${i}`);}
 assert.equal(other.position.x,0);assert.equal(other.position.z,0);
 move(0,1,12);move(1,0,18);assert.ok(p.position.x>0.5,'player can move around another');
 move(-1,0,18);assert.ok(p.position.x<-.5,'player can move away');
});

test('eliminated players do not block movement',()=>{
 const {g,a,b,move}=setup();g.players.get(b)!.status='eliminated';move(1,0,25);assert.ok(g.players.get(a)!.avatar!.position.x>1);
});

test('players already overlapping can separate instead of being trapped',()=>{
 const {g,a,b,move}=setup();Object.assign(g.players.get(a)!.avatar!.position,{x:0,z:0});Object.assign(g.players.get(b)!.avatar!.position,{x:0,z:0});move(1,0,10);assert.ok(g.players.get(a)!.avatar!.position.x>1);
});

test('collision near a boundary does not push a player through an obstacle or out of bounds',()=>{
 const {g,a,b,move}=setup();
 const p=g.players.get(a)!.avatar!,other=g.players.get(b)!.avatar!;
 Object.assign(p.position,{x:9.6,y:.5,z:0});Object.assign(other.position,{x:9.1,y:.5,z:.8});
 move(0,1,30);assert.ok(Math.abs(p.position.x)<=9.6&&Math.abs(p.position.z)<=9.6);assert.ok(Math.hypot(p.position.x-other.position.x,p.position.z-other.position.z)>=.839);
});

test('two active players moving toward one another do not penetrate',()=>{
 const {g,a,b}=setup();let now=1001;for(let seq=1;seq<=60;seq++){now+=33;for(const [id,x] of [[a,1],[b,-1]] as const)g.input(id,{x,z:0,jump:false,held:false},now);g.step(now,1/30);const pa=g.players.get(a)!.avatar!.position,pb=g.players.get(b)!.avatar!.position;assert.ok(Math.hypot(pa.x-pb.x,pa.z-pb.z)>=.839,`tick ${seq}: ${pa.x}, ${pb.x}`);}
});


test('a jumping player can land on another player without embedding',()=>{
 const {g,a,b}=setup(),p=g.players.get(a)!.avatar!,other=g.players.get(b)!.avatar!;Object.assign(p.position,{x:-1.1,y:.5,z:0});
 for(let i=0;i<50;i++){const now=1034+i*33;g.input(a,{x:i<12?1:0,z:0,jump:i===0,held:i<6},now);g.step(now,1/30);}
 assert.ok(Math.hypot(p.position.x-other.position.x,p.position.y-other.position.y,p.position.z-other.position.z)>=.839);assert.ok(p.position.y>other.position.y);
});
