# Cursor Grok 4.7 竖屏入场复核

我先只读核对竖屏入场相关的样式、游戏逻辑和测试，确认现在能否入场以及入场后是否会显示横屏提示。竖屏入场不再被「请横过手机」挡住；加入成功并把入场层关掉之后，竖屏才会把这块遮罩显示出来。这是样式和测试断言能对上的行为，不是真机验收。

`.rotate` 默认 `display: none`，只在 `(orientation: portrait)` 里变成铺满屏幕的遮罩（`position: fixed; inset: 0; z-index: 20`，文案是「请横过手机」）。入场层在 DOM 里排在它前面。后面这条规则特异性更高：

```13:13:apps/mobile/src/style.css
.entry:not([hidden]) ~ .rotate{display:none}
```

只要 `#entry` 还没有 `hidden`，竖屏也会把遮罩关掉，昵称表单可以点。`game.ts` 只在 `join` 成功或本地会话 `resume` 成功时执行 `entry.hidden = true`。入场层一隐藏，这条覆盖失效，竖屏遮罩重新出现；横屏仍走默认的 `display: none`。

`apps/test/browser-entry-guide.test.ts` 用 Chromium 加 iPhone Safari UA，视口 `390×844`，断言入场时 `.rotate` 不可见，填名并点击「进入游戏」、等 `#entry` 隐藏后，再断言 `.rotate` 可见，并确认服务端有一名「Safari 玩家」。这一轮我没有重跑这条测试。仓库报告写的是该文件与另外两项测试曾顺序通过。

仍未验证的部分：

- 真机 Safari / 微信 / 安卓浏览器的方向、地址栏和安全区。测试是桌面 Chromium 改视口，不是 WebKit，也不是设备旋转。
- 加入后转到横屏时遮罩是否消失。脚本把视口改成 `844×300` 后只点了全屏，没有再断言 `.rotate`。
- 遮罩文案、它是否挡住摇杆，以及竖屏表单是否完整落在首屏里。
- 安卓非微信竖屏入场、会话恢复后直接看到横屏提示、微信引导页。微信路径不加载 `game.ts`，因此没有这块遮罩。
