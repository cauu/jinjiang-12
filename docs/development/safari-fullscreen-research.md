# iPhone Safari 全屏与入场调研

日期：2026-10-28。范围是 iPhone 上有交互控件的网页游戏，不等同于视频播放器全屏。

## 文档证据

- 普通 Safari 标签页：WebKit 的 [iPhone 普通网页元素全屏反馈](https://bugs.webkit.org/show_bug.cgi?id=328773)在 2026-10-24 被标记为尚未解决的 [206854](https://bugs.webkit.org/show_bug.cgi?id=206854) 的重复问题。其报告者称普通网页 `requestFullscreen` 在 iPhone 不可用，视频自身全屏使用的是另一条路径。应做能力检测并以实际设备为准，不将某个设备结果推广为全部版本。
- 手动隐藏工具栏：Apple [iPhone Safari 显示控制说明](https://support.apple.com/zh-cn/guide/iphone/-iphb3100d149/ios)说明通过页面菜单选择“隐藏工具栏”；该动作由用户执行，仍不能当作网页 API 全屏。
- 主屏幕 Web App：Apple [添加到主屏幕说明](https://support.apple.com/zh-cn/guide/iphone/iphea86e5236/ios)给出 Safari 分享后添加的操作步骤。Apple [WWDC Web App 说明](https://developer.apple.com/videos/play/wwdc2023/10120/)称 standalone 模式不显示浏览器工具栏，且 iOS 主屏幕 Web App 与浏览器的 cookie 和存储分开。仍需处理系统安全区和实际设备表现。
- 版本差异：WebKit [Safari 26 发布说明](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)称 iOS 26 添加到主屏幕默认作为 Web App 打开，用户可以关闭该选项；旧版可通过 manifest 的 `display` 或 Apple 的兼容 meta 标记请求 Web App 模式。不同版本操作路径应实测。
- 房间参数：Apple 的 WWDC 说明中，manifest `start_url` 决定从图标首次打开的地址。不能假定从扫码网址进入 Safari 后，再从主屏幕打开时仍保留当前 room 参数；本项目目前通过查询参数读取 room，且 session 保存在 localStorage。若采用 Web App，需针对当前单房间提供查询当前房间的入场流程，或设计输入短房间码，并在 Web App 内创建/恢复身份。
- iPad 的 Safari 对普通网页元素全屏有支持，但需要用户触发，状态栏和控制区域仍可能占用或遮挡画面；参见 [WebKit iPad 全屏问题](https://bugs.webkit.org/show_bug.cgi?id=272392)。本次未验证 iPad。

## 本机模拟器验证

使用 Xcode iPhone 16 Pro 模拟器、iOS 18.5，在模拟器 Safari 中打开本机独立测试页面（不是游戏页面）。

1. Safari 标签页中，测试页显示 `document.fullscreenEnabled` 与 `document.documentElement.requestFullscreen` 均为 `undefined`；手动点击全屏按钮得到 TypeError，未进入网页全屏。
2. 旋转为横屏后，Safari 的完整工具栏出现在上方。用户手动操作“页面菜单 → 更多 → Hide Toolbar”，工具栏收起，顶部仍有一条显示地址的小条，底部保留系统手势条。界面比完整工具栏时更大，但不是无系统界面的全屏。
3. 分享面板可以打开，但自动化未能滚动到“添加到主屏幕”，因此本次**没有完成**主屏幕 Web App 的模拟器入场、房间参数或存储隔离实测。上述 Web App 能力来自 Apple 资料，不应当成对本项目的验证。

模拟器不等于真机；未验证真实微信、最新 iOS、Safari 操作中触控是否意外恢复工具栏，以及视频、断线和游戏性能。研究使用独立临时测试页，没有修改项目产品代码。

## 方案建议

- 黑客松默认：微信扫码后引导在 Safari 中打开；在 iPhone 上给出可选的“页面菜单 → 更多 → 隐藏工具栏”图示，随后直接加入。无需安装，但保留少量浏览器和系统界面，且必须验证摇杆操作时工具栏是否干扰。
- 如果必须去除 Safari 工具栏：评估引导“添加到主屏幕 → 打开 Web App”，并先解决单房间发现、跨存储身份、横屏安全区与真实设备验证。不能承诺所有系统条都消失，也不能假设添加时的 room 参数一定沿用。
- 验收：在真实 iPhone 上记录机型、iOS 版本与 Safari 版本；分别验证普通网页、手动隐藏工具栏、主屏幕 Web App 的地址栏、可视区域、横屏控制、视频、重连、房间定位和完整入场所需时间。每种模式的结果分开记录。
