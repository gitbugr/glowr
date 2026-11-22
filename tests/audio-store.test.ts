import { describe, expect, it } from "vitest";
import { AudioStore, coverage } from "../src/content/audio-store";

const SR = 1000; // 1 sample per ms keeps the arithmetic readable
const BLOCK = 100;

/** A block whose samples encode their true media time in ms. */
const block = (t0: number) => Float32Array.from({ length: BLOCK }, (_, i) => t0 * SR + i);

/** Record [from, to) seconds, with per-callback timestamp jitter. */
function record(s: AudioStore, from: number, to: number, jitter: (i: number) => number = () => 0) {
  for (let i = 0, t = from; t < to - 1e-9; i++, t += BLOCK / SR)
    s.add(t + jitter(i), block(t));
}

/** Max |recorded sample time - expected time| in ms over the recorded part. */
function maxError(s: AudioStore, a: number, b: number) {
  const { data, mask } = s.extract(a, b);
  let worst = 0;
  for (let i = 0; i < data.length; i++)
    if (mask[i]) worst = Math.max(worst, Math.abs(data[i] - (a * SR + i)));
  return worst;
}

describe("AudioStore", () => {
  it("returns exactly what was played", () => {
    const s = new AudioStore(SR);
    record(s, 10, 12);
    expect(maxError(s, 10.5, 11.5)).toBe(0);
    expect(coverage(s.extract(10.5, 11.5).mask)).toBe(1);
  });

  it("stays gap-free when callbacks arrive late and in bursts", () => {
    const s = new AudioStore(SR);
    // Late by up to 80 ms, as Firefox delivers them; never early.
    record(s, 0, 5, (i) => [0, 0.08, 0.02, 0.05, 0, 0.07][i % 6]);
    const { mask } = s.extract(0.5, 4.5);
    expect(coverage(mask)).toBe(1);
    // Placement is estimated from many blocks, so it's within a few ms.
    expect(maxError(s, 0.5, 4.5)).toBeLessThanOrEqual(10);
  });

  it("does not duplicate audio when a section is re-recorded after seeking back", () => {
    const s = new AudioStore(SR);
    record(s, 0, 3);
    s.breakRun(); // seek back to 1 s
    record(s, 1, 2.5);
    const { data, mask } = s.extract(0, 3);
    expect(data.length).toBe(3 * SR);
    expect(coverage(mask)).toBe(1);
    expect(maxError(s, 0, 3)).toBe(0);
  });

  it("leaves unrecorded ranges silent and unmarked", () => {
    const s = new AudioStore(SR);
    record(s, 0, 1);
    s.breakRun(); // seek forward
    record(s, 5, 6);
    const { mask } = s.extract(0, 6);
    expect(coverage(mask, 0, SR)).toBe(1);
    expect(coverage(mask, SR, 5 * SR)).toBe(0);
    expect(coverage(mask, 5 * SR, 6 * SR)).toBe(1);
  });

  it("starts a new run when timestamps jump without a breakRun()", () => {
    const s = new AudioStore(SR);
    record(s, 0, 1);
    record(s, 20, 21); // e.g. a missed seek event
    expect(maxError(s, 20, 21)).toBe(0);
    expect(coverage(s.extract(1, 20).mask)).toBe(0);
  });

  it("evicts the oldest audio beyond its limit", () => {
    const s = new AudioStore(SR, 2);
    record(s, 0, 5);
    expect(coverage(s.extract(0, 3).mask)).toBe(0);
    expect(coverage(s.extract(3, 5).mask)).toBe(1);
  });
});
