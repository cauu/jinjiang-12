// 锦江十二月市 · 白模流程蓝图数据
// 玩法数值来自 levels/*.md；道具摆位、尺寸、命名为本蓝图的简化建议（蛋仔派对式），U01 冻结前可改。
// 坐标：米，Y 向上；平台中心为原点；镜头朝北（-z 为北）；tile(col,row) 中心 = (col-9.5, row-9.5)。

window.BP = (function () {
  const OWNERS = {
    U: { name: '你 · 玩法/程序', color: '#4fd1c5' },
    A: { name: '同学A · 3D美术', color: '#f6a04d' },
    B: { name: '同学B · 二维/媒体', color: '#6aa8ff' },
  };

  const TEAM = ['#c8402f', '#2f5fae', '#e3b53b', '#2f6b4f'];
  const BODY = ['#e8584a', '#3d7be0', '#f2c230', '#3aa66b', '#9b59d0', '#f08c2e', '#2bb5c4', '#e85a9b'];

  // ── 简化原则（蛋仔派对式：浮空纸台 + 一个地标 + 复用套件）──
  const SIMPLIFY = [
    '浮空纸台：20×20 玩法台悬在云海/水面上，外围不铺整条街；四周 2m 只放围栏和 1–2 个小件。',
    '北侧地标台：每关只在镜头正前方（北）放 1 个地标 + 1–2 个套件，一眼认出是哪个市。',
    '每关新做 ≤2 个模型；摊位、彩旗、灯笼、纸树、围栏全部用通用套件换色/换招牌贴图。',
    '不做 3D 群众：热闹感 = B 的纸板剪影立牌（平面贴图）+ 远景卷轴里的人流。',
    '角色 = 1 个圆胖纸人（头大身小、身体程序染色）+ 每关一顶帽子；不做朝代服装体系。',
    '概念图只取配色、纸质感和地标造型，不照搬元素密度。',
  ];

  // 通用套件：A 只做一次，所有关复用
  const KIT = [
    { id: 'char_paperbuddy', name: '纸人角色（圆胖、分件）', o: 'A', task: 'A02', p: 'P0', note: '节点 root/head/body/arm_l/arm_r/leg_l/leg_r；身高≈1.0m（含头），头占约45%；身体颜色程序改' },
    { id: 'hat_han / hat_tang / hat_song / hat_yuan / hat_qing', name: '五顶帽子 + 桂冠 crown_osmanthus', o: 'A', task: 'A02', p: 'P0', note: '挂在 head 节点；每顶≤500面' },
    { id: 'kit_fence', name: '纸围栏 1m 段（高 0.8 / 矮 0.6 两种）', o: 'A', task: 'A01', p: 'P0', note: '程序沿平台边拼接' },
    { id: 'kit_stall', name: '通用摊位', o: 'A', task: 'A01', p: 'P0', note: '顶棚可换色、正面留 1×0.5m 招牌贴图位（B 出字）；3×2.4×2.5m' },
    { id: 'kit_bunting', name: '纸幡/彩旗串 4m', o: 'A', task: 'A01', p: 'P0', note: '两端挂点；可换色' },
    { id: 'kit_lantern', name: '纸灯笼（可缩放、可发光）', o: 'A', task: 'A01', p: 'P0', note: '自发光强度由程序调；灯市选择灯/题目灯也用它' },
    { id: 'kit_tree', name: '纸树（换花色：普通/灯树/桂树）', o: 'A', task: 'A01', p: 'P0', note: '2×4×2m 基准，可缩放' },
    { id: 'kit_cutout', name: '纸板剪影立牌（平面）', o: 'B', task: 'B03', p: 'P0', note: '透明 PNG 贴在立牌上，2.4×1.6m；每关 2 张人群剪影，替代 3D 群众' },
    { id: 'kit_platform', name: '纸台台身/台边', o: 'A', task: 'A01', p: 'P0', note: '厚 1.2m 纸层台身；地格贴图另交' },
  ];


  // ── 背景与天空（全部 B 负责出图，U 负责挂载/滚动）──
  // 层级由远到近：天空球 → 远景卷轴环 → 中景纸片 → 漂浮纸云 → 云海/水面
  const ENV_SPEC = [
    { id: 'sky_<关>', name: '天空球', o: 'B', task: 'B03', p: 'P0', fmt: '2048×1024 等距柱状 JPG/WebP（上半球即可）', where: '半径 120m 球，程序挂', note: '渐变 + 低对比纸纹；太阳/月亮单独做贴片，便于程序定位' },
    { id: 'bg_far_<关>', name: '远景卷轴环', o: 'B', task: 'B03', p: 'P0', fmt: '4096×1024 透明 PNG/WebP（上缘剪影）', where: '北侧 200° 圆弧，半径 48m、高 16m、底边 y=-6', note: '城墙/屋脊/山的纸剪影 + 远处人流；水平无缝；不画玩家、地面、答案' },
    { id: 'bg_mid_<关>_1..3', name: '中景纸片层 ×2–3', o: 'B', task: 'B03', p: 'P1', fmt: '2048×1024 透明 PNG', where: 'z≈-28～-34，宽 20–30m，底边藏在云海下', note: '屋顶/城楼/灯串剪影，与远景错开做视差' },
    { id: 'fx_cloud_<关>', name: '漂浮纸云 ×4–6', o: 'B', task: 'B03', p: 'P1', fmt: '512 透明 PNG（2–3 种形状）', where: '平台周边 y=-3～-8 的公告板', note: '程序缓慢漂移；也用来遮平台底部' },
    { id: 'sea_<关>', name: '云海 / 水面', o: 'B', task: 'B03', p: 'P0', fmt: '512 可平铺 PNG', where: '平台下 y=-6 的大平面 200×200m', note: '程序 UV 滚动；桂市为水面（倒映灯色）' },
  ];
  const ENV = {
    '00-lobby':   { skyTop: '#f7c98b', skyHor: '#fff1dc', body: 'sun',  bodyPos: [0.3, 0.55], far: '锦官城城墙 + 汉阙剪影（与锦市同一张）', mid: '—', sea: '暖白云海', farColor: '#c98f63' },
    '01-jinshi':  { skyTop: '#f7c98b', skyHor: '#fff1dc', body: 'sun',  bodyPos: [0.3, 0.55], far: '汉阙、夯土城墙、晾锦长竿与远处织坊人流', mid: '晾晒彩锦长幅（四队色）', sea: '暖白云海', farColor: '#c98f63' },
    '02-dengshi': { skyTop: '#141634', skyHor: '#3a2d63', body: 'moon', bodyPos: [-0.35, 0.6], far: '唐式城楼、坊墙，满城灯火与孔明灯', mid: '灯串与灯轮剪影', sea: '深紫云海（灯光点点）', farColor: '#5a3d7a' },
    '03-qibaoshi':{ skyTop: '#9fd3cf', skyHor: '#f3f7ec', body: 'sun',  bodyPos: [-0.25, 0.6], far: '宋式楼阁屋脊、大慈寺塔、街市人流', mid: '店招幌子剪影', sea: '青白云海', farColor: '#6e9c8e' },
    '04-shisan':  { skyTop: '#7d7a78', skyHor: '#c9b9a0', body: 'none', bodyPos: [0, 0.5], far: '同一街市屋脊（与七宝市同构图）褪色、风沙、离场人流', mid: '倒伏的幡、空摊剪影', sea: '灰褐风沙云海（更快滚动）', farColor: '#8a7f70' },
    '05-jiushi':  { skyTop: '#f4c98e', skyHor: '#fff3df', body: 'sun',  bodyPos: [0.35, 0.35], far: '清初新起屋舍、炊烟、远山', mid: '脚手架与屋架剪影', sea: '晨雾云海', farColor: '#a98a68' },
    '06-guishi':  { skyTop: '#101a38', skyHor: '#2f4a7a', body: 'moon', bodyPos: [0.28, 0.65], far: '东门码头街市灯火、桂树、远处城郭', mid: '码头灯串与篷船剪影', sea: '锦江水面（倒映灯色）', farColor: '#3a4f78' },
  };

  const LEVELS = {
    '00-lobby': {
      title: '大厅', era: '入场等待', tileColor: '#efe6d2', sky: '#f3d9b0', sea: '#fff4e2',
      spawn: [3, 3, 16, 16], fence: 0.8,
      props: [
        { id: 'lobby_titleboard', name: '标题牌（地标台中央）', o: 'A', size: [7, 3, 0.3], pos: [0, -15.5], task: 'A04', p: 'P0', note: '一块纸板，游戏名用 B02 出的字图贴上' },
        { id: 'kit_bunting', name: '彩旗串', o: 'A', size: [16, 0.6, 0.1], pos: [0, -12.3], y: 3, task: 'A01', p: 'P0', kit: true },
      ],
      note: '复用锦市纸台（不染色），只把地标换成标题牌。',
    },
    '01-jinshi': {
      title: '锦市 · 汉', month: '四月锦市', era: '汉代 · 锦官城', mood: '兴 3/5',
      tileColor: '#efe6d2', sky: '#f3d9b0', sea: '#fff4e2', playDur: 60, fence: 0.8,
      tileId: 'han_tile（素绢，程序染队色）', hat: 'hat_han', matte: 'han_scroll',
      card: '【史实】汉代设锦官专管蜀锦，成都因此被称为“锦官城”。', rule: '走过的格子会染上本队颜色，60 秒后面积最小的一队淘汰。',
      hudRight: '■■■■ 四队占比条', concept: '01-jinshi-paper-concept-v3.png',
      spawnCorners: true,
      props: [
        { id: 'han_hero_loom', name: '地标 · 提花织机', o: 'A', size: [3.2, 2.6, 2.2], pos: [-3.5, -15.5], task: 'A04', p: 'P0', hero: true, note: '≤5,000面；本关识别点' },
        { id: 'han_hero_rack', name: '地标 · 锦匹晾晒架', o: 'A', size: [4, 2.8, 0.8], pos: [4, -15.5], task: 'A04', p: 'P0', hero: true, note: '挂 3 匹四色锦' },
        { id: 'kit_stall', name: '摊位（赭红顶 · “锦”招牌）', o: 'A', size: [3, 2.4, 2.5], pos: [-10, -16], task: 'A01', p: 'P0', kit: true },
        { id: 'kit_bunting', name: '彩旗串', o: 'A', size: [16, 0.6, 0.1], pos: [0, -12.3], y: 3, task: 'A01', p: 'P1', kit: true },
        { id: 'kit_cutout', name: '剪影立牌 · 展锦议价', o: 'B', size: [2.4, 1.6, 0.05], pos: [9.5, -17.5], task: 'B03', p: 'P0', kit: true },
        { id: 'kit_cutout', name: '剪影立牌 · 运货', o: 'B', size: [2.4, 1.6, 0.05], pos: [-12.5, -18.5], task: 'B03', p: 'P1', kit: true },
      ],
    },
    '02-dengshi': {
      title: '灯市 · 盛唐', month: '正月灯市', era: '盛唐上元夜', mood: '盛 5/5',
      tileColor: '#6a5a80', sky: '#1c1f3f', sea: '#2a2d55', night: true, playDur: 70, pitch: 55, fence: 0,
      tileId: 'tang_tile', hat: 'hat_tang', matte: 'tang_scroll',
      card: '【演绎】唐代上元节，满城观灯、猜灯谜。', rule: '跑到你认为正确的答案区，答错的地面会塌陷。',
      hudRight: '第 2 / 5 题', topText: '题目：千灯照锦城（≤15字）', concept: '02-dengshi-paper-concept-v2.png',
      spawn: [7, 17, 12, 19],
      props: [
        { id: 'tang_hero_archway', name: '地标 · 牌坊', o: 'A', size: [8, 5, 1.2], pos: [0, -17], task: 'A05', p: 'P0', hero: true, note: '≤5,000面' },
        { id: 'kit_tree', name: '灯树 ×2（kit_tree 挂灯）', o: 'A', size: [2, 5, 2], pos: [-8, -15], shape: 'tree', task: 'A01', p: 'P0', kit: true, multi: [[-8, -15], [8, -15]] },
        { id: 'kit_lantern', name: '题目灯笼（放大2倍，北缘高悬）', o: 'A', size: [2.4, 2.4, 2.4], pos: [0, -12.5], y: 6.5, shape: 'lantern', task: 'A05', p: 'P0', kit: true, note: '题字程序贴；不挡玩法面' },
        { id: 'kit_lantern', name: '选择灯 A/B/C（答对程序点亮）', o: 'A', size: [1.4, 1.6, 1.4], pos: [-7, -8], y: 4, shape: 'lantern', task: 'A05', p: 'P0', kit: true, multi: [[-7, -8], [0, -8], [7, -8]] },
        { id: 'kit_cutout', name: '剪影立牌 · 提灯家庭', o: 'B', size: [2.4, 1.6, 0.05], pos: [-11, -18], task: 'B03', p: 'P0', kit: true },
        { id: 'kit_cutout', name: '剪影立牌 · 观灯人群', o: 'B', size: [2.4, 1.6, 0.05], pos: [11, -18], task: 'B03', p: 'P1', kit: true },
      ],
    },
    '03-qibaoshi': {
      title: '七宝市 · 北宋', month: '七月七宝市', era: '北宋 · 大慈寺旁', mood: '极盛 5/5',
      tileColor: '#cfe0d6', sky: '#cfe6e0', sea: '#eef7f2', playDur: 60, fence: 0.8,
      tileId: 'song_tile', hat: 'hat_song', matte: 'song_scroll',
      card: '【史实】北宋时，成都出现交子，被视为世界上最早的纸币之一。【演绎】本关借七宝市展现交子流通的盛景。', rule: '捡交子，60 秒后捡得最少的人淘汰。',
      hudRight: '我的交子 7 · 第 3 名', concept: '03-qibaoshi-paper-concept-v1.png',
      spawn: [6, 17, 13, 19],
      props: [
        { id: 'song_hero_templegate', name: '地标 · 大慈寺门（门板为独立节点）', o: 'A', size: [7, 5, 2], pos: [0, -16.5], task: 'A06', p: 'P0', hero: true, note: '下一关关门即复用；门板节点 door_l/door_r' },
        { id: 'kit_stall', name: '摊位（青绿顶 · “交子铺”招牌）', o: 'A', size: [3, 2.4, 2.5], pos: [-8, -15], task: 'A01', p: 'P0', kit: true },
        { id: 'kit_stall', name: '摊位（素白顶 · “珍玩”招牌）', o: 'A', size: [3, 2.4, 2.5], pos: [8, -15], task: 'A01', p: 'P0', kit: true },
        { id: 'kit_bunting', name: '彩旗串', o: 'A', size: [16, 0.6, 0.1], pos: [0, -12.3], y: 3, task: 'A01', p: 'P1', kit: true },
        { id: 'kit_cutout', name: '剪影立牌 · 兑换排队', o: 'B', size: [2.4, 1.6, 0.05], pos: [-12.5, -17.5], task: 'B03', p: 'P0', kit: true },
        { id: 'kit_cutout', name: '剪影立牌 · 挑珍玩', o: 'B', size: [2.4, 1.6, 0.05], pos: [12.5, -17.5], task: 'B03', p: 'P1', kit: true },
      ],
      dyn: [{ id: 'song_pickup_jiaozi', name: '交子（拾取物）', o: 'A', size: [0.35, 0.02, 0.6], task: 'A03', p: 'P0', note: '一张薄片即可；贴图256；程序负责飘落/拾取' }],
    },
    '04-shisan': {
      title: '市散 · 宋元之际', month: '（无月市）', era: '宋元之际 · 同地散市', mood: '落 1/5',
      tileColor: '#b2aa9a', sky: '#8e8a86', sea: '#a7a39c', playDur: 60, camDist: 14, fence: 0,
      tileId: 'yuan_tile（裂纹版）', hat: 'hat_yuan', matte: 'yuan_scroll',
      card: '【史实】宋元之际，战火入城。此后，十二月市渐渐衰落。', rule: '踩过的石板很快会化为沙土，别掉下去。',
      hudRight: '剩余 9 人', concept: '04-shisan-paper-concept-v2.png',
      spawn: [5, 5, 14, 14],
      props: [
        { id: 'song_hero_templegate', name: '大慈寺门 · 关门状态（复用）', o: 'A', size: [7, 5, 2], pos: [0, -16.5], task: 'A07', p: 'P0', hero: true, reuse: true, note: '只切 door 节点，不新建模型' },
        { id: 'kit_stall', name: '摊位 · 盖布收摊（复用+盖布节点）', o: 'A', size: [3, 2.4, 2.5], pos: [-8, -15], task: 'A07', p: 'P0', kit: true, reuse: true },
        { id: 'kit_stall', name: '摊位 · 盖布收摊', o: 'A', size: [3, 2.4, 2.5], pos: [8, -15], task: 'A07', p: 'P0', kit: true, reuse: true },
        { id: 'kit_cutout', name: '剪影立牌 · 携包离场', o: 'B', size: [2.4, 1.6, 0.05], pos: [-12.5, -17.5], task: 'B03', p: 'P0', kit: true },
        { id: 'kit_cutout', name: '剪影立牌 · 推车离场', o: 'B', size: [2.4, 1.6, 0.05], pos: [12.5, -17.5], task: 'B03', p: 'P1', kit: true },
      ],
      note: '与七宝市同一套场景，只切状态：关门、盖布、熄灯、去彩旗、换剪影、降饱和。A07 不新建模型。',
    },
    '05-jiushi': {
      title: '酒市 · 清初', month: '十月酒市', era: '清初 · 湖广填四川', mood: '再生 3/5',
      tileColor: '#d6c09a', sky: '#f0dcb8', sea: '#fbefd9', playDur: 60, fence: 0.6,
      tileId: 'qing_tile', hat: 'hat_qing', matte: 'qing_scroll',
      card: '【史实】清初“湖广填四川”，各地移民入川重建家园；水井坊遗址留下了明清酿酒的完整流程。', rule: '把粮袋运进酒坛，最先运满 3 袋的人晋级。',
      hudRight: '已运 1 / 3 袋', concept: '05-jiushi-paper-concept-v2.png',
      spawn: [6, 17, 13, 19],
      props: [
        { id: 'qing_hero_distillery', name: '地标 · 酒坊（屋架+甑，带蒸汽挂点）', o: 'A', size: [8, 4.5, 4], pos: [0, -16], task: 'A08', p: 'P0', hero: true, note: 'P1 再拆“木架/完整”两态显隐' },
        { id: 'kit_stall', name: '摊位（暖木顶 · “酒”招牌）', o: 'A', size: [3, 2.4, 2.5], pos: [-9, -15], task: 'A01', p: 'P0', kit: true },
        { id: 'qing_deliver_jar', name: '酒坛 ×4（交付点，四角）', o: 'A', size: [1.2, 1.4, 1.2], pos: [-8.5, -8.5], shape: 'cyl', task: 'A03', p: 'P0', inside: true, multi: [[-8.5, -8.5], [8.5, -8.5], [-8.5, 8.5], [8.5, 8.5]], note: '外观A；交付判定U（半径1.5m）' },
        { id: 'kit_cutout', name: '剪影立牌 · 运粮', o: 'B', size: [2.4, 1.6, 0.05], pos: [9.5, -17.5], task: 'B03', p: 'P0', kit: true },
        { id: 'kit_cutout', name: '剪影立牌 · 搭屋架', o: 'B', size: [2.4, 1.6, 0.05], pos: [-12.5, -18.5], task: 'B03', p: 'P1', kit: true },
      ],
      dyn: [{ id: 'qing_pickup_sack', name: '粮袋（拾取物）', o: 'A', size: [0.6, 0.4, 0.4], task: 'A03', p: 'P0', note: '≤800面；扛起时挂在头顶' }],
    },
    '06-guishi': {
      title: '桂市 · 清末民初', month: '八月桂市', era: '中秋夜 · 东门码头', mood: '归 5/5（决赛）',
      tileColor: '#e6d6b8', sky: '#1d2747', sea: '#22406a', night: true, playDur: 60, stairs: true,
      tileId: '台阶格（程序拼，贴 guishi_step 纹）', hat: 'hat_qing（换色）', matte: 'minguo_scroll',
      card: '【演绎】中秋夜，东门码头灯楼。东门码头今为成都十二月市博物馆所在地。', rule: '登上灯楼，第一个摘到桂枝的人夺冠。',
      hudRight: '离顶：甲3级 乙5级 你6级', topText: '冲上灯楼，摘下桂枝！', concept: '06-guishi-paper-concept-v2.png',
      props: [
        { id: 'minguo_hero_tower', name: '地标 · 灯楼（顶台中央）', o: 'A', size: [4, 6, 2.6], pos: [0, -14.8], y: 7, task: 'A09', p: 'P0', hero: true, note: '必须始终在镜头上方可见' },
        { id: 'minguo_goal_osmanthus', name: '终点 · 桂枝（触碰半径1m）', o: 'A', size: [0.9, 0.9, 0.9], pos: [0, -13.2], y: 8.2, shape: 'tree', task: 'A03', p: 'P0', note: '阔叶小黄花木犀，非西式月桂冠' },
        { id: 'kit_lantern', name: '灯笼柱 ×6（台阶两侧，赛道外）', o: 'A', size: [0.5, 0.7, 0.5], pos: [-6, 6], shape: 'lantern', task: 'A01', p: 'P0', kit: true, pole: true, multi: [[-6, 6], [6, 6], [-6, -1], [6, -1], [-6, -8], [6, -8]] },
        { id: 'kit_tree', name: '桂树 ×2（台阶脚两侧）', o: 'A', size: [2, 3.5, 2], pos: [-8, 10], shape: 'tree', task: 'A01', p: 'P0', kit: true, multi: [[-8, 10], [8, 10]] },
        { id: 'minguo_prop_boat', name: '篷船（水面）', o: 'A', size: [2, 1.2, 5], pos: [-11.8, 2], y: -0.5, task: 'A09', p: 'P1' },
        { id: 'kit_cutout', name: '剪影立牌 · 赏月人流', o: 'B', size: [2.4, 1.6, 0.05], pos: [7.8, 4], task: 'B03', p: 'P0', kit: true, rot: -0.6 },
      ],
      note: '台阶 20级×10格，每级深1.2m、高0.35m；顶台10×4m；缺口在第6/11/16级附近各3–4格（种子决定）。A09 只放地标和赛道外装饰，必须按 U09 实测路线。',
    },
  };

  // UI 盒子：phone 844×390，big 1920×1080；o=负责方；id=建议切图名（B02）
  const PH = { w: 844, h: 390 };
  const HUD = (lv) => [
    { x: 222, y: 8, w: 400, h: 40, o: 'B', id: 'ui/hud_topbar', text: `${lv.title}　0:42　晋级 24/32`, cls: 'bar', note: '底板B02切图；关卡名/倒计时/人数程序填' },
    { x: 590, y: 56, w: 210, h: 30, o: 'B', id: 'ui/hud_info', text: lv.hudRight, cls: 'chip', note: '本关特有信息，一行以内（00-common §7）' },
    { x: 60, y: 230, w: 120, h: 120, o: 'B', id: 'ui/joystick_base+knob', text: '摇杆', cls: 'round', note: '浮动摇杆：左半屏任意处按下即出现' },
    { x: 700, y: 262, w: 96, h: 96, o: 'B', id: 'ui/btn_jump', text: '跳', cls: 'round', note: '短按0.7m / 长按>0.15s 1.2m' },
    { x: 0, y: 0, w: 380, h: 390, o: 'U', id: 'touch-zone:joystick', text: '摇杆触控区', cls: 'zone', note: '程序热区，不需要美术' },
  ];
  const BIGHOST = [
    { x: 1300, y: 975, w: 580, h: 75, o: 'B', id: 'ui/host_controls', text: '开始｜跳过本关｜直接结局', cls: 'bar', note: '大屏即房主；按钮样式B02，逻辑U10' },
  ];

  function levelUI(key, phase, dev) {
    const lv = LEVELS[key];
    const isPhone = dev === 'phone';
    if (phase === 'card') {
      return isPhone ? [
        { x: 0, y: 0, w: 844, h: 390, o: 'U', id: 'dim', text: '', cls: 'dim' },
        { x: 142, y: 40, w: 560, h: 300, o: 'B', id: 'ui/card_frame', cls: 'card', note: 'B02卡片底板；文字B01 cards.json，程序排版',
          html: `<div class="c-t">${lv.title}</div><div class="c-e">${lv.month || ''} · ${lv.era}</div><div class="c-f">${lv.card}</div><div class="c-r">规则：${lv.rule}</div><div class="c-p"><i></i></div>` },
      ] : [
        { x: 0, y: 0, w: 1920, h: 1080, o: 'U', id: 'dim', text: '', cls: 'dim' },
        { x: 360, y: 180, w: 1200, h: 640, o: 'B', id: 'ui/card_frame_big', cls: 'card big', note: '与手机同一份 cards.json，同步 6 秒',
          html: `<div class="c-t">${lv.title}</div><div class="c-e">${lv.month || ''} · ${lv.era}</div><div class="c-f">${lv.card}</div><div class="c-r">规则：${lv.rule}</div><div class="c-p"><i></i></div>` },
      ];
    }
    if (phase === 'countdown') {
      const base = isPhone ? HUD(lv) : bigPlay(lv);
      return base.concat([{ x: isPhone ? 342 : 760, y: isPhone ? 95 : 340, w: isPhone ? 160 : 400, h: isPhone ? 160 : 400, o: 'B', id: 'ui/countdown_321', text: '3', cls: 'count', note: '3秒内可移动但不计入玩法' }]);
    }
    if (phase === 'play') {
      let ui = isPhone ? HUD(lv) : bigPlay(lv);
      if (lv.topText && isPhone) ui = ui.map(b => b.id === 'ui/hud_topbar' ? { ...b, x: 172, w: 500, text: lv.topText + '　0:08', note: '本关顶部改为题目/目标（关卡文档§6）' } : b);
      return ui;
    }
    if (phase === 'result') {
      return isPhone ? [
        { x: 0, y: 0, w: 844, h: 390, o: 'U', id: 'dim', text: '', cls: 'dim light' },
        { x: 222, y: 110, w: 400, h: 130, o: 'B', id: 'ui/result_pass / result_out', text: '晋 级！', cls: 'big-word', note: '晋级/淘汰两套字形；角色播放欢呼/掉落' },
        { x: 272, y: 252, w: 300, h: 34, o: 'U', id: 'result-sub', text: '本关晋级 24 / 32 人', cls: 'chip' },
      ] : [
        { x: 0, y: 0, w: 1920, h: 1080, o: 'U', id: 'dim', text: '', cls: 'dim light' },
        { x: 560, y: 120, w: 800, h: 110, o: 'B', id: 'ui/result_title_big', text: `${lv.title} · 晋级名单`, cls: 'bar big-t' },
        { x: 460, y: 260, w: 1000, h: 600, o: 'U', id: 'result-namegrid', cls: 'names', note: '名单程序生成；底板B02', html: names(24) },
      ].concat(BIGHOST);
    }
    if (phase === 'spectate') {
      return isPhone ? [
        { x: 222, y: 8, w: 400, h: 40, o: 'B', id: 'ui/spectate_banner', text: '你已淘汰 · 正在观战（与大屏同视角）', cls: 'bar', note: '淘汰后切固定俯视；不做切换跟拍（§5.3）' },
        { x: 590, y: 56, w: 210, h: 30, o: 'B', id: 'ui/hud_info', text: '晋级 17 / 24', cls: 'chip' },
      ] : bigPlay(lv);
    }
    return [];
  }
  function bigPlay(lv) {
    const ui = [
      { x: 560, y: 24, w: 800, h: 80, o: 'B', id: 'ui/big_topbar', text: `${lv.title}　0:42　晋级 24 / 32`, cls: 'bar big-t', note: '大屏顶栏，字号≥48px' },
      { x: 1560, y: 140, w: 330, h: 380, o: 'U', id: 'big-ranking', cls: 'names', note: '本关数据：队伍占比/排名/剩余人数', html: names(6, true) },
    ].concat(BIGHOST);
    if (lv.topText) ui.push({ x: 360, y: 120, w: 1200, h: 90, o: 'B', id: 'ui/big_question', text: lv.topText, cls: 'bar big-t q', note: '题目同时打在大屏上（B01题库，程序排字）' });
    return ui;
  }
  function names(n, rank) {
    let s = '';
    for (let i = 1; i <= n; i++) s += `<span>${rank ? i + '. ' : ''}玩家${String(i).padStart(2, '0')}</span>`;
    return s;
  }

  const LV_PHASES = [
    { id: 'card', name: '史实卡', dur: 6 },
    { id: 'countdown', name: '倒数', dur: 3 },
    { id: 'play', name: '游玩', dur: 60 },
    { id: 'result', name: '结算', dur: 5 },
    { id: 'spectate', name: '淘汰观战', dur: 0, opt: true },
  ];

  const VIDEOS = {
    opening: {
      title: '可选片头', file: 'assets/video/opening.mp4', dur: 15, prio: 'P2', task: 'B10 / U11',
      shots: [
        { t0: 0, t1: 6, pic: '01-jinshi-paper-concept-v3.png', what: '锦江水面 → 锦官城（占位）', sound: '片头乐起' },
        { t0: 6, t1: 12, pic: null, what: '六个月市符号翻页（待B05分镜）', sound: '' },
        { t0: 12, t1: 15, pic: null, what: '游戏名定格 → 进入锦市卡片', sound: '收' },
      ],
      phoneText: '锦江十二月市 · 千年赶集', note: '最后有余量再做；≤15秒，不阻断三段正片。没有片头时大厅直接进锦市史实卡。',
    },
    wind: {
      title: '风起', file: 'assets/video/wind.mp4', dur: 8, prio: 'P1', task: 'B06 / U11',
      shots: [
        { t0: 0, t1: 2.5, pic: '03-qibaoshi-paper-concept-v1.png', what: '七宝市同地街景：寺门、交子铺、珍玩摊、购物人流', sound: '热闹音渐弱' },
        { t0: 2.5, t1: 5, pic: null, what: '风带纸幡，商贩卷货装箱，顾客携包离开，灯熄；暖→灰紫', sound: '风声渐强、纸张翻动' },
        { t0: 5, t1: 8, pic: '04-shisan-paper-concept-v2.png', what: '市散纸街与退场人流，末帧落到第四关构图', sound: '结束交U11，不在片内切UI' },
      ],
      phoneText: '【史实】宋元之际，战火入城。此后，十二月市渐渐衰落。', 
      note: '保留大慈寺门/交子铺同地线索；无战争废墟、兵器、伤亡。',
    },
    rebirth: {
      title: '再生', file: 'assets/video/rebirth.mp4', dur: 6, prio: 'P1', task: 'B07 / U11',
      shots: [
        { t0: 0, t1: 2, pic: '04-shisan-paper-concept-v2.png', what: '风停、散市余景与留白，灰褐慢慢回暖', sound: '风声衰减' },
        { t0: 2, t1: 4, pic: null, what: '纸页翻转/叠化跨过时间；带粮与行囊人流进入新街，柱架立起', sound: '脚步、轻木作、纸折，暖乐起' },
        { t0: 4, t1: 6, pic: '05-jiushi-paper-concept-v2.png', what: '酒坊恢复，甑灶蒸汽与粮运，末帧接清代酒市', sound: '镜头稳定' },
      ],
      phoneText: '【史实】明末清初战乱之后，“湖广填四川”，各地移民入川重建家园。', 
      note: '蒸汽起于甑/灶，不从冷酒坛冒烟；清式衣帽与酒市一致。',
    },
    ending: {
      title: '古今结局', file: 'assets/video/ending.mp4', dur: 60, prio: 'P1', task: 'B08 / U11',
      shots: [
        { t0: 0, t1: 6, pic: '06-guishi-paper-concept-v2.png', what: '桂枝、暖灯楼、月色与赶集人群', sound: '冠军名网页叠加' },
        { t0: 6, t1: 14, pic: null, what: '折纸翻页/水岸叠化，古代→当代意象', sound: '' },
        { t0: 14, t1: 30, pic: null, what: '当代锦江/东门水岸、人群与市集（AI演绎需标注）', sound: '' },
        { t0: 30, t1: 42, pic: null, what: '十二个市的摊位/符号依次亮起（一张可分区点亮的全景）', sound: '' },
        { t0: 42, t1: 52, pic: null, what: '河灯顺水，热闹收向温暖安静', sound: '音乐收束' },
        { t0: 52, t1: 60, pic: null, what: '低干扰空镜：留给名单/合影（U11网页叠加）', sound: '不突然黑屏', overlay: true },
      ],
      phoneText: '冠军 玩家07', phoneSub: '你走到了第 4 关 · 市散', ending: true,
      note: '先按60秒剪，压到45秒时保留最后8秒叠字空间。',
    },
  };

  // 流程：每一项是一个“屏”
  const FLOW = [
    { id: 'entry', group: '入场', title: '扫码入场', kind: 'entry',
      phases: [{ id: 'portrait', name: '竖屏提示', dur: 0 }, { id: 'name', name: '名字选色', dur: 0 }],
      tasks: { U: 'U02 进房；入场“进入”按钮顺带解锁音频', B: 'B02 入场/名字选色样板；B10 现场扫码说明', A: '—' },
      desc: '手机扫码 → 竖屏时提示横过来 → 输入名字、选8种身体颜色 → 进入。大屏同时显示二维码和在场人数。' },
    { id: 'lobby', group: '入场', title: '大厅', kind: 'level', level: '00-lobby',
      phases: [{ id: 'lobby', name: '自由跑跳', dur: 0 }],
      tasks: { U: 'U02 移动/跳跃、U10 大屏房主', A: '复用锦市纸台＋标题牌', B: 'B02 大厅/大屏样板；B04 大厅复用锦市配乐' },
      desc: '所有人站在锦市平台（不染色）自由跑跳等待；大屏即房主，按“开始”。建议至少4人再开局。' },
    { id: 'opening', group: '入场', title: '片头（可选）', kind: 'video', video: 'opening' },
    { id: 'L1', group: '六关', title: '1 锦市', kind: 'level', level: '01-jinshi', tasks: { U: 'U04 四色染色/面积计分', A: '织机、锦架两个地标；纸人＋汉帽', B: '卡片文案、远景卷轴、剪影立牌、HUD' } },
    { id: 'g1', group: '转场', title: '切关', kind: 'gap', next: 'L2' },
    { id: 'L2', group: '六关', title: '2 灯市', kind: 'level', level: '02-dengshi', tasks: { U: 'U05 三区/出题/锁定/塌陷', A: '牌坊地标；灯笼/灯树套件', B: 'B01 15题题库、B03 夜景' } },
    { id: 'g2', group: '转场', title: '切关', kind: 'gap', next: 'L3' },
    { id: 'L3', group: '六关', title: '3 七宝市', kind: 'level', level: '03-qibaoshi', tasks: { U: 'U06 交子落地/拾取/排名', A: '大慈寺门地标；交子薄片', B: 'B03 寺旁繁华背景、纸票符号' } },
    { id: 'wind', group: '转场', title: '风起 8s', kind: 'video', video: 'wind' },
    { id: 'L4', group: '六关', title: '4 市散', kind: 'level', level: '04-shisan', tasks: { U: 'U07 踩格折落/掉落淘汰', A: '复用七宝市，只切状态节点', B: '同地褪色远景、离场剪影、风声' } },
    { id: 'rebirth', group: '转场', title: '再生 6s', kind: 'video', video: 'rebirth' },
    { id: 'L5', group: '六关', title: '5 酒市', kind: 'level', level: '05-jiushi', tasks: { U: 'U08 携粮/四角交付/达标', A: '酒坊地标；粮袋、酒坛', B: 'B03 清代街坊背景' } },
    { id: 'g3', group: '转场', title: '切关', kind: 'gap', next: 'L6' },
    { id: 'L6', group: '六关', title: '6 桂市', kind: 'level', level: '06-guishi', tasks: { U: 'U09 台阶/缺口/塌落/冠军', A: '灯楼地标、桂枝；按实测路线摆', B: 'B03 中秋水岸远景' } },
    { id: 'ending', group: '结局', title: '结局 45–60s', kind: 'video', video: 'ending' },
  ];

  return { OWNERS, TEAM, BODY, LEVELS, VIDEOS, FLOW, LV_PHASES, levelUI, HUD, BIGHOST, PH, SIMPLIFY, KIT, ENV, ENV_SPEC, names };
})();
