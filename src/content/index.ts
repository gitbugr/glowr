import browser from "webextension-polyfill";
import { APP_NAME, DEFAULTS, SITES, siteFor, type SelectorKey, type SiteDef } from "../shared/config";
import type { TabRequest } from "../shared/messages";
import { loadSettings, onSettingsChanged, saveSettings } from "../shared/settings";
import type { App } from "./app";
import { CaptionTracker, CueStore } from "./cues";
import { DeepQuery, textOf } from "./dom";
import { Recorder } from "./recorder";
import { clean } from "./text";
import { openEditor } from "./ui/editor";
import { Panel } from "./ui/panel";

const site = siteFor(location.hostname);
const siteDef: SiteDef | null = site ? SITES[site] : null;
const selectorKey = site ? (`sel_${site}` as SelectorKey) : null;

const cues = new CueStore();
const app = {
  cfg: { ...DEFAULTS },
  site,
  siteDef,
  video: null,
  cues,
  tracker: new CaptionTracker(cues),
  active: true,
  ad: false,
} as unknown as App;
app.query = new DeepQuery(() => app.panel.host);
app.recorder = new Recorder(
  () => app.video,
  () => app.ad || !app.active,
  () => app.panel.updateStatus(),
);
app.panel = new Panel(app);

app.setSelector = (sel) => {
  if (!selectorKey) return;
  app.cfg[selectorKey] = sel;
  void saveSettings({ [selectorKey]: sel });
  app.tracker.reset();
};

app.close = () => {
  app.active = false;
  app.recorder.set(false);
  app.tracker.interrupt();
  app.panel.hide();
  void browser.storage.local.set({ closed: true });
  app.panel.toast(`${APP_NAME} is hidden. Click its toolbar button to bring it back.`, "info", 5000);
};

function reopen() {
  app.active = true;
  void browser.storage.local.set({ closed: false });
  app.tracker.reset();
  app.panel.show();
  app.recorder.set(app.cfg.autoRecord);
}

const pathOk = () => !siteDef?.paths || siteDef.paths.test(location.pathname);
const adShowing = () => !!siteDef?.adSelector && !!document.querySelector(siteDef.adSelector);
const mediaKeyOf = (v: HTMLVideoElement) => siteDef?.mediaKey?.() ?? (v.currentSrc || v.src);

function readSubText(): string {
  const sel = selectorKey ? app.cfg[selectorKey] : "";
  if (!sel) return "";
  try {
    return clean(app.query.all(sel).map(textOf).join(" "));
  } catch {
    return ""; // invalid selector
  }
}

// ---------- capture ----------

let seekBlockUntil = 0;
let mediaKey = "";

function resetCapture() {
  app.recorder.store.clear();
  app.cues.clear();
  app.tracker.reset();
  app.panel.render(true);
}

function hookTextTracks(v: HTMLVideoElement) {
  const seen = new WeakSet<TextTrack>();
  const attach = (t: TextTrack) => {
    if (seen.has(t)) return;
    seen.add(t);
    t.addEventListener("cuechange", () => {
      if (t.mode === "disabled" || !app.active || app.ad) return;
      for (const c of t.activeCues ?? [])
        app.cues.add(c.startTime, c.endTime, clean((c as VTTCue).text ?? ""), "track");
    });
  };
  [...v.textTracks].forEach(attach);
  v.textTracks.addEventListener("addtrack", (e) => e.track && attach(e.track));
}

function attachVideo(v: HTMLVideoElement) {
  if (app.video) resetCapture();
  app.video = v;
  mediaKey = mediaKeyOf(v);
  hookTextTracks(v);
  const mine = () => v === app.video;
  v.addEventListener("seeking", () => {
    if (!mine()) return;
    app.tracker.seekStart(readSubText());
    app.recorder.seekStart();
    seekBlockUntil = Infinity;
  });
  v.addEventListener("seeked", () => {
    if (!mine()) return;
    seekBlockUntil = performance.now() + 250;
    app.recorder.seekEnd();
  });
  v.addEventListener("play", () => mine() && void app.recorder.start());
  // A new programme in the same element: old times no longer mean anything.
  // (YouTube also swaps sources for ads, so compare a per-programme key.)
  v.addEventListener("loadedmetadata", () => {
    if (!mine() || app.ad || adShowing()) return;
    const k = mediaKeyOf(v);
    if (k !== mediaKey) {
      mediaKey = k;
      resetCapture();
    }
  });
  app.panel.mount(app.active);
  void app.recorder.start();
}

function pickVideo() {
  const allowed = pathOk();
  app.panel.setPageAllowed(allowed);
  if (!allowed) return;
  const vids = app.query
    .all<HTMLVideoElement>("video")
    .filter(
      (v) =>
        v.title !== "Advertisement" &&
        !v.closest("[class*='ima-ad'], [title='Advertisement']") &&
        v.clientWidth > 0,
    )
    .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
  if (vids[0] && vids[0] !== app.video) attachVideo(vids[0]);
}

function pollSubtitles() {
  const v = app.video;
  if (!app.active || !v || v.seeking || performance.now() < seekBlockUntil) return;
  app.ad = adShowing();
  if (app.ad) return app.tracker.interrupt();
  app.tracker.feed(readSubText(), v.currentTime);
}

// ---------- startup ----------

void Promise.all([loadSettings(), browser.storage.local.get({ closed: false })]).then(
  ([cfg, local]) => {
    app.cfg = cfg;
    app.active = !local.closed;
    app.recorder.set(app.active && cfg.autoRecord);
    pickVideo();
    setInterval(pickVideo, 1000);
    setInterval(pollSubtitles, 100);
    setInterval(() => app.panel.render(), 400);
  },
);

onSettingsChanged((patch) => {
  Object.assign(app.cfg, patch);
  if (selectorKey && selectorKey in patch) app.tracker.reset();
});

// Any click or keypress counts as the gesture audio needs.
for (const ev of ["pointerdown", "keydown"])
  document.addEventListener(ev, () => app.active && void app.recorder.start(), true);

document.addEventListener("keydown", (e) => {
  if (!app.active || !app.panel.mounted) return;
  if (e.altKey && e.code === "KeyA") {
    e.preventDefault();
    void openEditor(app);
  } else if (e.key === "Escape" && !app.panel.modal && app.cues.selected.size) {
    app.cues.selected.clear();
    app.cues.version++;
    app.panel.render();
  }
});

// Toolbar button: show/hide the panel in the frame that has one.
browser.runtime.onMessage.addListener((msg: unknown) => {
  if ((msg as TabRequest)?.type !== "togglePanel" || !app.panel.mounted) return;
  if (app.active) app.close();
  else reopen();
  return Promise.resolve(true);
});
