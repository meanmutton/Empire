/** Global styles for the client, injected once. */
import splashWide from './assets/splash-wide.webp';

export const CSS = `
:root { --bg:#070b16; --panel:#0e1426ee; --panel2:#141c33; --line:#26304f; --text:#e6ebf5; --dim:#9aa6c4; --accent:#ffd166; --good:#7cfc9a; --bad:#ff6b6b; }
* { box-sizing: border-box; }
html, body { margin:0; height:100%; overflow:hidden; background:var(--bg); color:var(--text);
  font:13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
#app { position:fixed; inset:0; }
.btn { background:#1d2747; color:var(--text); border:1px solid #33416b; border-radius:6px; padding:5px 10px; cursor:pointer; font:inherit; }
.btn:hover:not(:disabled) { background:#273463; }
.btn:disabled { opacity:.45; cursor:default; }
.btn.primary { background:#c99a2e; border-color:#e7b94c; color:#130e02; font-weight:600; }
.btn.primary:hover:not(:disabled) { background:#e0ad3a; }
.btn.danger { background:#5a1d26; border-color:#8a2c3a; }
.btn.ghost { background:transparent; border-color:transparent; }
.btn.small { padding:2px 7px; font-size:12px; }
.chip { display:inline-flex; align-items:center; gap:5px; }
.chip .dot { width:9px; height:9px; border-radius:50%; background:var(--c); box-shadow:0 0 6px var(--c); }
.dim { color:var(--dim); }
.good { color:var(--good); } .bad { color:var(--bad); }
.row { display:flex; align-items:center; gap:8px; }
.row.wrap { flex-wrap:wrap; }
.grow { flex:1; }
.bar { height:5px; background:#0a0f1e; border-radius:3px; overflow:hidden; min-width:40px; }
.bar-fill { height:100%; }
h3 { margin:12px 0 6px; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--dim); font-weight:600; }

#map { position:absolute; inset:0; width:100%; height:100%; touch-action:none; display:block; }
#topbar { position:absolute; left:0; right:0; top:0; height:46px; display:flex; align-items:center; gap:14px; padding:0 12px;
  background:linear-gradient(#0b1122f5, #0b1122d0); border-bottom:1px solid var(--line); z-index:5; overflow-x:auto; white-space:nowrap; }
#topbar .res { display:flex; align-items:center; gap:4px; }
#topbar .btn { padding:4px 8px; }
#topbar { gap:10px; }
#topbar { overflow:hidden; padding:0; gap:0; }
#topbar .top-more { display:none; flex:none; align-self:stretch; padding:0 10px; border:none; border-left:1px solid var(--line); background:#0b1122; color:var(--accent); font-size:18px; cursor:pointer; }
#topbar.overflowing .top-more { display:block; }
#topbar.overflowing .top-scroll { -webkit-mask-image:linear-gradient(to right, #000 calc(100% - 36px), transparent); mask-image:linear-gradient(to right, #000 calc(100% - 36px), transparent); }
#topbar.overflowing.at-end .top-scroll { -webkit-mask-image:none; mask-image:none; }
#topbar .top-scroll { flex:1; min-width:0; height:100%; display:flex; align-items:center; gap:10px; padding:0 12px;
  overflow-x:auto; scrollbar-width:thin; }
#topbar .top-fixed { flex:none; height:100%; display:flex; align-items:center; gap:8px; padding:0 12px;
  border-left:1px solid var(--line); background:#0b1122; }
#topbar .res b { font-weight:600; }
#topbar .spacer { flex:1; }
#side { position:absolute; right:0; top:46px; bottom:0; width:360px; background:var(--panel); border-left:1px solid var(--line);
  overflow-y:auto; padding:10px 12px 90px; z-index:4; backdrop-filter:blur(6px); }
#side.collapsed { transform:translateX(100%); }
#mini { position:absolute; left:10px; bottom:10px; width:210px; height:126px; border:1px solid var(--line); border-radius:6px; z-index:4; }
#hint { position:absolute; left:50%; transform:translateX(-50%); top:56px; background:#000a; border:1px solid var(--line); padding:4px 10px;
  border-radius:12px; z-index:4; pointer-events:none; font-size:12px; }
#hint:empty { display:none; }
.move-pill { position:absolute; left:50%; transform:translateX(-50%); top:92px; z-index:6; display:flex; gap:8px; padding:6px; background:#0b1122ee; border:1px solid var(--line); border-radius:999px; box-shadow:0 4px 16px #000a; }
.move-pill .btn { border-radius:999px; padding:6px 16px; }
@media (pointer: coarse) {
  .btn, .list-btn, select, input, textarea { min-height:44px; }
  .btn.small { min-height:44px; padding-left:12px; padding-right:12px; }
  .ship-row { min-height:44px; }
  table.manage td { padding-top:10px; padding-bottom:10px; }
  #topbar .btn { min-height:36px; }
}
.card { background:var(--panel2); border:1px solid var(--line); border-radius:8px; padding:8px 10px; margin-bottom:8px; }
.card.sel { border-color:var(--accent); }
.kv { display:grid; grid-template-columns:auto 1fr; gap:2px 10px; }
.kv .k { color:var(--dim); }
.ship-row { display:flex; align-items:center; gap:6px; padding:3px 0; }
.ship-row canvas { width:28px; height:28px; }
.ship-row.sel { background:#ffd16622; border-radius:4px; }
.list-btn { display:flex; justify-content:space-between; align-items:center; width:100%; text-align:left; margin:2px 0; }
.tabs { display:flex; gap:4px; margin:6px 0; flex-wrap:wrap; }
.tabs .btn.on { background:#3a4a85; border-color:#5b6fb8; }
.queue-item { display:flex; align-items:center; gap:6px; padding:2px 0; }
.modal-overlay { position:fixed; inset:0; background:#000a; display:flex; align-items:center; justify-content:center; z-index:20; padding:12px; }
.modal { background:#0d1428; border:1px solid var(--line); border-radius:10px; width:min(560px, 100%); max-height:92vh; display:flex; flex-direction:column; }
.modal.wide { width:min(1100px, 100%); }
.modal-head { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--line); }
.modal-title { font-size:16px; font-weight:600; }
.modal-body { padding:12px 14px; overflow:auto; }
#toast { position:fixed; left:50%; bottom:24px; transform:translateX(-50%) translateY(30px); opacity:0; transition:.2s; background:#1d2747;
  border:1px solid #33416b; padding:8px 14px; border-radius:8px; z-index:30; pointer-events:none; max-width:90vw; }
#toast.show { opacity:1; transform:translateX(-50%); }
#toast.error { background:#4a1820; border-color:#8a2c3a; }
.tech { border:1px solid var(--line); border-radius:6px; padding:5px 7px; margin:3px 0; cursor:pointer; background:#10172c; }
.tech.known { background:#17331f; border-color:#2e6b3e; cursor:default; }
.tech.avail:hover { border-color:var(--accent); }
.tech.current { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent) inset; }
.tech.locked { opacity:.45; cursor:default; }
.tech-grid { display:grid; grid-template-columns:repeat(6, minmax(150px, 1fr)); gap:8px; }
table.t { border-collapse:collapse; width:100%; }
table.t td, table.t th { padding:4px 6px; border-bottom:1px solid #1c2440; text-align:left; }
table.manage tr.sel td { background:#1b2a52; }
.badge { display:inline-block; min-width:18px; margin-left:6px; padding:0 5px; border-radius:999px; background:#e5484d; color:#fff; font-size:11px; font-weight:700; line-height:18px; text-align:center; }
.notice-dot { display:inline-block; width:8px; height:8px; margin-left:6px; border-radius:50%; background:#8fb3ff; }
.card.drop-ok { outline:2px dashed var(--accent); outline-offset:2px; background:#1b2a52; }
.ship-row[draggable=true], .card[draggable=true] { cursor:grab; }
.drop-new { display:none; margin-top:6px; padding:10px; border:2px dashed var(--line); border-radius:8px; text-align:center; color:var(--dim); font-size:12px; }
#side.dragging .drop-new { display:block; }
.drop-new.drop-ok { border-color:var(--accent); color:var(--text); }
table.manage tbody tr:hover td { background:#141e3a; }
table.manage td { white-space:nowrap; }
.manage-grid { display:grid; grid-template-columns:minmax(0, 1.7fr) minmax(300px, 1fr); gap:12px; align-items:start; }
.roster { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
.roster-cell { width:58px; text-align:center; }
.roster-label { font-size:10px; opacity:.75; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.screen { position:absolute; inset:0; overflow:auto; padding:24px;
  background:linear-gradient(rgba(5, 8, 18, 0.84), rgba(5, 8, 18, 0.94)), url(${splashWide}) center 35% / cover no-repeat, #070b16; }
.splash { position:fixed; inset:0; overflow:hidden; background:#04060d; animation:splash-in .9s ease both; }
.splash.leaving { opacity:0; transition:opacity .25s ease; }
@keyframes splash-in { from { opacity:0; } to { opacity:1; } }
@keyframes splash-rise { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
.splash-art { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.splash-art.wide { object-position:center 40%; }
.splash-art.tall { display:none; object-position:center top; }
.splash-shade { position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(ellipse 60% 35% at 50% 26%, rgba(4, 6, 13, 0.6), transparent 70%),
    linear-gradient(to bottom, transparent 62%, rgba(4, 6, 13, 0.8)); }
.splash-title { position:absolute; left:0; right:0; top:17%; text-align:center; animation:splash-rise 1.2s .3s ease both; }
.splash-name { display:inline-block; font-size:clamp(52px, 11vw, 150px); font-weight:200; letter-spacing:.32em; padding-left:.32em; line-height:1;
  background:linear-gradient(#fff8e2 10%, #f2c46d 60%, #b9772c); -webkit-background-clip:text; background-clip:text; color:transparent;
  filter:drop-shadow(0 0 22px rgba(255, 186, 90, 0.45)); }
.splash-tag { margin-top:10px; font-size:clamp(11px, 1.5vw, 17px); letter-spacing:.42em; padding-left:.42em; text-transform:uppercase; color:#d6def7; opacity:.88; }
.splash-actions { position:absolute; left:0; right:0; bottom:6%; display:flex; flex-direction:column; align-items:center; gap:10px; animation:splash-rise 1s .8s ease both; }
.btn.splash-play { font-size:20px; padding:12px 64px; letter-spacing:.24em; text-transform:uppercase; border-radius:999px; box-shadow:0 0 28px rgba(255, 190, 90, 0.4); }
.splash-links { color:#aab4d6; font-size:13px; text-shadow:0 1px 4px #000; }
.splash-links a { color:#e4eaff; }
@media (max-aspect-ratio: 4/5) {
  .splash-art.wide { display:none; }
  .splash-art.tall { display:block; }
  .splash-title { top:9%; }
  .splash-shade { background:linear-gradient(to bottom, transparent 70%, rgba(4, 6, 13, 0.85)); }
}
.title { font-size:44px; letter-spacing:.35em; color:var(--accent); text-align:center; margin:30px 0 4px; font-weight:300; }
.subtitle { text-align:center; color:var(--dim); margin-bottom:24px; }
.faction-card { border:1px solid var(--line); border-radius:10px; padding:10px 12px; margin:8px 0; background:#0d1428cc; }
.faction-card.taken { border-color:var(--accent); }
input, select { background:#0a1022; color:var(--text); border:1px solid #33416b; border-radius:6px; padding:5px 8px; font:inherit; }
.event { padding:3px 0; border-bottom:1px solid #161e38; }
.setup-cols { display:grid; grid-template-columns:minmax(280px, 420px) minmax(300px, 1fr); gap:20px; max-width:1200px; margin:0 auto; }
.mobile-only { display:none; }
.msg-grid { display:grid; grid-template-columns:minmax(150px, 210px) minmax(0, 1fr); gap:12px; min-height:360px; }
.msg-grid > * { min-width:0; }
@media (max-width: 760px) {
  #side { width:100%; top:auto; height:46%; border-left:none; border-top:1px solid var(--line); padding-bottom:20px; }
  #side.empty { display:none; }
  #mini { display:none; }
  .mobile-only { display:inline-block; }
  #topbar .top-fixed { padding:0 8px; gap:6px; }
  #topbar .top-fixed .dim { max-width:84px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; }
  .tech-grid { grid-template-columns:repeat(2, minmax(140px, 1fr)); }
  .setup-cols { grid-template-columns:1fr; }
  .msg-grid { grid-template-columns:1fr; }
  .manage-grid { grid-template-columns:1fr; }
  .screen { padding:14px; }
  .title { font-size:34px; margin-top:16px; }
}
`;

export function injectStyles(): void {
  if (document.getElementById('empire-css')) return;
  const s = document.createElement('style');
  s.id = 'empire-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
