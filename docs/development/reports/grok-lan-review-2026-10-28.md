# Grok 4.7 局域网及二维码复验

模型：Cursor grok-4.7-low；模式：只读。原始结果如下。

我按只读方式核对 A01 的局域网地址和二维码：先读测试、日志和评审记录，再对照实现看解码结果是否与地址一致。测试和日志比旧评审更新。我再对一下大屏如何生成加入地址和二维码，确认断言对得上。这次日志证明的是：本机无头 Chrome 在 `192.168.30.25` 上把二维码像素解码成与 `#joinurl` 相同的地址，并完成 10 轮、每轮 2 个浏览器上下文进房。这不是真机、跨设备或微信扫码通过。

## 二维码与地址

`apps/display/src/main.ts` 用当前页面地址改端口，写入 `#joinurl`，再把同一字符串交给 `QRCode.toDataURL` 放进 `#qr img`。

`apps/test/entry-repeat.test.ts` 把该图绘到 canvas，用 `jsQR` 解码，并断言：

- `decoded.data` 等于 `#joinurl` 的文本
- 该 URL 的 hostname 等于 `JINJIANG_LAN_HOST`（未设置时为 `127.0.0.1`）
- URL 含当前 `room`

日志诊断行是：`10/10 two-session browser entries passed at 192.168.30.25; QR image decoded`。用例 `ok`，`pass 1`，`fail 0`，约 21.3 秒。进房仍是 `page.goto(url)`，用的是页面上的文字地址，不是扫码结果。

`docs/development/reports/grok-entry-review-2026-10-28.md` 写的是回环地址、未解码二维码，和当前测试与这份日志不一致，不能拿来描述这次运行。

## 次数

`round` 从 1 到 10。每轮新建 2 个浏览器上下文，名称是 `第N次玩家1`、`第N次玩家2`，等到大屏 `#count` 为 `2` 且两个名字出现，关闭上下文后再等到 `0`。同一个无头 Chrome 进程，不是两台设备。

## 仍未覆盖

诊断行写明：`physical QR scanning and another device are not covered`。没有另一台设备访问 `192.168.30.25`，也没有微信相机扫这张图。

## 日志异常

通过，但不是干净日志：

- 两次 `Re-optimizing dependencies because lockfile has changed`
- 一次 `Port 5173 is in use, trying another one...`（测试把端口设为 `0`，这条是端口被占用后的改口，不是失败）

这份日志里没有 `ECONNRESET`。旧评审里的两次 `read ECONNRESET` 不属于这次运行。
