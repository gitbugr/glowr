import { norm, words } from "./text";

export interface Cue {
  start: number;
  end: number;
  text: string;
  norm: string;
  /** "track": native TextTrack (exact timing); "dom": polled from the page. */
  src: "track" | "dom";
  seq: number;
  /** A DOM cue whose end has been seen at least once. */
  closed?: boolean;
}

/** Seconds within which the same text counts as the same line. */
const SAME_LINE = 3;

/** Subtitle lines seen so far, deduplicated across rewatches. */
export class CueStore {
  cues: Cue[] = [];
  selected = new Set<Cue>();
  anchor: Cue | null = null;
  /** Bumped on every change, for cheap re-render checks. */
  version = 0;
  private seq = 0;

  constructor(private max = 400) {}

  private sort() {
    this.cues.sort((a, b) => a.start - b.start);
  }

  private sameLine(n: string, start: number, except?: Cue) {
    return this.cues.find(
      (c) => c !== except && c.norm === n && Math.abs(c.start - start) < SAME_LINE,
    );
  }

  add(start: number, end: number, text: string, src: Cue["src"]): Cue | null {
    const n = norm(text);
    if (!n) return null;
    const dup = this.sameLine(n, start);
    if (dup) {
      // Native track timings beat polled DOM timings.
      if (src === "track" && dup.src === "dom")
        Object.assign(dup, { start, end, src });
      // First seen mid-line after a seek, now seen from its true start.
      else if (src === "dom" && dup.src === "dom" && start < dup.start) {
        dup.start = start;
        this.sort();
      }
      this.version++;
      return dup;
    }
    const cue: Cue = { start, end, text, norm: n, src, seq: this.seq++ };
    this.cues.push(cue);
    this.sort();
    if (this.cues.length > this.max)
      this.remove(this.cues.reduce((m, c) => (c.seq < m.seq ? c : m)));
    this.version++;
    return cue;
  }

  remove(c: Cue) {
    const i = this.cues.indexOf(c);
    if (i >= 0) this.cues.splice(i, 1);
    this.selected.delete(c);
    if (this.anchor === c) this.anchor = null;
    this.version++;
  }

  /** Update a growing DOM line; may merge into an existing identical line. */
  grow(c: Cue, text: string): Cue {
    if (c.src !== "dom" || c.text === text) return c;
    c.text = text;
    c.norm = norm(text);
    this.version++;
    const dup = this.sameLine(c.norm, c.start, c);
    if (!dup) return c;
    this.remove(c);
    if (c.start < dup.start) dup.start = c.start;
    return dup;
  }

  /** The line stopped showing at `end`. */
  close(c: Cue, end: number) {
    if (c.src !== "dom") return;
    // A rolling line cut short on a rewatch: we already have all of it.
    const whole = this.cues.find(
      (o) =>
        o !== c &&
        o.norm.length > c.norm.length &&
        (c.norm.length >= 12 ? o.norm.includes(c.norm) : o.norm.startsWith(c.norm)) &&
        Math.abs(o.start - c.start) < SAME_LINE,
    );
    if (whole) return this.remove(c);
    end = Math.max(c.start + 0.3, end);
    // A rewatch cut short by a seek mustn't shorten a line seen in full.
    c.end = c.closed ? Math.max(c.end, end) : end;
    c.closed = true;
    this.version++;
  }

  clear() {
    this.cues = [];
    this.selected.clear();
    this.anchor = null;
    this.version++;
  }

  /** Lines for a card: the selection, else the latest line at time `t`. */
  forCard(t: number): Cue[] {
    if (this.selected.size)
      return [...this.selected].sort((a, b) => a.start - b.start);
    const past = this.cues.filter((c) => t >= c.start - 0.3);
    return past.length ? [past[past.length - 1]] : [];
  }
}

/**
 * Turns polled on-screen subtitle text into cues.
 *
 * Seeking: the line open at seek time closes at the pre-seek time, and the
 * text on screen when the seek starts is ignored until it changes, so a
 * stale subtitle can't be stamped with the new position.
 *
 * Rolling captions (YouTube auto-captions) appear word by word and scroll up
 * a line at a time. Text that extends what was on screen grows the open line
 * in place; text that starts with the tail of what was on screen (the line
 * that scrolled up) only contributes its new words.
 */
export class CaptionTracker {
  open: Cue | null = null;
  /** Full on-screen text at the last change. */
  private raw = "";
  /** How many leading words of `raw` belong to the previous line. */
  private skip = 0;
  private stale: string | null = null;
  private lastT = 0;
  /** The line an interruption (ad) cut off, to resume if it carries on. */
  private paused: Cue | null = null;

  constructor(private store: CueStore) {}

  private closeOpen(end: number) {
    if (this.open) this.store.close(this.open, end);
    this.open = null;
  }

  seekStart(onScreen: string) {
    this.closeOpen(this.lastT);
    this.paused = null;
    this.raw = "";
    this.skip = 0;
    if (this.stale === null) this.stale = onScreen;
  }

  /** Captions paused (e.g. an ad). Keeps `raw`: they resume where they left off. */
  interrupt() {
    if (this.open) this.paused = this.open;
    this.closeOpen(this.lastT);
  }

  reset() {
    this.open = null;
    this.raw = "";
    this.skip = 0;
    this.stale = null;
    this.paused = null;
  }

  feed(text: string, t: number) {
    if (this.stale !== null) {
      if (text && text === this.stale) return;
      this.stale = null;
    }
    this.lastT = t;
    if (text === this.raw) return;
    const ow = words(this.raw),
      nw = words(text);
    const grows =
      ow.length > 0 && nw.length > ow.length && ow.every((w, i) => nw[i] === w);
    if (grows) {
      const rest = nw.slice(this.skip).join(" ");
      if (!this.open && this.paused && this.store.cues.includes(this.paused))
        this.open = this.paused;
      this.paused = null;
      if (this.open) this.open = this.store.grow(this.open, rest);
      else if (rest) this.open = this.store.add(t, t + 4, rest, "dom");
      this.raw = text;
      return;
    }
    this.closeOpen(t);
    this.paused = null;
    // Scrolled up: the new text starts with the end of the old.
    let k = 0;
    for (let n = Math.min(ow.length, nw.length); n >= 2; n--)
      if (ow.slice(-n).join(" ") === nw.slice(0, n).join(" ")) {
        k = n;
        break;
      }
    this.raw = text;
    this.skip = k;
    const rest = nw.slice(k).join(" ");
    if (rest) this.open = this.store.add(t, t + 4, rest, "dom");
  }
}
