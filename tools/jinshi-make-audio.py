"""Synthesize a small, original paper-market loop and UI cues; no external samples."""
import math, pathlib, struct, wave
out=pathlib.Path('packages/game-client/src/assets/jinshi/audio');out.mkdir(parents=True,exist_ok=True)
rate=22050

def write(name, samples):
 with wave.open(str(out/name),'wb') as f:
  f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate)
  f.writeframes(b''.join(struct.pack('<h',int(max(-.95,min(.95,v))*32767)) for v in samples))

def pluck(freq,t,duration):
 if t<0 or t>=duration:return 0
 env=(1-math.exp(-t*35))*math.exp(-t*3.3)
 return env*(math.sin(2*math.pi*freq*t)+.3*math.sin(2*math.pi*freq*2*t)+.12*math.sin(2*math.pi*freq*3*t))/1.42
# Four 4-second bars; silence at the loop boundary avoids a click.
notes=[0,2,4,7,9,7,4,2, 0,4,7,9,12,9,7,4, 2,4,7,9,7,4,2,0, 0,2,4,7,4,2,0,None]
bgm=[]
for i in range(rate*16):
 t=i/rate;v=0
 for j in range(max(0,int(t/.5)-2),min(len(notes),int(t/.5)+1)):
  n=notes[j]
  if n is not None:v+=.16*pluck(261.6256*2**(n/12),t-j*.5,1.4)
 fade=min(1,t/.18,(16-t)/.45);bgm.append(v*max(0,fade))
write('market-loop-v1.wav',bgm)
for name,freq,dur in [('jump-v1.wav',440,.20),('land-v1.wav',196,.18),('dye-v1.wav',660,.16),('result-v1.wav',523.25,.52)]:
 arr=[]
 for i in range(int(rate*dur)):
  t=i/rate; envelope=math.sin(math.pi*t/dur)**1.2
  f=freq*(1+.22*t/dur) if name.startswith('jump') else freq
  v=.22*envelope*(math.sin(2*math.pi*f*t)+.22*math.sin(2*math.pi*f*2*t))/1.22
  if name.startswith('result'):v+=.08*envelope*math.sin(2*math.pi*freq*1.5*t)
  arr.append(v)
 write(name,arr)
