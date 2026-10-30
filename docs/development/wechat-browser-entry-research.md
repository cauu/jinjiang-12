# 微信扫码入场与全屏调研

调研日期：2026-10-28。本文是演示方案建议，并非真机测试报告；不同微信版本、浏览器和手机需要实测。

## 结论

现有 H5 不应依赖微信内置浏览器隐藏微信导航栏。腾讯云的[全屏播放说明](https://cloud.tencent.com/document/product/266/35900)指出，部分安卓微信 X5 环境不支持网页 Fullscreen API；其 `webkitEnterFullScreen` 是视频全屏，不能用来承载带摇杆的整个网页游戏。该文是播放器兼容性资料，不代表每个当前微信版本都完全相同。

安卓：微信识别后在入场前引导用户用右上角菜单选择在浏览器打开；菜单名称或是否有此项须按设备验证。系统浏览器在支持 Fullscreen API 时，可由点击入场或全屏按钮触发，具体结果以实际调用结果为准。Fullscreen 请求需要用户操作，可能被拒绝，不能保证所有安卓浏览器都成功。参考 [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)。

iPhone：切换到 Safari 不能保证普通网页游戏真全屏。WebKit 的 [iPhone 元素全屏问题](https://bugs.webkit.org/show_bug.cgi?id=328773)近期仍记录该限制，须按版本实测。Safari 添加到主屏幕并以 Web App 打开是另一个选项，操作步骤见 [Apple 支持](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)，需要人工多步操作；实际画面、安全区、链接参数与存储隔离需验证，不保证无任何系统界面。可作为现场需要大画面的备用路径，不建议未经测试将其当作一分钟内入场的默认方案。

如果需要在微信里获得更接近原生游戏的横屏体验，可评估微信小游戏；需要平台接入及将 DOM、触控、媒体、网络和 Three.js 等适配到相应运行时，不是简单网页开关，也不能预先承诺隐藏所有平台控件。横屏配置参见 [Galacean 微信小游戏导出文档](https://www.galacean.com/engine/docs/platform/wechatMiniGame/)。

## 建议入口流程

1. 大屏二维码仍包含完整的房间链接。微信识别只用于引导，浏览器 UA 并不可靠，需要设误判的应对方案；全屏根据实际能力和调用结果判断。参考 [MDN UA 检测](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Browser_detection_using_the_user_agent)。
2. 微信中先展示清晰的步骤：点击右上角「…」，选择「在浏览器中打开」（实际菜单以微信版本为准）。若没有该选项，显示完整可选中的房间链接，让玩家手动复制到浏览器；不可宣称页面能强制启动外部浏览器。可另建议现场用手机自带相机扫码，根据系统提示打开链接，需按设备实测。
3. 外部浏览器保留 `room` 参数，先确认房间有效，再输入昵称加入；安卓支持时用入场点击尝试全屏，失败后允许手动重试或在当前可视区域继续。苹果手机优先推荐 Safari 并实事求是显示空间有限，不能说切换后一定全屏。
4. 引导发生在创建身份之前。现有匿名身份存储在浏览器 Local Storage，微信与外部浏览器之间不能假定共享；一旦先在微信入场再切换，可能创建第二个玩家，不能自动继承断线恢复凭据。若日后需要跨浏览器切换同一身份，需要单独设计一次性迁移流程及其有效期和错误处理。参考 [MDN 存储隔离](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)。
5. 当前局域网地址是 HTTP 私网 IP，不能假设剪贴板 API 可用：`navigator.clipboard.writeText` 需要安全上下文；应提供可长按选择的文本作为兜底。正式部署可评估 HTTPS 和稳定域名，仍需考虑现场网络能否访问。参考 [Clipboard.writeText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText) 和[安全上下文](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts)。

按当前偏好，识别出微信内置浏览器后只展示引导，不提供微信内直接入场；遇到菜单缺失时提供手动复制、相机扫码和人工协助。UA 识别并非可靠的安全边界，需为误判准备人工排障，不能把识别结果当作外部浏览器已验证的证明。

## 建议验收

在现场 Wi-Fi 和最终部署地址上，使用至少 10 台真实手机（覆盖 iOS 和安卓及多种微信版本），逐台记录：扫码后入口、菜单是否存在、是否保留房间号、昵称入场结果、进入用时、全屏调用结果及截图、横屏可操作性、断线后同一浏览器恢复、以及视频显示。单独统计安卓浏览器成功全屏率和 iPhone 实际可用视口；不要把模拟器通过、进入外部浏览器或网页铺满可视区域误记为真机全屏通过。验收阈值需与项目方确认后纳入正式清单。
