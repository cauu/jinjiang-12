# 灯市规则独立复核

模型：Cursor Grok 4.7 low；只读。以下为首次审查和修复后复核。

## 首次审查

正常答题路径已经按新规则结算：每题到时用服务端横坐标判区，答错立刻淘汰，不看 `targetCount`，题库打完或揭晓后只剩一人或零人就结束本关。全员答错时 `qualifiedIds` 为空，随后 `championId` 保持 `null`。主持人跳关和直接结局仍会从已淘汰的人里挑出冠军。

## 正常路径成立

结算在 `apps/server/src/game.ts` 的 `updateLevel`。作答截止（默认 `quizMs` 10 秒）后按 `x < -4` 为 A、`x < 4` 为 B、其余为 C 判定，与场景里 `col<6` / `col<14` 的着色一致（`packages/game-client/src/index.ts`）。空中只看 `x`，跳跃不改变区域。错的人马上标成 `eliminated`，揭晓（`quizRevealMs` 2 秒）结束后：

- `alive().length <= 1`，或 `questionIndex` 已是题序最后一题，就 `finish(alive())`。
- 否则进入 2 秒复原，再出下一题。

`02-dengshi` 开局把 `phaseEndsAt` 置空，不会走到后面「无人合格就塞 `activeIds[0]`」的超时补人。`makeLevel` 仍给灯市算 `targetCount`（`apps/server/src/levels.ts` 约 70% 晋级名额），答题循环不用它。当前 `QUESTIONS` 正好 5 道，所以「最多五题」和题库长度重合。

全灭时 `activeIds` 变成 `[]`，`finishEnding` 里 `championId = activeIds[0] ?? null` 得到 `null`。大屏在没有 `championId` 时写「无人夺冠」（`apps/display/src/main.ts`）。手机和大屏在 `playing` 时显示「第 n/5 题」和作答或揭晓倒计时。

`apps/server/test/rules.test.ts` 覆盖了：截止前改位置、五题后两名存活者晋级、只剩一人在揭晓后进 `result`、全错且 `void === false`、再推进一关后 `championId === null`、无人淘汰则全员晋级。浏览器用例 `apps/test/dengshi-objective.test.ts` 只覆盖一名玩家连续站对并晋级，另外两人被淘汰。

## 缺陷

**1. 主持人操作会凭空产生冠军**

`skip`（`game.ts` 约第 78 行）在本关仍在进行时，若存活者已被滤成空（揭晓阶段全员已是 `eliminated`，但仍留在 `activeIds`），会 `finish([activeIds[0]])`，把已淘汰的人改回 `qualified`。再从 `result` 跳过，`advance` 看到只剩一人，`finishEnding` 把他写成冠军。

`finishNow`（约第 79 行）不看淘汰状态，按分数和入场顺序从当时的 `activeIds` 里直接写 `championId`。全灭后分数都是 0，第一位入场者成为冠军。

规则测试没有覆盖这两条。`README` 仍把直接结局写成「按当前成绩和入场顺序选冠军」。

**2. 题数上限绑在题库长度上，界面写死 5**

结束条件是 `questionIndex >= questionOrder.length - 1`（`game.ts` 约第 117 行），`questionOrder` 是整份 `QUESTIONS`，没有先截成 5 题。手机 `apps/mobile/src/game.ts` 和大屏 `apps/display/src/main.ts` 文案写死 `/5`。现在题库 5 道所以一致；题库按关卡文档扩到约 15 题后，服务端会继续出题，界面会变成「第 6/5 题」。

**3. 揭晓没有塌陷，淘汰者立刻从画面消失**

错区地砖从不设置 `disappearsAt`，人也不会因 `y < -5` 掉落。判定瞬间状态已是 `eliminated`，场景在 `packages/game-client/src/index.ts` 里跳过该状态，人在 2 秒揭晓开始时就消失。复原阶段前端仍把倒计时标成「揭晓」。`roundResult.savedIds` 一直是空数组，`void` 恒为 `false`。

**4. 文档和快照还留着旧规则**

`docs/levels/02-dengshi.md` 第 2 节已是答错淘汰、全灭无人夺冠；第 13 节验收仍写「所有人答错时作废；人数不足时按距离补足名额」。关卡快照里的 `targetCount` 对灯市仍是晋级名额，客户端不用，但和「不设淘汰目标」的对外状态不一致。分界没有「按离中心更近」的缝：`x === -4` 算 B，`x === 4` 算 C，和地砖列一致，和该节「缝上按中心」的句子不一致。

## 断线与测试没覆盖的边界

断线或输入超过 `inputTimeoutMs`（300ms）只把速度清零，人停在服务端最后位置，截止时照常判区，不会复活（`disconnect` 与 `simulatePlayer`）。没有灯市断线用例。

也没有测试：空中锁定、`x` 恰为 -4 或 4、揭晓途中 `host:skip` / `host:finish`、只剩一人时在六关赛程里直接夺冠并跳过后面关卡。全灭不产生冠军的测试要先手动再塞一关才会从 `result` 进入 `ending`；生产环境六关会自己走进这条路径。整局测试 `full-match.test.ts` 和 `network-conditions.test.ts` 断言一定有 `championId`，玩家脚本会站到正确区，覆盖不到全灭。


## 修复后复核

全员淘汰时的主持跳过和直接结局不会再造出冠军，题库也会先截成最多五题。这两处在 `game.ts` 里已经按这个规则写好，`rules.test.ts` 里的断言对得上实际分支。对照 `/tmp/jinjiang-dengshi-grok-review.txt` 里原先的两条规则缺陷，当前没有阻塞性问题。

**主持跳过 / 直接结局。** 揭晓阶段全员已是 `eliminated`、但仍留在 `activeIds` 时，`skip` 先滤掉淘汰者再 `finish`。滤完是空数组，`activeIds` 被写成 `[]`，不会把 `activeIds[0]` 改回 `qualified`。再从 `result` 跳过时，`advance` 因人数不超过一人进入 `finishEnding`；冠军只从 `activeIds` 里找非淘汰者，空名单得到 `championId === null`。`finishNow` 同样先滤掉淘汰者，再对空名单取 `scoreOrder(...)[0] ?? null`，随后 `finishEnding` 也不会从仍留在 `activeIds` 里的淘汰者中补冠军。

```78:79:apps/server/src/game.ts
 skip(now:number){ /* ... */ const ids=m.activeIds.filter(id=>this.players.get(id)!.status!=='eliminated');this.finish(ids,'host_skip',now);this.revision++;}
 finishNow(now:number){ /* ... */ const ids=m.activeIds.filter(id=>this.players.get(id)?.status!=='eliminated');m.championId=(/* ... */this.scoreOrder(ids))[0]??null;this.finishEnding(now);this.revision++;}
```

`host skip or finish after everyone answers wrong never revives an eliminated player` 覆盖的就是这条路径：全员站错并在截止后淘汰，揭晓尚未结束时调用 `skip` 或 `finishNow`。`skip` 还再推进一关进入 `ending`。断言是 `phase === 'ending'`、`championId === null`，且四人状态仍为 `eliminated`。正常全灭路径另有一条测试，在 `result` 后再推进到 `ending`，同样要求 `championId === null`。

**五题上限。** `prepareLevel` 复制题库后执行 `slice(0,5)`。结束条件仍是 `questionIndex >= questionOrder.length - 1`，因此一局里最多五题，多出来的题进不了本题序。

```43:43:apps/server/src/game.ts
this.questionOrder=[...QUESTIONS]; /* 洗牌 */ this.questionOrder=this.questionOrder.slice(0,5);
```

`dengshi limits a larger question bank to five questions` 会临时往 `QUESTIONS` 追加第六题，四人连续答对五轮。若没有截断，第五题揭晓后仍会进入复原并变成第 6 题，阶段仍是 `playing`。测试要求此时已是 `result` 且 `questionIndex === 4`，所以截断失败会被这条断言抓住。
