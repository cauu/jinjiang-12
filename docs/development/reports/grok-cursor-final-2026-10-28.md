# Cursor Grok 4.7 重连与游标复核

我先只读核对这几处断线补发和重连竞态的实现，再对照两个测试看它们实际断言了什么。断线后的跳跃补发只在同一局、同一段内存里成立：服务端把还没被 tick 采样的 `jumpPressSeq` 退回已结算值，客户端用 `Math.max` 留着更大的本地序号，下一次移动包再带上去。两个测试都没有把这条链路跑通。

## 实际怎么补发

`disconnect` 只在 `pendingJump` 仍为真时，把 `jumpPressSeq` 退回 `processedJumpPressSeq`，并清掉 `pendingJump`。`lastSeq` 不退。`inputCursor` 因此报的是「已结算的跳跃」和「已收到的移动序号」。

```33:33:apps/server/src/game.ts
disconnect(id:string) { const p=this.players.get(id); if(p?.connected){p.connected=false;const m=this.motions.get(id);if(m){m.x=0;m.z=0;m.pendingSeq=-1;if(m.pendingJump)m.jumpPressSeq=m.processedJumpPressSeq;m.pendingJump=false;} if(p.avatar)p.avatar.jumpHeld=false;...
```

采样在下一拍：人还连着且输入未超过 300ms 才把 `pendingSeq` 记成已处理；`pendingJump` 为真就起跳，并让 `processedJumpPressSeq` 追上 `jumpPressSeq`。已经起跳后再断线，游标保持不变，同一序号不能再触发。

客户端没有单独的重发函数。`resume` 在同一 `matchId` 上做 `Math.max`；`input()` 每次都带当前 `jump`。手机端每 100ms 的定时器调用 `input(..., pressed=false)`，所以只要本地 `jump` 仍大于服务端游标，下一包就会把这次跳跃补上。`session:resume` 在 `bind` 之后同步返回 `inputCursor`。旧连接的 `disconnect` 只有在 `sockets` 仍指向自己时才会调用 `game.disconnect`，`bind` 先改映射再踢旧连接，不会把刚恢复的跳跃再退回。

## 测试实际覆盖了什么

`input-cursor.test.ts` 里那条跳跃用例是直接调用 `Game.input`，不是 `Connection` 或手机定时器。它覆盖了三件事：未采样就断线时游标回到 0；重连后手工再送 `jumpPressSeq: 1` 会离地；落地后重送同一个 1 不会再跳。移动序号、未采样不确认、300ms 边界、换阶段丢弃旧 `phaseId`，都只用 `jumpPressSeq: 0`。

`client-resume.test.ts` 没有碰到补发。对局停在 `card`（`cardMs` 仍是 6000，只 `step` 了一次）。`input()` 在非 `countdown`/`playing` 时直接 return，不会把 `jump` 从 3 加到 4。按现有代码，`assert.equal(connection.jump, 4)` 不会成立。就算改成可输入阶段，这个用例测的也是另一条分支：`inputMatchId` 还是 `null`，新局游标是赋值，不是 `Math.max`。旧回包被 `STALE_RESUME` 丢掉，这点是真的；它没有发 `disconnect`，没有写同一局「服务端游标更小、本地序号保留」，也没有看 `volatile.emit` 的载荷。

## 还在的风险

- **换关会把没跳成的一跳补到下一关。** `prepareLevel` 只把 `processedJumpPressSeq` 对齐到当前 `jumpPressSeq`，不升高它。断线已把未采样序号退回 0，而同一局客户端不重置 `jump`。下一关倒计时的 100ms 包会把这个旧按下当成新跳跃。
- **人在空中时，补发会被吃掉。** 第 79 行无论是否着地都清 `pendingJump` 并推进 `processedJumpPressSeq`。离地时速度不变。断线前若这一拍已经结算，游标已前进，落地后不会再补。
- **超过 300ms 的第一拍会确认跳跃但不跳。** 超时分支先把 `processedJumpPressSeq` 设成 `jumpPressSeq` 并清 `pendingJump`，后面的起跳代码看不到它。断线回退只在 `pendingJump` 仍为真时发生。事件循环卡住超过 300ms 时，这一跳消失，重连也不会补。现有边界测试只断言了移动序号。
- **断线期间连按会并成一次。** 服务端只认 `jumpPressSeq` 变大，一次 `pendingJump`。本地从 1 加到 3，补发包只产生一跳。
- **整页刷新补不回来。** 新的 `Connection` 里 `jump` 从 0 开始，而且 `inputMatchId` 对不上时直接采用服务端游标。服务端此时已经退回已结算值，内存里那次按下已经没了。
- **重连完成前的输入会被丢掉，但序号已经加了。** 新 socket 在 `bind` 之前是 `NOT_JOINED`，`input` 又是 `volatile` 且没有 ack。定时器最多早一个 100ms 周期空转。`seq` 会空跳，跳跃序号要等 `resume` 之后的下一包才送出。
- **`disconnect` 会把正在进行的 `resume` 标成过期。** `resumeGeneration` 在断线时加一。手机页靠下一次 `connect` 再恢复；若不再连上，存储的会话恢复会吞掉 `STALE_RESUME`，不会提示。这个交错没有测试。
- **预测用的 `intent.jump` 不跟游标走。** `resume` 只改 `this.jump`。断线只清 `intent.held/x/z`。本地画面可能先表演一次服务端已经退回的跳跃。

复核记录更正：复核所述 `client-resume.test.ts` 的 `cardMs` 为 6000 不符合该测试代码；测试显式设置 `cardMs: 0`，一次 step 后进入倒计时，相关断言实际执行并通过。复核指出的跨关旧跳跃问题随后增加了当前关卡游标同步和定向测试，仍须浏览器端和独立复验。
