export const APP_NAME = "Glöwr";
/** ASCII form for ids, tags and filenames. */
export const APP_SLUG = "glowr";

export interface SiteDef {
  label: string;
  hosts: string[];
  /** CSS selector for on-screen subtitles. Open shadow roots are searched too. */
  selector: string;
  /** Only run on matching paths (e.g. skip YouTube's homepage previews). */
  paths?: RegExp;
  /** While this matches, an ad is playing in the main <video>. */
  adSelector?: string;
  /** Identifies the programme, so a source swap for the same one isn't a reset. */
  mediaKey?: () => string;
}

export const SITES = {
  s4c: {
    label: "S4C Clic",
    hosts: ["s4c.cymru"],
    selector: ".vjs-text-track-cue",
  },
  iplayer: {
    label: "BBC iPlayer",
    hosts: ["bbc.co.uk"],
    // SMP renders IMSC subtitles inside <smp-subtitles>'s shadow root.
    selector: "smp-subtitles",
  },
  youtube: {
    label: "YouTube",
    hosts: ["youtube.com", "youtube-nocookie.com"],
    selector: ".ytp-caption-segment",
    paths: /^\/(watch|embed|live)\b/,
    adSelector: ".ad-showing",
    mediaKey: () =>
      new URLSearchParams(location.search).get("v") || location.pathname,
  },
} satisfies Record<string, SiteDef>;

export type SiteId = keyof typeof SITES;
export const SITE_IDS = Object.keys(SITES) as SiteId[];

/** Content-script match patterns, shared with the manifest generator. */
export const MATCHES = [
  "https://www.s4c.cymru/*",
  "https://www.bbc.co.uk/iplayer/*",
  "https://www.youtube.com/*",
  "https://m.youtube.com/*",
  "https://www.youtube-nocookie.com/embed/*",
];

export function siteFor(hostname: string): SiteId | null {
  for (const id of SITE_IDS)
    if (SITES[id].hosts.some((h) => hostname === h || hostname.endsWith("." + h)))
      return id;
  return null;
}

export type SelectorKey = `sel_${SiteId}`;

export interface Settings extends Record<SelectorKey, string> {
  deck: string;
  model: string;
  fSentence: string;
  fTranslation: string;
  fAudio: string;
  fHighlight: string;
  targetLang: string;
  /** Seconds of audio added either side of the subtitle timing. */
  pad: number;
  autoRecord: boolean;
  /** Fill in the translation with Google Translate when the card editor opens. */
  autoTranslate: boolean;
  /** AnkiConnect's address. */
  ankiUrl: string;
  /** AnkiConnect's optional API key ("apiKey" in its config). */
  ankiKey: string;
  /** A Google Translate-compatible endpoint (translate_a/single). */
  translateUrl: string;
}

export const DEFAULTS: Settings = {
  deck: "Default",
  model: "Basic",
  fSentence: "Front",
  fTranslation: "Back",
  fAudio: "Front",
  fHighlight: "",
  targetLang: "en",
  pad: 0.25,
  autoRecord: true,
  autoTranslate: true,
  ankiUrl: "http://127.0.0.1:8765",
  ankiKey: "",
  translateUrl: "https://translate.googleapis.com/translate_a/single",
  sel_s4c: SITES.s4c.selector,
  sel_iplayer: SITES.iplayer.selector,
  sel_youtube: SITES.youtube.selector,
};

/** Settings under "Advanced settings"; its reset button restores these. */
export const ADVANCED_KEYS = [
  "ankiUrl",
  "ankiKey",
  "translateUrl",
  "pad",
  ...SITE_IDS.map((id) => `sel_${id}` as const),
] satisfies (keyof Settings)[];

export const LANGUAGES: [code: string, name: string][] = [
  ["en", "English"],
  ["cy", "Welsh"],
  ["ga", "Irish"],
  ["gd", "Scottish Gaelic"],
  ["fr", "French"],
  ["de", "German"],
  ["es", "Spanish"],
  ["it", "Italian"],
  ["nl", "Dutch"],
  ["pt", "Portuguese"],
  ["pl", "Polish"],
  ["ja", "Japanese"],
  ["zh-CN", "Chinese (Simplified)"],
];

/** Injected at build time from package.json's `repository`. */
declare const __REPO_URL__: string;
export const REPO_URL = typeof __REPO_URL__ === "string" ? __REPO_URL__ : "";
