import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
if (/MicroMessenger/i.test(navigator.userAgent)) {
 app.innerHTML = `<main class="browser-guide"><section class="guide-card"><h1>请在手机浏览器中打开</h1><p>切换后再输入昵称，就能加入当前房间。</p><ol><li>点击微信右上角 <strong>···</strong></li><li>选择「在浏览器中打开」</li></ol><p>如果没有这个选项，请复制下方链接，粘贴到手机浏览器中打开。</p><label for="join-link">当前房间链接</label><input id="join-link" readonly><button id="copy-link" type="button">复制链接</button><p id="copy-result" role="status"></p><p class="guide-note">iPhone 推荐使用 Safari；安卓推荐使用 Chrome 或手机浏览器。</p></section></main>`;
 const link = document.querySelector<HTMLInputElement>('#join-link')!;
 const result = document.querySelector<HTMLElement>('#copy-result')!;
 link.value = location.href;
 link.addEventListener('click', () => link.select());
 document.querySelector<HTMLButtonElement>('#copy-link')!.addEventListener('click', async () => {
  try {
   if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
   await navigator.clipboard.writeText(link.value);
   result.textContent = '链接已复制，请粘贴到手机浏览器。';
  } catch {
   link.focus(); link.select();
   result.textContent = '请长按上方链接并复制，再粘贴到手机浏览器。';
  }
 });
} else {
 void import('./game.js');
}
