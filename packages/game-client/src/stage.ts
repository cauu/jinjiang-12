/** Full-screen stage presentation shared by phone and display: story videos, the pre-level card
 * (era, history, rules), the 3-2-1 countdown, the settlement screen and the final champion.
 * Everything is timed from the server clock so all screens change together. */
import { LEVEL_ERAS, LEVEL_FACTS, LEVEL_NAMES, LEVEL_RULES, type LevelId, type Match, type Snapshot } from '@jinjiang/shared';
import type { Connection } from './net.js';

type Mode = 'mobile' | 'display';
const TEAM_NAMES = ['朱红', '靛蓝', '明黄', '青绿'];
const GO_MS = 800;
const esc = (text: string) => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const CSS = `
.stage{position:fixed;inset:0;display:grid;place-items:center;pointer-events:none;z-index:6;animation:stage-in .25s ease-out}
@keyframes stage-in{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}
.stage-card{width:min(640px,86vw);padding:clamp(14px,3.2vh,28px) clamp(18px,4vw,36px);border-radius:18px;background:#fffaf0f2;color:#2b3b35;box-shadow:0 10px 40px #2b3b3540;text-align:left;text-shadow:none}
.stage-card small{display:block;font-size:clamp(13px,2.6vh,18px);font-weight:700;color:#a1543c;letter-spacing:.06em}
.stage-card h2{margin:4px 0 10px;font-size:clamp(26px,7vh,46px);line-height:1.1}
.stage-card .fact{margin:0 0 10px;font-size:clamp(14px,3.3vh,21px);font-weight:500;line-height:1.5;color:#4a5a52}
.stage-card .rule{margin:0;padding:8px 12px;border-radius:10px;background:#f3e3c3;font-size:clamp(15px,3.6vh,22px);font-weight:700;line-height:1.45}
.stage-card .bar{height:5px;margin-top:14px;border-radius:3px;background:#e9dcc2;overflow:hidden}
.stage-card .bar i{display:block;height:100%;background:#d0653f;transform-origin:left;animation:stage-bar linear forwards}
@keyframes stage-bar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
.stage-count{font-size:clamp(90px,34vh,220px);font-weight:900;color:#fff;text-shadow:0 6px 0 #c4583c,0 10px 30px #0006;animation:stage-pop .9s ease-out}
.stage-go{font-size:clamp(60px,22vh,150px);font-weight:900;color:#ffd75e;text-shadow:0 6px 0 #b9452f,0 10px 30px #0006;animation:stage-pop .8s ease-out forwards}
@keyframes stage-pop{0%{transform:scale(1.6);opacity:0}25%{transform:scale(1);opacity:1}100%{transform:scale(.92);opacity:1}}
.stage-result{min-width:min(520px,80vw);max-width:88vw;padding:clamp(16px,4vh,30px) clamp(20px,4vw,40px);border-radius:20px;text-align:center;color:#fff;text-shadow:0 2px 8px #0005;box-shadow:0 10px 40px #0004;animation:stage-pop .5s ease-out}
.stage-result.win{background:linear-gradient(160deg,#e9a93a,#d0653f)}.stage-result.lose{background:linear-gradient(160deg,#6c7a86,#45525e)}.stage-result.neutral{background:linear-gradient(160deg,#3f7d6c,#2c5a4f)}
.stage-result .headline{margin:0;font-size:clamp(34px,10vh,64px);font-weight:900}
.stage-result p{margin:8px 0 0;font-size:clamp(14px,3.4vh,22px);font-weight:700}
.stage-result .names{margin-top:10px;font-size:clamp(12px,2.8vh,17px);font-weight:600;opacity:.92;line-height:1.5}
.stage-note{align-self:start;margin-top:calc(54px + env(safe-area-inset-top));padding:7px 14px;border-radius:10px;background:#233b36e8;color:#fff;font-size:15px;font-weight:700;text-shadow:none}
.stage-media{position:fixed;inset:0;background:#000;z-index:6}.stage-media video{width:100%;height:100%;object-fit:contain}
.stage-fallback{position:fixed;inset:0;display:grid;place-items:center;background:#233b36;color:#fff;font-size:clamp(22px,6vh,40px);font-weight:800;z-index:6}
.stage-final{display:grid;place-items:center;gap:6px;text-align:center}
.stage-media .winner{position:absolute;bottom:10%;left:0;right:0;text-align:center;color:#fff;font-size:clamp(28px,8vh,56px);font-weight:900;text-shadow:0 2px 10px #000}
`;

/** Predict the next story video so it can be buffered before it is needed. */
function upcomingMedia(m: Match | null | undefined): string | null {
 if (!m) return 'intro';
 if (m.phase === 'finished' || m.phase === 'ending') return null;
 if (m.level.id === '03-qibaoshi' && ['playing', 'result'].includes(m.phase)) return 'wind';
 if (m.level.id === '04-shisan' && ['playing', 'result'].includes(m.phase)) return 'rebirth';
 if (m.level.id === '06-guishi' || m.activeIds.length <= 2) return 'ending';
 return null;
}

export function mountStage(root: HTMLElement, connection: Connection, mode: Mode) {
 if (!document.getElementById('stage-css')) { const style = document.createElement('style'); style.id = 'stage-css'; style.textContent = CSS; document.head.append(style); }
 const preloaded = new Map<string, HTMLVideoElement>();
 let key = '', video: HTMLVideoElement | null = null;
 const urlOf = (id: string) => mode === 'mobile' ? `/media/${id}_phone.mp4` : `/media/${id}.mp4`;
 const preload = (id: string | null) => {
  if (!id || preloaded.has(id)) return;
  const v = document.createElement('video'); v.preload = 'auto'; v.muted = mode === 'mobile'; v.playsInline = true; v.src = urlOf(id); v.load(); preloaded.set(id, v);
 };
 const set = (next: string, html: string) => { if (next === key) return; key = next; stopVideo(); root.innerHTML = html; };
 const stopVideo = () => { if (!video) return; video.pause(); video.removeAttribute('src'); video.load(); video = null; };
 const playMedia = (m: Match, snap: Snapshot) => {
  const media = m.media!, next = `media:${m.phaseId}:${media.id}`;
  if (next === key) return;
  stopVideo(); key = next;
  const v = preloaded.get(media.id) ?? document.createElement('video'); preloaded.delete(media.id);
  if (!v.src) v.src = urlOf(media.id);
  v.playsInline = true; v.autoplay = true; v.muted = mode === 'mobile'; video = v;
  const box = document.createElement('div'); box.className = 'stage-media'; box.append(v);
  if (media.id === 'ending') { const w = document.createElement('div'); w.className = 'winner'; w.textContent = m.championId ? `冠军：${snap.room.players[m.championId]?.name ?? '等待结果'}` : '无人夺冠'; box.append(w); }
  root.replaceChildren(box);
  // Join the video where the server timeline is, so late or refreshed screens never overrun the deadline.
  const align = () => { const offset = (connection.serverNow() - (media.endsAt - media.durationMs)) / 1000; if (offset > .5 && Number.isFinite(v.duration) && offset < v.duration - .2) v.currentTime = offset; };
  if (v.readyState >= 1) align(); else v.addEventListener('loadedmetadata', align, { once: true });
  const fail = () => { if (video === v) { root.innerHTML = '<div class="stage-fallback">过场进行中</div>'; } };
  v.onerror = fail;
  v.play().catch(() => { if (video !== v) return; if (!v.muted) { v.muted = true; v.play().catch(fail); } else fail(); });
 };
 const frame = () => {
  requestAnimationFrame(frame);
  const snap = connection.snapshot, m = snap?.room.match, now = connection.serverNow();
  preload(upcomingMedia(m));
  if (!snap || !m) return set('lobby', '');
  if (m.media) return playMedia(m, snap);
  const selfId = mode === 'mobile' ? connection.session?.playerId : undefined, self = selfId ? snap.room.players[selfId] : undefined;
  const levelId = m.level.id as LevelId, round = m.results.length + (m.phase === 'result' ? 0 : 1);
  if (m.phase === 'card') {
   const left = Math.max(0, (m.phaseEndsAt ?? now) - now);
   return set(`card:${m.phaseId}`, `<div class="stage"><div class="stage-card"><small>第 ${round} 关 · ${esc(LEVEL_ERAS[levelId])}</small><h2>${esc(LEVEL_NAMES[levelId])}</h2><p class="fact">${esc(LEVEL_FACTS[levelId])}</p><p class="rule">${esc(LEVEL_RULES[levelId])}</p><div class="bar"><i style="animation-duration:${left}ms"></i></div></div></div>`);
  }
  if (m.phase === 'countdown') { const n = Math.max(1, Math.ceil(((m.phaseEndsAt ?? now) - now) / 1000)); return set(`count:${m.phaseId}:${n}`, `<div class="stage"><div class="stage-count">${n}</div></div>`); }
  if (m.phase === 'playing') {
   if (m.level.startedAt != null && now - m.level.startedAt < GO_MS) return set(`go:${m.phaseId}`, '<div class="stage"><div class="stage-go">开始！</div></div>');
   if (self?.status === 'qualified') return set(`done:${m.phaseId}`, '<div class="stage"><div class="stage-note">已晋级！等待本关结束</div></div>');
   // Explain Lantern Market safeguards while the answer is revealed.
   const round = m.level.data.roundResult;
   if (levelId === '02-dengshi' && m.level.data.questionPhase === 'revealing' && round) {
    const note = round.void ? '全员答错，本题作废' : selfId && round.savedIds.includes(selfId) ? '离正确答案最近，保底存活' : round.savedIds.length ? `${round.savedIds.length} 人离正确答案最近，保底存活` : '';
    if (note) return set(`note:${m.phaseId}:${m.level.data.questionIndex}`, `<div class="stage"><div class="stage-note">${esc(note)}</div></div>`);
   }
   return set(`play:${m.phaseId}`, '');
  }
  if (m.phase === 'result') {
   const result = m.results.find(r => r.levelId === m.level.id), final = levelId === '06-guishi' || !!m.championId;
   if (!result) return set(`wait:${m.phaseId}`, '');
   const champion = m.championId ? snap.room.players[m.championId]?.name ?? '' : '';
   const names = result.qualifiedIds.map(id => snap.room.players[id]?.name ?? id), list = names.length > 12 ? `${names.slice(0, 12).join('、')} 等 ${names.length} 人` : names.join('、');
   let cls = 'neutral', headline: string, lines: string[] = [];
   if (mode === 'display' || !self || !selfId || (!result.qualifiedIds.includes(selfId) && !result.eliminatedIds.includes(selfId))) {
    headline = mode === 'mobile' ? '观战中' : final ? (champion ? `冠军：${champion}` : '无人夺冠') : `本关结束 · 晋级 ${result.qualifiedIds.length} 人`;
    if (mode === 'display' && !final) lines = [`淘汰 ${result.eliminatedIds.length} 人`];
   } else {
    const won = result.qualifiedIds.includes(selfId); cls = won ? 'win' : 'lose';
    headline = final ? (won ? '你夺冠了！' : champion ? `冠军：${champion}` : '无人夺冠') : won ? '本关晋级' : '本关淘汰';
    const score = result.scores[selfId] ?? 0, team = m.level.data.teams.findIndex(t => t.playerIds.includes(selfId));
    const stat = levelId === '01-jinshi' && team >= 0 ? `${TEAM_NAMES[team] ?? ''}队 · 面积 ${score} 格` : levelId === '03-qibaoshi' ? `捡到交子 ${score} 张` : levelId === '05-jiushi' ? `运粮 ${score} 袋` : '';
    lines = [stat, final ? '' : `本关晋级 ${result.qualifiedIds.length} 人 · 淘汰 ${result.eliminatedIds.length} 人`].filter(Boolean);
   }
   return set(`result:${m.phaseId}:${mode}`, `<div class="stage"><div class="stage-result ${final && (mode === 'display' || cls !== 'lose') ? 'win' : cls}"><h2 class="headline">${esc(headline)}</h2>${lines.map(l => `<p>${esc(l)}</p>`).join('')}${mode === 'display' && !final && list ? `<div class="names">晋级：${esc(list)}</div>` : ''}</div></div>`);
  }
  if (m.phase === 'finished') return set('finished', `<div class="stage"><div class="stage-result win"><h2 class="headline">${esc(m.championId ? `冠军：${snap.room.players[m.championId]?.name ?? '等待结果'}` : '无人夺冠')}</h2></div></div>`);
  return set(`other:${m.phaseId}`, '');
 };
 requestAnimationFrame(frame);
}
