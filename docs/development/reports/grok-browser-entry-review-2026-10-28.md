# Cursor Grok 4.7 入场引导只读复核

我按只读方式核对这次微信引导和 Safari 入场改动，先看这四个文件里的连接时机、房间信息和加入路径。微信内置浏览器这条路径不会提前连上服务器，也不会创建玩家。普通安卓浏览器和 Safari 的加入、重连代码还在，但竖屏会被旧的横屏遮罩挡住；当前测试证明不了真机复制、竖屏排版和重连。

## 微信不会提前连接或建玩家

`apps/mobile/src/main.ts` 只要 UA 含 `MicroMessenger`，就只画引导页，不执行 `import('./game.js')`。`Connection` 和 `new SceneView` 都在 `game.ts` 里，所以这条路径不会创建 Socket，也不会调用 `join` 或 `resume`。`packages/game-client` 里的 Socket 还是 `autoConnect: false`，只有 `join` / `resume` 才会 `connect()`，这段代码微信路径根本加载不到。

测试用无效的 `localStorage['jinjiang-session']='saved-session'` 做旁证：`game.ts` 一旦运行，`JSON.parse` 失败就会删掉这个键。断言它仍在，比 `players.size === 0` 更能说明游戏模块没跑。`#stage` 和 `form` 数量为 0 也一致。测试没有监听 Socket.IO 握手，玩家数为 0 单独不能证明「没连上」，但和 localStorage 一起看，当前实现是没连上。

## 房间链接和复制失败

链接用的是 `location.href`，查询串、`room` 和 hash 会原样留下。测试 URL `/?room=...&demo=1#join` 被完整写进 `#join-link`。页面自己不另造房间地址：微信里打开的地址如果已经丢掉 `room`，复制出去后，Safari 仍会走 `game.ts` 里的「请扫描大屏二维码进入」。

复制失败有兜底。没有 `navigator.clipboard.writeText`，或 `writeText` 抛错时，会 `focus` + `select`，并把 `#copy-result` 设为「请长按上方链接并复制……」。测试只把 `clipboard` 定义成 `undefined`，所以只覆盖了这条失败文案，没有覆盖复制成功，也没有断言选区是否真的选中。微信里 `select()` 经常选不中只读输入框，兜底实际取决于用户能否长按该输入框。

## 安卓浏览器和 Safari 的加入 / 重连

不含 `MicroMessenger` 的 UA 仍会加载 `game.ts`。加入仍是 `connection.join`，同房间的 `jinjiang-session` 仍会 `resume`，断线后的 `session:resume` 也还在。Safari 提示的条件是 iPhone/iPod、Safari、且排除 CriOS/FxiOS/EdgiOS/OPiOS，并且 `document.fullscreenEnabled === false`。命中时提交表单不会调用全屏，全屏按钮只显示「隐藏工具栏」。安卓 Chrome 的 UA 带有 `Safari` 字样，但没有 iPhone/iPod，不会走进这个分支，提交时仍会尝试全屏，失败只提示，不挡住 `join`。

这次测试没有普通安卓 Chrome，没有带合法 session 的重连，也没有 iOS Chrome。桌面 Chromium 加 UA 伪装不能代表系统浏览器。

## 竖屏和横屏

微信引导不挂载 `.rotate`。`.browser-guide` 是 `position: fixed; overflow: auto`，矮屏有 `max-height: 400px` 的字号收缩，竖屏和约 250px 高的横屏都可以滚动操作。测试在 390×844 和 844×250 上点了复制，但没有量按钮是否在首屏内、有没有被裁切。

非微信页面仍有这条旧规则：

```1:1:apps/mobile/src/style.css
.rotate{display:none}@media (orientation:portrait){.rotate{display:grid;...;z-index:20}}
```

`.entry` 的 `z-index` 是 10，遮罩没有 `pointer-events: none`。竖屏时「请横过手机」盖住昵称表单，安卓浏览器和 iPhone Safari 都填不了名字。Safari 用例的视口是 844×300，刚好避开这条遮罩。

可复现：用 iPhone Safari 的 UA，视口 390×844 打开 `/?room=<id>`，入场表单在遮罩下面，点不到「进入游戏」。转到横屏后遮罩消失，表单可以提交。

## 测试覆盖不到的地方

`apps/test/browser-entry-guide.test.ts` 只用 Chromium（SwiftShader），没有 WebKit。一个用例里做了三件事：iOS 微信竖屏、安卓微信矮横屏、伪装的 iPhone Safari 横屏加入。Safari 能建一名玩家并看到全屏提示，是因为脚本把 `fullscreenEnabled` 写成了 `false`。

没有覆盖：复制成功、`writeText` 被拒绝、选区、Socket 握手次数、安卓 Chrome 加入、session 重连、竖屏遮罩、以及引导卡在矮屏是否需要滚动。这不能当作真机验收。
