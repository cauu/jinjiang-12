# Cursor Grok 4.7 独立复核

我先只读核对这几处断线补位、重开选人和跨局游标相关实现，以及对应测试是否真的锁住竞态。断线补位和重开时优先在线玩家这两处已经按加入顺序补上，测试也锁住了。还没修好的是跳跃沿：断线会把它记成已收到却不跳，连续重连时旧的 `session:resume` 回包仍会改客户端游标。

## 已对齐的部分

大厅候场上限 32。候场玩家断线后变成观战，`fillWaitingSlots` 按 `players` 的插入顺序，把空位交给最早的在线观战者。人回来时如果候场已满，就继续观战，不会挤掉当前候场玩家。`reset` 只把在线玩家放回候场，不改本局 `participants`。机器人换 `match.id` 时会把 `seq` 和 `jump` 清零，新局服务端动作也从 `jumpPressSeq: 0` 开始。

`apps/server/test/bots.test.ts` 覆盖了容量、清机器人后晋级、断线观战补位、最早观战者、重开在线优先，以及机器人跨局不重放跳跃。`apps/test/browser.test.ts` 覆盖了同一页重开后约 400ms 内不把旧跳跃送进新局。`apps/test/browser-network.test.ts` 连续切断 10 次后，只检查身份、还能移动，以及 5.5 秒内旧恢复失败不会把入场层盖回来。

## 仍未修复

**1. 断线丢掉尚未结算的跳跃，游标却已经前进。** `input` 先把 `jumpPressSeq` 加上并置 `pendingJump`。`disconnect` 只清 `pendingJump`，不清 `jumpPressSeq`。`inputCursor` 随后把这个序号交给客户端。跳跃是沿触发，和摇杆的 `x/z` 不同，下一包不会再带一次“刚按下”。客户端用 `Math.max` 保留这个序号后，`jumpPressSeq > jumpPressSeq` 不再成立，这次跳就没了。移动丢包可以靠下一帧摇杆补上，所以 `input-cursor.test.ts` 只证明了序号保留，没有证明跳跃还能发生。

**2. 连续断线时，过期的恢复回包仍会改游标。** 服务端在处理 `session:resume` 时才拍快照，回包在网上延迟就变成旧局状态。手机端的 `recoveryVersion` 只包住界面：

```24:26:apps/mobile/src/game.ts
let connectedOnce=false,recoveryVersion=0;
connection.addEventListener('disconnected',()=>{recoveryVersion++;});
connection.socket.on('connect',()=>{if(connectedOnce&&connection.session){const attempt=++recoveryVersion;void connection.resume(connection.session).then(()=>{if(attempt===recoveryVersion){entry.hidden=true;error.textContent='';}}).catch(()=>{if(attempt===recoveryVersion&&connection.socket.connected){entry.hidden=false;error.textContent='恢复失败，请重新入场';}});}connectedOnce=true;render();});
```

`Connection.resume` 在这个判断之前就写了 `seq`、`jump`、`inputMatchId`，并调用 `receive`。同一局里 `Math.max` 还能挡住更小的序号。跨局则不是：回包里的旧 `matchId` 对不上当前 `inputMatchId` 时，会把 `jump` 直接设成旧局的 `jumpPressSeq`，再把 `inputMatchId` 改回旧局。下一帧 `input()` 发现对局变了，又把 `jump` 清零。新局里已经按下、服务端已经记下的跳跃沿被客户端丢掉，之后要点多次才重新超过服务端序号。`intent.jump` 在换局时也不清，预测用的计数会和权威序号分开。

**3. 旧连接上的延迟 `resume` 仍能抢走绑定。** `bind` 谁后执行就把 `sockets` 指到谁，并踢掉另一个 socket。死连接上的延迟恢复若最后执行，会把映射指回死 socket，并把活连接踢掉。活连接的 `disconnect` 看到映射已经不是自己，就不会把玩家标成离线。玩家会停在 `connected: true`，直到下一次恢复碰巧绑对。网络测试只等到最终又连上，没有锁住这次抢绑。

同一局换关时两边都不重置 `jumpPressSeq`，这是对齐的，不是漏修。机器人只在 `match.id` 变化时清零，也和这一点一致。

## 测试没锁住的部分

没有测试在跳跃尚未被 tick 结算时断线，再断言人会跳起来。浏览器重开测试没有在重连途中换局，也没有断言 `jumpPressSeq`。网络测试没有检查跳跃游标，也没有让旧 `resume` 回包晚于新局到达。

## 结论

候场补位和重开选人可以认为已经修好。跳跃游标在「断线取消未结算跳跃」和「旧恢复回包跨局覆盖客户端」这两条路径上仍会丢跳或吞掉新局的下一次跳。现有测试覆盖了补位、重开名单、机器人换局和入场层，没有覆盖这两条竞态。
