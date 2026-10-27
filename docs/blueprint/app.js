// 锦江十二月市 · 白模流程蓝图（经典脚本 + 动态 import，便于直接双击 file:// 打开）
(async function () {
  const BP = window.BP;
  const stageEl = document.getElementById('stage');
  let THREE, CSS2DRenderer, CSS2DObject, OrbitControls;
  try {
    THREE = await import('three');
    ({ CSS2DRenderer, CSS2DObject } = await import('three/addons/renderers/CSS2DRenderer.js'));
    ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  } catch (e) {
    stageEl.innerHTML = `<div class="err">Three.js 加载失败（需要联网访问 cdn.jsdelivr.net）。<br>${e}</div>`;
    return;
  }

  const OC = (o) => BP.OWNERS[o].color;
  const fmt = (n) => (Math.round(n * 100) / 100).toString();
  const sizeStr = (s) => (s ? s.map(fmt).join('×') + 'm' : '');
  const tileX = (c) => c - 9.5;
  const tileZ = (r) => r - 9.5;
  const rnd = mulberry(7);
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ───────────────────────── 状态 ─────────────────────────
  const S = {
    screen: 3, phase: 2, t: 0, dev: 'phone', cam: 'game', playing: false, spd: 1, sel: null,
    tg: { lbl3d: true, size: true, lblui: true, tint: false, p0: false },
  };

  // ───────────────────────── 纹理工具 ─────────────────────────
  function canvasTex(w, h, draw, opt = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (opt.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opt.repeat, opt.repeat); }
    return t;
  }
  function skylineTex(color, label, kind) {
    return canvasTex(2048, 512, (g, w, h) => {
      const r = mulberry(kind.length * 31 + 3);
      g.fillStyle = color;
      let x = 0;
      while (x < w) {
        const bw = 60 + r() * 160, bh = 80 + r() * (kind === 'mid' ? 200 : 260);
        g.fillRect(x, h - bh, bw, bh);
        // 屋顶
        g.beginPath(); g.moveTo(x - 14, h - bh); g.lineTo(x + bw / 2, h - bh - 30 - r() * 30); g.lineTo(x + bw + 14, h - bh); g.fill();
        if (r() < 0.15) { g.fillRect(x + bw / 2 - 12, h - bh - 140, 24, 120); }
        x += bw + r() * 30;
      }
      // 人群剪影带
      g.globalAlpha = 0.85;
      for (let i = 0; i < 90; i++) { const px = r() * w; g.beginPath(); g.arc(px, h - 40 - r() * 10, 9, 0, 7); g.fill(); g.fillRect(px - 9, h - 40, 18, 40); }
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,.75)'; g.font = 'bold 34px sans-serif';
      for (let i = 0; i < 3; i++) g.fillText(label, 80 + i * 700, h - 120);
    });
  }
  function cutoutTex(label) {
    return canvasTex(512, 340, (g, w, h) => {
      g.fillStyle = '#efe3c8'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#6aa8ff'; g.lineWidth = 8; g.setLineDash([16, 10]); g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#6b5a48';
      const r = mulberry(label.length);
      for (let i = 0; i < 6; i++) { const x = 50 + i * 80 + r() * 20, s = 0.8 + r() * 0.4; g.beginPath(); g.arc(x, 150 - 20 * s, 26 * s, 0, 7); g.fill(); g.fillRect(x - 26 * s, 150, 52 * s, 120 * s); }
      g.fillStyle = '#1d4f9a'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
      g.fillText('B · 剪影立牌（透明PNG）', w / 2, 316);
    });
  }
  function textTex(text, color = '#fff', bg = null) {
    return canvasTex(512, 256, (g, w, h) => {
      if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
      g.fillStyle = color; g.font = 'bold 150px "PingFang SC", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 8);
    });
  }
  function seaTex(color) {
    return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3;
      for (let y = 20; y < h; y += 42) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / 20 + y) * 5); g.stroke(); }
    }, { repeat: 30 });
  }
  function cloudTex() {
    return canvasTex(256, 128, (g) => {
      g.fillStyle = 'rgba(255,255,255,.92)';
      [[70, 80, 40], [120, 60, 52], [175, 80, 38], [125, 92, 40]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
    });
  }

  // ───────────────────────── 场景构建 ─────────────────────────
  const PAPER = '#f2ebde', HERO = '#ffe2bf', LANTERN = '#ff8a3d';

  function buildWorld(key) {
    const lv = BP.LEVELS[key], env = BP.ENV[key];
    const scene = new THREE.Scene();
    const W = { key, lv, env, scene, items: [], players: [], dyn: [], clock: 0, phase: 'play', fx: {} };
    scene.background = new THREE.Color(env.skyHor);
    scene.fog = new THREE.Fog(env.skyHor, 80, 190);
    scene.add(new THREE.HemisphereLight(lv.night ? '#8fa0ff' : '#ffffff', lv.night ? '#2a2030' : '#b9a588', lv.night ? 1.6 : 1.9));
    const sun = new THREE.DirectionalLight(lv.night ? '#ffd9a0' : '#fff6e6', lv.night ? 1.0 : 1.6);
    sun.position.set(8, 20, 12); scene.add(sun);

    buildEnv(W);
    if (lv.stairs) buildStairs(W); else buildPlatform(W);
    for (const p of lv.props || []) addProp(W, p);
    buildPlayers(W);
    if (key === '03-qibaoshi') W.dynInfo = lv.dyn[0];
    if (key === '05-jiushi') buildSacks(W);
    return W;
  }

  function reg(W, obj, info, labelAt, opts = {}) {
    obj.traverse((m) => { if (m.isMesh) { m.userData.info = info; if (m.material && m.material.color) m.userData.base = m.material.color.clone(); } });
    let label = null;
    if (labelAt) {
      const div = document.createElement('div');
      div.className = 'lbl' + (opts.cls ? ' ' + opts.cls : '');
      div.style.setProperty('--c', OC(info.o));
      const mult = info.multi ? ` ×${info.multi.length}` : '';
      div.innerHTML = opts.html || `${info.name}${mult}${info.p === 'P1' ? ' <span style="color:#aab">P1</span>' : ''}<i>${info.id}${info.size ? ' · ' + sizeStr(info.size) : ''}</i>`;
      div.addEventListener('click', (e) => { e.stopPropagation(); select(info); });
      label = new CSS2DObject(div);
      label.position.copy(labelAt);
      W.scene.add(label);
    }
    W.items.push({ obj, info, label });
    return obj;
  }
  const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
  function edges(mesh, color = '#2b2620', op = 0.35) {
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20), new THREE.LineBasicMaterial({ color, transparent: true, opacity: op }));
    mesh.add(l); return mesh;
  }
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

  function buildEnv(W) {
    const { env, key, lv, scene } = W;
    const short = key.slice(3);
    // 天空球
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(env.skyTop) }, hor: { value: new THREE.Color(env.skyHor) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(hor, top, smoothstep(-0.05, 0.55, h)), 1.); }',
    }));
    sky.renderOrder = -10; scene.add(sky);
    const specs = Object.fromEntries(BP.ENV_SPEC.map((s) => [s.name, s]));
    const envInfo = (name, extra) => ({ ...specs[name], id: specs[name].id.replace('<关>', short), desc: extra, env: true });
    reg(W, sky, envInfo('天空球', `${env.skyTop} → ${env.skyHor}`), v3(-26, 30, -70));
    if (env.body !== 'none') {
      const b = new THREE.Mesh(new THREE.CircleGeometry(env.body === 'moon' ? 7 : 9, 32), new THREE.MeshBasicMaterial({ color: env.body === 'moon' ? '#fff3cf' : '#fff2c0', fog: false }));
      b.position.set(env.bodyPos[0] * 140, env.bodyPos[1] * 90, -120); b.lookAt(0, 0, 0); scene.add(b);
    }
    // 远景卷轴环（北侧 200°）
    const arc = (200 * Math.PI) / 180;
    const farTex = skylineTex(env.farColor, `bg_far_${short} · 4096×1024 · 远景卷轴（B）`, 'far');
    farTex.wrapS = THREE.RepeatWrapping; farTex.repeat.x = -1;
    const far = new THREE.Mesh(new THREE.CylinderGeometry(48, 48, 16, 64, 1, true, Math.PI - arc / 2, arc),
      new THREE.MeshBasicMaterial({ map: farTex, transparent: true, side: THREE.DoubleSide, fog: false, depthWrite: false }));
    far.position.y = 2; far.renderOrder = -5; scene.add(far);
    reg(W, far, envInfo('远景卷轴环', env.far), v3(20, 9, -42));
    // 中景纸片（P1）
    const midTex = skylineTex(shade(env.farColor, 0.18), `bg_mid_${short} · 中景纸片（B）`, 'mid');
    const midG = new THREE.Group();
    [[-12, -30, 28], [13, -34, 26]].forEach(([x, z, w]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.36), new THREE.MeshBasicMaterial({ map: midTex, transparent: true, depthWrite: false, fog: false }));
      m.position.set(x, -4 + w * 0.18, z); midG.add(m);
    });
    midG.renderOrder = -4; scene.add(midG);
    reg(W, midG, envInfo('中景纸片层 ×2–3', env.mid), v3(-14, 4, -30));
    // 漂浮纸云（P1）
    const ct = cloudTex(); const clouds = new THREE.Group();
    [[-17, -4, -6], [18, -5, 2], [-15, -6, 10], [16, -3.5, -12], [0, -7, 16], [-22, -2, -16]].forEach(([x, y, z], i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, opacity: lv.night ? 0.35 : 0.9, depthWrite: false }));
      s.position.set(x, y, z); s.scale.set(8 + (i % 3) * 2, 4 + (i % 3), 1); s.userData.vx = 0.3 + (i % 3) * 0.15; clouds.add(s);
    });
    scene.add(clouds); W.fx.clouds = clouds;
    reg(W, clouds, envInfo('漂浮纸云 ×4–6', '平台周边 y=-3～-8，程序漂移'), v3(-17, -1.5, -6));
    // 云海 / 水面
    const st = seaTex(env.seaColor || lv.sea);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshBasicMaterial({ map: st, fog: true }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = lv.stairs ? -0.5 : -6; scene.add(sea); W.fx.sea = st;
    reg(W, sea, envInfo('云海 / 水面', env.sea), lv.stairs ? v3(-12, -0.3, 9) : v3(14, -5.5, 14));
  }
  function shade(hex, k) { const c = new THREE.Color(hex); c.lerp(new THREE.Color('#ffffff'), k); return '#' + c.getHexString(); }

  function buildPlatform(W) {
    const { lv, scene, key } = W;
    // 纸台台身 24×24（含 2m 周边带）
    const slab = edges(new THREE.Mesh(new THREE.BoxGeometry(24, 1.4, 24), lam('#e6d8bf')));
    slab.position.set(0, -0.85, 0); scene.add(slab);
    reg(W, slab, { name: '纸台台身（含四周 2m 周边带）', id: 'kit_platform', o: 'A', size: [24, 1.4, 24], task: 'A01', p: 'P0', note: '玩家不进入 2m 周边带；台底被纸云遮住' }, v3(-12.2, -0.4, 6));
    // 北侧地标台
    const isl = edges(new THREE.Mesh(new THREE.BoxGeometry(28, 1.4, 9), lam('#dccbaa')));
    isl.position.set(0, -0.85, -16.5); scene.add(isl);
    reg(W, isl, { name: '北侧地标台（镜头正前方）', id: 'kit_platform:north', o: 'A', size: [28, 1.4, 9], task: 'A01', p: 'P0', note: 'z = -12 ～ -21；每关地标只放这里' }, v3(13.8, -0.2, -20.5));
    // 地格
    const geo = new THREE.BoxGeometry(0.95, 0.3, 0.95);
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const tiles = new THREE.InstancedMesh(geo, mat, 400);
    const base = new THREE.Color(lv.tileColor), alt = base.clone().lerp(new THREE.Color('#000'), 0.06);
    W.tileBase = []; W.tileState = new Array(400).fill(0);
    const m4 = new THREE.Matrix4();
    for (let r = 0; r < 20; r++) for (let c = 0; c < 20; c++) {
      const i = r * 20 + c; m4.makeTranslation(tileX(c), -0.15, tileZ(r)); tiles.setMatrixAt(i, m4);
      let col = (r + c) % 2 ? base : alt;
      if (key === '02-dengshi') col = c < 6 ? new THREE.Color('#7a5a8a') : c < 14 ? new THREE.Color('#5d5a8f') : new THREE.Color('#7a5a7a');
      W.tileBase[i] = col.clone(); tiles.setColorAt(i, col);
    }
    scene.add(tiles); W.tiles = tiles;
    reg(W, tiles, { name: '玩法地格 20×20（1m/格）', id: lv.tileId || 'tile', o: 'U', size: [20, 0.3, 20], task: lvTask(key), p: 'P0', note: '程序生成、染色、消失；A/B 只交 512 地格贴图' }, v3(-6, 0.4, 9.5));
    // 围栏
    if (lv.fence) {
      const g = new THREE.Group(); const h = lv.fence;
      [[0, -10.15, 20.3, 0.15], [0, 10.15, 20.3, 0.15], [-10.15, 0, 0.15, 20.3], [10.15, 0, 0.15, 20.3]].forEach(([x, z, w, d]) => {
        const m = edges(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam('#c9a57a'))); m.position.set(x, h / 2, z); g.add(m);
      });
      scene.add(g);
      reg(W, g, { name: `纸围栏（高 ${h}m，碰撞由程序做）`, id: 'kit_fence', o: 'A', size: [1, h, 0.15], task: 'A01', p: 'P0', note: '1m 模块沿平台边拼接' }, v3(10.2, h + 0.3, 3));
    }
    // 出生区
    const spawnInfo = { name: '出生区', id: 'spawn', o: 'U', task: lvTask(key), p: 'P0', note: '程序判定区，不需要美术' };
    const zones = lv.spawnCorners ? [[0, 0, 2, 2], [17, 0, 19, 2], [0, 17, 2, 19], [17, 17, 19, 19]] : lv.spawn ? [lv.spawn] : [];
    zones.forEach((z, i) => {
      const [c0, r0, c1, r1] = z, w = c1 - c0 + 1, d = r1 - r0 + 1;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: lv.spawnCorners ? BP.TEAM[i] : '#3ddc84', transparent: true, opacity: 0.35, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(tileX(c0) + (w - 1) / 2, 0.03, tileZ(r0) + (d - 1) / 2); scene.add(m);
      reg(W, m, { ...spawnInfo, size: [w, 0, d] }, i === 0 ? v3(m.position.x, 0.4, m.position.z) : null);
    });
    // 南侧镜头带
    const cam = new THREE.Mesh(new THREE.PlaneGeometry(24, 5), new THREE.MeshBasicMaterial({ color: '#ff5a5a', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    cam.rotation.x = -Math.PI / 2; cam.position.set(0, -0.12, 14.5); scene.add(cam);
    reg(W, cam, { name: '南侧 = 镜头位，禁放任何物件', id: 'no-build:south', o: 'U', size: [24, 0, 5], p: 'P0', note: '手机镜头从南往北看，这里放东西会挡画面' }, v3(0, 0.2, 14.5));
    // 灯市：三区与地面大字
    if (key === '02-dengshi') {
      [['甲', -7, '上元'], ['乙', 0, '中秋'], ['丙', 7, '端午']].forEach(([k, x, ans], i) => {
        const t = new THREE.Mesh(new THREE.PlaneGeometry(i === 1 ? 6 : 4.6, 2.3), new THREE.MeshBasicMaterial({ map: textTex(ans, '#ffe8a8'), transparent: true, depthWrite: false }));
        t.rotation.x = -Math.PI / 2; t.position.set(x, 0.04, 1); scene.add(t);
        reg(W, t, { name: `答案区${k} ${i === 1 ? '8' : '6'}×20 · 地面答案字`, id: 'zone+ground-text（程序文字贴图）', o: 'U', size: [i === 1 ? 8 : 6, 0, 20], task: 'U05', p: 'P0', note: '答案字由程序按题库生成，不烘焙进贴图' }, v3(x, 0.3, 4));
      });
      [-4, 4].forEach((x) => {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 20), new THREE.MeshBasicMaterial({ color: '#ffe08a' }));
        s.position.set(x, 0.02, 0); scene.add(s);
      });
    }
  }
  function lvTask(key) { return { '00-lobby': 'U02', '01-jinshi': 'U04', '02-dengshi': 'U05', '03-qibaoshi': 'U06', '04-shisan': 'U07', '05-jiushi': 'U08', '06-guishi': 'U09' }[key]; }

  function buildStairs(W) {
    const { scene } = W;
    const geo = new THREE.BoxGeometry(0.95, 0.6, 1.15);
    const tiles = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: '#fff' }), 200);
    const r = mulberry(11);
    W.gaps = {};
    [5, 10, 15].forEach((s) => { const w = 3 + Math.floor(r() * 2); const c0 = Math.floor(r() * (10 - w)); W.gaps[s] = [c0, c0 + w - 1]; });
    W.stepPos = []; W.tileBase = [];
    const m4 = new THREE.Matrix4(); const cA = new THREE.Color('#efe2c6'), cB = new THREE.Color('#e3d2b0');
    for (let s = 0; s < 20; s++) for (let c = 0; c < 10; c++) {
      const i = s * 10 + c, x = c - 4.5, z = 11.4 - s * 1.2, y = s * 0.35 - 0.3;
      const gap = W.gaps[s] && c >= W.gaps[s][0] && c <= W.gaps[s][1];
      W.stepPos[i] = [x, y, z, gap];
      m4.makeTranslation(x, y, z); if (gap) m4.scale(v3(0, 0, 0));
      tiles.setMatrixAt(i, m4);
      const col = (s + c) % 2 ? cA : cB; W.tileBase[i] = col; tiles.setColorAt(i, col);
    }
    scene.add(tiles); W.tiles = tiles; W.stairs = true;
    reg(W, tiles, { name: '台阶 20级×10格（深1.2 高0.35）', id: 'guishi_step（程序拼）', o: 'U', size: [10, 7, 24], task: 'U09', p: 'P0', note: '缺口第6/11/16级附近 3–4 格，种子决定；A 只交台阶贴图与赛道外装饰' }, v3(-5.6, 2.6, 4));
    const top = edges(new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 4), lam('#f3e6c9')));
    top.position.set(0, 6.7, -14); scene.add(top);
    reg(W, top, { name: '顶台 10×4', id: 'guishi_top', o: 'U', size: [10, 0.6, 4], task: 'U09', p: 'P0' }, v3(5.5, 7.4, -14));
    // 码头台面（两侧，赛道外）
    const dock = new THREE.Group();
    [-7.5, 7.5].forEach((x) => { const m = edges(new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 28), lam('#b89a74'))); m.position.set(x, -0.3, -1); dock.add(m); });
    scene.add(dock);
    reg(W, dock, { name: '码头台面（两侧，玩家不可进）', id: 'kit_platform:dock', o: 'A', size: [4, 0.6, 28], task: 'A09', p: 'P0', note: '装饰都放这里，不碰赛道' }, v3(-7.5, 0.3, 12));
    // 起点区
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.6), new THREE.MeshBasicMaterial({ color: '#3ddc84', transparent: true, opacity: 0.3, depthWrite: false }));
    sp.rotation.x = -Math.PI / 2; sp.position.set(0, 0.36, 10.2); scene.add(sp);
    reg(W, sp, { name: '起点（最下 3 级）', id: 'spawn', o: 'U', size: [10, 0, 3.6], task: 'U09', p: 'P0' }, null);
  }

  function addProp(W, p) {
    const list = p.multi || [p.pos];
    list.forEach((pos, k) => {
      const obj = makeShape(p);
      obj.position.set(pos[0], p.y || 0, pos[1]);
      if (p.rot) obj.rotation.y = p.rot;
      W.scene.add(obj);
      const top = (p.y || 0) + p.size[1] + 0.4;
      reg(W, obj, p, k === 0 ? v3(pos[0], top, pos[1]) : null);
    });
  }
  function makeShape(p) {
    const [w, h, d] = p.size; const g = new THREE.Group();
    const isStall = p.id === 'kit_stall';
    const fill = p.o === 'B' ? '#efe3c8' : p.hero ? HERO : PAPER;
    if (p.id === 'kit_cutout') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), [lam('#c8b89a'), lam('#c8b89a'), lam('#c8b89a'), lam('#c8b89a'), new THREE.MeshLambertMaterial({ map: cutoutTex(p.name) }), lam('#c8b89a')]);
      m.position.y = h / 2; g.add(m);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.5), lam('#a88')); leg.position.set(0, 0.2, -0.25); g.add(leg);
    } else if (isStall) {
      const roofCol = /赭红/.test(p.name) ? '#b4553a' : /青绿/.test(p.name) ? '#4f9a86' : /素白/.test(p.name) ? '#f3f3f0' : /暖木/.test(p.name) ? '#b8864f' : /盖布/.test(p.name) ? '#8f897e' : '#c8402f';
      const body = edges(new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.45, d * 0.8), lam(fill))); body.position.y = h * 0.225; g.add(body);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => { const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 0.12), lam('#9b7b55')); post.position.set(sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1)); g.add(post); });
      const roof = edges(new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.25, d + 0.3), lam(roofCol))); roof.position.y = h; roof.rotation.x = -0.12; g.add(roof);
      const label = (p.name.match(/“(.+?)”/) || [])[1];
      if (label) { const s = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), new THREE.MeshBasicMaterial({ map: textTex(label, '#3b2a1a', '#f7efdd') })); s.position.set(0, h * 0.62, d / 2 + 0.02); g.add(s); }
    } else if (p.shape === 'cyl') {
      const m = edges(new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2 * 0.85, h, 14), lam(p.id.includes('jar') ? '#8b5a3c' : fill))); m.position.y = h / 2; g.add(m);
    } else if (p.shape === 'tree') {
      const flower = /灯/.test(p.name) ? LANTERN : /桂/.test(p.name) ? '#f2c230' : '#7fb069';
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.08, w * 0.1, h * 0.45, 8), lam('#8a6a48')); trunk.position.y = h * 0.225; g.add(trunk);
      const crown = edges(new THREE.Mesh(new THREE.IcosahedronGeometry(w * 0.55, 0), lam(/桂/.test(p.name) ? '#5f8f4e' : flower, /灯/.test(p.name) ? { emissive: '#7a2a00' } : {})));
      crown.scale.set(1, (h * 0.6) / (w * 1.1), 1); crown.position.y = h * 0.68; g.add(crown);
      if (/桂/.test(p.name)) for (let i = 0; i < 10; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(w * 0.07, 6, 4), lam('#f2c230', { emissive: '#553300' })); f.position.set((rnd() - 0.5) * w, h * 0.5 + rnd() * h * 0.4, (rnd() - 0.5) * w); g.add(f); }
    } else if (p.shape === 'lantern') {
      const m = edges(new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 10), lam('#e8553a', { emissive: '#7a1c00' }))); m.position.y = h / 2; g.add(m);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.35, w * 0.35, 0.12, 10), lam('#3b2a1a')); cap.position.y = h + 0.06; g.add(cap);
      if (p.pole) { const pole = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), lam('#6b4a2a')); pole.position.y = -1.2; g.add(pole); g.position.y = 2.4; m.position.y = h / 2; }
      g.userData.lantern = m;
    } else if (h > 2.5) {
      // 建筑类地标：主体 + 檐
      const body = edges(new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, h * 0.72, d * 0.8), lam(fill))); body.position.y = h * 0.36; g.add(body);
      const roof = edges(new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, h * 0.28, 4), lam(/寺|牌坊|灯楼/.test(p.name) ? '#b4553a' : '#5a4a3a')));
      roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, d / w + 0.25); roof.position.y = h * 0.86; g.add(roof);
      if (/门|牌坊/.test(p.name)) { const door = new THREE.Mesh(new THREE.BoxGeometry(w * 0.32, h * 0.5, 0.1), lam(/关门/.test(p.name) ? '#7a3a28' : '#2a2018')); door.position.set(0, h * 0.25, d * 0.4 + 0.06); g.add(door); }
      if (/灯楼/.test(p.name)) { const glow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, h * 0.35, 0.1), lam('#ffd27a', { emissive: '#aa6a00' })); glow.position.set(0, h * 0.4, d * 0.4 + 0.06); g.add(glow); }
    } else {
      const m = edges(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(fill))); m.position.y = h / 2; g.add(m);
    }
    return g;
  }

  // 玩家：圆胖纸人（身体+大头+帽）
  const HAT = { '00-lobby': 'none', '01-jinshi': '#3a2a22', '02-dengshi': '#262626', '03-qibaoshi': '#4a5a50', '04-shisan': 'straw', '05-jiushi': '#2a2a3a', '06-guishi': '#7a2a2a' };
  function makeBuddy(color, hat) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.12, 4, 10), lam(color)); body.position.y = 0.42; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), lam('#fbefd9')); head.position.y = 0.92; g.add(head);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.02), lam('#222')); eye.position.set(0, 0.95, 0.29); g.add(eye);
    if (hat === 'straw') { const h = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.22, 12), lam('#c8a86a')); h.position.y = 1.24; g.add(h); }
    else if (hat !== 'none') { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.2, 10), lam(hat)); h.position.y = 1.25; g.add(h); }
    g.userData.body = body;
    return g;
  }
  function buildPlayers(W) {
    const counts = { '00-lobby': 12, '01-jinshi': 16, '02-dengshi': 12, '03-qibaoshi': 10, '04-shisan': 9, '05-jiushi': 7, '06-guishi': 4 };
    const n = counts[W.key];
    for (let i = 0; i < n; i++) {
      const g = makeBuddy(BP.BODY[i % 8], HAT[W.key]);
      const p = { g, team: i % 4, x: 0, y: 0, z: 0, tx: 0, tz: 0, alive: true, carry: null, stepIdx: 0, delivered: 0 };
      spawnPos(W, p, i);
      g.position.set(p.x, p.y, p.z);
      if (W.key === '01-jinshi') { const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 20), new THREE.MeshBasicMaterial({ color: BP.TEAM[p.team], side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring); }
      W.scene.add(g); W.players.push(p);
      if (i === 0) {
        const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.2, 4, 12), new THREE.MeshBasicMaterial({ color: '#4fd1c5', wireframe: true, transparent: true, opacity: 0.35 }));
        cap.position.y = 0.5; g.add(cap);
        reg(W, g, { name: '纸人角色（你）', id: `char_paperbuddy + ${({ '00-lobby': '无帽', '04-shisan': 'hat_yuan', '06-guishi': 'hat_qing 换色' })[W.key] || 'hat_' + ({ '01-jinshi': 'han', '02-dengshi': 'tang', '03-qibaoshi': 'song', '05-jiushi': 'qing' })[W.key]}`, o: 'A', size: [0.8, 1.1, 0.8], task: 'A02 / U02', p: 'P0', note: '青色线框 = 碰撞胶囊 r0.4 h1.0（U）；身体颜色程序染' }, null);
        const div = document.createElement('div'); div.className = 'lbl you'; div.textContent = '你';
        const l = new CSS2DObject(div); l.position.set(0, 1.7, 0); g.add(l);
      }
    }
  }
  function spawnPos(W, p, i) {
    const r = mulberry(i * 13 + 5);
    if (W.lv.stairs) { const s = Math.floor(r() * 3); p.stepIdx = s; p.x = -4 + r() * 8; p.z = 11.4 - s * 1.2; p.y = s * 0.35; return; }
    let zone = W.lv.spawnCorners ? [[0, 0, 2, 2], [17, 0, 19, 2], [0, 17, 2, 19], [17, 17, 19, 19]][p.team] : W.lv.spawn || [3, 3, 16, 16];
    if (i === 0 && !W.lv.spawnCorners) zone = [zone[0] + 1, zone[3], zone[2] - 1, zone[3]];
    p.x = tileX(zone[0]) - 0.4 + r() * (zone[2] - zone[0] + 0.8);
    p.z = tileZ(zone[1]) - 0.4 + r() * (zone[3] - zone[1] + 0.8);
    p.y = 0; p.tx = p.x; p.tz = p.z;
  }
  function buildSacks(W) {
    const info = W.lv.dyn[0];
    for (let i = 0; i < 14; i++) {
      const m = edges(new THREE.Mesh(new THREE.BoxGeometry(...info.size), lam('#d9b77a')));
      m.position.set((rnd() - 0.5) * 13, 0.2, (rnd() - 0.5) * 13); W.scene.add(m); W.dyn.push({ m, held: null });
      reg(W, m, info, i === 0 ? m.position.clone().add(v3(0, 0.6, 0)) : null);
    }
    // 交付圈
    [[-8.5, -8.5], [8.5, -8.5], [-8.5, 8.5], [8.5, 8.5]].forEach(([x, z], i) => {
      const c = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.5, 32), new THREE.MeshBasicMaterial({ color: '#4fd1c5', side: THREE.DoubleSide }));
      c.rotation.x = -Math.PI / 2; c.position.set(x, 0.05, z); W.scene.add(c);
      reg(W, c, { name: '交付区 r=1.5m', id: 'deliver-zone', o: 'U', size: [3, 0, 3], task: 'U08', p: 'P0' }, i === 0 ? v3(x + 1.6, 0.4, z) : null);
    });
  }

  // ───────────────────────── 玩法动画（示意） ─────────────────────────
  function tick(W, dt) {
    W.clock += dt;
    if (W.fx.sea) W.fx.sea.offset.x += dt * (W.key === '04-shisan' ? 0.05 : 0.012);
    if (W.fx.clouds) W.fx.clouds.children.forEach((c) => { c.position.x += c.userData.vx * dt; if (c.position.x > 26) c.position.x = -26; });
    const playing = W.phase === 'play' || W.phase === 'lobby' || W.phase === 'spectate';
    const m4 = new THREE.Matrix4();
    W.players.forEach((p, i) => {
      if (!p.alive) return;
      if (W.phase === 'result') { p.g.position.y = p.y + Math.abs(Math.sin(W.clock * 6 + i)) * 0.3; return; }
      if (!playing) return;
      if (W.stairs) return stairsPlayer(W, p, i, dt);
      let tx = p.tx, tz = p.tz;
      if (W.key === '02-dengshi') { const q = W.clock % 14; const zone = [-7, 0, 7][(i + Math.floor(W.clock / 14)) % 3]; if (q < 10) { tx = zone + Math.sin(i * 7) * 2; tz = Math.cos(i * 3) * 6; } }
      else if (W.key === '05-jiushi') {
        if (!p.carry) { let best = null, bd = 1e9; W.dyn.forEach((s) => { if (s.held) return; const d = (s.m.position.x - p.x) ** 2 + (s.m.position.z - p.z) ** 2; if (d < bd) { bd = d; best = s; } }); if (best) { tx = best.m.position.x; tz = best.m.position.z; if (bd < 0.64) { p.carry = best; best.held = p; } } }
        else { const j = [[-8.5, -8.5], [8.5, -8.5], [-8.5, 8.5], [8.5, 8.5]].sort((a, b) => ((a[0] - p.x) ** 2 + (a[1] - p.z) ** 2) - ((b[0] - p.x) ** 2 + (b[1] - p.z) ** 2))[0]; tx = j[0]; tz = j[1];
          if ((tx - p.x) ** 2 + (tz - p.z) ** 2 < 2) { const s = p.carry; s.held = null; p.carry = null; s.m.position.set((rnd() - 0.5) * 13, 0.2, (rnd() - 0.5) * 13); } }
      } else if (W.key === '03-qibaoshi' && W.dyn.length) {
        let best = null, bd = 1e9; W.dyn.forEach((s) => { if (!s.landed) return; const d = (s.m.position.x - p.x) ** 2 + (s.m.position.z - p.z) ** 2; if (d < bd) { bd = d; best = s; } }); if (best && bd < 60) { tx = best.m.position.x; tz = best.m.position.z; }
      }
      if ((tx - p.x) ** 2 + (tz - p.z) ** 2 < 0.2 && W.key !== '02-dengshi') { p.tx = (rnd() - 0.5) * 18; p.tz = (rnd() - 0.5) * 18; }
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), sp = 3.2 * dt;
      if (d > 0.05) { p.x += (dx / d) * Math.min(sp, d); p.z += (dz / d) * Math.min(sp, d); p.g.rotation.y = Math.atan2(dx, dz); }
      p.x = Math.max(-9.6, Math.min(9.6, p.x)); p.z = Math.max(-9.6, Math.min(9.6, p.z));
      // 地格事件
      const c = Math.floor(p.x + 10), r = Math.floor(p.z + 10), idx = r * 20 + c;
      let y = 0;
      if (W.key === '01-jinshi' && W.phase === 'play') W.tiles.setColorAt(idx, new THREE.Color(BP.TEAM[p.team]));
      if (W.key === '04-shisan' && W.phase === 'play' && W.tileState[idx] === 0) W.tileState[idx] = W.clock;
      if (W.key === '02-dengshi') { const q = W.clock % 14, zone = p.x < -4 ? 0 : p.x < 4 ? 1 : 2, right = Math.floor(W.clock / 14) % 3; if (q > 10 && q < 12 && zone !== right) y = -(q - 10) * 4; }
      if (W.key === '04-shisan' && W.tileState[idx] && W.clock - W.tileState[idx] > 0.6) y = -3;
      p.y = y; p.g.position.set(p.x, y + Math.abs(Math.sin(W.clock * 9 + i)) * 0.08, p.z);
      if (p.carry) p.carry.m.position.set(p.x, 1.5, p.z);
    });
    // 灯市塌陷/点灯
    if (W.key === '02-dengshi' && W.tiles) {
      const q = W.clock % 14, right = Math.floor(W.clock / 14) % 3;
      for (let r = 0; r < 20; r++) for (let c = 0; c < 20; c++) {
        const zone = c < 6 ? 0 : c < 14 ? 1 : 2; let y = -0.15;
        if (zone !== right) { if (q > 10 && q < 12) y -= (q - 10) * 3; else if (q >= 12) y -= Math.max(0, (14 - q) * 3); }
        m4.makeTranslation(tileX(c), y, tileZ(r)); W.tiles.setMatrixAt(r * 20 + c, m4);
      }
      W.tiles.instanceMatrix.needsUpdate = true;
      W.items.forEach((it) => { if (it.info.name && it.info.name.startsWith('选择灯')) { /* multi：按位置点亮 */ const x = it.obj.position.x, z = x < -3 ? 0 : x < 3 ? 1 : 2; const lit = q > 10 && z === right; it.obj.userData.lantern.material.emissive.set(lit ? '#ffcc33' : '#7a1c00'); } });
    }
    // 市散：抖动→消失
    if (W.key === '04-shisan' && W.tiles) {
      if (W.clock > 30) { W.clock = 0; W.tileState.fill(0); W.players.forEach((p, i) => spawnPos(W, p, i)); }
      for (let i = 0; i < 400; i++) {
        const t0 = W.tileState[i]; const c = i % 20, r = Math.floor(i / 20);
        if (!t0) { m4.makeTranslation(tileX(c), -0.15, tileZ(r)); }
        else { const a = W.clock - t0; if (a < 0.4) m4.makeTranslation(tileX(c) + Math.sin(a * 80) * 0.05, -0.15, tileZ(r)); else if (a < 0.6) { m4.makeTranslation(tileX(c), -0.15 - (a - 0.4) * 2, tileZ(r)); W.tiles.setColorAt(i, new THREE.Color('#8a6a50')); } else { m4.makeTranslation(0, -50, 0); } }
        W.tiles.setMatrixAt(i, m4);
      }
      W.tiles.instanceMatrix.needsUpdate = true;
    }
    if (W.key === '01-jinshi' && W.tiles && W.tiles.instanceColor) W.tiles.instanceColor.needsUpdate = true;
    if (W.key === '04-shisan' && W.tiles && W.tiles.instanceColor) W.tiles.instanceColor.needsUpdate = true;
    // 七宝市：交子雨
    if (W.key === '03-qibaoshi' && W.phase === 'play') {
      W.spawnAcc = (W.spawnAcc || 0) + dt * 5;
      while (W.spawnAcc > 1) {
        W.spawnAcc -= 1;
        const m = new THREE.Mesh(new THREE.BoxGeometry(...W.dynInfo.size), lam('#f6e7b0', { emissive: '#3a2a00' }));
        m.position.set((rnd() - 0.5) * 17, 6, (rnd() - 0.5) * 17); m.userData.info = W.dynInfo; W.scene.add(m);
        W.dyn.push({ m, born: W.clock, landed: false });
        if (!W.jiaoziLabel) { W.jiaoziLabel = true; reg(W, m, W.dynInfo, null); }
      }
      W.dyn = W.dyn.filter((s) => {
        const a = W.clock - s.born;
        if (a < 2) { s.m.position.y = 6 - a * 3; s.m.rotation.set(a * 3, a * 2, a); }
        else if (!s.landed) { s.landed = true; s.m.position.y = 0.05; s.m.rotation.set(0, s.m.rotation.y, 0); }
        const taken = s.landed && W.players.some((p) => (p.x - s.m.position.x) ** 2 + (p.z - s.m.position.z) ** 2 < 0.64);
        if (a > 10 || taken) { W.scene.remove(s.m); s.m.geometry.dispose(); return false; }
        return true;
      });
    }
  }
  function stairsPlayer(W, p, i, dt) {
    // 逐级上跳；底部逐级塌落
    const collapse = W.phase === 'play' ? Math.max(0, Math.floor((W.clock - 3) / 1.1)) : -1;
    if (W.phase === 'play') {
      p.hop = (p.hop || 0) + dt * (2.2 + (i % 3) * 0.4);
      if (p.hop > 1 && p.stepIdx < 19) { p.hop = 0; p.stepIdx++; const g = W.gaps[p.stepIdx]; if (g) { /* 跳过缺口：落到下一级 */ p.stepIdx = Math.min(19, p.stepIdx + 1); } }
      if (W.clock > 24) { W.clock = 0; W.players.forEach((q, k) => spawnPos(W, q, k)); }
    }
    const tz = 11.4 - p.stepIdx * 1.2, ty = p.stepIdx * 0.35;
    p.z += (tz - p.z) * Math.min(1, dt * 8); p.y += (ty - p.y) * Math.min(1, dt * 8);
    p.g.position.set(p.x, p.y + Math.sin(Math.min(1, p.hop || 0) * Math.PI) * 0.5, p.z); p.g.rotation.y = Math.PI;
    if (i === 0 && W.tiles) {
      const m4 = new THREE.Matrix4();
      for (let k = 0; k < 200; k++) { const [x, y, z, gap] = W.stepPos[k]; const s = Math.floor(k / 10); m4.makeTranslation(x, s < collapse ? y - (collapse - s) * 2 : y, z); if (gap || s < collapse - 3) m4.scale(v3(0, 0, 0)); W.tiles.setMatrixAt(k, m4); }
      W.tiles.instanceMatrix.needsUpdate = true;
    }
  }

  // ───────────────────────── 视口 ─────────────────────────
  class Viewport {
    constructor(dev) {
      this.dev = dev;
      this.slot = document.createElement('div'); this.slot.className = 'vp-slot';
      this.cap = document.createElement('div'); this.cap.className = 'vp-cap';
      this.box = document.createElement('div'); this.box.className = 'vp-box';
      this.frameEl = document.createElement('div'); this.frameEl.className = 'frame' + (dev === 'big' ? ' big' : '');
      this.box.appendChild(this.frameEl); this.slot.append(this.box, this.cap);
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.frameEl.appendChild(this.renderer.domElement);
      this.css = new CSS2DRenderer(); this.css.domElement.className = 'layer labels'; this.frameEl.appendChild(this.css.domElement);
      this.video = document.createElement('div'); this.video.className = 'layer video'; this.frameEl.appendChild(this.video);
      this.ui = document.createElement('div'); this.ui.className = 'layer ui'; this.frameEl.appendChild(this.ui);
      this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 500);
      this.controls = new OrbitControls(this.camera, this.css.domElement);
      this.controls.enabled = false;
      this.world = null; this.native = [844, 390]; this.scale = 1;
      this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.snap = true;
      let down = null;
      this.frameEl.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
      this.frameEl.addEventListener('click', (e) => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
        if (e.target.closest('.uib') || e.target.closest('.lbl')) return;
        this.pick(e);
      });
    }
    setNative(w, h) {
      if (this.native[0] === w && this.native[1] === h) return;
      this.native = [w, h]; this.layout();
    }
    fit(aw, ah) { this.avail = [aw, ah]; this.layout(); }
    layout() {
      if (!this.avail) return;
      const [w, h] = this.native, [aw, ah] = this.avail;
      const s = Math.min(aw / w, (ah - 24) / h, 1.6);
      this.scale = s;
      this.frameEl.style.width = w + 'px'; this.frameEl.style.height = h + 'px'; this.frameEl.style.transform = `scale(${s})`;
      this.box.style.width = w * s + 'px'; this.box.style.height = h * s + 'px';
      this.renderer.setPixelRatio(Math.min(2, (window.devicePixelRatio || 1) * s));
      this.renderer.setSize(w, h, true); this.css.setSize(w, h);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    }
    setWorld(key) {
      if (this.world && this.world.key === key) return;
      if (this.world) disposeWorld(this.world);
      this.css.domElement.innerHTML = '';
      this.world = key ? buildWorld(key) : null;
      this.snap = true;
      applyToggles(this);
    }
    pick(e) {
      if (!this.world || this.renderer.domElement.style.visibility === 'hidden') return;
      const r = this.renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, this.camera);
      const hit = rc.intersectObjects(this.world.scene.children, true).find((h) => h.object.userData.info && h.object.visible && !h.object.userData.info.env);
      if (hit) select(hit.object.userData.info); else select(null);
    }
    camTarget(mode) {
      const W = this.world, lv = W.lv;
      if (mode === 'top' || (this.dev === 'big' && mode === 'game') || W.phase === 'spectate') {
        if (lv.stairs) return [v3(17, 15, 16), v3(0, 3, -3)];
        const pitch = (55 * Math.PI) / 180, d = 34;
        return [v3(0, Math.sin(pitch) * d, Math.cos(pitch) * d - 4), v3(0, 0, -4)];
      }
      const p = W.players[0];
      if (lv.stairs) return [v3(p.x * 0.5, p.y + 3.4, p.z + 8.5), v3(p.x * 0.5, p.y + 2.6, p.z - 6)];
      const pitch = ((lv.pitch || 45) * Math.PI) / 180, d = lv.camDist || 12;
      return [v3(p.x, p.y + Math.sin(pitch) * d, p.z + Math.cos(pitch) * d), v3(p.x, p.y, p.z)];
    }
    render(dt) {
      if (!this.world || this.renderer.domElement.style.visibility === 'hidden') return;
      tick(this.world, dt);
      if (S.cam === 'free') {
        if (!this.controls.enabled) { this.controls.enabled = true; this.css.domElement.style.pointerEvents = 'auto'; const [pos, look] = this.camTarget('top'); this.camera.position.copy(pos); this.controls.target.copy(look); }
        this.controls.update();
      } else {
        if (this.controls.enabled) { this.controls.enabled = false; this.css.domElement.style.pointerEvents = 'none'; this.snap = true; }
        const [pos, look] = this.camTarget(S.cam);
        const k = this.snap ? 1 : Math.min(1, dt * 6); this.snap = false;
        this.camPos.lerp(pos, k); this.camLook.lerp(look, k);
        this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
      }
      this.renderer.render(this.world.scene, this.camera);
      this.css.render(this.world.scene, this.camera);
    }
  }
  function disposeWorld(W) {
    W.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); });
  }
  function applyToggles(vp) {
    vp.css.domElement.classList.toggle('hide-3dlbl', !S.tg.lbl3d);
    vp.css.domElement.classList.toggle('hide-size', !S.tg.size);
    vp.ui.classList.toggle('hide-uilbl', !S.tg.lblui);
    vp.ui.style.display = S.cam === 'free' ? 'none' : '';
    if (!vp.world) return;
    vp.world.items.forEach(({ obj, info, label }) => {
      const hide = S.tg.p0 && info.p === 'P1';
      obj.visible = !hide; if (label) label.visible = !hide;
      obj.traverse((m) => { if (m.isMesh && m.userData.base && m.material.color && !m.isInstancedMesh) m.material.color.copy(S.tg.tint ? new THREE.Color(OC(info.o)) : m.userData.base); });
    });
  }

  // ───────────────────────── 画面内容（UI / 视频） ─────────────────────────
  const SAFE = [{ x: 0, y: 0, w: 44, h: 390, o: 'U', id: '安全区 44px', cls: 'safe' }, { x: 800, y: 0, w: 44, h: 390, o: 'U', id: '安全区 44px', cls: 'safe' }];

  function lobbyUI(dev, cnt = 12) {
    if (dev === 'phone') return [
      { x: 172, y: 8, w: 500, h: 40, o: 'B', id: 'ui/hud_topbar', text: `大厅 · 在场 ${cnt}/32 · 等待房主开始`, cls: 'bar', note: '大厅复用 HUD 顶栏' },
      { x: 590, y: 56, w: 210, h: 30, o: 'B', id: 'ui/hud_info', text: '你：玩家01', cls: 'chip' },
      ...BP.HUD(BP.LEVELS['00-lobby']).filter((b) => /joystick|jump|touch/.test(b.id)),
    ];
    return [
      { x: 60, y: 40, w: 900, h: 110, o: 'B', id: 'ui/logo_big', text: '锦江十二月市 · 千年赶集', cls: 'bar big-t', note: 'B02 出字形 Logo' },
      { x: 60, y: 200, w: 460, h: 560, o: 'U', id: 'qr（U12 生成）', cls: 'qr', html: '<div class="qrbox"></div>扫码进场', note: '二维码由部署地址生成；外框样式 B02' },
      { x: 60, y: 790, w: 460, h: 80, o: 'B', id: 'ui/lobby_count', text: `在场 ${cnt} / 32`, cls: 'bar big-t' },
      { x: 1400, y: 200, w: 480, h: 640, o: 'U', id: 'lobby-namegrid', cls: 'names', html: BP.names(cnt), note: '名字程序生成；底板 B02' },
      ...BP.BIGHOST,
    ];
  }
  function entryUI(phase) {
    if (phase === 'portrait') return [
      { x: 0, y: 0, w: 390, h: 844, o: 'B', id: 'ui/bg_paper', cls: 'paper' },
      { x: 45, y: 250, w: 300, h: 300, o: 'B', id: 'ui/rotate_hint', cls: 'hint', html: '<div style="font-size:80px">⟲</div>请把手机横过来', note: 'iOS 无法锁横屏，竖屏时一直显示' },
    ];
    const sw = BP.BODY.map((c, i) => ({ x: 262 + i * 42, y: 214, w: 34, h: 34, o: 'U', id: i ? '' : 'color-swatch ×8（程序色）', cls: 'sw', html: '', style: `background:${c}` }));
    return [
      { x: 0, y: 0, w: 844, h: 390, o: 'B', id: 'ui/bg_paper', cls: 'paper' },
      { x: 222, y: 26, w: 400, h: 70, o: 'B', id: 'ui/logo', text: '锦江十二月市', cls: 'bar', note: '字形 Logo', style: 'font-size:30px' },
      { x: 262, y: 130, w: 320, h: 50, o: 'U', id: 'input:name', text: '输入名字（≤6字）', cls: 'input' },
      ...sw,
      { x: 322, y: 290, w: 200, h: 56, o: 'B', id: 'ui/btn_enter', text: '进 入', cls: 'btn', note: '点击同时解锁音频' },
    ];
  }

  function renderUI(vp, boxes) {
    vp.ui.innerHTML = '';
    boxes.forEach((b) => {
      const d = document.createElement('div');
      d.className = 'uib ' + (b.cls || '');
      d.style.cssText = `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;--c:${OC(b.o)};${b.style || ''}`;
      if (b.html != null) d.innerHTML = b.html; else d.textContent = b.text || '';
      if (b.id) { const t = document.createElement('div'); t.className = 'tag'; t.textContent = `${b.o} · ${b.id}`; d.appendChild(t); }
      d.addEventListener('click', (e) => { e.stopPropagation(); if (b.id && !/dim/.test(b.cls || '')) select({ name: b.text || b.id, id: b.id, o: b.o, ui: true, size: null, px: [b.x, b.y, b.w, b.h], note: b.note, dev: vp.dev }); });
      b.el = d; vp.ui.appendChild(d);
    });
    vp.boxes = boxes;
  }

  function videoShot(v, t) { return v.shots.find((s) => t >= s.t0 && t < s.t1) || v.shots[v.shots.length - 1]; }
  // 手机 844×390 用 cover 铺满 16:9 源片：源片上下各裁掉约 96px，只有中间 1920×888 可见
  const PHONE_CROP = { y: 96, h: 888 };
  function phoneFile(v) { return v.file.replace('.mp4', '_phone.mp4'); }
  function renderVideo(vp, v, t) {
    const s = videoShot(v, t);
    if (vp.lastShot === s) return; vp.lastShot = s;
    const big = vp.dev === 'big';
    vp.video.innerHTML = s.pic
      ? `<div class="vimg" style="background-image:url('../concepts/${s.pic}')"></div>`
      : `<div class="vph${big ? '' : ' sm'}">${s.what}<small>${v.title} · ${fmt(s.t0)}–${fmt(s.t1)}s · 关键帧待 B05</small></div>`;
    let boxes;
    if (big) {
      boxes = [
        { x: 40, y: 30, w: 760, h: 54, o: 'B', id: v.file, text: `${v.title} · ${v.prio} · ${v.dur}s · 1920×1080 H.264 · 带声音`, cls: 'chip', note: v.note },
        { x: 40, y: 100, w: 760, h: 54, o: 'B', id: '当前镜头', text: `${fmt(s.t0)}–${fmt(s.t1)}s：${s.what.slice(0, 26)}`, cls: 'chip', note: `${s.what}；声音：${s.sound || '—'}` },
        { x: 0, y: PHONE_CROP.y, w: 1920, h: PHONE_CROP.h, o: 'B', id: '手机可见区（中间 1920×888，上下各裁 96px）', cls: 'crop', note: '字幕、主体、首末帧关键物都放在这条带里，手机全屏铺满时不会被裁掉' },
      ];
      if (v.phoneText && !v.ending) boxes.push({ x: 260, y: 850, w: 1400, h: 100, o: 'B', id: '固定字幕区（烧录，须在手机可见区内）', text: v.phoneText, cls: 'bar', note: '字幕烧录进视频，两端看到同一字幕' });
      if (s.overlay) boxes.push(
        { x: 560, y: 110, w: 800, h: 130, o: 'U', id: 'overlay:champion', text: '冠军 玩家07 · 桂冠', cls: 'overlay', note: 'U11 网页实时叠加，不写进视频' },
        { x: 160, y: 270, w: 1100, h: 580, o: 'U', id: 'overlay:group-photo', text: '全场合影（游戏实时渲染截图）', cls: 'overlay' },
        { x: 1330, y: 270, w: 450, h: 580, o: 'U', id: 'overlay:name-roll', text: '全体名单滚动', cls: 'overlay' });
    } else {
      boxes = [
        { x: 54, y: 10, w: 520, h: 30, o: 'B', id: phoneFile(v), text: `${v.title} · 全屏 CG · 1280×720 · 静音`, cls: 'chip', note: '手机与大屏同步播同一段（服务器下发开始时间）；手机静音，声音只走大屏，避免几十台手机回声。上一关游玩时预加载' },
        { x: 600, y: 10, w: 190, h: 30, o: 'U', id: 'fallback', text: '失败 → 同长文字卡', cls: 'chip', note: `加载失败或没播起来时显示同时长文字卡：“${v.phoneText}”，时长不变，到点照样进下一关` },
      ];
      if (v.phoneText && !v.ending) boxes.push({ x: 120, y: 318, w: 604, h: 42, o: 'B', id: '烧录字幕（来自源片）', text: v.phoneText, cls: 'bar', style: 'font-size:15px', note: '不是网页叠加，是视频画面本身' });
      if (v.ending && s.overlay) boxes.push(
        { x: 222, y: 90, w: 400, h: 150, o: 'U', id: 'overlay:phone-ending', cls: 'ending', html: '<b>冠军 玩家07</b><div>你走到了第 4 关 · 市散</div>', note: '最后 8 秒网页叠加：冠军 + 本人成绩；合影只在大屏' });
      boxes = boxes.concat(SAFE);
    }
    renderUI(vp, boxes);
  }

  // 根据屏/阶段/设备装载视口
  function loadViewport(vp) {
    const scr = BP.FLOW[S.screen], ph = phasesOf(scr)[S.phase];
    const dev = vp.dev; vp.lastShot = null;
    vp.video.style.display = 'none'; vp.renderer.domElement.style.visibility = 'visible'; vp.css.domElement.style.visibility = 'visible';
    let native = dev === 'phone' ? [844, 390] : [1920, 1080];
    let key = null, ui = [], phase = ph.id, cap = '';
    if (scr.kind === 'entry') {
      if (dev === 'phone') { if (ph.id === 'portrait') native = [390, 844]; ui = entryUI(ph.id); key = null; cap = ph.id === 'portrait' ? '手机竖屏 390×844' : '手机横屏'; }
      else { key = '00-lobby'; ui = lobbyUI('big', 3); phase = 'lobby'; }
    } else if (scr.kind === 'level') {
      key = scr.level;
      if (key === '00-lobby') ui = lobbyUI(dev);
      else ui = BP.levelUI(key, ph.id, dev);
      if (ph.id === 'card' || ph.id === 'countdown') phase = 'idle';
      if (dev === 'big' && ph.id === 'spectate') phase = 'play';
    } else if (scr.kind === 'gap') {
      const next = BP.FLOW.find((f) => f.id === scr.next); key = next.level; phase = 'idle';
      const lv = BP.LEVELS[key];
      ui = [{ x: 0, y: 0, w: native[0], h: native[1], o: 'U', id: 'fade（U03）', cls: 'dim full', note: '约2秒淡出→换平台→淡入' },
        { x: native[0] / 2 - (dev === 'phone' ? 200 : 480), y: native[1] / 2 - (dev === 'phone' ? 40 : 90), w: dev === 'phone' ? 400 : 960, h: dev === 'phone' ? 80 : 180, o: 'U', id: 'gap-title', text: `下一关 · ${lv.title}`, cls: 'bar' + (dev === 'big' ? ' big-t' : ''), note: '普通切关不做影片' }];
    } else if (scr.kind === 'video') {
      const v = BP.VIDEOS[scr.video];
      vp.video.style.display = 'block'; vp.renderer.domElement.style.visibility = 'hidden'; vp.css.domElement.style.visibility = 'hidden';
      vp.setNative(...native); renderVideo(vp, v, S.t);
      vp.cap.textContent = `${dev === 'big' ? '大屏' : '手机'} · ${v.title} 全屏 CG 占位`; return;
    }
    vp.setNative(...native);
    vp.setWorld(key);
    if (!key) { vp.renderer.domElement.style.visibility = 'hidden'; vp.css.domElement.style.visibility = 'hidden'; }
    if (vp.world) { if (vp.world.phase !== phase) { vp.world.clock = 0; } vp.world.phase = phase; }
    if (dev === 'phone' && native[1] === 390 && !(scr.kind === 'gap')) ui = ui.concat(SAFE);
    renderUI(vp, ui);
    vp.cap.textContent = (dev === 'phone' ? '手机 · ' : '大屏 · ') + (cap || (key ? BP.LEVELS[key].title : '')) + (dev === 'phone' && ph.id === 'spectate' ? ' · 淘汰后观战' : '');
    applyToggles(vp);
  }

  // ───────────────────────── 流程 / 时间 ─────────────────────────
  function phasesOf(scr) {
    if (scr.phases) return scr.phases;
    if (scr.kind === 'level') return BP.LV_PHASES.map((p) => (p.id === 'play' ? { ...p, dur: BP.LEVELS[scr.level].playDur } : p));
    if (scr.kind === 'gap') return [{ id: 'gap', name: '淡入淡出', dur: 2 }];
    if (scr.kind === 'video') return [{ id: 'video', name: '播放', dur: BP.VIDEOS[scr.video].dur }];
    return [{ id: 'x', name: '', dur: 0 }];
  }
  function go(screen, phase = 0) {
    S.screen = (screen + BP.FLOW.length) % BP.FLOW.length; S.phase = phase; S.t = 0;
    refresh();
  }
  function advance() {
    const ph = phasesOf(BP.FLOW[S.screen]);
    let next = S.phase + 1;
    while (next < ph.length && ph[next].opt) next++;
    if (next < ph.length) { S.phase = next; S.t = 0; refresh(); } else go(S.screen + 1);
  }
  let VPS = [];
  function refresh() {
    VPS.forEach(loadViewport);
    renderFlow(); renderTimeline(); renderPanel();
  }
  function setupViewports() {
    stageEl.innerHTML = ''; VPS.forEach((v) => { if (v.world) disposeWorld(v.world); v.renderer.dispose(); });
    VPS = (S.dev === 'both' ? ['phone', 'big'] : [S.dev]).map((d) => new Viewport(d));
    VPS.forEach((v) => stageEl.appendChild(v.slot));
    fitAll(); refresh();
  }
  function fitAll() {
    const r = stageEl.getBoundingClientRect(); const n = VPS.length;
    VPS.forEach((v) => v.fit((r.width - 28 - (n - 1) * 18) / n, r.height - 28));
  }
  window.addEventListener('resize', fitAll);

  // ───────────────────────── 头部流程条 / 时间轴 / 侧栏 ─────────────────────────
  const flowEl = document.getElementById('flow');
  function renderFlow() {
    flowEl.innerHTML = '';
    BP.FLOW.forEach((f, i) => {
      if (i) { const a = document.createElement('span'); a.className = 'arr'; a.textContent = '→'; flowEl.appendChild(a); }
      const n = document.createElement('div'); n.className = `node g-${f.group}` + (i === S.screen ? ' on' : '');
      const d = f.kind === 'level' && f.level !== '00-lobby' ? `${BP.LEVELS[f.level].playDur}s` : f.kind === 'gap' ? '2s' : '';
      n.innerHTML = `${f.title}${d ? `<small>${d}</small>` : ''}`;
      n.onclick = () => go(i);
      flowEl.appendChild(n);
      if (i === S.screen) n.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }
  const tlBar = document.getElementById('tlBar'), tabsEl = document.getElementById('phaseTabs');
  function renderTimeline() {
    const scr = BP.FLOW[S.screen], ph = phasesOf(scr);
    document.getElementById('tlTitle').textContent = scr.title;
    tabsEl.innerHTML = '';
    if (ph.length > 1) ph.forEach((p, i) => { const b = document.createElement('button'); b.textContent = p.name + (p.dur ? ` ${p.dur}s` : ''); if (i === S.phase) b.className = 'on'; b.onclick = () => { S.phase = i; S.t = 0; refresh(); }; tabsEl.appendChild(b); });
    tlBar.innerHTML = '';
    let segs;
    if (scr.kind === 'video') segs = BP.VIDEOS[scr.video].shots.map((s, i) => ({ name: s.what, sub: `${fmt(s.t0)}–${fmt(s.t1)}s ${s.sound || ''}`, dur: s.t1 - s.t0, on: S.t >= s.t0 && S.t < s.t1, ov: s.overlay, click: () => { S.t = s.t0; VPS.forEach((v) => (v.lastShot = null)); } }));
    else segs = ph.filter((p) => !p.opt || ph.indexOf(p) === S.phase).map((p) => ({ name: p.name, sub: p.dur ? `${p.dur}s` : '不限 / 演示', dur: p.dur || 6, on: ph.indexOf(p) === S.phase, click: () => { S.phase = ph.indexOf(p); S.t = 0; refresh(); } }));
    const total = segs.reduce((a, s) => a + s.dur, 0);
    segs.forEach((s) => { const d = document.createElement('div'); d.className = 'tl-seg' + (s.on ? ' on' : '') + (s.ov ? ' ov' : ''); d.style.flex = s.dur / total; d.innerHTML = `<b>${s.name}</b><span>${s.sub}</span>`; d.onclick = s.click; tlBar.appendChild(d); });
    const ph2 = document.createElement('div'); ph2.className = 'tl-head-play'; ph2.id = 'tlPlay'; tlBar.appendChild(ph2);
    TL = { segs, total, kind: scr.kind };
  }
  let TL = null;
  function updatePlayhead() {
    const el = document.getElementById('tlPlay'); if (!el || !TL) return;
    let x;
    if (TL.kind === 'video') x = S.t / TL.total;
    else { const ph = phasesOf(BP.FLOW[S.screen]); let acc = 0; for (const s of TL.segs) { if (s.on) break; acc += s.dur; } x = (acc + Math.min(S.t, ph[S.phase].dur || 6)) / TL.total; }
    el.style.left = `calc(${Math.min(1, x) * 100}% - 1px)`;
    document.getElementById('tlTime').textContent = `${fmt(S.t)}s` + (S.playing ? ` · 播放中 ${S.spd}×` : '');
  }

  const panel = document.getElementById('panel');
  function ownerChip(o) { return `<span class="own" style="--c:${OC(o)}">${o}</span>`; }
  function renderPanel() {
    const scr = BP.FLOW[S.screen], ph = phasesOf(scr)[S.phase];
    const lvKey = scr.kind === 'level' ? scr.level : scr.kind === 'gap' ? BP.FLOW.find((f) => f.id === scr.next).level : null;
    const lv = lvKey ? BP.LEVELS[lvKey] : null;
    let h = `<section><div class="sub">${scr.group} · 第 ${S.screen + 1}/${BP.FLOW.length} 屏</div><h2>${scr.title}${ph.name ? ' · ' + ph.name : ''}</h2>`;
    if (scr.desc) h += `<p>${scr.desc}</p>`;
    if (lv && scr.kind === 'level' && lvKey !== '00-lobby') h += `<p><b>${lv.month}</b> · ${lv.era} · 情绪 ${lv.mood} · 游玩 ${lv.playDur}s</p><p style="color:#c9cdd6">${lv.rule}</p>`;
    if (lv && lv.note) h += `<p style="color:#ffd8a8">${lv.note}</p>`;
    if (scr.kind === 'gap') h += `<p>普通关间约 2 秒淡入淡出，同时换平台皮肤（U03）。不为每次切关做影片。</p>`;
    if (scr.kind === 'video') { const v = BP.VIDEOS[scr.video]; h += `<p><code>${v.file}</code> · ${v.dur}s · ${v.prio} · ${v.task}</p><p>${v.note}</p><p class="kbd">大屏和手机同步全屏播放：大屏 1080p 带声音，手机 720p 静音铺满（上下会裁掉一点，见大屏上的“手机可见区”）。视频加载失败时手机显示同时长文字卡兜底。切到“并排”可以同时看两端。</p>`; }
    h += `</section>`;
    // 选中
    h += `<section class="selbox${S.sel ? ' show' : ''}" id="selbox">${S.sel ? selHTML(S.sel) : ''}</section>`;
    // 分工
    if (scr.tasks) h += `<section><h3>这一屏谁交什么</h3><div class="who">${['U', 'A', 'B'].map((o) => `${ownerChip(o)}<div>${scr.tasks[o] || '—'}</div>`).join('')}</div></section>`;
    // 素材清单
    const rows = [];
    const W = VPS.map((v) => v.world).find(Boolean);
    if (W && scr.kind !== 'video') {
      const seen = new Set();
      W.items.forEach((it) => { const i = it.info; const k = i.name + i.id; if (seen.has(k) || i.env) return; seen.add(k); rows.push(i); });
      rows.sort((a, b) => 'UAB'.indexOf(a.o) - 'UAB'.indexOf(b.o));
      const shown = rows.filter((r) => !S.tg.p0 || r.p !== 'P1'); rows.length = 0; rows.push(...shown);
      h += tableHTML('场景 · 白模占位（点击定位）', rows);
      const envRows = W.items.filter((it) => it.info.env).map((it) => it.info);
      h += `<section><h3>背景与天空 · ${BP.LEVELS[W.key].title}</h3><table><tr><th></th><th>层</th><th>本关内容 / 规格</th></tr>${envRows.map((r) => `<tr class="row" data-env="${r.name}"><td>${ownerChip(r.o)}</td><td>${r.name}<br><code>${r.id}</code>${r.p === 'P1' ? '<span class="pill">P1</span>' : ''}</td><td>${r.desc}<br><span class="kbd">${r.fmt} · ${r.where}</span></td></tr>`).join('')}</table></section>`;
    }
    if (scr.kind === 'video') {
      const v = BP.VIDEOS[scr.video];
      h += `<section><h3>镜头表（B05 分镜 → B06–B08 成片）</h3><table><tr><th>时间</th><th>画面</th><th>声音/衔接</th></tr>${v.shots.map((s) => `<tr><td>${fmt(s.t0)}–${fmt(s.t1)}s</td><td>${s.what}${s.pic ? `<br><span class="kbd">首/末帧参考：${s.pic}</span>` : ''}</td><td>${s.sound || ''}</td></tr>`).join('')}</table></section>`;
    }
    const uiRows = []; VPS.forEach((vp) => (vp.boxes || []).forEach((b) => { if (b.id && !/dim|safe|paper/.test(b.cls || '')) uiRows.push({ ...b, dev: vp.dev }); }));
    if (uiRows.length) h += `<section><h3>界面元素（坐标=设备像素）</h3><table><tr><th></th><th>元素</th><th>位置 x,y,w,h</th></tr>${uiRows.map((b, i) => `<tr class="row" data-ui="${i}"><td>${ownerChip(b.o)}</td><td><code>${b.id}</code>${b.note ? `<br><span class="kbd">${b.note}</span>` : ''}</td><td>${b.dev === 'big' ? '大屏' : '手机'} ${b.x},${b.y},${b.w},${b.h}</td></tr>`).join('')}</table></section>`;
    if (lv && lv.concept) h += `<section><h3>概念图（只取配色/纸感/地标造型，不照搬密度）</h3><a href="../concepts/${lv.concept}" target="_blank"><img class="concept" src="../concepts/${lv.concept}"></a></section>`;
    // 全局
    h += `<section><details open><summary>简化原则（蛋仔派对式）</summary><ul class="tight">${BP.SIMPLIFY.map((s) => `<li>${s}</li>`).join('')}</ul></details></section>`;
    h += `<section><details><summary>通用套件 · A 只做一次（${BP.KIT.length} 项）</summary><table>${BP.KIT.map((k) => `<tr><td>${ownerChip(k.o)}</td><td><code>${k.id}</code><br>${k.name}<br><span class="kbd">${k.note}</span></td><td>${k.task}</td></tr>`).join('')}</table></details></section>`;
    h += `<section><details><summary>背景与天空 · 五层规格（全部 B）</summary><table>${BP.ENV_SPEC.map((k) => `<tr><td>${ownerChip(k.o)}</td><td><b>${k.name}</b> <code>${k.id}</code> ${k.p === 'P1' ? '<span class="pill">P1</span>' : ''}<br>${k.fmt}<br><span class="kbd">${k.where}；${k.note}</span></td></tr>`).join('')}</table></details></section>`;
    h += `<section><details><summary>模型总量（每关新做）</summary>${modelCount()}</details></section>`;
    h += `<section><details><summary>图例与坐标</summary><div class="legend">${Object.entries(BP.OWNERS).map(([k, o]) => `<span>${ownerChip(k)} ${o.name}</span>`).join('')}</div>
      <ul class="tight"><li>单位米，Y 向上；平台中心为原点，平台顶面 y=0；镜头朝北（画面上方 = 北 = −z）。</li><li>地格 (col,row)：col 西→东 0–19，row 北→南 0–19，中心 = (col−9.5, row−9.5)。</li>
      <li>白模尺寸是建议包围盒：A 的模型不能超出，原点放在底面中心。</li><li>手机 844×390，左右各 44px 安全区；大屏 1920×1080。</li>
      <li>标 <span class="pill">P1</span> 的项打开“只看P0”会隐藏：时间不够就不做。</li><li>“自由旋转”可拖动查看；“责任色”把物体按负责人上色。</li></ul></details></section>`;
    panel.innerHTML = h;
    panel.querySelectorAll('tr.row[data-k]').forEach((tr) => (tr.onclick = () => select(rows[+tr.dataset.k])));
    panel.querySelectorAll('tr.row[data-ui]').forEach((tr) => (tr.onclick = () => { const b = uiRows[+tr.dataset.ui]; select({ name: b.text || b.id, id: b.id, o: b.o, ui: true, px: [b.x, b.y, b.w, b.h], note: b.note, dev: b.dev }); }));
    panel.querySelectorAll('tr.row[data-env]').forEach((tr) => (tr.onclick = () => { const W2 = VPS.map((v) => v.world).find(Boolean); const it = W2.items.find((x) => x.info.name === tr.dataset.env); if (it) select(it.info); }));
  }
  function tableHTML(title, rows) {
    return `<section><h3>${title}</h3><table><tr><th></th><th>名称 / 命名</th><th>包围盒</th><th>任务</th></tr>${rows.map((r) => `<tr class="row${S.sel === r ? ' sel' : ''}" data-k="${rowsIndex(rows, r)}"><td>${ownerChip(r.o)}</td><td>${r.name}${r.multi ? ` ×${r.multi.length}` : ''}${r.hero ? '<span class="pill hero">地标</span>' : ''}${r.reuse ? '<span class="pill reuse">复用</span>' : ''}${r.p === 'P1' ? '<span class="pill">P1</span>' : ''}<br><code>${r.id}</code></td><td>${sizeStr(r.size)}${r.pos ? `<br><span class="kbd">@ ${r.pos.join(', ')}${r.y ? ' y' + r.y : ''}</span>` : ''}</td><td>${r.task || ''}</td></tr>`).join('')}</table></section>`;
  }
  function rowsIndex(rows, r) { return rows.indexOf(r); }
  function selHTML(i) {
    return `<h3>选中 ${ownerChip(i.o)} ${BP.OWNERS[i.o].name}</h3><p><b>${i.name}</b></p><p><code>${i.id}</code></p>` +
      (i.size ? `<p>包围盒 ${sizeStr(i.size)}${i.pos ? ` · 位置 (${i.pos.join(', ')})${i.y ? ' y=' + i.y : ''}` : ''}</p>` : '') +
      (i.px ? `<p>${i.dev === 'big' ? '大屏' : '手机'}像素 x=${i.px[0]} y=${i.px[1]} w=${i.px[2]} h=${i.px[3]}</p>` : '') +
      (i.fmt ? `<p>${i.fmt}<br>${i.where}</p>` : '') + (i.desc ? `<p>本关：${i.desc}</p>` : '') +
      (i.task ? `<p>任务 ${i.task}${i.p ? ' · ' + i.p : ''}</p>` : '') + (i.note ? `<p style="color:#c9cdd6">${i.note}</p>` : '');
  }
  function modelCount() {
    let rows = '';
    Object.entries(BP.LEVELS).forEach(([k, lv]) => {
      const news = (lv.props || []).concat(lv.dyn || []).filter((p) => p.o === 'A' && !p.kit && !p.reuse);
      rows += `<tr><td>${lv.title}</td><td>${news.length}</td><td>${news.map((p) => `<code>${p.id}</code>`).join(' ') || '—'}</td></tr>`;
    });
    return `<table><tr><th>关</th><th>新模型</th><th>命名</th></tr>${rows}</table><p class="kbd">另加通用套件 ${BP.KIT.filter((k) => k.o === 'A').length} 项（含角色与帽子）。其余全部复用套件或由 B 出平面图。</p>`;
  }
  function select(info) {
    S.sel = info;
    const box = document.getElementById('selbox');
    if (box) { box.className = 'selbox' + (info ? ' show' : ''); box.innerHTML = info ? selHTML(info) : ''; if (info) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    panel.querySelectorAll('tr.sel').forEach((t) => t.classList.remove('sel'));
    // 3D 高亮
    VPS.forEach((vp) => {
      if (vp.world) vp.world.items.forEach(({ obj, info: i2 }) => obj.traverse((m) => { if (m.isMesh && m.material && m.material.emissive) { if (m.userData.em0 === undefined) m.userData.em0 = m.material.emissive.getHex(); m.material.emissive.setHex(i2 === info ? 0x8a5a00 : m.userData.em0); } }));
      (vp.boxes || []).forEach((b) => { if (b.el) b.el.style.outline = info && info.ui && info.id === b.id ? '4px solid #ffd166' : ''; });
    });
  }

  // ───────────────────────── 工具栏 ─────────────────────────
  function syncToolbar() {
    document.querySelectorAll('[data-dev]').forEach((b) => b.classList.toggle('on', b.dataset.dev === S.dev));
    document.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === S.cam));
    document.querySelectorAll('[data-tg]').forEach((b) => b.classList.toggle('on', S.tg[b.dataset.tg]));
    document.querySelectorAll('[data-spd]').forEach((b) => b.classList.toggle('on', +b.dataset.spd === S.spd));
    document.getElementById('btnPlay').textContent = S.playing ? '⏸ 暂停' : '▶ 播放';
  }
  document.querySelectorAll('[data-dev]').forEach((b) => (b.onclick = () => { S.dev = b.dataset.dev; syncToolbar(); setupViewports(); }));
  document.querySelectorAll('[data-cam]').forEach((b) => (b.onclick = () => { S.cam = b.dataset.cam; syncToolbar(); VPS.forEach(applyToggles); }));
  document.querySelectorAll('[data-tg]').forEach((b) => (b.onclick = () => { S.tg[b.dataset.tg] = !S.tg[b.dataset.tg]; syncToolbar(); VPS.forEach(applyToggles); renderPanel(); }));
  document.querySelectorAll('[data-spd]').forEach((b) => (b.onclick = () => { S.spd = +b.dataset.spd; syncToolbar(); }));
  document.getElementById('btnPlay').onclick = () => { S.playing = !S.playing; syncToolbar(); };
  document.getElementById('btnNext').onclick = () => go(S.screen + 1);
  document.getElementById('btnPrev').onclick = () => go(S.screen - 1);
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); S.playing = !S.playing; syncToolbar(); }
    if (e.key === 'ArrowRight') go(S.screen + 1);
    if (e.key === 'ArrowLeft') go(S.screen - 1);
  });

  // ───────────────────────── 主循环 ─────────────────────────
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const scr = BP.FLOW[S.screen], ph = phasesOf(scr)[S.phase];
    if (S.playing) {
      S.t += dt * S.spd;
      const dur = ph.dur || 3;
      if (S.t >= dur) advance();
    }
    // 卡片进度 / 倒数 / 视频
    VPS.forEach((vp) => {
      (vp.boxes || []).forEach((b) => {
        if (b.cls && b.cls.startsWith('card') && b.el) b.el.style.setProperty('--prog', `${Math.min(100, (S.t / (ph.dur || 6)) * 100)}%`);
        if (b.cls === 'count' && b.el) b.el.firstChild.nodeValue = String(Math.max(1, 3 - Math.floor(S.t)));
      });
      if (scr.kind === 'video') renderVideo(vp, BP.VIDEOS[scr.video], S.t);
      vp.render(dt);
    });
    if (scr.kind === 'video' && TL) TL.segs.forEach((s, i) => tlBar.children[i] && tlBar.children[i].classList.toggle('on', S.t >= BP.VIDEOS[scr.video].shots[i].t0 && S.t < BP.VIDEOS[scr.video].shots[i].t1));
    updatePlayhead();
    requestAnimationFrame(loop);
  }

  syncToolbar();
  setupViewports();
  requestAnimationFrame(loop);
  window.__BP_STATE = S; window.__BP_GO = go; window.__BP_DEBUG = { VPS: () => VPS, THREE, buildWorld };
})();
