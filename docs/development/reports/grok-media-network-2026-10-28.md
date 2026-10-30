# Grok 4.7 过场断网复验

模型：Cursor grok-4.7-low；模式：只读。原始结果如下。

我只读核对四段过场断网测试、日志和验收条目，不改任何文件。四段断网用例本身通过，但不能据此把 A08 或真机验收判为通过。

## 证据范围

`apps/test/media-network-reconnect.test.ts` 只有一条用例。`docs/development/reports/media-network-2026-10-28.log` 为 TAP：1 通过、0 失败，耗时 84432.612542 ms，四条诊断均为 `resumed without extending deadline`。`createGameServer()` 未改时长，服务端默认值为开场 15000、风起 8000、再生 6000、结局 50000 毫秒。测试没有读取 `media.durationMs`，也没有断言这四个数字。

## 播放、断网、身份、时间线

播放开始只看手机页存在 `video`，`src` 为 `/media/${id}_phone.mp4`，且 `currentTime > 0.1`（10 秒内）。未检查 `paused`、大屏视频，断线后也不再检查是否仍在播。

断网是 `context.setOffline(true)`，再 `proxy.cut(29)`。Vite 把 `/socket.io` 指到 30 路代理的第 29 路（约 160 ms 基线延迟加抖动）；`/media` 直连后端，不经过该代理。`cut` 只拆已有 TCP。页面出现精确文案「连接中断，正在重连」后再等 700 ms，然后 `setOffline(false)`。新连接仍可走同一代理端口。

身份是断线前 `localStorage['jinjiang-session']` 整串不变，且 5 秒内 `room.players[playerId].connected === true`。未再断言名字。

时间线在断线前记下 `phaseId` 与 `phaseEndsAt`，恢复后两者必须相同；然后轮询到阶段变化，并要求 `serverTime >= phaseEndsAt` 且超出不足 3000 ms。这只说明原截止点未被推迟，不能证明客户端播放时钟与服务端对齐。总时长约 84 秒，与 15+8+6+50 秒再加进房和跳关开销相符，属于旁证。

## 定位关卡

开局后直接等 `intro`。`checkVideo` 会等到该阶段自然结束。接着 2 轮各 3 次 `host:skip`（结算、进入下一段过场、再跳过过场），跳过锦市、灯市，停在七宝市规则卡。再跳两次进入七宝市之后的 `wind`。再生同理，停在市散规则卡后再跳两次，进入 `rebirth`。最后在酒市规则卡调用 `host:finish` 进入 `ending`。两人都会被跳关保留，不会提前冠军。脚本没有断言关卡 id，只靠跳关次数和视频地址；以当前 `skip` / `advance` 语义，路径是对的。

## 误报、日志、未覆盖

误报风险：过场时长未断言；断线后画面可以报错被换成「过场进行中」，测试仍会过；3 秒宽限可以盖住短暂停表；第 29 路自带延迟，不是纯切断。

日志异常：四次切断只出现 3 次 Vite `ws proxy error` / `read ECONNRESET`（约 1:20:46、1:20:54、1:21:00，间隔 8 秒和 6 秒，对得上风起和再生）。用例仍为 ok。这些错误来自断线本身，不是收尾清理。

未覆盖：文件缺失、播放失败、大屏、播放时钟对照、断线后继续播放、真机与 A08 的其余证据。验收记录仍写明 A01–A10 与真机尚未完成，总体未通过验收。
