import { APP_SLUG } from "../../shared/config";
import { icon } from "../../shared/icons";
import { anki, send } from "../../shared/messages";
import type { App } from "../app";
import { coverage } from "../audio-store";
import { mp3Base64 } from "../mp3";
import { escapeHTML, fmtPrecise } from "../text";
import { setHTML } from "./html";
import { logoURL } from "./panel";

/** The "New card" dialog: trim the clip, edit the text, send to Anki. */
export async function openEditor(app: App) {
  const { panel, cues, recorder, cfg } = app;
  const v = app.video;
  if (!v || panel.modal || !panel.visible) return;
  const highlight = panel.pendingHighlight || panel.selText();
  panel.pendingHighlight = "";
  const lines = cues.forCard(v.currentTime);
  if (!lines.length) return panel.toast("No subtitle line yet. Select one first.", "err");
  const wasPlaying = !v.paused;
  v.pause();

  const sentence = lines.map((c) => c.text).join(" ");
  let a = Math.max(0, lines[0].start - cfg.pad);
  let b = lines[lines.length - 1].end + cfg.pad;
  const viewA = Math.max(0, a - 1.5);
  const viewB = b + 1.5;
  const sr = recorder.sr;
  const { data: samples, mask } = recorder.store.extract(viewA, viewB);
  const idx = (t: number) => Math.round((t - viewA) * sr);
  const hasAudio = coverage(mask, idx(a), idx(b)) > 0.5;

  const m = document.createElement("div");
  m.className = "modal";
  setHTML(
    m,
    `<div class="dlg" role="dialog" aria-label="New card">
      <div class="dlg-hd">
        <img class="logo" src="${logoURL()}" alt="">
        <h2>New card</h2>
        <span class="crumb">${escapeHTML(cfg.deck)} · ${escapeHTML(cfg.model)}</span>
        <span class="sp"></span>
        <button class="ib" data-x title="Cancel (Esc)">${icon("x")}</button>
      </div>
      <div class="wave"><canvas></canvas></div>
      <div class="row">
        <button class="btn" data-play ${hasAudio ? "" : "disabled"}>${icon("play")}<span>Play</span></button>
        <span class="times"></span>
      </div>
      ${
        hasAudio
          ? ""
          : `<div class="warn">${icon("warning")}No audio captured here. Play this part through once at 1× while the panel says “Recording”.</div>`
      }
      <label class="field"><span>${icon("captions")}Sentence</span><textarea data-s rows="2"></textarea></label>
      <label class="field"><span>${icon("highlighter")}Highlight <i>— select a word in the sentence</i></span><input data-h></label>
      <label class="field"><span data-tl>${icon("languages")}Translation</span><textarea data-t rows="2"></textarea></label>
      <div class="actions">
        <span class="status"></span>
        <button class="btn" data-cancel>Cancel</button>
        <button class="btn primary" data-save>${icon("plus")}Add to Anki <kbd>Ctrl</kbd><kbd>↵</kbd></button>
      </div>
    </div>`,
  );
  panel.root.appendChild(m);
  panel.modal = m;
  const $ = <E extends HTMLElement = HTMLElement>(s: string) => m.querySelector<E>(s)!;
  const sEl = $<HTMLTextAreaElement>("[data-s]"),
    hEl = $<HTMLInputElement>("[data-h]"),
    tEl = $<HTMLTextAreaElement>("[data-t]"),
    status = $(".status"),
    times = $(".times"),
    playBtn = $<HTMLButtonElement>("[data-play]"),
    saveBtn = $<HTMLButtonElement>("[data-save]");
  sEl.value = sentence;
  hEl.value = highlight;
  sEl.addEventListener("select", () => {
    const w = sEl.value.slice(sEl.selectionStart, sEl.selectionEnd).trim();
    if (w) hEl.value = w;
  });

  // Translation
  const tl = $("[data-tl]");
  if (cfg.autoTranslate) {
    setHTML(tl, `${icon("loader", "spin")}Translating…`);
    void send<string>({ type: "translate", text: sentence, tl: cfg.targetLang }).then((r) => {
      setHTML(tl, `${icon("languages")}Translation`);
      if (r.ok) {
        if (!tEl.value) tEl.value = r.result;
      } else tEl.placeholder = `Couldn't translate (${r.error}). Type one in.`;
    });
  } else tEl.placeholder = "Optional. Automatic translation is off in Settings.";

  // Waveform with draggable trim handles
  const cv = $<HTMLCanvasElement>("canvas");
  const g = cv.getContext("2d")!;
  const dpr = window.devicePixelRatio || 1;
  const dur = viewB - viewA;
  const tx = (t: number) => ((t - viewA) / dur) * cv.width;
  const xt = (x: number) => viewA + (x / cv.width) * dur;
  let peaks = new Float32Array(0);
  let playhead: number | null = null;

  const fit = () => {
    cv.width = Math.max(1, Math.round(cv.clientWidth * dpr));
    cv.height = Math.round(120 * dpr);
    peaks = new Float32Array(cv.width);
    const step = samples.length / cv.width;
    for (let x = 0; x < cv.width; x++) {
      let mx = 0;
      const i1 = Math.min(samples.length, Math.floor((x + 1) * step));
      for (let i = Math.floor(x * step); i < i1; i++) mx = Math.max(mx, Math.abs(samples[i]));
      peaks[x] = mx;
    }
  };

  function draw() {
    const W = cv.width,
      H = cv.height,
      ax = tx(a),
      bx = tx(b);
    g.clearRect(0, 0, W, H);
    g.fillStyle = "rgba(46,168,255,.12)";
    g.fillRect(ax, 0, bx - ax, H);
    for (let x = 0; x < W; x++) {
      const hgt = Math.max(1, Math.min(1, peaks[x] * 1.6) * (H - 8 * dpr));
      const recorded = mask[Math.floor((x / W) * mask.length)];
      g.fillStyle = !recorded
        ? "rgba(255,255,255,.08)"
        : x >= ax && x <= bx
          ? "#7cc8ff"
          : "rgba(160,170,185,.35)";
      g.fillRect(x, (H - hgt) / 2, 1, hgt);
    }
    for (const hx of [ax, bx]) {
      g.fillStyle = "#2ea8ff";
      g.fillRect(hx - dpr, 0, 2 * dpr, H);
      g.beginPath();
      g.roundRect(hx - 5 * dpr, H / 2 - 14 * dpr, 10 * dpr, 28 * dpr, 4 * dpr);
      g.fill();
      g.fillStyle = "rgba(3,19,32,.7)";
      g.fillRect(hx - 2 * dpr, H / 2 - 6 * dpr, dpr, 12 * dpr);
      g.fillRect(hx + dpr, H / 2 - 6 * dpr, dpr, 12 * dpr);
    }
    if (playhead != null) {
      g.fillStyle = "#fff";
      g.fillRect(tx(playhead), 0, 1.5 * dpr, H);
    }
    times.textContent = `${fmtPrecise(a)} → ${fmtPrecise(b)}  ·  ${(b - a).toFixed(2)}s`;
  }

  let drag: "a" | "b" | null = null;
  const px = (e: PointerEvent) =>
    ((e.clientX - cv.getBoundingClientRect().left) / cv.clientWidth) * cv.width;
  const move = (e: PointerEvent) => {
    if (!drag) return;
    const t = Math.min(viewB, Math.max(viewA, xt(px(e))));
    if (drag === "a") a = Math.min(t, b - 0.05);
    else b = Math.max(t, a + 0.05);
    draw();
  };
  cv.onpointerdown = (e) => {
    const x = px(e);
    drag = Math.abs(x - tx(a)) < Math.abs(x - tx(b)) ? "a" : "b";
    cv.setPointerCapture(e.pointerId);
    move(e);
  };
  cv.onpointermove = move;
  cv.onpointerup = () => {
    if (drag && hasAudio) play();
    drag = null;
  };
  const ro = new ResizeObserver(() => {
    fit();
    draw();
  });
  ro.observe(cv);
  fit();
  draw();

  // Clip playback
  const clip = () => samples.subarray(Math.max(0, idx(a)), idx(b));
  let stopFn: (() => void) | null = null;
  let raf = 0;
  const stop = () => {
    stopFn?.();
    stopFn = null;
    cancelAnimationFrame(raf);
    playhead = null;
    setHTML(playBtn, `${icon("play")}<span>Play</span>`);
    draw();
  };
  function play() {
    stop();
    if (!hasAudio || !recorder.ctx) return;
    const ctx = recorder.ctx;
    const t0 = ctx.currentTime,
      a0 = a;
    stopFn = recorder.play(clip(), stop);
    if (!stopFn) return;
    setHTML(playBtn, `${icon("stop")}<span>Stop</span>`);
    const tick = () => {
      playhead = a0 + (ctx.currentTime - t0);
      draw();
      raf = requestAnimationFrame(tick);
    };
    tick();
  }
  playBtn.onclick = () => (stopFn ? stop() : play());

  const close = () => {
    stop();
    ro.disconnect();
    m.remove();
    panel.modal = null;
    cues.selected.clear();
    cues.anchor = null;
    cues.version++;
    panel.render();
    if (wasPlaying) void v.play();
  };
  $("[data-cancel]").onclick = close;
  $("[data-x]").onclick = close;
  m.addEventListener("pointerdown", (e) => e.target === m && close());
  m.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
    else if (e.key === " " && !(e.target as Element).matches("textarea, input")) {
      e.preventDefault();
      playBtn.click();
    }
  });
  sEl.focus();
  if (hasAudio) play();

  async function save() {
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    status.className = "status";
    const fail = (msg: string) => {
      status.className = "status err";
      status.textContent = msg;
      saveBtn.disabled = false;
    };
    const s = sEl.value.trim();
    const hl = hEl.value.trim();
    const shown = hl && s.includes(hl) ? s.replace(hl, `<b>${hl}</b>`) : s;

    status.textContent = "Checking note type…";
    const fr = await anki<string[]>("modelFieldNames", { modelName: cfg.model });
    if (!fr.ok) return fail(fr.error);
    const real = fr.result;
    const missing = [cfg.fSentence, cfg.fTranslation, cfg.fAudio, cfg.fHighlight].filter(
      (f) => f && !real.includes(f),
    );
    if (missing.length)
      return fail(`"${cfg.model}" has no field ${missing.join(", ")}. Fix this in Settings.`);

    const fields: Record<string, string> = {
      [cfg.fSentence]: shown,
      [cfg.fTranslation]: tEl.value.trim(),
    };
    if (!fields[real[0]]) fields[real[0]] = shown; // Anki rejects an empty first field
    if (cfg.fHighlight && hl) fields[cfg.fHighlight] = hl;

    const note: Record<string, unknown> = {
      deckName: cfg.deck,
      modelName: cfg.model,
      fields,
      tags: [APP_SLUG, app.site ?? location.hostname],
      options: { allowDuplicate: false },
    };
    if (hasAudio) {
      status.textContent = "Encoding audio…";
      await new Promise((r) => setTimeout(r, 0));
      note.audio = [
        {
          data: mp3Base64(clip(), sr),
          filename: `${APP_SLUG}_${Date.now()}.mp3`,
          fields: [cfg.fAudio],
        },
      ];
    }
    status.textContent = "Saving…";
    const r = await anki("addNote", { note });
    if (!r.ok)
      return fail(
        /duplicate/i.test(r.error) ? "You already have a card with this sentence." : r.error,
      );
    close();
    panel.toast(`Added to ${cfg.deck}`);
  }
  saveBtn.onclick = () => void save();
}
