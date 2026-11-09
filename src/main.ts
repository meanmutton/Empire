import { VERSION } from './version';

const app = document.getElementById('app');
if (app) {
  app.innerHTML = `<div style="display:flex;height:100%;align-items:center;justify-content:center;flex-direction:column;gap:8px">
    <div style="font-size:40px;letter-spacing:.3em;color:#f5c542">EMPIRE</div>
    <div style="opacity:.6">v${VERSION}: under construction</div></div>`;
}
