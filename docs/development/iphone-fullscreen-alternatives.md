# iPhone 全屏的其他方案

调研日期：2026-10-28。以下比较微信小游戏、iOS App 和 App Clip；它们不同于 Safari 中隐藏工具栏或从主屏幕运行 Web App。均未对本项目完成接入或真机验证。

## 1. 微信小游戏

小游戏使用微信的游戏运行环境，可配置横屏。体验目标是微信扫码进入、游戏画面占据主要屏幕；仍需给平台和系统控件留安全区，不能承诺完全不显示任何系统界面。参考 [Galacean 小游戏平台配置](https://www.galacean.com/engine/docs/platform/wechatMiniGame/)。

需要小游戏账号、平台相应权限和发布流程；已有公众号不能证明已具备小游戏账号、发布资质或免审核。开发工具里的体验、对外发布的审核和网络规则应分别确认。

现有服务器逻辑和协议可作为复用基础，但现有手机页面直接使用 DOM、HTML 视频、Pointer Events、localStorage、Socket.IO 浏览器客户端和 Three.js，不能简单当 H5 页面直接嵌入就完成小游戏。需要验证图形适配、网络传输、视频、身份存储和双指触控；不能保证现有库无改动兼容。微信开源的 [Three.js 小程序适配版本](https://github.com/wechat-miniprogram/threejs-miniprogram)是小程序适配示例，README 指向 Three.js 0.108.0；它不能证明与本项目或小游戏运行时兼容。

建议先用小范围技术验证，跑通 iPhone 与安卓进入同一真实房间、触控移动、1 个视频和断线重连，再估算六关迁移工作量。需要逐项核实小游戏扫码打开方式、可用合法域名、连接和发布条件。

## 2. iOS 原生 App / WebView 外壳

设计一个横屏原生应用承载现有网页，目标是不显示 Safari 的地址栏和工具栏。原生应用可调整状态栏和系统手势，但 iOS 仍控制 Home 指示条，自动隐藏是系统决定，不能承诺完全没有系统控件。参见 [Apple 全屏指南](https://developer.apple.com/design/human-interface-guidelines/going-full-screen)和 [Home 指示条 API](https://developer.apple.com/documentation/uikit/uiviewcontroller/prefershomeindicatorautohidden)。

此方案可以尝试复用现有前端，但 WKWebView 的 WebGL 性能、双指、视频、横屏、Socket.IO、身份存储和重新进入都必须通过实际测试；无需推翻后端并不意味着兼容性已经证实。手机访问当前局域网服务器时需要检查 iOS 局域网权限、HTTP 加载与网络策略，参考 [Apple 局域网说明](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)。

分发代价：

- 使用 TestFlight，玩家需安装 TestFlight 和测试 App；外部测试首个版本需审核。[Apple TestFlight](https://developer.apple.com/testflight/)
- 对预先登记的固定设备可用 Ad Hoc 分发，不需要 beta 审核，但要预先收集设备标识并完成签名和安装；每个设备类别每会员年最多登记 100 台。[Apple 设备管理](https://developer.apple.com/help/account/devices/devices-overview/)
- TestFlight 等分发需要合适的开发者账号；Apple Developer Program 现列价每年 99 美元或当地价格。[Apple 会员信息](https://developer.apple.com/programs/)
- 简单网页外壳提交 App Store 或外部测试存在审核风险；[App Review 4.2](https://developer.apple.com/app-store/review/guidelines/)要求提供超出重新包装网站的功能和体验，不能保证审批结果。

## 3. Apple App Clip

App Clip 可以在 iPhone 上通过系统支持的 QR 等入口触发，下载并启动轻量 App 体验，无需安装完整 App；默认 App Clip 链接可支持参数。参见 [App Clip 概览](https://developer.apple.com/help/app-store-connect/offer-app-clip-experiences/overview-of-app-clips)和[启动配置](https://developer.apple.com/documentation/AppClip/configuring-the-launch-experience-of-your-app-clip)。微信扫一扫是否直接识别并启动需真机核验，不能假设与系统相机一样。

对本项目存在两个关键限制：Apple 明确表示 [App Clip 不可进行局域网操作](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)，因此不能直接连接目前 `192.168.x.x` 的局域网服务；需要可从公网访问的后端。Apple 的 [App Clip 设计指南](https://developer.apple.com/design/human-interface-guidelines/app-clips)还建议避免使用 WebView，只有网页组件时引导到网站。因此，直接把现有 H5 包成 App Clip 存在明确的平台适配及审核风险；此外要处理开发者账号、签名、发布审核及不同入口大小限制。测试过程使用 TestFlight 和正式公开入口的流程不同，不能假定已获批准。

## 当前建议

如果目标是公众使用微信扫码且接受适配成本，先验证微信小游戏。若可预先安排固定的 iPhone 和开发者账号，可以验证 WebView 原生外壳加 Ad Hoc；若面对临时加入的 30 人，需要把注册或 TestFlight 安装、审批时间计入现场流程。App Clip 更接近扫码即用，但不适合不改变当前局域网架构的快速实现。所有选项仍需实机验证，不代表项目已经满足全屏或完整游戏验收。
