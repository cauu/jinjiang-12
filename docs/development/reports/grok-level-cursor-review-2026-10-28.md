# Cursor Grok 4.7 跨关游标复核

我先只读这几处实现和测试，核对跨关恢复、跳跃游标和过期响应会不会对不上。跨关恢复和断线重发这条主路径是对的。真正会丢跳跃的是：输入超时和人在空中时，服务端把还没跳出去的 `jumpPressSeq` 记成已结算。

## 结论

同一局里换关时，客户端会先停手，等这一关的 `world` 到了，再用服务端已经收到的跳跃序号做基准，只补上新关按下的次数。断线时，还没被 tick 采样的跳跃会把序号退回去，恢复后可以再发一次。过期的恢复响应也不会把新对局的游标盖掉。

会丢跳的是两条结算路径：输入超过 300ms 没被采样，以及人还在空中。这两处都把 `pendingJump` 清掉，并把 `processedJumpPressSeq` 抬到当前 `jumpPressSeq`，跳跃却没有发生。之后同样的序号再发上来会被当成已结算。

## 客户端

`resume` 用 `resumeGeneration` 丢掉后完成的那次调用。只有恢复快照不是「更新的另一局」时才改游标：`seq` 只升不降；同一局且同一关时 `jump` 取本地和服务端的较大值，换关或换局则直接采用服务端的 `jumpPressSeq`。`receive` 也会丢掉更旧的 `revision`。

`input` 在 `playing` / `countdown` 里，用 `matchId:levelId` 判断关卡。换关且仍是同一局时，必须先看到 `matchId` 和 `phaseId` 都对得上的 `world`，否则这次直接返回，按下的次数留在 `deferredJumps`。世界状态到了之后，`jump` 被设成 `world.players[id].jumpPressSeq`，再加上积压的次数。这个 `jumpPressSeq` 是服务端已经收到的序号，不是「已经跳出去」的序号。新对局或还没有关卡键时，`jump` 从 0 起算。`seq` 不随关卡清零，服务端换关也不清 `lastSeq`，两边能接上。

这里有两个缺口。等 `world` 的时候，这一帧的移动也不会发出去。若关卡又变了，`deferredJumps` 会被清掉，但 `intent.jump` 已经加过，画面上的预测跳已经播了，包却没发出去。连按多次时，客户端会把序号一次加上 N，服务端的 `pendingJump` 只是布尔值，一个 tick 只跳一次，多出来的次数被记成已结算。

## 服务端

收到输入就更新 `lastSeq` 和 `jumpPressSeq`，并在序号变大时把 `pendingJump` 设为真。真正是否跳、移动序号是否记入 `lastProcessedSeq`，要等 `simulatePlayer`。

断线时，若 `pendingJump` 仍为真，`jumpPressSeq` 会退回 `processedJumpPressSeq`。恢复后用同一个序号再发，仍能跳。已经采样过的跳跃不会退，再发同序号也不会跳第二次。

换关的 `prepareLevel` 会把 `processedJumpPressSeq` 设成当前 `jumpPressSeq` 并清掉 `pendingJump`，序号本身保留。上一关还没跳的那次被丢掉，新关要更大的序号才会再跳。这和客户端「旧关未确认的跳跃不算进新关」是对齐的。

超时和空中这两处不一致：

```78:79:apps/server/src/game.ts
if(!p.connected||now-move.lastInputAt>this.opts.inputTimeoutMs){move.x=0;move.z=0;move.pendingSeq=-1;a.jumpHeld=false;move.processedJumpPressSeq=move.jumpPressSeq;move.pendingJump=false;}else if(move.pendingSeq>=0)move.lastProcessedSeq=move.pendingSeq;
if(move.pendingJump){if(a.grounded){a.velocity.y=Math.sqrt(2*25*.7);a.grounded=false;move.jumpTime=0;}move.processedJumpPressSeq=move.jumpPressSeq;move.pendingJump=false;}
```

超时分支先把跳跃标成已处理并清掉 `pendingJump`，后面的起跳不会跑。移动序号则因为 `pendingSeq = -1` 而不会记入 `lastProcessedSeq`，但 `lastSeq` 已经在收包时前进，旧序号不能重发。跳跃序号没有像断线那样退回，客户端下一包还是这个序号，于是这次跳跃永久丢失。`>` 300ms 才算超时，刚好 300ms 仍会采样。

人在空中时，只要 `pendingJump` 为真，同一次 tick 就会把序号标成已处理，即使 `grounded` 为假、速度没被改。落地后再发同一序号不会跳。只有断线发生在这次 tick 之前，序号才会退回。

`world()` 和 `inputCursor()` 暴露的都是收到的 `jumpPressSeq`，没有暴露 `processedJumpPressSeq`。客户端无法区分「已收到但还没跳」和「已经结算」。断线退回之后两者暂时一致；超时和空中结算之后，客户端会以为这次已经算数。

## 测试没盖住的部分

`client-resume.test.ts` 只断言 `Connection.jump` 和快照 id。恢复调用是假的，没有把发出的 `jumpPressSeq` 送进 `Game.input`。过期响应只断言了 `jump === 4`，没有断言 `seq`。换关用例是手动塞 `connection.world`，没有覆盖世界状态一直不到、中途又换关、以及一次加上多次连按。

`input-cursor.test.ts` 盖住了：未采样不算 `lastProcessedInputSeq`、断线后退序号再发可以跳、已采样再发不跳、刚好 300ms 采样、超过则移动序号不更新。它没有覆盖超时后的 `jumpPressSeq`、空中把跳跃结算掉、换关 `prepareLevel` 清掉未起跳、以及序号一次增加超过 1 却只跳一下。
