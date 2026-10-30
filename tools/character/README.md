# 角色资源生成

原始 `.blend` 在主工作区的 `assets/hanfu_boy_animated.blend`，生成时只读取，不覆盖。以下命令在 monorepo 根目录运行，使用 macOS 的 Blender、`sips`、Node 22 和 Chrome。请按本机环境设置 `BLENDER`、`SOURCE` 和（如有需要）`CHROME_PATH`。

```sh
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
SOURCE=/Users/caiyufu/Dev/projects/jinjiang-12/assets/hanfu_boy_animated.blend
"$BLENDER" -b "$SOURCE" -t 4 --python tools/character/export.py -- 0.1 "$PWD/packages/game-client/src/assets/hanfu-boy.glb"
"$BLENDER" -b "$SOURCE" -t 4 --python tools/character/export.py -- 0.05 "$PWD/packages/game-client/src/assets/hanfu-boy-low.glb"
"$BLENDER" -b "$SOURCE" --python tools/character/extract-texture.py -- /tmp/hanfu-base-original.png
sips -z 1024 1024 /tmp/hanfu-base-original.png --out /tmp/hanfu-base.png
node tools/character/mask.mjs /tmp/hanfu-base.png tools/character/hanfu-boy-cloth-mask.png
node tools/character/bake-atlas.mjs
```

蒙版按原角色颜色自动选择衣服区域，不是通用分割算法；换模型或贴图时需重新审核脸、手、腰带和衣服边缘，必要时人工修正。减面会有四骨骼权重截断警告，动作要在游戏中复核。`bake-atlas` 从低精度角色离线生成 8 个方向、行走/跳跃画面及换色蒙版；手机的自己用高精度 GLB，其他玩家和大屏用这些面向镜头的轻量画面。贴图仅提供有限角度，不适用于自由旋转摄像机，增加镜头旋转时需要重新设计。生成品目前未经真机性能验收。


## 运行时压缩（2026-10-30）

`packages/game-client/src/assets/hanfu-boy.glb` 是压缩后的运行版本（4.5MB → 约 0.75MB）：贴图转 WebP、几何体 meshopt 压缩与量化，动画与节点名不变；加载端已启用 `MeshoptDecoder`。从 Blender 重新导出后执行：

```sh
npx @gltf-transform/cli webp hanfu-boy.glb tmp.glb --quality 88
npx @gltf-transform/cli meshopt tmp.glb packages/game-client/src/assets/hanfu-boy.glb
```

运行时读取同名 `.webp`（无损，可见像素与 PNG 完全一致）。重新烘焙图集或蒙版后，用 sharp 以 `webp({ lossless: true, exact: true })` 重新生成对应的 `.webp`。

## 定稿模型导出（2026-10-30）

`assets/models/*.blend` 是定稿源文件，**不入 git**（`.gitignore` 已排除 `assets/**/*.blend`）。运行时用的是导出后的 `packages/game-client/src/assets/models/*.glb`：

```sh
node tools/export-models.mjs              # 全部
node tools/export-models.mjs street_house # 只导出某个
# 源文件不在 assets/models 时：MODELS_DIR=/path/to/models node tools/export-models.mjs
```

流程：Blender（`tools/export-models.py`）去掉相机、灯光、摄影棚地面和参考图，大于 1024 的贴图缩到 1024；两个角色减面到 10%（约 3 万三角形）；再用 gltf-transform 把贴图转 WebP、几何体做 meshopt 压缩。场景模型 0.1–0.24MB/个、2.3k–3k 三角形，角色约 0.77MB/个，全部加起来约 3.5MB。`hanfu_boy_animated`、`hanfu_girl_animated` 导出为 `hanfu_boy.glb`、`hanfu_girl.glb`，保留 `Walk_Cycle`、`Run_Cycle`、`Jump_InPlace`、`Hit_Reaction` 四个动作。

## 运行时角色与资源一览（2026-10-30）

- 自己的角色：`assets/models/hanfu_boy.glb`、`hanfu_girl.glb`（入场时选性别），动作 `Walk_Cycle`、`Run_Cycle`、`Jump_InPlace`、`Hit_Reaction`。衣服换色蒙版：`hanfu-boy-cloth-mask.webp`（沿用原蒙版）、`hanfu-girl-cloth-mask.webp`（按女孩贴图的红色衣服自动生成）。
- 其他玩家与大屏：按玩家所选性别使用 `hanfu-boy-crowd-atlas.webp` / `hanfu-boy-crowd-mask.webp` 或 `hanfu-girl-crowd-atlas.webp` / `hanfu-girl-crowd-mask.webp`，分别由 `hanfu-boy-low.glb`、`hanfu-girl-low.glb` 烘焙的 8 方向精灵图。性别随玩家状态同步给所有客户端。
- `hanfu-*-low.glb`、`tools/character/hanfu-*-cloth-mask.png`、`hanfu-*-crowd-*.png` 只给烘焙工具用，运行时不加载。`node tools/character/bake-atlas.mjs` 会同时烘焙男孩和女孩两套。
