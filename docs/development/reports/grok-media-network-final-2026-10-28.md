# Grok 4.7 过场断网增强复验

模型：Cursor grok-4.7-low；模式：只读。原始结果如下。

我按只读方式核对这三份材料，看时长、开播、断网恢复画面、身份和截止时间的断言是否真的覆盖到，以及日志里有没有异常。报告和现行测试、复验日志已经对不上。我接着核对服务端默认时长、跳关路径和代理切断语义，避免把旧结论当成这次证据。现行测试和 `media-network-verified-2026-10-28.log` 比 `grok-media-network-2026-10-28.md` 更新。报告里「没断言时长、没查 `paused`、没再断言名字、日志只有 3 次 `ECONNRESET`」已经和这两份材料不符。四段用例在这份日志里是 1 通过、0 失败，耗时 84350.288709 ms，四条诊断都是 `resumed without extending deadline`。这不能当成 A08 或真机验收通过。

## 断言现在覆盖到哪

`createGameServer()` 没有改时长。`apps/server/src/game.ts` 默认仍是开场 15000、风起 8000、再生 6000、结局 50000 毫秒。`checkVideo` 在断线前用主持人 `room:snapshot` 断言 `media.id`，以及 `media.durationMs` 正好是这四个数。这个值来自服务端选项，不是 `<video>.duration`，也不是文件元数据。

开播在 10 秒内要求手机页存在 `video`，`src` 为 `/media/${id}_phone.mp4`，且 `!paused`、`currentTime > 0.1`。大屏没有打开。

断网仍是 `context.setOffline(true)` 再 `proxy.cut(29)`。Vite 只把 `/socket.io` 指到第 29 路；`/media` 直连后端。第 29 路基线延迟是 `120+(29-27)*20 = 160` ms，再加最多约 35 ms 抖动，以及约 2% 概率的 200–300 ms 额外延迟。`cut` 只拆掉该路已有 TCP。页面出现精确文案「连接中断，正在重连」后再等 700 ms，然后 `setOffline(false)`。恢复后等 `#status` 不再是这句文案。新连接仍可走同一代理端口。

身份是 `localStorage['jinjiang-session']` 整串不变，5 秒内 `room.players[playerId].connected === true`，并且名字是「视频断线玩家」。

时间线在断线前记下 `phaseId` 与 `phaseEndsAt`，恢复后两者必须相同；随后轮询到阶段变化，并要求 `serverTime >= phaseEndsAt` 且超出不足 3000 ms。这只说明服务端原截止点没被推迟。

跳关路径和当前 `skip` / `advance` 一致：开场自然结束后，两轮各 3 次 `host:skip` 跳过锦市、灯市，停在七宝市规则卡，再跳两次进入 `wind`；再生前停在市散规则卡再跳两次；酒市规则卡上 `host:finish` 进入 `ending`。两人都会被跳关保留。脚本没有断言关卡 id，只靠次数和视频 id。

## 仍不够的地方

恢复后的「可见画面」是或条件：视频盒宽高大于 0、`visibility` 不是 `hidden`、`display` 不是 `none`，或者 `#message` 恰好是「过场进行中」。播放失败时 `apps/mobile/src/main.ts` 会把视频换成这句文案，测试仍会过。这里不看 `paused`、`currentTime` 是否继续增加、`readyState`、`error`，也不采样像素。

断线后不再检查是否仍是同一段视频在播。3 秒宽限可以盖住短暂停表。总时长约 84 秒只与 15+8+6+50 秒加上进房、跳关相符，是旁证。客户端播放时钟没有和服务端对照。

未覆盖：媒体文件缺失、解码失败、大屏、断线期间媒体链路本身、真机，以及 A08 的其余证据。

## 复验日志和报告不一致

`media-network-verified-2026-10-28.log` 有四次 Vite `ws proxy error`，不是报告写的三次：

| 时间 | 错误 |
| --- | --- |
| 1:24:19 AM | `This socket has been ended by the other party`（`writeAfterFIN`） |
| 1:24:34 AM | `read ECONNRESET` |
| 1:24:43 AM | `read ECONNRESET` |
| 1:24:49 AM | `read ECONNRESET` |

间隔约 15 秒、9 秒、6 秒，对得上开场、风起、再生的配置时长加一点开销。第一次是写已结束套接字，后三次才是 `ECONNRESET`。报告里的 1:20:46、1:20:54、1:21:00 和只有三次 `ECONNRESET`，对应的是旧文件 `media-network-2026-10-28.log`（用例 84432.612542 ms）。这些错误来自切断本身，出现在 `ok 1` 之前，不是收尾清理。整份 TAP 的 `duration_ms` 是 84868.774333。
