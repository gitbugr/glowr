// lamejs is loaded as its own (unbundled, LGPL) content script before ours.
declare namespace lamejs {
  class Mp3Encoder {
    constructor(channels: number, sampleRate: number, kbps: number);
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
    flush(): Int8Array;
  }
}

interface Element {
  /** Firefox, extension contexts only. */
  openOrClosedShadowRoot?: ShadowRoot | null;
}

interface ShadowRoot {
  /** Chromium only. */
  getSelection?(): Selection | null;
}

interface HTMLMediaElement {
  captureStream?(): MediaStream;
}

declare const chrome:
  | { dom?: { openOrClosedShadowRoot?(el: Element): ShadowRoot | null } }
  | undefined;
