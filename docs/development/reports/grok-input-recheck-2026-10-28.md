# Grok 4.7 输入序号复验（二）

模型：Cursor grok-4.7-low；模式：只读。原始结果如下。

我先只读这几份报告、实现和日志，核对断线、立即重连、超时和阶段重置时，被丢弃的输入还会不会被误确认。丢弃路径不会把未作用的序号写成 `lastProcessedInputSeq`。断线、断后立即重连、超时在代码里是安全的，后两者有测试；阶段重置只靠读代码，测试没覆盖。这仍是「每拍只采样最新意图」，不是逐条回放。

`input()` 收到包就推进 `lastSeq` 和 `pendingSeq`。确认号只在采样时、且本拍真的采用该意图时才等于 `pendingSeq`：

```76:76:apps/server/src/game.ts
  if(!p.connected||now-move.lastInputAt>this.opts.inputTimeoutMs){move.x=0;move.z=0;move.pendingSeq=-1;a.jumpHeld=false;move.pendingJump=false;}else if(move.pendingSeq>=0)move.lastProcessedSeq=move.pendingSeq;
```

| 丢弃场景 | 确认号 | 依据 |
|---|---|---|
| 断线 | 不前进 | `disconnect` 先把 `pendingSeq` 置为 -1，tick 时未连接也不进入确认分支 |
| 断后、tick 前重连 | 不前进 | 重连只把 `connected` 设回 true，不恢复 `pendingSeq`。测试先 `input(1)`、断线、立刻 `resume`、再 `step`，确认号保持 -1，游标仍是 1 |
| 超时（>300ms） | 不前进 | 同一分支清掉 `pendingSeq` 再跳过确认。测试里 1040 的 seq 2 到 1400 才采样，确认号仍为 -1；1410 的 seq 3 在 1434 被确认 |
| 阶段重置 | 不前进 | `prepareLevel` 清 `pendingSeq` / 速度 / `pendingJump`，不改 `lastProcessedSeq`。`setPhase` 只增加 `phaseId`，旧阶段包在 `input()` 被拒绝。进入下一局倒计时前，未采样序号已经被清掉 |

## 残留风险

- 跳跃序号在 `input()` 里就写入 `jumpPressSeq`。断线、超时、`prepareLevel` 只清 `pendingJump`，不回退这个序号。`inputCursor` 会让客户端把已丢弃的跳跃当成已接收，不会重发。这不影响 `lastProcessedInputSeq`。
- 断线期间仍可调用 `input()`（不检查 `connected`）。若 tick 前重连且未超时，这包会被采样并确认；若 tick 时仍断着，则丢弃且不确认。测试没有这条。
- 恰好 300ms 不算超时（条件是 `>`），这拍会确认并生效。
- 同一拍后到的序号覆盖先到的序号，确认号只跳到最后一条。中间朝向没有单独模拟。

## 测试实际覆盖

`input-cursor.test.ts` 只有两则，回归日志均为通过；全量 `backend-after-input-cursor` 也通过，但没有新增阶段用例。

1. 同一拍 seq 1 再 seq 2：tick 前确认号为 -1，tick 后为 2，位移跟最后一条朝向。
2. 断线后立即重连，以及超时后再来一条新输入。断言的是确认号和接收游标，没有断言丢弃后位移仍为 0。

没覆盖：tick 时仍然断线、`prepareLevel` / 换阶段、跳跃被丢弃、300ms 边界，以及断线期间收到、重连后才采样的包。
