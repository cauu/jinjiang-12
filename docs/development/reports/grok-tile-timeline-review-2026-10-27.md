# Grok 4.7 地砖时间局部复验

模型：Cursor grok-4.7-low；模式：只读。原始结果如下。

我先只读对照审查报告、回归测试和当天日志，确认“同一地砖消失时缺少服务器时间断言”这一条现在是否补上，以及测试实际覆盖到哪。这项具体遗漏已经补进测试源码。`docs/development/reports/map-regression-timeline-2026-10-27.log` 只证明包含该断言的合并用例跑通了一次，不能单独证明“变色瞬间”与服务器时间是同一次读取。

审查报告第 9 段写的是：同一地砖从预警色变成 `(57,73,80)` 时，没有再取 `room:snapshot`，因此没有核对 `disappearsAt <= serverTime`。当前 `apps/test/map-guidance.test.ts` 第 27 行已经有这条断言：先在 `warned` 下标里筛出画布上已是消失色的格子，再取一次快照，并要求其中至少一格满足 `disappearsAt <= serverTime`。断言文案是 `a displayed collapsed tile must have reached its server disappearance time`。

时间线日志只有这一条合并用例：

- 用例名：`the on-screen map shows all answer areas and delivery corners`
- 结果：`ok 1`，`pass 1`，`fail 0`
- 耗时：用例约 12885 ms，整段约 13480 ms

日志里没有格子下标、`disappearsAt` 或 `serverTime`。这条断言没有被 `try/catch` 包住，所以这次通过意味着第 27 行的 `assert.ok` 当时为真。它没有单独的子测试结果。

同一条路径现在实际覆盖的是：

- 第 24 行：7 秒内整张画布出现预警色 `(216,74,49)`。
- 第 25 行：快照里 `disappearsAt > serverTime` 的格子，按 `10+(i%20)*5`、`10+Math.floor(i/20)*5` 的 4×4 至少有一颗预警像素，且 `warned` 非空。
- 第 26 行：7 秒内这些下标里任意一格出现消失色 `(57,73,80)`。
- 第 27 行：随后仍显示该消失色的 `warned` 格子里，至少一格在后一次快照上已经 `disappearsAt <= serverTime`。

仍未覆盖的是：

- 像素和快照仍是先后两次读取，不是变色那一帧的同一时刻。
- 用的是 `.some`。只要有一格已到服务器消失时间即可，其余已变色的格子不必都满足。
- `waitForFunction` 只返回真假，不记录最先变色的下标。
- 若客户端提前涂上消失色，而在读像素和取快照之间服务器时间刚好越过 `disappearsAt`，这条断言仍会通过。
- 日志不记录通过的是哪一格，也不记录两个时间戳。
