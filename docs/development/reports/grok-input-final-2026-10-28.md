# Grok 4.7 输入序号边界复验

模型：Cursor grok-4.7-low；模式：只读。原始结果如下。

我先只读核对输入序号的最新修正，对照服务端实现、测试和边界日志，确认覆盖范围和是否有阻断缺陷。最新代码和日志已经盖过那份复验报告。移动输入仍是每拍只采样最新意图，四项都没有阻断缺陷；`input-cursor-boundary-2026-10-28.log` 为 4 通过、0 失败。

确认号只在 `simulatePlayer` 里、本拍连接且未超时、并且 `pendingSeq >= 0` 时写成该序号。`input()` 只推进接收游标 `lastSeq` 和待采样的 `pendingSeq`。

| 项 | 结论 | 覆盖 |
|---|---|---|
| 断线期间输入 | 安全。`input()` 要求 `connected`，断线中的包直接 `INPUT_NOT_ALLOWED`，不会进入待采样。断线本身把 `pendingSeq` 置为 -1。 | 有。先收 seq 1，断线，seq 2 被拒绝，立即 `resume` 再 tick，确认号仍为 -1，接收游标仍为 1。 |
| 超时边界 | 安全。条件是 `now - lastInputAt > 300`。恰好 300ms 会采样并确认；301ms 清掉 `pendingSeq`，确认号不前进。 | 有。1100 的 seq 1 在 1400 确认为 1；1410 的 seq 2 到 1711 仍停在 1。另一则里 1040 的输入到 1400 被丢弃，确认号保持 -1，随后 1410 的 seq 3 在 1434 确认为 3。 |
| 阶段重置 | 安全。`prepareLevel` 清 `pendingSeq`、速度和 `pendingJump`，不改 `lastProcessedSeq`。`setPhase` 只增加 `phaseId`，旧阶段包在 `input()` 被拒。 | 有，但是跳阶段路径：playing 中未采样的 seq 1，经三次 `skip` 进入下一阶段后确认号仍为 -1，旧 `phaseId` 的 seq 2 抛 `INVALID_INPUT`。 |
| 采样确认 | 符合「最新意图」语义。同一拍 seq 1 再 seq 2，tick 前确认号为 -1，tick 后为 2，位移跟最后一条朝向。中间输入没有逐条回放。 | 有。 |

旧报告里的两处判断已经过时：测试现在是 4 则，不是 2 则；断线期间也不能再调用 `input()`。

未构成阻断的残留：跳跃序号在 `input()` 时就写入 `jumpPressSeq`，断线、超时和 `prepareLevel` 只清 `pendingJump`，不回退这个序号，`inputCursor` 会让客户端把已丢弃的跳跃当成已接收。这不影响 `lastProcessedInputSeq`。丢弃路径没有断言位移仍为 0；阶段用例没有再断言接收游标，也没有断言新阶段的下一条输入能被采样。
