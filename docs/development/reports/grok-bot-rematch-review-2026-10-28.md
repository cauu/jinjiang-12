# Cursor Grok 4.7 局部只读复核

我先只读这三处实现和相关测试，对照候补补位与跨局跳跃重置的行为找具体漏洞。候补只在「删掉玩家」或「大厅里重连」时发生，断线占座和 `reset()` 都不会把已连接的观战者补进去。跨局跳跃序号在机器人换 `match.id`、真人下一次 `input()` 时会清掉，但同一局里换关不会清，测试也没守住重连游标。

## 候补补位

`fillWaitingSlots` 只看 `status === 'waiting'` 的人数，不看是否还连着。断线只把 `connected` 设为 false，状态仍是 `waiting`，这 32 个名额继续被占住。

```34:35:apps/server/src/game.ts
private fillWaitingSlots(){let available=32-[...this.players.values()].filter(p=>p.status==='waiting').length;for(const p of this.players.values())if(available>0&&p.connected&&p.status==='spectating'){p.status='waiting';available--;}}
removeWaitingPlayer(id:string) { if(this.match) throw new GameError('MATCH_EXISTS'); if(this.players.delete(id)){this.tokens.delete(id);this.motions.delete(id);this.fillWaitingSlots();this.revision++;} }
```

因此：

- 大厅里有人断线后，后来的已连接观战者补不进去。`join` 在等待人数仍是 32 时会直接进观战，也不会先回收这些空占的座位。
- `resume` 只有 `this.match` 为空才补位。名额被断线者占满时，观战者重连仍然是观战。
- `reset()` 按 Map 插入顺序把前 32 人设为 `waiting`，其余为 `spectating`，不调用 `fillWaitingSlots`。前面的人即使已经断线也占座，后面已连接的观战者要等有人被 `removeWaitingPlayer` 删掉才会补上。`start()` 又只带已连接的等待玩家，所以房间里可以有足够的在线观众，开局仍然 `NEED_TWO_PLAYERS`。

补位顺序是玩家 Map 的插入顺序，断线的观战者会被跳过，后面的在线观战者先上台。前面的人再连回来时，若名额已满就一直观战。这个顺序没有测试。

现有测试只覆盖了两条窄路径：31 个机器人加 1 名等待、1 名观战，`clear()` 后两人都是 waiting；观战者先断线，机器人清掉出现空位后再 `resume`。没有覆盖「等待者断线占座」「`reset()` 之后的名额」「空位少于观战人数时谁上台」，也没有覆盖对局进行中 `resume` 不得改名单。

## 跨局跳跃

服务端换关时 `prepareLevel` 只清速度、`pendingJump` 和 `lastInputAt`，`jumpPressSeq` 和 `lastSeq` 留在同一局内。新局要靠 `reset()` 清掉 `motions`，再在 `start()` 里写成 0。机器人要等 `step()` 看见 `countdown` 或 `playing` 且 `match.id` 变了，才把 `jump`、`seq`、`lastJumpAt` 清零；介绍、出牌、结算阶段不会清。

```35:37:apps/server/src/bots.ts
if (this.matchId !== match.id) {
 this.matchId = match.id;
 for (const bot of this.bots.values()) { bot.seq = 0; bot.jump = 0; bot.lastJumpAt = 0; bot.lastInputAt = 0; }
}
```

真人客户端也只在 `input()` 里发现 `match.id` 变化时把 `this.jump` 置 0，而且写在阶段判断之后。`intent.jump` 不清。`resume` 在对局 id 相同用 `Math.max` 保留本地和服务器游标，id 不同则改用服务器游标。

```14:16:packages/game-client/src/index.ts
async resume(session:Session){...this.seq=Math.max(this.seq,data.inputCursor.seq);this.jump=this.inputMatchId===matchId?Math.max(this.jump,data.inputCursor.jumpPressSeq):data.inputCursor.jumpPressSeq;this.inputMatchId=matchId;...}
input(...){...if(!m||!['playing','countdown'].includes(m.phase))return;if(this.inputMatchId!==m.id){this.inputMatchId=m.id;this.jump=0;}if(pressed){this.jump++;this.intent.jump++;}...}
```

机器人那条测试是有效的：桂市跳过之后 `reset` 再开锦市，服务器 `jumpPressSeq` 必须是 0，角色也还在地上。它依赖锦市不会主动起跳。同一关再开一局、换关时序号是否延续、丢包后的那一次跳跃，都没测。

浏览器测试只断言重开后约 400 毫秒内服务器序号仍是 0、人还在地上。随后的 10 次刷新发生在这场新对局、而且还没跳，所以不能证明「同一局断线重连会留下非 0 的 `jumpPressSeq`」。按住跳跃键跨过 `reset` 也没测；按现有规则按住只会让 `jumpHeld` 为真，序号不会加，本身不会起跳。
