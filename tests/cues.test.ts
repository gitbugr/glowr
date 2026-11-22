import { describe, expect, it } from "vitest";
import { CaptionTracker, CueStore } from "../src/content/cues";

const setup = () => {
  const store = new CueStore();
  return { store, tracker: new CaptionTracker(store) };
};
const texts = (s: CueStore) => s.cues.map((c) => c.text);

/** Feed on-screen text every 100 ms from `t0`. */
function play(tracker: CaptionTracker, t0: number, frames: string[]) {
  frames.forEach((f, i) => tracker.feed(f, t0 + i * 0.1));
  return t0 + frames.length * 0.1;
}

describe("CaptionTracker: broadcast subtitles", () => {
  it("records each subtitle with when it appeared and disappeared", () => {
    const { store, tracker } = setup();
    const A = Array(10).fill("Bore da."),
      B = Array(15).fill("Sut wyt ti?");
    play(tracker, 1, [...A, "", "", ...B, ""]);
    expect(store.cues.map((c) => [c.text, c.start, +c.end.toFixed(1)])).toEqual([
      ["Bore da.", 1, 2],
      ["Sut wyt ti?", 2.2, 3.7],
    ]);
  });

  it("ignores a stale subtitle still on screen after a seek", () => {
    const { store, tracker } = setup();
    play(tracker, 10, ["Line A", "Line A"]);
    tracker.seekStart("Line A");
    // The player still shows the old line briefly at the new position.
    play(tracker, 30, ["Line A", "Line A", "Line B"]);
    expect(texts(store)).toEqual(["Line A", "Line B"]);
    expect(store.cues[0].start).toBe(10);
    expect(store.cues[1].start).toBeCloseTo(30.2);
  });

  it("closes the open line at the pre-seek time", () => {
    const { store, tracker } = setup();
    play(tracker, 5, Array(8).fill("Hello there"));
    tracker.seekStart("Hello there");
    expect(store.cues[0].end).toBeCloseTo(5.7);
  });

  it("dedupes a rewatched line and never shortens it", () => {
    const { store, tracker } = setup();
    play(tracker, 3, [...Array(10).fill("Dw i'n dysgu."), ""]);
    const full = store.cues[0].end;
    tracker.seekStart("");
    // Rewatch, but seek away before the line ends.
    play(tracker, 3, Array(3).fill("Dw i'n dysgu."));
    tracker.seekStart("Dw i'n dysgu.");
    expect(store.cues).toHaveLength(1);
    expect(store.cues[0].end).toBe(full);
  });

  it("prefers native track timing over polled DOM timing", () => {
    const { store, tracker } = setup();
    play(tracker, 2.1, ["Diolch"]);
    store.add(2.0, 3.5, "Diolch", "track");
    expect(store.cues).toHaveLength(1);
    expect(store.cues[0]).toMatchObject({ start: 2.0, end: 3.5, src: "track" });
  });
});

describe("CaptionTracker: rolling auto-captions", () => {
  // Word-by-word, two visible lines of three words.
  const W = "un dau tri pedwar pump chwech saith wyth naw".split(" ");
  function frames(upTo: number) {
    const out: string[] = [];
    for (let n = 1; n <= upTo; n++) {
      const lines: string[][] = [];
      for (let i = 0; i < n; i += 3) lines.push(W.slice(i, Math.min(n, i + 3)));
      out.push(lines.slice(-2).map((l) => l.join(" ")).join(" "));
    }
    return out;
  }

  it("grows lines in place and splits where the captions scroll", () => {
    const { store, tracker } = setup();
    play(tracker, 0, frames(9));
    expect(texts(store)).toEqual(["un dau tri pedwar pump chwech", "saith wyth naw"]);
  });

  it("does not duplicate anything when rewatched", () => {
    const { store, tracker } = setup();
    play(tracker, 0, frames(9));
    tracker.seekStart(frames(9)[8]);
    play(tracker, 0, ["", ...frames(9)]);
    expect(texts(store)).toEqual(["un dau tri pedwar pump chwech", "saith wyth naw"]);
  });

  it("keeps its place across an ad break", () => {
    const { store, tracker } = setup();
    const f = frames(9);
    play(tracker, 0, f.slice(0, 5));
    tracker.interrupt(); // ad
    play(tracker, 0.5, f.slice(5));
    expect(texts(store).join(" ")).toBe(W.join(" "));
  });
});

describe("CueStore.forCard", () => {
  it("uses the selection, else the latest line", () => {
    const store = new CueStore();
    const a = store.add(1, 2, "A", "track")!;
    const b = store.add(3, 4, "B", "track")!;
    expect(store.forCard(3.5)).toEqual([b]);
    expect(store.forCard(2.5)).toEqual([a]);
    store.selected = new Set([b, a]);
    expect(store.forCard(0)).toEqual([a, b]);
  });
});
