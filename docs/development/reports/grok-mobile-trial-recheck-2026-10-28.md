# Cursor Grok 4.7 手机修复复核

我按只读方式对照上一轮复核报告和当前手机端源码、样式与测试，核对哪些问题已经落地、哪些还缺、哪些不能当作真机验收。对照 `docs/development/reports/grok-mobile-trial-review-2026-10-28.md` 里点名的缺口，当前源码里摇杆失捕获、全屏提示叠层和连续定时器这几处已经改过。键盘顶起可视区、视频是否被视口裁切、全屏失败的真实原因，仍然没有被测到。这次只读了源码和测试，没有跑测试，也没有真机验收。

## 已在源码里补上

**摇杆丢掉指针捕获会停。** `lostpointercapture` 和 `pointerup`、`pointercancel` 一样走 `stop`，把 `x`/`z` 清零并再发一次输入。测试在捕获丢失后再等 400ms，断言服务端 `x` 变化小于 0.2。

**全屏提示不再盖住边界提示，连续失败也不会被前一个定时器提前关掉。** `#fullscreen-notice` 改到底部，`#boundary-alert` 仍在顶部。`showFullscreenNotice` 会先 `clearTimeout`。文案是「无法切换全屏，可继续试玩」，不再写成「当前浏览器不支持全屏」。退出全屏失败也会走这条提示。

**短视口入场多了两档尺寸。** 测试在 667×230 和 844×390 上检查 `--visible-height` 与面板包围盒，再回到 920×280。这是改布局视口，不是模拟软键盘。

## 仍缺失

**游戏画面和摇杆仍钉在布局视口上。** `--visible-top` / `--visible-height` 只用于 `.entry`。`#stage`、`#message`、摇杆仍是相对布局视口的 `position: fixed`。`SceneView.resize` 只听 `window.resize`，不听 `visualViewport`。`html, body { overflow: hidden }` 还在。软键盘把可视区压矮时，视频和摇杆不会跟着缩。

**全屏失败仍是一条路。** `fullscreenEnabled === false`、没有 `requestFullscreen`、调用被拒绝，都进同一个 `catch`。入场仍是 `enterFullscreen(false)`，失败不提示。会话恢复不进全屏。没有 `webkit` 前缀。

**边界提示仍要「位置超过 ±9.3 且摇杆朝外」。** 贴在钳制边上、摇杆回中或沿边滑时，提示会消失。提示读的是 `connection.world` 或快照里的头像坐标，不是 `SceneView` 里已经钳到 ±9.6 的本地预测。

**键盘两个行为还在。** 焦点不在输入框时，方向键仍 `preventDefault`。空格的 `keyup` 不看焦点，只要键是空格就把跳跃松开。

## 未证实

测试仍只守住一条成功路径，外加按钮在 `fullscreenEnabled = false` 时出现提示，以及摇杆 `releasePointerCapture` 后停住。下面这些报告里写过、现在代码或测试都没有证据：

- 没有把 `visualViewport` 单独压矮，也没有断言摇杆和视频的包围盒留在可视区内。
- 没有量视频显示宽高比。`object-fit: contain` 被断言了，元素被视口裁切时测试仍会过。
- 没测入场全屏失败保持沉默、提示 4 秒后消失、连续点击互相取消、`requestFullscreen()` 被拒绝，以及带前缀的旧实现。
- 边界只推了 +X。没有 -X / Z，也没有贴边后松摇杆时提示应消失。
- 没有键盘移动、空格跳、输入框内按键不应抢操作的用例。
- 截图仍写到 `/tmp`，不参与断言。

这次没有执行 `mobile-viewport-touch.test.ts`，也没有在真实手机、微信、系统软键盘或现场网络上复测。源码和测试这样写，不能当成这些缺口已经在真机上修好。
