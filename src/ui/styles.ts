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
.chip .glyph { flex:none; filter:drop-shadow(0 0 3px var(--c)); }
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
#map-tools { position:absolute; left:10px; bottom:144px; z-index:4; display:flex; gap:4px; align-items:flex-end; }
#map-tools .btn { width:32px; padding:4px 0; font-size:15px; background:#0b1122e6; }
#map-tools .btn.on { border-color:var(--accent); color:var(--accent); }
.map-legend { margin-left:6px; padding:6px 8px; background:#0b1122ee; border:1px solid var(--line); border-radius:6px; font-size:11px; display:grid; gap:2px; }
.hover-card { position:fixed; z-index:9; width:240px; padding:8px 10px; background:#0d1428f2; border:1px solid var(--line); border-radius:8px; box-shadow:0 6px 20px #000a;
  font-size:12px; pointer-events:none; display:grid; gap:3px; }
#hint { position:absolute; left:50%; transform:translateX(-50%); top:56px; background:#000a; border:1px solid var(--line); padding:4px 10px;
  border-radius:12px; z-index:4; pointer-events:none; font-size:12px; }
#hint:empty { display:none; }
@keyframes brief-in { from { transform:translateX(24px); opacity:0; } to { transform:none; opacity:1; } }
.briefing-body { min-height:240px; }
.briefing-head { position:sticky; top:-12px; margin:-12px -14px 8px; padding:12px 14px 8px; background:#0d1428; border-bottom:1px solid var(--line); z-index:1; }
.brief-chips { display:flex; flex-wrap:wrap; gap:6px; margin:4px 0 8px; }
.brief-chip { border:1px solid var(--line); background:#141c33; color:var(--text); border-radius:999px; padding:4px 10px; font:inherit; font-size:12px; cursor:pointer; }
.brief-chip.bad { border-color:#e5484d88; }
.brief-chip:disabled { cursor:default; }
.brief-line { display:flex; align-items:flex-start; gap:8px; padding:6px 4px; border-bottom:1px solid #1c2440; }
.brief-line.link { cursor:pointer; }
.brief-line.link:hover { background:#141e3a; }
.brief-line.bad { color:var(--bad); }
.brief-icon { width:20px; text-align:center; flex:none; }
.move-pill { position:absolute; left:50%; transform:translateX(-50%); top:92px; z-index:6; display:flex; gap:8px; padding:6px; background:#0b1122ee; border:1px solid var(--line); border-radius:999px; box-shadow:0 4px 16px #000a; }
.move-pill .btn { border-radius:999px; padding:6px 16px; }
@media (pointer: coarse) {
  .btn, .list-btn, select, input, textarea { min-height:44px; }
  .btn.small { min-height:44px; padding-left:12px; padding-right:12px; }
  .ship-row { min-height:44px; }
  table.manage td { padding-top:10px; padding-bottom:10px; }
  #topbar .btn { min-height:36px; }
}
.portrait { flex:none; display:flex; align-items:center; justify-content:center; overflow:hidden; border:1px solid; border-radius:6px;
  background:radial-gradient(circle at 50% 40%, #1b2542, #0a0f1e); box-shadow:0 2px 10px #0008; }
.portrait img { width:100%; height:100%; object-fit:cover; display:block; }
.portrait.zoomable { cursor:zoom-in; }
.portrait-zoom { display:flex; flex-direction:column; align-items:center; gap:10px; }
.portrait-zoom img { width:min(360px, 78vw); aspect-ratio:4/5; object-fit:cover; border:2px solid; border-radius:8px; box-shadow:0 6px 30px #000c; }
.portrait.avatar { border-radius:50%; position:relative; }
.portrait.avatar img { position:absolute; width:170%; height:212%; max-width:none; left:-35%; top:-32%; }
.leader-strip { display:flex; gap:10px; margin:6px 0 2px; }
.leader-pick { display:flex; flex-direction:column; align-items:center; gap:3px; width:72px; padding:4px; border-radius:6px; border:1px solid transparent; }
.leader-pick.can { cursor:pointer; }
.leader-pick.can:hover { background:#141e3a; }
.leader-pick.on { border-color:var(--accent); background:#1a2442; }
.leader-name { font-size:11px; text-align:center; line-height:1.2; color:var(--dim); }
.leader-pick.on .leader-name { color:var(--accent); }
.crest { display:inline-block; flex:none; line-height:0; }
.crest svg { width:100%; height:100%; display:block; filter:drop-shadow(0 2px 4px #0009); }
.mission-list { display:grid; gap:4px; margin:4px 0; }
.mission-row { display:flex; gap:8px; align-items:center; }
.mission-row .btn { flex:none; min-width:150px; }
.tooltip { position:fixed; z-index:50; max-width:300px; padding:7px 10px; background:#0b1122f7; color:var(--text); border:1px solid #3a4772;
  border-radius:8px; box-shadow:0 8px 24px #000b; font-size:12px; line-height:1.45; white-space:pre-line; pointer-events:none;
  opacity:0; transform:translateY(3px); transition:opacity .12s, transform .12s; left:-9999px; top:-9999px; }
.tooltip.show { opacity:1; transform:none; }
.tooltip b { color:#fff; }
.tooltip .bad { color:var(--bad); }
.info-tip { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; margin-left:4px; padding:0; border-radius:50%;
  border:1px solid #4a5780; background:#141c33; color:var(--dim); font:600 10px/1 Georgia, serif; font-style:italic; cursor:help; vertical-align:middle; flex:none; }
.info-tip:hover { color:var(--text); border-color:var(--accent); }
@media (pointer: coarse) { .info-tip { width:22px; height:22px; font-size:12px; } }
.icon { display:inline-flex; align-items:center; justify-content:center; flex:none; line-height:0; }
.icon img { width:100%; height:100%; object-fit:contain; }
.icon.emoji { line-height:1; font-family:'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif; }
.colony-wrap { display:flex; justify-content:center; margin:6px 0 2px; }
.colony-view { position:relative; flex:none; }
.colony-planet { position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); line-height:0; filter:drop-shadow(0 0 14px #0009); }
.colony-count { position:absolute; left:50%; top:calc(50% + 44px); transform:translateX(-50%); padding:1px 8px; border-radius:999px; background:#070b16cc; border:1px solid #2b3556; font-size:11px; color:var(--text); pointer-events:none; }
.colony-slot { position:absolute; display:flex; align-items:center; justify-content:center; padding:0; border-radius:50%; cursor:default;
  background:radial-gradient(circle at 40% 35%, #1d2747, #0c1222); border:1.5px solid var(--accent-c, #3a4772); box-shadow:0 2px 8px #000a; }
.colony-slot.built { box-shadow:0 0 0 1px #0008, 0 0 10px color-mix(in srgb, var(--accent-c) 35%, transparent); }
.colony-slot.queued { border-style:dashed; background:conic-gradient(color-mix(in srgb, var(--accent-c) 45%, transparent) var(--progress, 0deg), #0c1222 0); }
.colony-slot.queued .icon { opacity:.75; }
.slot-turns { position:absolute; bottom:-7px; right:-7px; min-width:18px; padding:0 3px; border-radius:8px; background:#0b1122; border:1px solid #3a4772;
  font-size:10px; line-height:15px; color:var(--text); }
.colony-slot.empty { border:1.5px dashed #4a5780; background:#0c1222aa; cursor:pointer; }
.colony-slot.empty:hover:not(:disabled) { border-color:var(--accent); background:#1a2442; }
.colony-slot.locked { border:1.5px dashed #2a3352; background:#080d1a88; opacity:.6; }
.yield-row { display:flex; flex-wrap:wrap; justify-content:center; gap:6px; margin:2px 0 6px; }
.yield-chip { display:inline-flex; align-items:center; gap:4px; padding:2px 8px 2px 5px; border-radius:999px; background:#141c33; border:1px solid var(--line); font-size:12px; }
.queue-item .icon { margin-right:6px; }
.imp-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(118px, 1fr)); gap:8px; }
.imp-tile { display:flex; flex-direction:column; align-items:center; gap:4px; padding:10px 6px 8px; border-radius:10px; border:1px solid var(--line);
  background:linear-gradient(#18213d, #0f1629); color:var(--text); font:inherit; cursor:pointer; }
.imp-tile:hover:not(:disabled) { border-color:var(--accent); background:linear-gradient(#202b4d, #131b33); }
.imp-tile.off { opacity:.5; cursor:default; }
.imp-tile-icon { display:flex; width:46px; height:46px; align-items:center; justify-content:center; border-radius:50%; border:1.5px solid var(--accent-c);
  background:radial-gradient(circle at 40% 35%, #1d2747, #0c1222); }
.imp-tile-name { font-size:12px; font-weight:600; text-align:center; line-height:1.2; }
.imp-tile-cost { font-size:11px; }
.unavail-list.imp-grid { opacity:.85; }
.picker-layout { display:grid; grid-template-columns:300px minmax(0, 1fr); gap:18px; align-items:start; }
.picker-planet { display:flex; flex-direction:column; align-items:center; gap:6px; position:sticky; top:0; }
.picker-tiles { min-width:0; }
.colony-slot.preview { border-style:solid; background:radial-gradient(circle at 40% 35%, #26335c, #101833); box-shadow:0 0 14px color-mix(in srgb, var(--accent-c) 55%, transparent); }
.colony-slot.preview .icon { opacity:.85; }
@media (max-width: 760px) {
  .picker-layout { grid-template-columns:1fr; }
  .picker-planet { position:static; }
}
.guide-grid { display:grid; grid-template-columns:minmax(170px, 230px) minmax(0, 1fr); gap:14px; min-height:420px; }
.guide-grid > * { min-width:0; }
.guide-list { display:flex; flex-direction:column; max-height:70vh; overflow:auto; padding-right:4px; }
.guide-head { margin:10px 0 3px; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--dim); }
.guide-pick { display:none; width:100%; margin-bottom:8px; }
.guide-pane { max-height:70vh; overflow:auto; line-height:1.5; padding-right:6px; }
.guide-pane p { margin:6px 0; }
.guide-title { margin:0 0 2px; font-size:20px; }
.guide-top { display:flex; gap:12px; align-items:flex-start; margin-bottom:6px; }
.guide-ul { margin:4px 0; padding-left:20px; }
.guide-leader { display:flex; gap:10px; align-items:flex-start; }
.guide-leader.on { border-color:var(--accent); }
@media (max-width: 760px) {
  .guide-grid { grid-template-columns:1fr; min-height:0; }
  .guide-list { display:none; }
  .guide-pick { display:block; }
  .guide-pane { max-height:none; }
  .guide-top .portrait, .guide-leader .portrait { width:64px !important; height:80px !important; }
}
.dip-head { display:flex; gap:12px; align-items:flex-start; }
@media (max-width: 760px) { .dip-head .portrait { width:72px !important; height:90px !important; } }
.card { background:var(--panel2); border:1px solid var(--line); border-radius:8px; padding:8px 10px; margin-bottom:8px; }
.card.sel { border:2px solid var(--accent); padding:7px 9px; background:#1b2340; box-shadow:0 0 0 1px #ffd16633, 0 0 12px #ffd16622; }
.kv { display:grid; grid-template-columns:auto 1fr; gap:2px 10px; }
.kv .k { color:var(--dim); }
.ship-row { display:flex; align-items:center; gap:6px; padding:3px 0; }
.ship-row canvas { width:28px; height:28px; }
.ship-row.sel { background:#ffd16622; border-radius:4px; box-shadow:inset 0 0 0 2px var(--accent); }
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
.side-tabs { margin:8px 0 6px; }
.build-row { margin-bottom:3px; }
.build-row.off .list-btn { opacity:.65; }
.build-row .btn:disabled { pointer-events:none; }
.unavail-toggle { display:block; width:100%; margin:6px 0 2px; padding:4px 2px; background:none; border:none; border-top:1px dashed #2b3556;
  color:var(--dim); font:inherit; font-size:12px; text-align:left; cursor:pointer; }
.unavail-toggle:hover { color:var(--text); }
.unavail-list .build-row { opacity:.55; }
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
.btn.splash-play { font-size:20px; padding:13px 70px; letter-spacing:.32em; text-transform:uppercase; border-radius:2px;
  clip-path:polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px);
  filter:drop-shadow(0 0 18px rgba(255, 190, 90, 0.45)); }
.splash-play-frame { position:relative; z-index:0; }
.splash-play-frame::after { content:''; position:absolute; left:-120px; right:-120px; top:50%; height:1px; z-index:-1; pointer-events:none;
  background:linear-gradient(90deg, transparent, #4fd8ff99 30%, transparent 42%, transparent 58%, #4fd8ff99 70%, transparent); }
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
.msg-grid { display:grid; grid-template-columns:minmax(170px, 230px) minmax(0, 1fr); gap:12px; min-height:360px; }
.dip-group { margin:10px 0 3px; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--dim); }
.dip-entry { padding-top:5px; padding-bottom:5px; }
.dip-entry-body { display:flex; flex-direction:column; gap:2px; width:100%; min-width:0; }
.dip-facts { display:flex; align-items:center; gap:8px; font-size:11px; color:var(--dim); }
.dip-status.bad { color:var(--bad); } .dip-status.good { color:var(--good); } .dip-status.ok { color:#4fd1c5; }
.dip-emb { letter-spacing:1px; color:#3a4569; } .dip-emb .on { color:var(--accent); }
.msg-grid > * { min-width:0; }
/* ===================================================================================================
   Command deck theme: a starship bridge console. Crisp angled frames, cyan instrument light for
   information, gold reserved for decisions. (Phone rules further down still apply on top of this.)
   =================================================================================================== */
:root { --panel:#071019f2; --panel2:#0b1724; --line:#1d3a4d; --dim:#7f9bb0; --accent:#ffc04d; --cy:#4fd8ff; }
body { background:#03070d; font-variant-numeric:tabular-nums; }
#topbar { background:#050c14; border-bottom:1px solid #1d3a4d; box-shadow:0 6px 24px #000a; }
#topbar::after { content:''; position:absolute; left:0; right:0; bottom:-1px; height:1px; background:linear-gradient(90deg, transparent, #4fd8ff88, transparent); pointer-events:none; }
#topbar .top-fixed { background:#071019; border-left:1px solid #1d3a4d; }
#topbar .top-more { background:#071019; border-left-color:#1d3a4d; color:var(--cy); }
#topbar .res { padding:0 12px; border-right:1px solid #16303f; }
#topbar .res b { color:#e8f6ff; }
.btn { background:#0a1a26; border:1px solid #23485c; border-radius:3px; padding:5px 12px; text-transform:uppercase; letter-spacing:.08em; font-size:12px;
  clip-path:polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px); transition:background .12s, border-color .12s, color .12s; }
.btn:hover:not(:disabled) { background:#0f2533; border-color:var(--cy); color:#dff7ff; }
.btn.small { padding:3px 9px; font-size:11px; }
.btn.ghost { clip-path:none; background:transparent; border-color:transparent; }
.btn.primary { background:linear-gradient(180deg, #ffcc66, #e0a030); border-color:#ffd98a; color:#170f00; font-weight:700; }
.btn.primary:hover:not(:disabled) { background:linear-gradient(180deg, #ffd889, #eab046); color:#170f00; border-color:#ffe3a6; }
.btn.danger { background:#3a0f16; border-color:#8a2c3a; color:#ffb3bd; }
#endturn { padding:7px 20px; }
/* Lists keep normal lettering: they hold names and numbers, not commands. */
.list-btn, .btn.list-btn { text-transform:none; letter-spacing:0; font-size:13px; clip-path:none; border-radius:2px; }
.btn.small.list-btn { font-size:12px; }
.tabs .btn.on { background:#0f2b3a; border-color:var(--cy); color:var(--cy); box-shadow:inset 0 -2px 0 var(--cy); }
.list-btn.on { background:#0f2b3a; border-color:var(--cy); }
#side { background-color:#040a12f2; border-left:1px solid #1d3a4d; padding:12px 14px 90px;
  background-image:linear-gradient(#4fd8ff08 1px, transparent 1px), linear-gradient(90deg, #4fd8ff08 1px, transparent 1px), linear-gradient(180deg, #06101a, #040a12);
  background-size:22px 22px, 22px 22px, 100% 100%; }
#side > .row b { letter-spacing:.18em; text-transform:uppercase; color:#e8f6ff; }
.card { background:#08141fe6; border:1px solid #1d3a4d; border-left:2px solid #4fd8ff66; border-radius:2px; padding:10px 12px;
  clip-path:polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%); }
.card.sel { border:1px solid var(--accent); border-left:3px solid var(--accent); background:#14200fe6; padding:9px 11px 9px 10px; box-shadow:none; }
h3 { font-size:11px; letter-spacing:.24em; color:var(--cy); font-weight:600; margin:14px 0 6px; }
h3::before { content:'▸ '; color:#4fd8ff99; }
.kv .k { color:#6f8ca1; text-transform:uppercase; font-size:11px; letter-spacing:.08em; }
.yield-chip { border-radius:2px; background:#0a1a26; border-color:#23485c; }
.colony-slot { background:radial-gradient(circle at 40% 35%, #0f2533, #050c14); }
.colony-view::before { content:''; position:absolute; inset:24px; border-radius:50%; border:1px dashed #4fd8ff33; pointer-events:none; }
.colony-count { background:#050c14cc; border-color:#23485c; }
.imp-tile { border-radius:2px; background:linear-gradient(#0b1a26, #071019); border-color:#1d3a4d; clip-path:polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%); }
.imp-tile:hover:not(:disabled) { border-color:var(--cy); background:linear-gradient(#0f2533, #08141f); }
.modal-overlay { background:#01050acc; }
.modal { background:#060e17; border:1px solid #23485c; border-radius:2px; box-shadow:0 0 0 1px #000, 0 0 40px #4fd8ff18, 0 30px 80px #000;
  clip-path:polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px)); }
.modal-head { background:linear-gradient(90deg, #0d2433, #060e17); border-bottom:1px solid #23485c; padding:12px 18px; }
.modal-title { font-size:15px; letter-spacing:.28em; text-transform:uppercase; color:#dff7ff; font-weight:600; }
.modal-body { padding:14px 18px; }
.dip-head .portrait, .portrait { border-radius:2px; }
.portrait.avatar { border-radius:50%; }
.tooltip { background:#060e17f5; border-color:#4fd8ff66; border-radius:2px; }
.info-tip { border-color:#23485c; background:#0a1a26; color:var(--cy); }
.unavail-toggle { border-top-color:#1d3a4d; }
.brief-chip { border-radius:2px; background:#0a1a26; border-color:#23485c; }
.badge { border-radius:2px; }
.chip { letter-spacing:.02em; }
#mini { border-radius:2px; border-color:#23485c; }
#map-tools .btn { background:#050c14e6; }
.hover-card { background:#060e17f2; border-color:#23485c; border-radius:2px; }
.faction-card { background:#08141fcc; border-color:#1d3a4d; border-radius:2px; clip-path:polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%); }
.faction-card.taken { border-color:var(--accent); }
input, select, textarea { background:#050c14; border:1px solid #23485c; border-radius:2px; color:var(--text); }
#phone-nav { background:#050c14f8; border-top:1px solid #1d3a4d; box-shadow:0 -1px 0 #4fd8ff22; }
.nav-label { letter-spacing:.02em; }
#phone-nav .nav-end { letter-spacing:.06em; }
.sheet-handle { background:#0b1724; border-bottom-color:#1d3a4d; }
.sheet-handle span { background:var(--cy); opacity:.6; }

/* Mid-size windows: drop the turn number and per-turn changes (both are in the Empire panel) so the bar fits. */
@media (min-width: 761px) and (max-width: 1180px) {
  #topbar .top-turn, #topbar .top-net { display:none; }
  #topbar .top-scroll { gap:7px; padding:0 8px; }
}
:root { --nav-h:calc(58px + env(safe-area-inset-bottom, 0px)); }
#phone-nav { display:none; }
@media (max-width: 760px) {
  #side { width:100%; top:auto; bottom:var(--nav-h); height:calc((100% - 46px - var(--nav-h)) / 2); border-left:none; border-top:1px solid var(--line);
    border-radius:14px 14px 0 0; padding:0 12px 20px; transition:height .18s ease; box-shadow:0 -6px 20px #0008; }
  #side.sheet-full { height:calc(100% - 46px - var(--nav-h)); border-radius:0; }
  #side.sheet-peek { height:150px; }
  #side.sizing { transition:none; }
  /* Closing slides the sheet away. */
  #side.empty { transform:translateY(calc(100% + var(--nav-h))); pointer-events:none; visibility:hidden; transition:transform .18s ease, visibility 0s .18s; }
  .sheet-handle { position:sticky; top:0; z-index:2; height:24px; margin:0 -12px 4px; display:flex; align-items:center; justify-content:center;
    background:var(--panel2); border-bottom:1px solid var(--line); border-radius:14px 14px 0 0; touch-action:none; cursor:grab; }
  #side.sheet-full .sheet-handle { border-radius:0; }
  .sheet-handle span { width:44px; height:5px; border-radius:3px; background:#5a6690; }
  #phone-nav { display:flex; position:absolute; left:0; right:0; bottom:0; height:var(--nav-h); padding:0 4px env(safe-area-inset-bottom, 0px); z-index:7;
    background:#0b1122f8; border-top:1px solid var(--line); align-items:stretch; gap:2px; }
  .nav-tab { flex:1 1 0; min-width:0; border:none; background:none; color:var(--text); font:inherit; display:flex; flex-direction:column; align-items:center;
    justify-content:center; gap:2px; padding:4px 0; cursor:pointer; border-radius:8px; }
  .nav-tab:active { background:#1a2442; }
  .nav-icon { position:relative; font-size:19px; line-height:1; }
  .nav-icon .badge { position:absolute; top:-6px; left:14px; margin:0; }
  .nav-icon .notice-dot { position:absolute; top:-2px; left:16px; margin:0; }
  .nav-label { font-size:10px; color:var(--dim); max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .nav-end { flex:0 0 auto; align-self:center; margin:0 4px; min-height:44px; padding:0 14px; font-weight:700; border-radius:10px; }
  .desk-only { display:none !important; }
  .more-item { justify-content:flex-start; gap:12px; padding:10px 12px; }
  .more-item .nav-icon { width:26px; text-align:center; }
  #toast { bottom:calc(var(--nav-h) + 12px); }
  #mini { display:none; }
  #map-tools { top:56px; bottom:auto; left:auto; right:10px; flex-direction:column; align-items:flex-end; }
  #side:not(.empty) ~ #map-tools { display:none; }
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
