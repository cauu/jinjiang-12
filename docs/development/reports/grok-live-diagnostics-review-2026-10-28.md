# Cursor Grok 4.7 实时诊断复核

我只读这些诊断相关文件，核对结论是否站得住、会不会改游戏逻辑，以及令牌和测试缺口。诊断读取本身不改对局状态，`/admin/diagnostics` 的响应里也没有主持令牌或重连令牌。不可靠的是 `observe.ts` 里的 `hint`：它会把「最近一次被拒绝」或「摇杆很小」说成玩家没在动。真正把主持令牌交出去的是未鉴权的 `/admin/bootstrap`。

## 会不会改游戏逻辑

`Game.diagnostics` 只读 `match`、玩家、`motions` 和 `tick`，不改 `revision`，也不调用 `input`、`step`、`finish`。`/admin/diagnostics` 只做 `checkHost` 和 `JSON.stringify`。输入计数写在 `server.ts` 的 `inputStats` / `unboundRejected` 里，`game.input` 的接受与拒绝规则不变。

`players[].avatar` 是场上对象的同一引用，当前调用方只序列化、不回写。只要没有别的代码改这份返回值，诊断就不会带动角色。

诊断和 `setInterval` 仿真在同一线程。玩家很多时，这次 JSON 会挡住 tick，这是调度延迟，不是规则变化。`observe.ts` 是另一个进程，每秒拉一次，不进入仿真。

## 令牌

诊断 JSON 不含 `hostToken`、`resumeToken`。测试用「诊断玩家」打了一记有效输入和一记过期 `phaseId`，并断言正文里没有这两个令牌。403 是空 body。`observe.ts` 成功路径只打印局面、输入、计数和 `hint`，不打印令牌。

主持令牌从 `GET /admin/bootstrap` 出去：任何人拿到 200 就能得到 `{ roomId, token }`。`observe.ts` 启动时就是这样取令牌，再放进 `x-host-token`。拿到它的人可以 `host:attach`，然后开始、跳过、结束、重置。这和诊断响应是否脱敏是两件事。

## hint 是否站得住

判定顺序是：断线 → 非 `playing` → 阶段不是 `playing`/`countdown` → 没有 motion → **最近一次拒绝晚于最近一次接受** → 输入超时 → 摇杆长度 ≤ 0.1 → 贴边且位移 < 0.02 → 有输入但位移 < 0.02 → `moving`。

和仿真对得上的部分：

- `expired` 与 `simulatePlayer` 用的是同一个 `inputTimeoutMs`（默认 300ms）。超时后仿真会把摇杆清零。
- `countdown` 仍会移动（`inPlay=false` 只是不做关卡规则），`hint` 没有把倒计时当成禁止操作。
- 四关夹边阈值 9.59 和代码里的 ±9.6 夹紧是对齐的；朝墙外推且 1 秒内 xz 几乎不动时，`at_boundary` 说得通。

对不上的部分：

- `latest_input_rejected` 比位移优先。重复序号、过期 `phaseId` 都会记一次拒绝。之后只要没有更新的接受，`hint` 就停在这里，即使角色仍按上一记有效输入在移动。拒绝时间比接受时间新，并不等于当前不动。
- 游戏没有死区，`hypot <= 0.1` 仍会以约 `0.05 * 5 m/s` 移动。`hint` 却先判 `neutral_input`，不再看位移。
- 位移是约 1 秒的 xz 净位移。走出去又走回原点会变成 `nonzero_input_no_displacement`。换 `phaseId` 后第一拍位移是 `null`，非零输入会直接标成 `moving`。仿真卡住时也是「有输入无位移」，`tickAgeMs` 只是另字段，不参与 `hint`。
- `06-guishi`、`04-shisan` 不在贴边表里。鬼市撞墙被推回时，结论是泛泛的无位移，看不出是墙。

`input.x/z` 是服务端当前摇杆，不是这一秒的采样平均。`lastProcessedSeq` 要等未过期的 tick 才从 `pendingSeq` 抄过去；诊断读到的「已处理」可以比「已接收」旧一拍，这是正常的，不是丢输入。

## 计数

已绑定玩家：先 `received++`，成功再 `accepted++`，`GameError` 或其它异常再 `rejected++` 并按 `code` 累加。未绑定套接字只加 `unboundRejected`，不进某个玩家。现有测试覆盖了「接受 1、拒绝 1、`INVALID_INPUT` 为 1」。

尚未被测试、但会影响结论的缺口：

- 被顶掉的旧套接字仍带着 `playerId`。它再发 `input` 会因 `NOT_JOINED` 记到**当前玩家**的 `rejected` 上，从而把 `hint` 打成 `latest_input_rejected`。
- 断线、移除等待玩家都不清 `inputStats`。同 id 不会复用，所以只是残留；诊断只列出仍在房间里的人。
- 没发过输入的人 `transport` 为 `null`。测试里的「另一玩家」没有断言这一点。
- `received` 应等于接受加拒绝；测试没断言。
- 输入超时、`unboundRejected`、错误令牌、重复令牌头（Node 会变成字符串数组，从而 403）都没有覆盖。
- `observe.ts` 的整条 `hint` 链没有测试。

现有测试也不看大厅、倒计时、贴边、净位移回原点和「拒绝之后仍在移动」。
