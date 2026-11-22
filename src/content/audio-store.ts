interface Chunk {
  /** Sample offset within its run. */
  pos: number;
  data: Float32Array;
}
interface Run {
  /** Media time of the run's first sample. */
  start: number;
  /** Samples appended so far (including evicted ones). */
  len: number;
  chunks: Chunk[];
  /** Per-block estimates of `start`. */
  ests: number[];
}

/**
 * Recorded audio, indexed by media time.
 *
 * Audio is stored as runs: stretches of uninterrupted playback whose blocks
 * are laid end to end, so a run is always gap-free. Audio callbacks arrive
 * with jittery timing (bursty in Firefox), so a run's position is estimated
 * from all of its blocks' timestamps rather than trusting any single one.
 * A seek, pause or drift starts a new run; where runs overlap (after
 * seeking back) the newer one wins on extraction.
 */
export class AudioStore {
  private runs: Run[] = [];
  private cur: Run | null = null;
  private samples = 0;

  constructor(
    public sr: number,
    private maxSeconds = 600,
  ) {}

  private end(r: Run) {
    return r.start + r.len / this.sr;
  }

  /** The next block doesn't follow on from the last one. */
  breakRun() {
    this.cur = null;
  }

  /** Add a block whose first sample is (roughly) at media time `stamp`. */
  add(stamp: number, data: Float32Array) {
    const sr = this.sr;
    let r = this.cur;
    if (r && Math.abs(stamp - this.end(r)) > 0.5) r = null;
    if (!r) {
      r = { start: stamp, len: 0, chunks: [], ests: [] };
      this.runs.push(r);
      this.cur = r;
    }
    // A late callback only ever makes the stamp too big, so lean low.
    r.ests.push(stamp - r.len / sr);
    if (r.ests.length > 400) r.ests.splice(0, r.ests.length - 400);
    const sorted = [...r.ests].sort((x, y) => x - y);
    r.start = sorted[Math.floor(sorted.length * 0.2)];
    r.chunks.push({ pos: r.len, data });
    r.len += data.length;
    this.samples += data.length;

    // Older runs entirely re-recorded by this one are dead weight.
    const cur = r;
    this.runs = this.runs.filter((o) => {
      const dead =
        o !== cur && o.start >= cur.start - 0.05 && this.end(o) <= this.end(cur) + 0.05;
      if (dead) for (const c of o.chunks) this.samples -= c.data.length;
      return !dead;
    });
    while (this.samples > this.maxSeconds * sr && this.runs.length) {
      const o = this.runs[0];
      const c = o.chunks.shift();
      if (c) this.samples -= c.data.length;
      if (o.chunks.length) continue;
      if (o === cur) break;
      this.runs.shift();
    }
  }

  clear() {
    this.runs = [];
    this.cur = null;
    this.samples = 0;
  }

  /** Audio for [a, b) seconds; `mask` marks which samples were recorded. */
  extract(a: number, b: number): { data: Float32Array; mask: Uint8Array } {
    const sr = this.sr;
    const len = Math.max(0, Math.round((b - a) * sr));
    const data = new Float32Array(len);
    const mask = new Uint8Array(len);
    for (const r of this.runs) {
      if (this.end(r) <= a || r.start >= b) continue;
      const base = Math.round((r.start - a) * sr);
      for (const c of r.chunks) {
        const off = base + c.pos;
        const s0 = Math.max(0, -off);
        const s1 = Math.min(c.data.length, len - off);
        if (s1 <= s0) continue;
        data.set(c.data.subarray(s0, s1), off + s0);
        mask.fill(1, off + s0, off + s1);
      }
    }
    return { data, mask };
  }
}

/** Fraction of [i0, i1) that was recorded. */
export function coverage(mask: Uint8Array, i0 = 0, i1 = mask.length) {
  let n = 0;
  for (let i = i0; i < i1; i++) n += mask[i];
  return i1 > i0 ? n / (i1 - i0) : 0;
}
