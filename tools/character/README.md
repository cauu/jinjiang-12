# 角色资源生成

原始 `.blend` 在主工作区的 `assets/hanfu_boy_animated.blend`，生成时只读取，不覆盖。以下命令在 monorepo 根目录运行，使用 macOS 的 Blender、`sips`、Node 22 和 Chrome。请按本机环境设置 `BLENDER`、`SOURCE` 和（如有需要）`CHROME_PATH`。

```sh
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
SOURCE=/Users/caiyufu/Dev/projects/jinjiang-12/assets/hanfu_boy_animated.blend
"$BLENDER" -b "$SOURCE" -t 4 --python tools/character/export.py -- 0.1 "$PWD/packages/game-client/src/assets/hanfu-boy.glb"
"$BLENDER" -b "$SOURCE" -t 4 --python tools/character/export.py -- 0.05 "$PWD/packages/game-client/src/assets/hanfu-boy-low.glb"
"$BLENDER" -b "$SOURCE" --python tools/character/extract-texture.py -- /tmp/hanfu-base-original.png
sips -z 1024 1024 /tmp/hanfu-base-original.png --out /tmp/hanfu-base.png
node tools/character/mask.mjs /tmp/hanfu-base.png packages/game-client/src/assets/hanfu-cloth-mask.png
node tools/character/bake-atlas.mjs
```

蒙版按原角色颜色自动选择衣服区域，不是通用分割算法；换模型或贴图时需重新审核脸、手、腰带和衣服边缘，必要时人工修正。减面会有四骨骼权重截断警告，动作要在游戏中复核。`bake-atlas` 从低精度角色离线生成 8 个方向、行走/跳跃画面及换色蒙版；手机的自己用高精度 GLB，其他玩家和大屏用这些面向镜头的轻量画面。贴图仅提供有限角度，不适用于自由旋转摄像机，增加镜头旋转时需要重新设计。生成品目前未经真机性能验收。
