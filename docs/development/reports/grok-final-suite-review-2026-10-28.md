# Grok 4.7 完整自动化套件复验

模型：Cursor grok-4.7-low；模式：只读。原始结果如下。

我按独立验收人只读复核这些文档和日志，先核对 35 项、30 局浏览器结果和录像诊断，再单独列出日志错误、未满足的 P0 和真机真人项。**整体验收未通过。** `acceptance-final-2026-10-28.log` 是 35 项自动化全过，不能代替 P0 全项、第 3 节关卡边界、第 6 节现场，以及手机体验清单 V01–V10。

## 35 项与 30 浏览器整局

`acceptance-final-2026-10-28.log` 末尾为 `tests 35`、`pass 35`、`fail 0`、`skipped 0`，总时长约 694 秒。30 人默认时长整局是其中第 23 项 `browser users play a default-duration match without host skips`（`ok 23`，约 391 秒），诊断行为「30 browsers completed 6 levels and saw 冠军：玩家1」。第 35 项只是 30 个浏览器入房并开局，日志自己写明不是六关整局。

`acceptance-final-progress-2026-10-28.log` 与这场对齐：房间 `44bec874-4ad2-4d80-bd48-ce97369c48bf`，`2026-10-27T16:58:39Z` 入房，`17:05:04Z` 记通过。关卡顺序为锦市、灯市、七宝市、市散、酒市、桂市。在场操作人数为 **30、23、16、10、10、6**，冠军为玩家1。市散可操作约 2 秒、桂市约 1 秒，符合短摇杆，不能当成各关目标已由界面完成。

同一次 35 项里没有 2 人和 10 人整局。那两次在更早的 `full-browser-2-latest` / `full-browser-10-latest`，不在本份最终日志内。

## 录像诊断

修正与当前代码一致，但**这份通过日志仍是修正前的文字**。

日志第 226–231 行六关都写 `captured desktop browser opening, movement and jump`。`six-level-camera-evidence.test.ts` 现在只有设置了 `CAMERA_EVIDENCE_DIR` 才 `recordVideo`、截图并保存 webm；诊断改为 `video and screenshot saved`，否则是 `no video or screenshot saved`。`acceptance.md` 第 85 条写明：该次未指定录像目录却印了 captured，之后只改了诊断文字，没有新存六关短片；旧片仍在 `camera-six-level-v3/`。因此不能把本份日志里的 captured 当成新录像证据。

## 日志里的错误

用例失败数为 0，日志并非无错误：

- `Port 5173 is in use, trying another one...` 出现 4 次（约在第 19、23、30、35 项附近）。
- `Error: read ECONNRESET`（Vite `ws proxy socket error`）共 **5 次**：30 人整局 `ok 23` 之前 4 次，镜头/观战用例之后、第 35 项之前再 1 次，都在收尾阶段。

## 仍未满足的 P0 与真机真人

按 `acceptance.md` 与 `mobile-experience-acceptance.md`，下列不能标通过：

- **A01**：局域网可扫码地址、两会话进房且与大屏一致，重复 10 次；真机微信扫码另计第 6 节。
- **A04 的目标完成度**：30 人六关结果和冠军一致只证明短手势下整局能跑完；涂色面积、答题、拾取交子、送粮、桂市抵达终点未由这次整局证明。2/10 人不在本份 35 项里。
- **第 3 节**：六关模式、边界和并列规则没有被这一轮整局覆盖。套件里的关卡用例是分项，且多条用跳关或服务端快照，不能并成整节通过。
- **第 4 节**：逐输入精确回放仍未实现；被丢弃的跳跃不会自动重发。
- **第 6 节**：至少 10 台 iOS/安卓、现场 Wi-Fi、微信扫码、真实大屏、默认规则 2 次整局、按秒 FPS（95% 采样秒 ≥30）、重启与重新扫码。无设备则应标未执行。
- **V01–V10 全部未执行**（体验清单状态仍是「尚未执行」）：真机角色在画面内、四向跟随各 10 次、遮挡、双手触控（不得用鼠标代替）、安全区、真机触摸到首帧 P95≤150ms、真机帧时间、10 台可读性、至少 10 名未参与研发的试玩者及问卷。
