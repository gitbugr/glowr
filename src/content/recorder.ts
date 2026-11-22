import { APP_NAME } from "../shared/config";
import { AudioStore } from "./audio-store";

export type RecorderState = "idle" | "rec" | "error";

interface Tap {
  video: HTMLVideoElement;
  stream: MediaStream | null;
  src: AudioNode;
}

/**
 * Records the video's soundtrack into an AudioStore.
 *
 * It listens through captureStream(), which leaves the element's own
 * playback untouched. createMediaElementSource() would reroute it, and on
 * pages whose player already uses Web Audio, Firefox then plays the
 * soundtrack through both graphs (an echo). Rerouting is kept only as a
 * fallback for when captureStream() isn't available or throws.
 */
export class Recorder {
  store = new AudioStore(44100);
  ctx: AudioContext | null = null;
  state: RecorderState = "idle";
  /** null until settings have loaded. */
  wanted: boolean | null = null;

  private proc: ScriptProcessorNode | null = null;
  private tap: Tap | null = null;
  private pending = false;
  private blockUntil = 0;
  private elementSources = new WeakMap<HTMLVideoElement, MediaElementAudioSourceNode>();

  constructor(
    private video: () => HTMLVideoElement | null,
    private paused: () => boolean,
    private onChange: () => void,
  ) {
    // Streams end when the player swaps sources (next video, ads): re-tap.
    setInterval(() => {
      if (this.wanted && this.video() && this.state === "rec" && !this.live()) this.start();
    }, 1000);
  }

  get sr() {
    return this.store.sr;
  }

  /** Recording right now (or would be, when the video plays). */
  get recording() {
    return !!this.wanted && this.state === "rec" && this.live();
  }

  private live(): boolean {
    const t = this.tap;
    return (
      !!t &&
      t.video === this.video() &&
      (!t.stream || t.stream.getAudioTracks().some((k) => k.readyState === "live"))
    );
  }

  set(on: boolean) {
    this.wanted = on;
    if (on) void this.start();
    else {
      this.untap();
      this.store.breakRun();
    }
    this.onChange();
  }

  seekStart() {
    this.blockUntil = Infinity;
    this.store.breakRun();
  }

  seekEnd() {
    this.blockUntil = performance.now() + 300;
  }

  /** Start if wanted and possible. Safe to call often (e.g. on every click). */
  async start() {
    const v = this.video();
    if (!v || !this.wanted || this.pending || this.live()) return;
    this.pending = true;
    try {
      if (!this.ctx) {
        // The browser's native rate; forcing one breaks Firefox.
        this.ctx = new AudioContext();
        this.store = new AudioStore(this.ctx.sampleRate);
        // Resuming can finish long after we stop waiting for it.
        this.ctx.onstatechange = () => {
          if (this.ctx?.state === "running") void this.start();
        };
      }
      if (this.ctx.state !== "running")
        await Promise.race([
          this.ctx.resume().catch(() => {}),
          new Promise((r) => setTimeout(r, 300)),
        ]);
      if (this.ctx.state !== "running") {
        this.state = "idle"; // needs a click or keypress first
        return;
      }
      if (!this.proc) this.makeProcessor(this.ctx);
      this.untap();
      const t = await this.openTap(this.ctx, v);
      if (!t || v !== this.video() || !this.wanted) return;
      t.src.connect(this.proc!);
      this.tap = t;
      this.state = "rec";
    } catch (e) {
      console.error(`[${APP_NAME}] audio capture failed:`, e);
      this.state = "error";
    } finally {
      this.pending = false;
      this.onChange();
    }
  }

  private untap() {
    if (this.tap && this.proc)
      try {
        this.tap.src.disconnect(this.proc);
      } catch {
        /* already disconnected */
      }
    this.tap = null;
  }

  private async openTap(ctx: AudioContext, v: HTMLVideoElement): Promise<Tap | null> {
    let stream: MediaStream | null = null;
    try {
      stream = v.captureStream?.() ?? null;
    } catch (e) {
      console.warn(`[${APP_NAME}] captureStream failed, rerouting instead:`, e);
    }
    if (stream) {
      const s = stream;
      if (!s.getAudioTracks().length)
        await new Promise((res) => {
          s.addEventListener("addtrack", res, { once: true });
          setTimeout(res, 2000);
        });
      if (!s.getAudioTracks().length) return null; // no audio yet; retried later
      return { video: v, stream: s, src: ctx.createMediaStreamSource(s) };
    }
    let src = this.elementSources.get(v);
    if (!src) {
      src = ctx.createMediaElementSource(v);
      src.connect(ctx.destination);
      this.elementSources.set(v, src);
    }
    return { video: v, stream: null, src };
  }

  private makeProcessor(ctx: AudioContext) {
    const proc = ctx.createScriptProcessor(4096, 2, 1);
    // Must reach the destination to be pulled; muted so it's never heard.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    proc.connect(mute);
    mute.connect(ctx.destination);
    proc.onaudioprocess = (e) => {
      e.outputBuffer.getChannelData(0).fill(0);
      const v = this.video();
      if (
        !this.wanted ||
        !v ||
        this.tap?.video !== v ||
        v.paused ||
        v.seeking ||
        v.ended ||
        v.playbackRate !== 1 ||
        this.paused() ||
        performance.now() < this.blockUntil
      )
        return this.store.breakRun();
      const ib = e.inputBuffer;
      const n = ib.length;
      const mono = new Float32Array(n);
      for (let ch = 0; ch < ib.numberOfChannels; ch++) {
        const d = ib.getChannelData(ch);
        for (let i = 0; i < n; i++) mono[i] += d[i] / ib.numberOfChannels;
      }
      this.store.add(v.currentTime - n / this.sr, mono);
    };
    this.proc = proc;
  }

  /** Play samples through the speakers; returns a stop function. */
  play(samples: Float32Array, onEnded: () => void): (() => void) | null {
    if (!this.ctx || !samples.length) return null;
    const ab = this.ctx.createBuffer(1, samples.length, this.sr);
    ab.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const s = this.ctx.createBufferSource();
    s.buffer = ab;
    s.connect(this.ctx.destination);
    s.onended = onEnded;
    s.start();
    return () => {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    };
  }
}
