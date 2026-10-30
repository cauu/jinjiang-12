# 实时同步与角色表现（Colyseus 0.18 + Rapier）

日期：2026-10-29。本文替代 [输入预测与回放：未完成事项](input-reconciliation-next.md) 中的待办，并取代 [多人联机研发方案](multiplayer-architecture.md) 第 2、6、7 节的 Socket.IO 方案；房间、阶段和六关规则的设计不变。

## 为什么重做

旧实现有三个结构性问题，靠调参数解决不了：

1. 服务器每 tick 只采样“最新摇杆值”，客户端每 100ms 才补发一次，无法知道一条输入实际执行了几步，客户端也就没法按服务器结果重放。自己的角色只能朝着落后一个往返的服务器位置 `lerp`，表现为移动发涩、松手回弹。
2. 其他玩家没有快照缓冲和时间戳插值，每帧 `lerp(actual, .25)`，速度随帧率和丢包忽快忽慢。
3. 朝向直接取服务器的 `atan2(摇杆)`，客户端直接赋值；动作用 `stop()/play()` 切换，转身、起步、落地都会跳帧。

## 组成

| 层 | 选型 | 作用 |
|---|---|---|
| 房间与状态 | `@colyseus/core` 0.18、`@colyseus/ws-transport`、`@colyseus/schema` 5 | 单房间、二进制增量状态（20Hz patch）、请求/应答命令、断线后 20 秒内自动重连同一会话 |
| 输入与时钟 | Colyseus `defineInput` + `setFixedTimestep(30Hz)`，客户端 `room.input()`、`room.clock` | 每个固定步一条输入；服务器按到达顺序逐条消费并确认；服务器时钟估算 |
| 移动与碰撞 | `@dimforge/rapier3d-compat` 0.21 的 `KinematicCharacterController`（`packages/shared/src/motion.ts`） | 前后端共用同一步进函数；地砖、栏杆、台阶、其他玩家都是碰撞体 |
| 自己的角色 | `@colyseus/sdk/predict` 的 `Reconciler` | 输入立即本地执行；收到确认后回到服务器状态并重放未确认输入，误差在约 90ms 内淡出 |
| 其他玩家 | `Predict.attachAll(..., { mode: 'lerp' })` | 渲染 120ms 之前的画面；样本按 50ms patch 网格对齐，抖动不改变播放速度；`smoothMs: 65` 保证速度连续；朝向按最短弧插值 |
| 表现 | `maath/easing`、three.js `AnimationMixer` | 朝向阻尼（最大约 690°/s），速度驱动步态，动作淡入淡出；人群图集只在明显越过扇区边界后才换方向 |

## 数据流

```text
手机  每帧 predict.tick(now) → 到期 n 步 → 每步写入 {x,z,jump,held} 并 input.send()
      Reconciler 观察每次 send，用共享 MotionWorld.step 立即预测
服务器 setFixedTimestep 30Hz：取出每个会话的全部新输入 → Game.input 入队
      Game.step：每条命令执行一步移动并评估地砖规则；无输入时原地评估规则；
      300ms 无输入或断线则执行空输入步（重力、塌落照常）
      onBeforePatch：StateMirror 把 Game 写入 Schema（只发变化）
手机  patch 带确认序号 → Reconciler 校正 + 重放；其他玩家进入插值缓冲
```

`Game` 仍是规则的唯一权威，保持纯对象，`apps/server/src/mirror.ts` 负责映射到 Schema。客户端由 `toSnapshot()` 还原成原有的 `Snapshot` 结构，界面代码基本不变。

## 规则相关的行为变化

- 站立高度为 `STAND_HEIGHT`（0.51，含 Rapier 0.01 的接触间隙），渲染时扣除。
- 玩家之间是胶囊体碰撞：迎面撞上会沿身体滑开，不会卡死、不会穿模，也推不动对方。
- 市散与桂市触发的是脚下所有承重的地砖（与脚底圆面相交的格子），站在接缝上不再能躲过塌落；锦市染色仍按中心格计分。
- 桂市出生位置改为第一级台阶中央（z=9.4），避免与第二级台阶侧面重叠。

## 实测（本机无头 Chrome / SwiftShader，9 机器人 + 1 浏览器玩家）

脚本 `node --import tsx tools/netcode-metrics.ts [代理档位]`；页面加 `?netMetrics=1` 会把每帧位置、朝向和对账统计写入 `window.__jjNet`。

| 网络（经 TCP 抖动代理） | 自己的对账修正 p50/p95/最大 | 其他玩家渲染速度 p99 / 最大（真实 5u/s） | 最大转身角速度 |
|---|---|---|---|
| 约 150ms RTT，0–35ms 抖动，2% 尖峰 200–300ms | 0 / 0 / 0 cm | 7.7 / 9.3 u/s | 约 600°/s |
| 约 280ms RTT，同上 | 0 / 0 / 0 cm | 7.2 / 8.0 u/s | 约 600°/s |

修改前同一指标为 p99 约 10–12u/s、最大约 16u/s。自己角色的修正为 0 是因为前后端运行同一 Rapier 构建并在每步做 `Math.fround`，与地形的碰撞逐位一致（见 `apps/server/test/input-queue.test.ts`）；与其他玩家的碰撞只能近似预测，由对账消化。大屏在最差一档（280ms 加尖峰）下 p99 约 10u/s，现场大屏应走有线局域网。以上结果不能替代真机和现场网络彩排。

## 包体与加载

Rapier 0.21 的 WASM 原始约 3MB，compat 包内联为 base64，构建后是独立的 `rapier` 分块（gzip 约 1.6MB）。它由 `initPhysics()` 动态加载，不阻塞页面启动和入场：加载完成前只是暂不发送移动输入，入场、观战和界面都正常。主代码分块 gzip 约 97KB。

## 断线

- 短暂断线：SDK 自动重连同一会话（服务器保留 20 秒），预测状态保留；`minUptime` 调到 1 秒，刚进房也能自动重连。
- 更长断线或自动重连失败：`Connection.recover()` 用本地保存的恢复凭证重新进入，并持续重试，直到房间稳定连上；恢复过程中再次断线时，会由正在运行的同一个循环接着处理。
- 同一玩家在另一个标签页进入时，旧会话以 4100 关闭，不会自动抢回。

## 界面快照节流

锦市几乎每个 tick 都在染色，版本号约每秒 30 次变化。客户端重建 UI 快照的规则：阶段和人数变化时立即重建，其余变化最多每 100ms 重建一次，与旧服务器的合并节奏相同。角色运动不经过快照，直接读 Schema 和预测结果，不受这个节流影响。

## 开发时连接

客户端连接同源的 `/colyseus`，Vite 代理去掉前缀后转给游戏服务（见 `apps/*/vite.config.ts` 的 `gameProxy`）。测试中的 `apps/test/support/game-client.ts` 是测试专用适配层，保留旧的 `call(s, 'room:join', …)` 写法，底层走 Colyseus SDK。
