export const CSS = /* css */ `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.ic { width: 16px; height: 16px; flex: none; display: block; }
.ic.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.panel, .dlg, .toast, .pick-tip {
  --bg: rgba(18, 20, 26, .95); --bg2: #22262f; --bg3: #2c313c;
  --line: rgba(255,255,255,.09); --fg: #e9ecf1; --muted: #9aa3b2;
  --accent: #2ea8ff; --accent-bg: rgba(46,168,255,.16);
  --ok: #3ccf8e; --warn: #f5b142; --err: #ff6b6b;
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--fg); -webkit-font-smoothing: antialiased;
}
button { font: inherit; color: inherit; }
.panel {
  position: fixed; z-index: 2147483647; width: 380px;
  background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,.45);
  display: flex; flex-direction: column; overflow: hidden;
}
.hd { display: flex; align-items: center; gap: 6px; padding: 8px 6px 8px 10px;
  cursor: grab; user-select: none; }
.hd:active { cursor: grabbing; }
.logo { width: 22px; height: 22px; }
.title { font-weight: 650; letter-spacing: .2px; margin-right: 2px; }
.sp { flex: 1; }
.ib { display: inline-grid; place-items: center; width: 28px; height: 28px;
  border: 0; border-radius: 7px; background: transparent; color: var(--muted);
  cursor: pointer; padding: 0; }
.ib:hover { background: var(--bg3); color: var(--fg); }
.ib.primary { background: var(--accent); color: #031320; margin-right: 2px; }
.ib.primary:hover { filter: brightness(1.1); }
.pill { display: inline-flex; align-items: center; gap: 5px; height: 22px;
  padding: 0 8px 0 7px; border-radius: 99px; font-size: 11.5px; border: 0;
  background: var(--bg2); color: var(--muted); cursor: pointer; white-space: nowrap; }
.pill:hover { background: var(--bg3); }
.pill .ic { width: 13px; height: 13px; }
.pill[data-s="rec"] { color: var(--ok); }
.pill[data-s="rec"]::before { content: ""; width: 6px; height: 6px;
  border-radius: 50%; background: var(--ok); animation: pulse 1.6s infinite; }
.pill[data-s="rec"] .ic { display: none; }
.pill[data-s="hold"] { color: var(--warn); }
.pill[data-s="off"] { color: var(--fg); }
.pill[data-s="error"] { color: var(--err); }
@keyframes pulse { 50% { opacity: .3; } }
.body { border-top: 1px solid var(--line); }
.collapsed .body { display: none; }
.list { max-height: 280px; overflow-y: auto; padding: 6px; scrollbar-width: thin;
  scrollbar-color: var(--bg3) transparent; }
.cue { display: flex; gap: 8px; align-items: flex-start; padding: 5px 6px 5px 8px;
  border-radius: 7px; cursor: pointer; position: relative;
  border-left: 2px solid transparent; }
.cue:hover { background: var(--bg2); }
.cue.now { border-left-color: var(--accent); background: rgba(255,255,255,.035); }
.cue.sel { background: var(--accent-bg); }
.ts { font: 11px/1.9 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--muted); flex: none; }
.tx { flex: 1; user-select: text; cursor: text; }
.cue .ib { width: 24px; height: 24px; opacity: 0; flex: none; }
.cue:hover .ib { opacity: 1; }
.empty { padding: 18px 16px; color: var(--muted); text-align: center; }
.empty b { color: var(--fg); font-weight: 600; display: block; margin-bottom: 2px; }
.ft { display: flex; align-items: center; gap: 6px; padding: 6px 10px;
  border-top: 1px solid var(--line); color: var(--muted); font-size: 11.5px; }
kbd { font: 10.5px ui-monospace, monospace; padding: 1px 4px; border-radius: 4px;
  background: var(--bg3); color: var(--fg); border: 1px solid var(--line); }
.linkbtn { display: inline-flex; gap: 4px; align-items: center; border: 0;
  background: none; color: var(--muted); cursor: pointer; padding: 2px 4px;
  border-radius: 5px; font-size: 11.5px; }
.linkbtn:hover { color: var(--fg); background: var(--bg3); }
.linkbtn .ic { width: 13px; height: 13px; }

.modal { position: fixed; inset: 0; z-index: 2147483647; display: grid;
  place-items: center; background: rgba(0,0,0,.6); padding: 16px; }
.dlg { width: min(820px, 100%); max-height: calc(100vh - 32px); overflow-y: auto;
  background: #16181e; border: 1px solid var(--line); border-radius: 14px;
  box-shadow: 0 24px 80px rgba(0,0,0,.6); padding: 16px 18px 18px; }
.dlg-hd { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.dlg-hd h2 { font-size: 15px; margin: 0; font-weight: 650; }
.crumb { color: var(--muted); font-size: 12px; }
.wave { position: relative; border-radius: 10px; overflow: hidden;
  background: #0d0f13; border: 1px solid var(--line); }
.wave canvas { display: block; width: 100%; height: 120px; cursor: ew-resize;
  touch-action: none; }
.row { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.btn { display: inline-flex; align-items: center; gap: 6px; height: 32px;
  padding: 0 12px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--bg2); color: var(--fg); cursor: pointer; font-weight: 550; }
.btn:hover { background: var(--bg3); }
.btn.primary { background: var(--accent); border-color: transparent; color: #031320; }
.btn.primary:hover { filter: brightness(1.08); }
.btn:disabled { opacity: .55; cursor: default; filter: none; }
.btn kbd { background: rgba(0,0,0,.18); border-color: transparent; color: inherit; }
.times { font: 12px ui-monospace, monospace; color: var(--muted); }
.warn { display: flex; gap: 8px; align-items: center; margin-top: 10px;
  padding: 8px 10px; border-radius: 8px; color: var(--warn);
  background: rgba(245,177,66,.1); font-size: 12.5px; }
.field { display: block; margin-top: 12px; }
.field > span { display: flex; align-items: center; gap: 6px; margin-bottom: 5px;
  color: var(--muted); font-size: 12px; font-weight: 550; }
.field > span i { font-weight: 400; }
.field > span .ic { width: 13px; height: 13px; }
textarea, input { width: 100%; font: 14px/1.45 system-ui, sans-serif; color: var(--fg);
  background: #0d0f13; border: 1px solid var(--line); border-radius: 8px;
  padding: 8px 10px; resize: vertical; outline: none; }
textarea:focus, input:focus { border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-bg); }
textarea { min-height: 54px; }
.actions { display: flex; align-items: center; gap: 8px; margin-top: 16px; }
.status { flex: 1; font-size: 12.5px; color: var(--muted); }
.status.err { color: var(--err); }

.toasts { position: fixed; z-index: 2147483647; top: 16px; left: 50%;
  transform: translateX(-50%); display: grid; gap: 8px; pointer-events: none; }
.toast { display: flex; align-items: center; gap: 8px; padding: 9px 14px;
  border-radius: 10px; background: var(--bg); border: 1px solid var(--line);
  box-shadow: 0 8px 30px rgba(0,0,0,.4); animation: tin .18s ease-out; }
.toast.ok .ic { color: var(--ok); } .toast.err .ic { color: var(--err); }
.toast.info .ic { color: var(--accent); }
@keyframes tin { from { opacity: 0; transform: translateY(-6px); } }

.pick-box { position: fixed; z-index: 2147483646; pointer-events: none;
  border: 2px solid #2ea8ff; background: rgba(46,168,255,.15); border-radius: 4px;
  transition: all .06s; }
.pick-tip { position: fixed; z-index: 2147483647; left: 50%; bottom: 24px;
  transform: translateX(-50%); padding: 10px 14px; border-radius: 10px;
  background: var(--bg); border: 1px solid var(--line); pointer-events: none;
  display: flex; gap: 8px; align-items: center; }
`;
