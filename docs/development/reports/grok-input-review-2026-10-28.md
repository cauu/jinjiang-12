# Grok 4.7 输入序号复验

模型：Cursor grok-4.7-low；模式：只读。原始结果如下。

我按只读方式核对服务端输入序号：看 `lastProcessedInputSeq` 和实际 tick、阶段切换、断线重连、被覆盖输入是否一致。`lastProcessedInputSeq` 只表示「下一次 `simulatePlayer` 采样时，当时留下的最新序号」。它不是逐条输入回放，被覆盖的中间输入没有单独模拟。

## 证据

服务端只保留一份意图。`input` 用新包直接覆盖 `x`、`z` 和 `lastSeq`；跳跃只留一个 `pendingJump` 布尔值，同一 tick 里多次按下只会生效一次。

```44:47:apps/server/src/game.ts
 input(id:string,value:unknown,now:number) {
  // ...
  const len=Math.hypot(a.x,a.z),s=len>1?1/len:1;move.x=a.x*s;move.z=a.z*s;move.lastSeq=a.seq;...
  if(a.jumpPressSeq>move.jumpPressSeq){move.jumpPressSeq=a.jumpPressSeq;move.pendingJump=true;}
```

采样时先把确认号设成当前 `lastSeq`，再决定这拍用不用这股输入：

```74:78:apps/server/src/game.ts
 private simulatePlayer(...) {
  if(p.status!=='playing')return false;
  move.lastProcessedSeq=move.lastSeq;
  if(!p.connected||now-move.lastInputAt>this.opts.inputTimeoutMs){move.x=0;move.z=0;a.jumpHeld=false;move.pendingJump=false;}
```

`countdown` 和 `playing` 都会走这里。`card`、`result`、`transition` 不采样，确认号停在上一拍。`setPhase` 只增加 `phaseId`，不重置 `lastSeq` / `lastProcessedSeq`。旧阶段的包因 `phaseId` 不符被拒绝。

断线在 tick 之前就把意图清掉，序号仍留着：

```33:33:apps/server/src/game.ts
 disconnect(id:string) { ... if(m){m.x=0;m.z=0;m.pendingJump=false;} ... }
```

下一拍仍会把 `lastProcessedSeq` 写成这个 `lastSeq`。重连游标是已收到的 `lastSeq`，不是已采样号：

```49:50:apps/server/src/game.ts
 inputCursor(id){ return {seq:move?.lastSeq??-1, jumpPressSeq:...}; }
 world(){ ... lastProcessedInputSeq: this.motions.get(p.id)?.lastProcessedSeq??-1 }
```

客户端重连用游标抬序号；`world:state` 再用已处理号做 `Math.max`，且不看 `matchId` / `phaseId`。

```9:14:packages/game-client/src/index.ts
 this.socket.on('world:state',(w)=>{ ... if(last!=null)this.seq=Math.max(this.seq,last); ...});
 async resume(...){ this.seq=Math.max(this.seq,data.inputCursor.seq); ... }
```

协议里的字段只是 `number`，没有「每条输入都已积分」的含义。

现有测试只覆盖：同一拍先发 seq 1 再发 seq 2，tick 前确认号仍为 -1，tick 后变为 2，且位移跟最后一条朝向。

## 结论

- 正常连着玩时，确认号落后于已收到序号，tick 后跳到最新序号。中间朝向被丢掉，这和测试一致。
- 阻断点在断线，以及输入后超过 300ms 才第一次采样：确认号会前进，但这拍速度和待处理跳跃已被清掉，输入没有作用于模拟。重连从 `inputCursor.seq` 继续，这条输入不会重放。
- 同一采样窗口内的多次跳跃同样只消费一次，确认号仍跳到最后的 seq。
- 测试没覆盖断线、输入超时、阶段切换后的旧 `phaseId`、倒计时采样、跳跃合并，以及重连游标高于 `lastProcessedInputSeq` 时的续号。
