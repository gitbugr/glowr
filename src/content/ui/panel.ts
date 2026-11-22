import browser from "webextension-polyfill";
import { APP_NAME } from "../../shared/config";
import { icon, type IconName } from "../../shared/icons";
import { send } from "../../shared/messages";
import type { App } from "../app";
import type { Cue } from "../cues";
import { shadowOf } from "../dom";
import { escapeHTML, fmtTime } from "../text";
import { openEditor } from "./editor";
import { setHTML } from "./html";
import { startPicker } from "./picker";
import { CSS } from "./styles";

interface SavedPanel {
  x?: number;
  yb?: number;
  collapsed?: boolean;
}

export const logoURL = () => browser.runtime.getURL("icons/icon-48.png");

/** The floating panel: recent lines, recording status and actions. */
export class Panel {
  host: HTMLDivElement | null = null;
  root!: ShadowRoot;
  modal: HTMLElement | null = null;
  picking = false;
  /** Text highlighted when the card button was pressed. */
  pendingHighlight = "";

  private el!: {
    panel: HTMLElement;
    list: HTMLElement;
    empty: HTMLElement;
    pill: HTMLButtonElement;
    toasts: HTMLElement;
    collapse: HTMLButtonElement;
  };
  private x = 0;
  /** Distance from the bottom edge: a growing list never runs off-screen. */
  private yb = 96;
  private lastSig = "";

  constructor(private app: App) {}

  get mounted() {
    return !!this.host;
  }

  mount(visible: boolean) {
    if (this.host) return;
    const host = document.createElement("div");
    host.id = "glowr-host";
    const root = host.attachShadow({ mode: "closed" });
    setHTML(
      root,
      `<style>${CSS}</style>
      <div class="panel">
        <div class="hd">
          <img class="logo" src="${logoURL()}" alt="">
          <span class="title">${APP_NAME}</span>
          <button class="pill" data-act="record"></button>
          <span class="sp"></span>
          <button class="ib primary" data-act="card" title="Make a card (Alt+A)">${icon("plus")}</button>
          <button class="ib" data-act="settings" title="Settings">${icon("settings")}</button>
          <button class="ib" data-act="collapse" title="Collapse">${icon("chevron-down")}</button>
          <button class="ib" data-act="close" title="Close and stop recording">${icon("x")}</button>
        </div>
        <div class="body">
          <div class="list"></div>
          <div class="empty"></div>
          <div class="ft">
            <span>Click to select · <kbd>Shift</kbd> range · <kbd>Alt</kbd>+<kbd>A</kbd> card</span>
            <span class="sp"></span>
            <button class="linkbtn" data-act="pick" title="Click the subtitles on the video to show ${APP_NAME} where they are">${icon("crosshair")}Pick subs</button>
          </div>
        </div>
      </div>
      <div class="toasts"></div>`,
    );
    const q = <E extends Element>(s: string) => root.querySelector<E & HTMLElement>(s)!;
    this.host = host;
    this.root = root;
    this.el = {
      panel: q(".panel"),
      list: q(".list"),
      empty: q(".empty"),
      pill: q<HTMLButtonElement>(".pill"),
      toasts: q(".toasts"),
      collapse: q<HTMLButtonElement>('[data-act="collapse"]'),
    };

    // Keep page hotkeys (space = play/pause etc.) away from our inputs.
    for (const ev of ["keydown", "keyup", "keypress"])
      root.addEventListener(ev, (e) => {
        if ((e.target as Element).matches?.("textarea, input")) e.stopPropagation();
      });

    const actions: Record<string, () => void> = {
      record: () => this.app.recorder.set(!this.app.recorder.recording),
      card: () => void openEditor(this.app),
      settings: () => void send({ type: "openOptions" }),
      collapse: () => this.setCollapsed(!this.el.panel.classList.contains("collapsed")),
      close: () => this.app.close(),
      pick: () => startPicker(this.app),
    };
    root.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-act]");
      if (b?.dataset.act) actions[b.dataset.act]?.();
    });
    // Grab the highlighted word before the button click can clear it.
    q('[data-act="card"]').addEventListener(
      "pointerdown",
      () => (this.pendingHighlight = this.selText()),
    );

    this.makeDraggable(q(".hd"));
    void browser.storage.local.get({ panel: {} }).then((r) => {
      const p = r.panel as SavedPanel;
      if (p.collapsed) this.setCollapsed(true, false);
      this.place(p.x, p.yb);
    });
    this.place();
    this.el.panel.hidden = !visible;
    this.placeHost();
    document.addEventListener("fullscreenchange", () => this.placeHost());
    window.addEventListener("resize", () => this.place(this.x, this.yb));
    this.updateStatus();
    this.render();
  }

  get visible() {
    return !!this.host && !this.el.panel.hidden;
  }

  show() {
    if (!this.host) return;
    this.el.panel.hidden = false;
    this.place(this.x, this.yb);
    this.render(true);
  }

  /** Hides the panel; toasts can still show. */
  hide() {
    if (this.host) this.el.panel.hidden = true;
  }

  /** Hide/show for pages a site profile excludes (e.g. YouTube's homepage). */
  setPageAllowed(allowed: boolean) {
    if (this.host) this.host.style.display = allowed ? "" : "none";
  }

  private setCollapsed(c: boolean, save = true) {
    this.el.panel.classList.toggle("collapsed", c);
    setHTML(this.el.collapse, icon(c ? "chevron-up" : "chevron-down"));
    this.el.collapse.title = c ? "Expand" : "Collapse";
    if (save) this.save();
  }

  // Fullscreen players (incl. shadow-DOM ones like iPlayer) need us inside
  // the fullscreen element or we disappear.
  private placeHost() {
    const host = this.host!;
    const fs = document.fullscreenElement;
    let parent: Node = document.documentElement;
    if (fs && fs.tagName !== "VIDEO") parent = shadowOf(fs) ?? fs;
    if (host.parentNode !== parent) parent.appendChild(host);
  }

  private place(x?: number, yb?: number) {
    const p = this.el.panel;
    const w = p.offsetWidth || 380,
      h = p.offsetHeight || 60;
    if (x == null || yb == null) {
      x = innerWidth - w - 16;
      yb = 96;
    }
    this.x = Math.min(Math.max(8, x), innerWidth - w - 8);
    this.yb = Math.max(8, Math.min(yb, innerHeight - h - 8));
    p.style.left = this.x + "px";
    p.style.bottom = this.yb + "px";
  }

  private save() {
    const panel: SavedPanel = {
      x: this.x,
      yb: this.yb,
      collapsed: this.el.panel.classList.contains("collapsed"),
    };
    void browser.storage.local.set({ panel });
  }

  private makeDraggable(handle: HTMLElement) {
    let d: { dx: number; dy: number } | null = null;
    handle.addEventListener("pointerdown", (e) => {
      if ((e.target as Element).closest("button")) return;
      d = { dx: e.clientX - this.x, dy: e.clientY - (innerHeight - this.yb) };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (d) this.place(e.clientX - d.dx, innerHeight - (e.clientY - d.dy));
    });
    handle.addEventListener("pointerup", () => {
      if (d) this.save();
      d = null;
    });
  }

  updateStatus() {
    if (!this.host) return;
    const { recorder } = this.app;
    const v = this.app.video;
    let s: string = recorder.state,
      label: string,
      ic: IconName = "mic",
      title = "";
    if (!recorder.wanted) {
      s = "off";
      label = "Record";
      title = "Start capturing audio for cards";
    } else if (s === "rec" && v && v.playbackRate !== 1) {
      s = "hold";
      label = `Paused at ${v.playbackRate}×`;
      title = "Audio is only captured at 1× speed";
    } else if (s === "rec") {
      label = "Recording";
      title = "Click to stop recording";
    } else if (s === "error") {
      label = "Audio error";
      ic = "warning";
      title = "See the browser console for details";
    } else {
      label = "Click page to record";
      ic = "mic-off";
    }
    const pill = this.el.pill;
    const sig = s + label;
    if (pill.dataset.sig === sig) return;
    pill.dataset.sig = sig;
    pill.dataset.s = s;
    pill.title = title;
    setHTML(pill, icon(ic) + label);
  }

  toast(msg: string, kind: "ok" | "err" | "info" = "ok", ms = 2600) {
    if (!this.host) return;
    const t = document.createElement("div");
    t.className = `toast ${kind}`;
    const ic: IconName = kind === "ok" ? "circle-check" : kind === "err" ? "warning" : "mic-off";
    setHTML(t, icon(ic) + `<span>${escapeHTML(msg)}</span>`);
    this.el.toasts.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  /** Selected text, including inside our (closed) shadow root. */
  selText(): string {
    const sel = this.root?.getSelection?.() ?? window.getSelection();
    return sel?.toString().trim() ?? "";
  }

  /** Re-render the line list if anything visible changed. */
  render(force = false) {
    if (!this.visible) return;
    this.updateStatus();
    const { cues } = this.app;
    const v = this.app.video;
    const now = v?.currentTime ?? 0;
    const shown = cues.cues.filter((c) => c.start <= now + 1).slice(-30);
    const nowIdx = shown.findIndex((c) => now >= c.start && now <= c.end);
    const sig = `${cues.version}|${shown.length}|${nowIdx}`;
    if (!force && sig === this.lastSig) return; // keep scroll and text selection
    this.lastSig = sig;

    const l = this.el.list;
    const stick = l.scrollHeight - l.scrollTop - l.clientHeight < 40;
    l.replaceChildren(...shown.map((c, i) => this.row(c, i === nowIdx)));
    if (stick || !shown.length) l.scrollTop = l.scrollHeight;

    l.hidden = !shown.length;
    this.el.empty.hidden = !!shown.length;
    if (!shown.length)
      setHTML(
        this.el.empty,
        !v
          ? "<b>Waiting for the video…</b>Start playing something."
          : cues.cues.length
            ? "<b>Nothing yet at this point</b>Lines appear here as they're spoken."
            : `<b>Waiting for subtitles…</b>Turn subtitles on in the player.
               If none show up after a few lines, use <i>Pick subs</i>.`,
      );
  }

  private row(c: Cue, now: boolean) {
    const d = document.createElement("div");
    d.className = "cue";
    if (this.app.cues.selected.has(c)) d.classList.add("sel");
    if (now) d.classList.add("now");
    setHTML(
      d,
      `<span class="ts">${fmtTime(c.start)}</span><span class="tx"></span>
       <button class="ib" title="Replay from here">${icon("replay")}</button>`,
    );
    d.querySelector(".tx")!.textContent = c.text;
    d.querySelector("button")!.onclick = (e) => {
      e.stopPropagation();
      const v = this.app.video;
      if (!v) return;
      v.currentTime = Math.max(0, c.start - 0.15);
      void v.play();
    };
    d.onmousedown = (e) => e.shiftKey && e.preventDefault();
    d.onclick = (e) => this.select(c, e);
    return d;
  }

  private select(c: Cue, e: MouseEvent) {
    if (this.selText()) return; // highlighting a word, not picking a line
    const s = this.app.cues;
    if (e.shiftKey && s.anchor && s.cues.includes(s.anchor)) {
      const i = s.cues.indexOf(c),
        j = s.cues.indexOf(s.anchor);
      s.selected = new Set(s.cues.slice(Math.min(i, j), Math.max(i, j) + 1));
    } else if (e.ctrlKey || e.metaKey) {
      if (s.selected.has(c)) s.selected.delete(c);
      else s.selected.add(c);
      s.anchor = c;
    } else {
      const only = s.selected.size === 1 && s.selected.has(c);
      s.selected = only ? new Set() : new Set([c]);
      s.anchor = only ? null : c;
    }
    s.version++;
    this.render();
  }
}
