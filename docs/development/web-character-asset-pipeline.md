# 网页角色模型处理方案

日期：2026-10-28。本项目建议用 Blender `.blend` 保存可编辑源文件，游戏运行时使用 glTF 2.0 的 `.glb`。GLB 是 glTF 的二进制容器，能够将网格、材质、贴图、骨架和动画放在同一个文件中；但 GLB 也允许引用外部资源，导出时须确认资源已经嵌入。Three.js 通过 GLTFLoader 加载。格式参考：[Khronos glTF 2.0](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc)、[Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader)。

## 流程

1. 保留 `.blend` 原件并制作工作副本。确认坐标、脚底原点、朝向、比例、骨架、权重、材质和走路/跳跃动画；仅选择角色和骨架导出，不带摄影棚地板、灯光、摄像机与参考图。导出选中对象，使用 GLB、材质与贴图、蒙皮和动画；检查动画名称及循环范围。不要无差别应用会破坏骨架和动画的变换或修改器。材质需检查 Blender 与 glTF 支持的节点差异：[Blender glTF 手册](https://docs.blender.org/manual/en/3.6/addons/import_export/scene_gltf2.html)。
2. 视效果进行网格清理、重拓扑或减面、骨骼权重和贴图优化。不能把极端减面比例当成验收标准，须在面部、手部、衣摆及走跳动画上检查。先尝试 2K 贴图调整到 1K，比较画面，效果和尺寸由实测决定。除面数，还要关注导出后的顶点数、材质/绘制次数和 30 个角色的骨骼动画计算成本。
3. 需要更快加载时可评估 Meshopt 或 Draco 网格压缩；它们主要减少传输大小，不能替代减面。分别测下载、解码和运行性能。KTX2/Basis 可供贴图压缩选择，需 GLTFLoader 配置 KTX2Loader 和转码器、检查目标设备兼容；其价值包括降低 GPU 贴图内存，但也引入构建和运行时复杂度。资源优化工具参见 [glTF Transform](https://gltf-transform.dev/) 和 [KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html)。
4. 客户端只加载一次资源，共享几何与材质，并用 `SkeletonUtils.clone` 为每个角色建立独立骨架；按服务端位置和朝向更新，按移动和跳跃状态切换动画。视觉动画不可驱动或改写服务端碰撞与真实位置。调整模型的脚底与当前角色碰撞体的对应关系，以及动画播放时长和身份/队伍标记。[Three.js SkeletonUtils](https://threejs.org/docs/pages/module-SkeletonUtils)。
5. 人多时优先测量后再选择优化手段，如更低面数版本、远处关闭骨骼动画或隐藏屏幕外人物。每台手机需渲染自己可见的其他玩家，不是只有本地一名角色的成本。
6. 验证加载成功及贴图、透明、法线、方向；站立、走、跳动作和切换，位置同步与碰撞体一致；2 人与最多 30 人、真实游戏场景、移动设备模拟及有条件时真机的帧时间、资源加载时长、内存和异常；记录最低机型、测试场景和可接受门槛，不能把本机软件渲染结果当作手机帧率。

## 当前角色实测

本地已用 Blender 导出并通过 Three.js 在浏览器中播放走和跳。原版约 30 万三角面；临时自动减面至 1.5 万面时面部和衣物有明显损坏，3 万面预览大体可用但未通过游戏内验收。临时 GLB 使用现有贴图约 10.9 MiB，且减面导出出现超过 4 骨骼权重截断提示，应检查变形。30 个带骨骼动画实例的电脑浏览器软件渲染压力测试仅提供相对比较，不代表手机表现。[测试报告与预览](reports/hanfu-boy-assessment-2026-10-28.md)。
